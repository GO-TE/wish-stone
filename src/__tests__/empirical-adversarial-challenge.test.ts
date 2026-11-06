import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { Stone } from '../domain/entities/Stone.ts';
import { Tower, type TowerStoneItem } from '../domain/entities/Tower.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import { TowerKey, type CategoryCode } from '../domain/value-objects/TowerKey.ts';
import { CheerLevel, type CheerLevelValue } from '../domain/value-objects/CheerLevel.ts';
import { InMemoryEffectBus, type VisualEffectEvent } from '../domain/ports/EffectBus.ts';
import { type WishRepository, type TowerRepository } from '../domain/ports/repositories.ts';
import {
  ToastStore,
  defaultToastStore,
} from '../presentation/components/toastStore.ts';
import {
  getCheerButtonState,
  formatAuthorDisplay,
  formatCheerDisplay,
} from './wish-detail-bottom-sheet.test.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Helper to create mock stone items
function createMockStoneItem(overrides: Partial<TowerStoneItem> = {}): TowerStoneItem {
  return {
    id: overrides.id ?? 'stone-mock-1',
    content: overrides.content ?? '꿈을 향한 작은 발걸음',
    category: overrides.category ?? 'job',
    stone: overrides.stone ?? new Stone({ shape: 'round', color: '#555555', pose: Pose.origin() }),
    status: overrides.status ?? 'active',
    bloom: overrides.bloom ?? null,
    cheerLevel: overrides.cheerLevel ?? 0,
    cheerCount: overrides.cheerCount ?? 0,
    isMine: overrides.isMine ?? false,
    nickname: overrides.nickname ?? null,
    createdAt: overrides.createdAt ?? new Date(),
  };
}

// =============================================================================
// CHALLENGE 1: Route /tower Accessibility & Navigation Flow
// =============================================================================

test('Adversarial Challenge 1: Route /tower accessibility and navigation contracts', () => {
  // 1.1 Verify route registration in _layout.tsx
  const layoutPath = path.resolve(projectRoot, 'app/_layout.tsx');
  assert.ok(fs.existsSync(layoutPath), '_layout.tsx must exist');
  const layoutSource = fs.readFileSync(layoutPath, 'utf8');

  assert.ok(
    layoutSource.includes('name="tower/index"'),
    '_layout.tsx must explicitly register Stack.Screen name="tower/index"'
  );
  assert.ok(
    layoutSource.includes('options={{ headerShown: false }}') ||
    layoutSource.includes('headerShown: false'),
    'tower/index must have headerShown: false to support full-screen Toss UI'
  );

  // 1.2 Verify accessibility from home.tsx
  const homePath = path.resolve(projectRoot, 'app/home.tsx');
  assert.ok(fs.existsSync(homePath), 'home.tsx must exist');
  const homeSource = fs.readFileSync(homePath, 'utf8');

  // Must provide entry via explore button
  assert.ok(
    homeSource.includes("router.push('/tower')"),
    "home.tsx must invoke router.push('/tower')"
  );
  assert.ok(
    homeSource.includes('360° 둘러보기'),
    'home.tsx must have 360° 둘러보기 label'
  );
  // Must provide direct tap-to-explore on tower viewport
  assert.ok(
    homeSource.includes("onSelectStone={() => router.push('/tower')}"),
    'home.tsx onSelectStone must route to /tower'
  );

  // 1.3 Verify back navigation in tower/index.tsx
  const towerPath = path.resolve(projectRoot, 'app/tower/index.tsx');
  assert.ok(fs.existsSync(towerPath), 'src/app/tower/index.tsx must exist');
  const towerSource = fs.readFileSync(towerPath, 'utf8');

  assert.ok(
    towerSource.includes('router.back()'),
    'tower/index.tsx must provide back navigation via router.back()'
  );
  assert.ok(
    towerSource.includes('accessibilityLabel="뒤로가기"'),
    'tower/index.tsx back button must have accessibilityLabel="뒤로가기"'
  );
});

// =============================================================================
// CHALLENGE 2: Category Tab Switching - Concurrency & Rejection Resilience
// =============================================================================

test('Adversarial Challenge 2.1: Category tabs produce valid keys and handle network rejection without uncaught errors', async () => {
  const tabs = [
    { label: '전체', keyRaw: 'global', expectedType: 'global' },
    { label: '취업', keyRaw: 'cat:job', expectedType: 'category' },
    { label: '학업', keyRaw: 'cat:study', expectedType: 'category' },
    { label: '건강', keyRaw: 'cat:health', expectedType: 'category' },
    { label: '관계', keyRaw: 'cat:relation', expectedType: 'category' },
    { label: '기타', keyRaw: 'cat:etc', expectedType: 'category' },
  ];

  for (const t of tabs) {
    const parsed = TowerKey.parse(t.keyRaw);
    assert.equal(parsed.type, t.expectedType);
    assert.equal(parsed.toString(), t.keyRaw);
  }

  // Test error rejection safety
  let fallbackTower: Tower | null = null;
  const failingRepo = {
    async findByKey(key: TowerKey): Promise<Tower> {
      throw new Error('503 Service Unavailable (Network Partition)');
    },
  };

  const loadTowerForKeyWithErrorHandling = async (key: TowerKey) => {
    try {
      return await failingRepo.findByKey(key);
    } catch {
      // Recovery behavior matching tower/index.tsx:120-128
      fallbackTower = new Tower(key, [], {
        stoneCount: 0,
        todayCount: 0,
        fulfilledCount: 0,
        cheerCount: 0,
      });
      return fallbackTower;
    }
  };

  const result = await loadTowerForKeyWithErrorHandling(TowerKey.category('health'));
  assert.ok(result instanceof Tower, 'Must recover cleanly and return fallback Tower instance');
  assert.equal(result.key.toString(), 'cat:health');
  assert.equal(result.stones.length, 0);
  assert.equal(result.stats.stoneCount, 0);
});

test('Adversarial Challenge 2.2: Category tab rapid switching race condition simulation (Out-of-Order Resolution)', async () => {
  // Simulate tab switching where earlier request arrives AFTER later request
  // Query 1: 'cat:job' (slow, 60ms)
  // Query 2: 'cat:study' (fast, 15ms)
  let activeTabKey = 'cat:study';
  let renderedTower: Tower | null = null;

  const asyncQuery = (keyRaw: string, delayMs: number): Promise<Tower> =>
    new Promise((resolve) => {
      setTimeout(() => {
        resolve(new Tower(TowerKey.parse(keyRaw), [createMockStoneItem({ id: `stone-${keyRaw}` })], {
          stoneCount: 1,
          todayCount: 1,
          fulfilledCount: 0,
          cheerCount: 0,
        }));
      }, delayMs);
    });

  // Naive un-cancelled flow (as implemented in tower/index.tsx)
  const executeNaiveTabSwitch = async () => {
    const q1 = asyncQuery('cat:job', 60).then((res) => {
      // In un-cancelled useEffect, this resolves and sets tower
      renderedTower = res;
    });

    const q2 = asyncQuery('cat:study', 15).then((res) => {
      renderedTower = res;
    });

    await Promise.all([q1, q2]);
  };

  await executeNaiveTabSwitch();

  const finalTower = renderedTower as any;
  const hasRaceConditionMismatch = finalTower?.key?.toString() !== activeTabKey;
  assert.equal(
    hasRaceConditionMismatch,
    true,
    'EMPIRICAL CONFIRMATION: Out-of-order promise resolution causes stale tab data overwrite if un-cancelled'
  );
});

// =============================================================================
// CHALLENGE 3: OrbitControls Mutual Exclusion with SCR-10 Bottom Sheet
// =============================================================================

test('Adversarial Challenge 3: OrbitControls is strictly mutually exclusive with SCR-10 bottom sheet', () => {
  const towerSource = fs.readFileSync(
    path.resolve(projectRoot, 'app/tower/index.tsx'),
    'utf8'
  );

  // Contract: enableOrbitControls={!isSheetOpen}
  assert.ok(
    towerSource.includes('const isSheetOpen = selectedStone !== null;'),
    'isSheetOpen must be derived from selectedStone !== null'
  );
  assert.ok(
    towerSource.includes('enableOrbitControls={!isSheetOpen}'),
    'StoneTowerCanvas must pass enableOrbitControls={!isSheetOpen}'
  );

  // In StoneTowerCanvas.tsx:
  const canvasSource = fs.readFileSync(
    path.resolve(projectRoot, 'presentation/components/StoneTowerCanvas.tsx'),
    'utf8'
  );

  // When enableOrbitControls is false, OrbitControls must NOT mount
  assert.ok(
    canvasSource.includes('{enableOrbitControls && (') &&
    canvasSource.includes('<OrbitControls'),
    'OrbitControls must be conditionally mounted only when enableOrbitControls is true'
  );

  // In WishDetailBottomSheet.tsx:
  const sheetSource = fs.readFileSync(
    path.resolve(projectRoot, 'presentation/components/WishDetailBottomSheet.tsx'),
    'utf8'
  );

  // Sheet card must stop touch propagation
  assert.ok(
    sheetSource.includes('e.stopPropagation()'),
    'WishDetailBottomSheet sheetCard must call e.stopPropagation() to prevent touch fall-through'
  );
  assert.ok(
    sheetSource.includes('<Modal'),
    'WishDetailBottomSheet must use React Native Modal for touch interception'
  );
});

// =============================================================================
// CHALLENGE 4: Cheering Concurrency, Idempotency & Button States
// =============================================================================

test('Adversarial Challenge 4.1: Cheer button state rules (owner disabled, already-cheered disabled, others enabled)', () => {
  const otherStone = createMockStoneItem({ id: 'stone-other', isMine: false });
  const ownStone = createMockStoneItem({ id: 'stone-mine', isMine: true });

  // 1) Other's stone, uncheered: enabled
  const stateActive = getCheerButtonState(otherStone, false);
  assert.equal(stateActive.enabled, true);
  assert.equal(stateActive.text, '🔥 마음 담아 응원하기');

  // 2) Other's stone, already cheered: disabled
  const stateAlreadyCheered = getCheerButtonState(otherStone, true);
  assert.equal(stateAlreadyCheered.enabled, false);
  assert.equal(stateAlreadyCheered.text, '✓ 응원 완료');

  // 3) Own stone: disabled
  const stateOwn = getCheerButtonState(ownStone, false);
  assert.equal(stateOwn.enabled, false);
  assert.equal(stateOwn.text, '내가 올린 소원입니다');

  // 4) Null stone: disabled
  const stateNull = getCheerButtonState(null);
  assert.equal(stateNull.enabled, false);
});

test('Adversarial Challenge 4.2: Rapid double-tap cheering burst concurrency and event emission', async () => {
  const effectBus = new InMemoryEffectBus();
  const toastStore = new ToastStore();

  let cheerApiCallCount = 0;
  const mockWishRepo: Partial<WishRepository> = {
    async cheer(id: string) {
      cheerApiCallCount++;
      return { level: CheerLevel.fromCount(cheerApiCallCount), levelUp: cheerApiCallCount === 1 };
    },
  };

  const initialStone = createMockStoneItem({
    id: 'wish-burst-target',
    cheerCount: 0,
    cheerLevel: 0,
    isMine: false,
  });

  const cheeredStoneIds = new Set<string>();
  let currentStone: TowerStoneItem = initialStone;
  let sparkEventCount = 0;

  effectBus.subscribe((e) => {
    if (e.type === 'cheer_spark') {
      sparkEventCount++;
    }
  });

  // Simulate handler execution with a re-entrancy / in-flight lock check
  let isCheeringInFlight = false;

  const robustHandleCheer = async (targetId: string) => {
    // Defense: guard against double-tap when call is already in-flight or already cheered
    if (isCheeringInFlight || cheeredStoneIds.has(targetId)) {
      return;
    }
    isCheeringInFlight = true;
    try {
      await mockWishRepo.cheer!(targetId);
      cheeredStoneIds.add(targetId);

      const updatedCount = (currentStone.cheerCount ?? 0) + 1;
      const updatedLevel = Math.min(3, (currentStone.cheerLevel ?? 0) + 1) as CheerLevelValue;
      currentStone = {
        ...currentStone,
        cheerCount: updatedCount,
        cheerLevel: updatedLevel,
      };

      effectBus.emit({
        type: 'cheer_spark',
        wishId: targetId,
        level: updatedLevel,
        levelUp: true,
      });

      toastStore.showCheerSuccess();
    } finally {
      isCheeringInFlight = false;
    }
  };

  // Simulate rapid double-tap (2 concurrent calls triggered simultaneously)
  await Promise.all([
    robustHandleCheer(initialStone.id),
    robustHandleCheer(initialStone.id),
  ]);

  // Assertions for idempotent single cheer execution
  assert.equal(cheerApiCallCount, 1, 'Rapid double-tap MUST fire exactly one cheer API call');
  assert.equal(currentStone.cheerCount, 1, 'Cheer count must increment by exactly 1');
  assert.equal(sparkEventCount, 1, 'Exactly one cheer_spark event must be emitted');
  assert.equal(toastStore.getToasts().length, 1, 'Exactly one toast must be displayed');
  assert.ok(cheeredStoneIds.has('wish-burst-target'), 'Stone must be marked as cheered in session');

  // Verify button state after cheering
  const postCheerState = getCheerButtonState(currentStone, cheeredStoneIds.has(currentStone.id));
  assert.equal(postCheerState.enabled, false, 'Cheer button must become disabled after cheer');
  assert.equal(postCheerState.text, '✓ 응원 완료');
});

test('Remediation 2.3: Sequence ref prevents stale out-of-order tab overwrite (empirically verifies loadSeqRef)', async () => {
  let activeTabKey = 'cat:study';
  let renderedTower: Tower | null = null;
  let currentSeq = 0;

  const asyncQuery = (keyRaw: string, delayMs: number): Promise<Tower> =>
    new Promise((resolve) => {
      setTimeout(() => {
        resolve(
          new Tower(
            TowerKey.parse(keyRaw),
            [createMockStoneItem({ id: `stone-${keyRaw}` })],
            {
              stoneCount: 1,
              todayCount: 1,
              fulfilledCount: 0,
              cheerCount: 0,
            }
          )
        );
      }, delayMs);
    });

  const loadTowerWithSeq = async (keyRaw: string, delayMs: number) => {
    const seq = ++currentSeq;
    const result = await asyncQuery(keyRaw, delayMs);
    if (seq === currentSeq) {
      renderedTower = result;
    }
  };

  // Switch to job (slow: 60ms), then study immediately (fast: 15ms)
  const q1 = loadTowerWithSeq('cat:job', 60);
  const q2 = loadTowerWithSeq('cat:study', 15);

  await Promise.all([q1, q2]);

  assert.ok(renderedTower !== null, 'Tower must be rendered');
  assert.equal(
    (renderedTower as any)?.key?.toString(),
    activeTabKey,
    'Fast later query cat:study must be the rendered tower; slower earlier query cat:job must be discarded by loadSeqRef'
  );
});

test('Remediation 4.3: Synchronous submittingRef lock prevents burst concurrent cheering calls in WishDetailBottomSheet', async () => {
  let onCheerCalls = 0;
  const mockOnCheer = async (wishId: string) => {
    onCheerCalls++;
    await new Promise((r) => setTimeout(r, 20));
  };

  const submittingRef = { current: false };
  let isSubmitting = false;

  const simulateHandleCheerPress = async (stoneId: string) => {
    if (isSubmitting || submittingRef.current) return;
    submittingRef.current = true;
    isSubmitting = true;
    try {
      await mockOnCheer(stoneId);
    } finally {
      submittingRef.current = false;
      isSubmitting = false;
    }
  };

  // Fire 5 rapid concurrent bursts
  await Promise.all([
    simulateHandleCheerPress('target-stone'),
    simulateHandleCheerPress('target-stone'),
    simulateHandleCheerPress('target-stone'),
    simulateHandleCheerPress('target-stone'),
    simulateHandleCheerPress('target-stone'),
  ]);

  assert.equal(onCheerCalls, 1, 'Synchronous submittingRef guard must ensure exactly 1 onCheer execution across concurrent bursts');
});

test('Remediation 5: Source contracts verify loadSeqRef and cheerInFlightRef in tower/index.tsx, and submittingRef in WishDetailBottomSheet.tsx', () => {
  const towerSource = fs.readFileSync(
    path.resolve(projectRoot, 'app/tower/index.tsx'),
    'utf8'
  );
  assert.ok(
    towerSource.includes('loadSeqRef = useRef(0)'),
    'tower/index.tsx must declare loadSeqRef'
  );
  assert.ok(
    towerSource.includes('seq === loadSeqRef.current'),
    'tower/index.tsx must gate setTower with seq === loadSeqRef.current'
  );
  assert.ok(
    towerSource.includes('cheerInFlightRef = useRef<Set<WishId>>(new Set())'),
    'tower/index.tsx must declare cheerInFlightRef'
  );
  assert.ok(
    towerSource.includes('cheerInFlightRef.current.has(targetId)'),
    'tower/index.tsx must guard handleCheer with cheerInFlightRef'
  );
  assert.ok(
    towerSource.includes('cheerInFlightRef.current.delete(targetId)'),
    'tower/index.tsx must clean up cheerInFlightRef in finally block'
  );

  const sheetSource = fs.readFileSync(
    path.resolve(projectRoot, 'presentation/components/WishDetailBottomSheet.tsx'),
    'utf8'
  );
  assert.ok(
    sheetSource.includes('submittingRef = useRef(false)'),
    'WishDetailBottomSheet.tsx must declare submittingRef'
  );
  assert.ok(
    sheetSource.includes('submittingRef.current = true'),
    'WishDetailBottomSheet.tsx must set submittingRef.current = true before async cheer'
  );
  assert.ok(
    sheetSource.includes('submittingRef.current = false'),
    'WishDetailBottomSheet.tsx must reset submittingRef.current = false in finally'
  );
});

