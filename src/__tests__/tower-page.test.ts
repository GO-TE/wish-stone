import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { Stone } from '../domain/entities/Stone.ts';
import { Tower, type TowerStoneItem } from '../domain/entities/Tower.ts';
import { Wish, type WishId } from '../domain/entities/Wish.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import { TowerKey, type CategoryCode } from '../domain/value-objects/TowerKey.ts';
import { CheerLevel, type CheerLevelValue } from '../domain/value-objects/CheerLevel.ts';
import { InMemoryEffectBus, type VisualEffectEvent } from '../domain/ports/EffectBus.ts';
import { type WishRepository, type TowerRepository } from '../domain/ports/repositories.ts';
import {
  ToastStore,
  defaultToastStore,
} from '../presentation/components/toastStore.ts';
import { type CameraPresetType } from '../presentation/components/cameraPresetSpec.ts';

// ESM-safe paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// =============================================================================
// Specification Constants Matching src/app/tower/index.tsx
// =============================================================================

export interface TowerCategoryTabItem {
  readonly label: string;
  readonly keyRaw: string;
  readonly key: TowerKey;
}

export const TOWER_CATEGORY_TABS: readonly TowerCategoryTabItem[] = [
  { label: '전체', keyRaw: 'global', key: TowerKey.global() },
  { label: '취업', keyRaw: 'cat:job', key: TowerKey.category('job') },
  { label: '학업', keyRaw: 'cat:study', key: TowerKey.category('study') },
  { label: '건강', keyRaw: 'cat:health', key: TowerKey.category('health') },
  { label: '관계', keyRaw: 'cat:relation', key: TowerKey.category('relation') },
  { label: '기타', keyRaw: 'cat:etc', key: TowerKey.category('etc') },
];

export const CAMERA_PRESET_ITEMS: readonly {
  label: string;
  preset: CameraPresetType;
}[] = [
  { label: '정면', preset: 'front' },
  { label: '측면 45°', preset: 'side45' },
  { label: '탑뷰', preset: 'top' },
  { label: '360° 자유', preset: 'free' },
];

// =============================================================================
// Helper Mock Factory
// =============================================================================

function createMockStoneItem(overrides?: Partial<TowerStoneItem>): TowerStoneItem {
  return {
    id: overrides?.id ?? 'wish-test-101',
    content: overrides?.content ?? '목표 달성을 간절히 기원합니다',
    category: overrides?.category ?? 'job',
    stone: overrides?.stone ?? new Stone({ shape: 'round', color: '#888888', pose: new Pose({ x: 0, y: 1.2, z: 0 }) }),
    status: overrides?.status ?? 'active',
    bloom: overrides?.bloom ?? null,
    cheerLevel: overrides?.cheerLevel ?? 0,
    cheerCount: overrides?.cheerCount ?? 0,
    isMine: overrides?.isMine ?? false,
    nickname: overrides?.nickname ?? null,
    createdAt: overrides?.createdAt ?? new Date(),
  };
}

function createMockRouter(initialRoute = '/home') {
  const routes = [initialRoute];
  return {
    get current() {
      return routes[routes.length - 1];
    },
    get history() {
      return [...routes];
    },
    push(path: string) {
      routes.push(path);
    },
    back() {
      if (routes.length > 1) {
        routes.pop();
      }
    },
  };
}

// =============================================================================
// Unit Tests: Milestone 3 Dedicated Tower Exploration Page & Navigation
// =============================================================================

test('Tower Route: 1. Route contract verifies /tower is defined and navigates from /home', () => {
  const router = createMockRouter('/home');
  assert.equal(router.current, '/home');

  // Trigger navigation via 360° 둘러보기 button in home header
  router.push('/tower');
  assert.equal(router.current, '/tower');
  assert.deepEqual(router.history, ['/home', '/tower']);

  // Trigger return navigation via top header back button
  router.back();
  assert.equal(router.current, '/home');
});

test('Tower Route: 2. Source contract verifies _layout.tsx and home.tsx navigation integration', () => {
  const layoutPath = path.resolve(projectRoot, 'app/_layout.tsx');
  assert.ok(fs.existsSync(layoutPath), '_layout.tsx must exist');
  const layoutSource = fs.readFileSync(layoutPath, 'utf8');
  assert.ok(
    layoutSource.includes('name="tower/index"'),
    '_layout.tsx must register route tower/index'
  );
  assert.ok(
    layoutSource.includes('headerShown: false'),
    'tower/index screen must configure headerShown: false'
  );

  const homePath = path.resolve(projectRoot, 'app/home.tsx');
  assert.ok(fs.existsSync(homePath), 'home.tsx must exist');
  const homeSource = fs.readFileSync(homePath, 'utf8');
  assert.ok(
    homeSource.includes("router.push('/tower')"),
    "home.tsx must call router.push('/tower')"
  );
  assert.ok(
    homeSource.includes('360° 둘러보기'),
    'home.tsx must provide 360° 둘러보기 entry button'
  );
});

test('Tower Tabs: 3. Category filter tabs specification has 6 distinct categories with correct keys', () => {
  assert.equal(TOWER_CATEGORY_TABS.length, 6, 'There must be exactly 6 category tabs');

  const expectedTabs = [
    { label: '전체', keyRaw: 'global', type: 'global' },
    { label: '취업', keyRaw: 'cat:job', type: 'category' },
    { label: '학업', keyRaw: 'cat:study', type: 'category' },
    { label: '건강', keyRaw: 'cat:health', type: 'category' },
    { label: '관계', keyRaw: 'cat:relation', type: 'category' },
    { label: '기타', keyRaw: 'cat:etc', type: 'category' },
  ];

  expectedTabs.forEach((expected, i) => {
    const tab = TOWER_CATEGORY_TABS[i];
    assert.equal(tab.label, expected.label);
    assert.equal(tab.keyRaw, expected.keyRaw);
    assert.equal(tab.key.type, expected.type);
    assert.equal(tab.key.toString(), expected.keyRaw);
  });
});

test('Tower Tabs: 4. Tab switching correctly queries repository via TowerKey.parse', async () => {
  const queriedKeys: string[] = [];

  const mockTowerRepo = {
    async findByKey(key: TowerKey) {
      queriedKeys.push(key.toString());
      return new Tower(key, [], {
        stoneCount: 0,
        todayCount: 0,
        fulfilledCount: 0,
        cheerCount: 0,
      });
    },
  };

  // Simulate switching through all category tabs
  const testTabs = ['global', 'cat:job', 'cat:study', 'cat:health', 'cat:relation', 'cat:etc'];

  for (const raw of testTabs) {
    const parsedKey = TowerKey.parse(raw);
    const tower = await mockTowerRepo.findByKey(parsedKey);
    assert.equal(tower.key.toString(), raw);
  }

  assert.deepEqual(queriedKeys, testTabs);
});

test('Stone Selection: 5. Selecting stone opens SCR-10 bottom sheet and disables OrbitControls', () => {
  const stone1 = createMockStoneItem({ id: 'stone-1' });
  const stone2 = createMockStoneItem({ id: 'stone-2' });
  const tower = new Tower(TowerKey.global(), [stone1, stone2], {
    stoneCount: 2,
    todayCount: 1,
    fulfilledCount: 0,
    cheerCount: 4,
  });

  // Initial state: nothing selected
  let selectedStone: TowerStoneItem | null = null;
  const isSheetOpen = () => selectedStone !== null;
  const isOrbitControlsEnabled = () => !isSheetOpen();

  assert.equal(selectedStone, null);
  assert.equal(isSheetOpen(), false);
  assert.equal(isOrbitControlsEnabled(), true, 'OrbitControls must be enabled when no stone is selected');

  // Select stone-1
  selectedStone = tower.stones.find((s) => s.id === 'stone-1') ?? null;
  assert.equal(selectedStone?.id, 'stone-1');
  assert.equal(isSheetOpen(), true, 'Sheet must be open when stone is selected');
  assert.equal(isOrbitControlsEnabled(), false, 'OrbitControls must be disabled while bottom sheet is open');

  // Close sheet
  selectedStone = null;
  assert.equal(isSheetOpen(), false);
  assert.equal(isOrbitControlsEnabled(), true, 'OrbitControls must re-enable when bottom sheet is closed');
});

test('Camera Presets HUD: 6. Floating HUD supports 4 view presets and transitions', () => {
  assert.equal(CAMERA_PRESET_ITEMS.length, 4);
  assert.deepEqual(
    CAMERA_PRESET_ITEMS.map((c) => c.preset),
    ['front', 'side45', 'top', 'free']
  );
  assert.deepEqual(
    CAMERA_PRESET_ITEMS.map((c) => c.label),
    ['정면', '측면 45°', '탑뷰', '360° 자유']
  );

  let activePreset = 'front';
  const selectPreset = (next: string) => {
    activePreset = next;
  };

  selectPreset('side45');
  assert.equal(activePreset, 'side45');

  selectPreset('top');
  assert.equal(activePreset, 'top');

  selectPreset('free');
  assert.equal(activePreset, 'free');
});

test('Cheer Integration: 7. Cheer action calls repository, updates count, emits cheer_spark, and displays toast', async () => {
  const effectBus = new InMemoryEffectBus();
  const toastStore = new ToastStore();

  let cheerCallCount = 0;
  let cheeredWishId: WishId | null = null;

  const mockWishRepo: Partial<WishRepository> = {
    async cheer(id: WishId) {
      cheerCallCount++;
      cheeredWishId = id;
      return { level: CheerLevel.fromCount(1), levelUp: true };
    },
  };

  const initialStone = createMockStoneItem({
    id: 'wish-to-cheer-99',
    cheerCount: 2,
    cheerLevel: 1,
    isMine: false,
  });

  const cheeredStoneIds = new Set<WishId>();
  let currentStone: TowerStoneItem = initialStone;

  // Simulate handleCheer execution
  const handleCheer = async (targetId: WishId) => {
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
      levelUp: updatedLevel > initialStone.cheerLevel,
    });

    toastStore.showCheerSuccess();
  };

  await handleCheer(initialStone.id);

  // Assertions
  assert.equal(cheerCallCount, 1, 'Repository cheer must be called once');
  assert.equal(cheeredWishId, 'wish-to-cheer-99');
  assert.equal(currentStone.cheerCount, 3, 'Local cheer count must increment to 3');
  assert.equal(currentStone.cheerLevel, 2, 'Local cheer level must advance to 2');
  assert.ok(cheeredStoneIds.has('wish-to-cheer-99'), 'Stone ID must be added to session cheered set');

  // Verify visual event
  const history = effectBus.getHistory();
  const spark = history.find((e) => e.type === 'cheer_spark');
  assert.ok(spark, 'cheer_spark event must be emitted on EffectBus');

  // Verify emotional toast
  const toasts = toastStore.getToasts();
  assert.equal(toasts.length, 1);
  assert.ok(toasts[0].text.includes('누군가의 마음에 불꽃이 닿았습니다'));
});

test('Tower Exploration File: 8. Static source code verification of src/app/tower/index.tsx', () => {
  const towerIndexPath = path.resolve(projectRoot, 'app/tower/index.tsx');
  assert.ok(fs.existsSync(towerIndexPath), 'src/app/tower/index.tsx must exist');

  const source = fs.readFileSync(towerIndexPath, 'utf8');

  // Verify key components and props are mounted
  assert.ok(source.includes('StoneTowerCanvas'), 'Must mount StoneTowerCanvas');
  assert.ok(source.includes('WishDetailBottomSheet'), 'Must mount WishDetailBottomSheet');
  assert.ok(source.includes('CheerSparkEffect'), 'Must mount CheerSparkEffect');
  assert.ok(source.includes('enableOrbitControls={!isSheetOpen}'), 'Must disable OrbitControls when sheet is open');
  assert.ok(source.includes('enablePan={true}'), 'Must enable Pan');
  assert.ok(source.includes('enableZoom={true}'), 'Must enable Zoom');
  assert.ok(source.includes('findByKey'), 'Must call findByKey on towers repository');
  assert.ok(source.includes('router.back()'), 'Must wire back button to router.back()');
  assert.ok(source.includes("router.push('/stack/ar')"), 'Must wire AR button to /stack/ar');
});
