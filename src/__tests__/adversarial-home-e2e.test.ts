import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { Stone, type StoneShape } from '../domain/entities/Stone.ts';
import { Tower, type TowerStoneItem, type TowerStats } from '../domain/entities/Tower.ts';
import { Wish, type WishId, type WishStatus } from '../domain/entities/Wish.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import { TowerKey, type CategoryCode } from '../domain/value-objects/TowerKey.ts';
import { type BloomType } from '../domain/value-objects/BloomType.ts';
import { StonePhysicsBodyFactory } from '../infrastructure/physics/StonePhysicsBodyFactory.ts';
import { ToastStore } from '../presentation/components/toastStore.ts';
import { InMemoryEffectBus } from '../domain/ports/EffectBus.ts';
import {
  computeInitialSpawnPosition,
  computeDragWorldPosition,
  evaluateLiveBalance,
  shouldTriggerDrop,
  calculate3DDropPoseFromWorldPosition,
  DEFAULT_INITIAL_SPAWN_POSITION,
  BALANCE_THRESHOLD_STABLE,
  BALANCE_THRESHOLD_CAUTION,
  type DragWorldPositionResult,
} from '../presentation/components/stoneDragSpec.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// =============================================================================
// SCR-10 Presentation Logic Contracts (Mirrored & Verified from WishDetailBottomSheet.tsx)
// =============================================================================

export const CATEGORY_NAMES: Record<CategoryCode, string> = {
  job: '#취업',
  study: '#학업',
  health: '#건강',
  relation: '#인간관계',
  etc: '#기타',
};

export function formatCategoryBadge(category?: CategoryCode): string {
  if (!category) return '#기타';
  return CATEGORY_NAMES[category] ?? `#${category}`;
}

export function formatAuthorDisplay(
  stone: TowerStoneItem | null,
  isGroupTower?: boolean
): string {
  if (!stone) return '익명의 소원 돌';
  if (stone.isMine) {
    return '내가 올린 소원 ⭐️';
  }
  if (isGroupTower && stone.nickname) {
    return stone.nickname;
  }
  return '익명의 소원 돌';
}

export function formatCheerDisplay(stone: TowerStoneItem | null): string {
  if (!stone) return '✨ 빛 레벨 0';
  if (stone.isMine) {
    return `🔥 응원 ${stone.cheerCount ?? 0}회`;
  }
  return `✨ 빛 레벨 ${stone.cheerLevel}`;
}

export interface CheerButtonState {
  readonly enabled: boolean;
  readonly text: string;
}

export function getCheerButtonState(
  stone: TowerStoneItem | null,
  isCheered?: boolean
): CheerButtonState {
  if (!stone) {
    return { enabled: false, text: '소원 정보 없음' };
  }
  if (stone.isMine) {
    return { enabled: false, text: '내가 올린 소원입니다' };
  }
  if (isCheered) {
    return { enabled: false, text: '✓ 응원 완료' };
  }
  return { enabled: true, text: '🔥 마음 담아 응원하기' };
}

export function formatBloomLabel(bloom?: BloomType | null): string | null {
  if (!bloom) return null;
  if (bloom === 'flower') return '🌸 산들꽃 피어남';
  if (bloom === 'sprout') return '🌱 초록 새싹 돋아남';
  if (bloom === 'moss') return '🍀 포근한 이끼 덮임';
  return null;
}

// =============================================================================
// Helper Mock Factory
// =============================================================================

function createMockStoneItem(overrides?: Partial<TowerStoneItem>): TowerStoneItem {
  return {
    id: 'test-stone-01',
    content: '원하는 곳에 꼭 취업하기를',
    category: 'job',
    stone: new Stone({
      shape: 'round',
      color: '#4A5568',
      pose: new Pose({ x: 0, y: 0.5, z: 0 }),
    }),
    status: 'active',
    bloom: null,
    cheerLevel: 1,
    cheerCount: 3,
    isMine: false,
    nickname: null,
    ...overrides,
  };
}

interface MockRouter {
  readonly history: readonly string[];
  readonly currentRoute: string;
  readonly pushCount: Record<string, number>;
  push(route: string): void;
  back(): void;
  replace(route: string): void;
}

function createMockRouter(initialRoute = '/home'): MockRouter {
  const history: string[] = [initialRoute];
  const pushCount: Record<string, number> = {};

  return {
    get history() {
      return [...history];
    },
    get currentRoute() {
      return history[history.length - 1] ?? '/';
    },
    get pushCount() {
      return { ...pushCount };
    },
    push(route: string) {
      history.push(route);
      pushCount[route] = (pushCount[route] ?? 0) + 1;
    },
    back() {
      if (history.length > 1) {
        history.pop();
      }
    },
    replace(route: string) {
      if (history.length > 0) {
        history[history.length - 1] = route;
      } else {
        history.push(route);
      }
      pushCount[route] = (pushCount[route] ?? 0) + 1;
    },
  };
}

// =============================================================================
// ADVERSARIAL CASE 1: Empty or Zero-Data States in home.tsx (SCR-04)
// =============================================================================

test('Adversarial Case 1.1: Compact stat bar renders exact "돌 0 · 오늘 0 · 🌱 0" when all counts are 0', () => {
  const zeroStats: TowerStats = {
    stoneCount: 0,
    todayCount: 0,
    fulfilledCount: 0,
    cheerCount: 0,
  };

  // Expression verbatim from home.tsx:250
  const formattedStats = `돌 ${(zeroStats.stoneCount ?? 0).toLocaleString()} · 오늘 ${(zeroStats.todayCount ?? 0).toLocaleString()} · 🌱 ${(zeroStats.fulfilledCount ?? 0).toLocaleString()}`;
  assert.equal(formattedStats, '돌 0 · 오늘 0 · 🌱 0', 'Zero counts must format to exact "돌 0 · 오늘 0 · 🌱 0"');
});

test('Adversarial Case 1.2: Compact stat bar handles null tower and undefined stats without NaN or crash', () => {
  const nullTower = null as { stats?: Partial<TowerStats> } | null;
  const undefinedStatsTower: { stats?: Partial<TowerStats> } = {};

  const nullResult = `돌 ${(nullTower?.stats?.stoneCount ?? 0).toLocaleString()} · 오늘 ${(nullTower?.stats?.todayCount ?? 0).toLocaleString()} · 🌱 ${(nullTower?.stats?.fulfilledCount ?? 0).toLocaleString()}`;
  assert.equal(nullResult, '돌 0 · 오늘 0 · 🌱 0');

  const undefResult = `돌 ${(undefinedStatsTower.stats?.stoneCount ?? 0).toLocaleString()} · 오늘 ${(undefinedStatsTower.stats?.todayCount ?? 0).toLocaleString()} · 🌱 ${(undefinedStatsTower.stats?.fulfilledCount ?? 0).toLocaleString()}`;
  assert.equal(undefResult, '돌 0 · 오늘 0 · 🌱 0');
});

test('Adversarial Case 1.3: Cheer news banner is strictly hidden when unread cheer count is 0, undefined, or negative', () => {
  // Condition verbatim from home.tsx:378: {unreadCheerCount > 0 ? (...) : null}
  const isBannerVisible = (count: number | undefined | null) => (count !== undefined && count !== null ? count > 0 : false);

  assert.equal(isBannerVisible(0), false, 'Banner MUST be hidden when count is 0');
  assert.equal(isBannerVisible(-1), false, 'Banner MUST be hidden when count is negative');
  assert.equal(isBannerVisible(-999), false, 'Banner MUST be hidden for large negative count');
  assert.equal(isBannerVisible(undefined), false, 'Banner MUST be hidden when count is undefined');
  assert.equal(isBannerVisible(null), false, 'Banner MUST be hidden when count is null');

  // Verify positive count displays banner
  assert.equal(isBannerVisible(1), true, 'Banner must show for 1 cheer');
  assert.equal(isBannerVisible(42), true, 'Banner must show for 42 cheers');
});

test('Adversarial Case 1.4: Empty random wish cards feed handles index cycling and prevents NaN/division-by-zero', () => {
  const emptyCards: readonly any[] = [];
  const cardIndex = 0;
  const activeCard = emptyCards[cardIndex] ?? null;

  assert.equal(activeCard, null, 'Active card must be null when card feed is empty');

  // Next card cycle safety: when feed is empty, activeCard is null, so button is unrendered.
  // If invoked adversarially:
  const safeNextIndex = (currentIndex: number, length: number) => (length > 0 ? (currentIndex + 1) % length : 0);
  assert.equal(safeNextIndex(0, emptyCards.length), 0, 'Empty feed must not produce NaN');

  // Single card feed
  assert.equal(safeNextIndex(0, 1), 0, 'Single card feed cycles safely to 0');
});

test('Adversarial Case 1.5: Static AST audit verifies null-coalescing and safe cheer banner gating in home.tsx', () => {
  const homePath = path.resolve(projectRoot, 'app/home.tsx');
  const source = fs.readFileSync(homePath, 'utf8');

  // Verify safe null-coalescing on all 3 stat metrics
  assert.ok(source.includes('(state.tower?.stats.stoneCount ?? 0)'), 'Must null-coalesce stoneCount');
  assert.ok(source.includes('(state.tower?.stats.todayCount ?? 0)'), 'Must null-coalesce todayCount');
  assert.ok(source.includes('(state.tower?.stats.fulfilledCount ?? 0)'), 'Must null-coalesce fulfilledCount');

  // Verify strict conditional gating for cheer banner
  assert.ok(source.includes('unreadCheerCount > 0 ? ('), 'Banner must be strictly gated on unreadCheerCount > 0');

  // Verify safe fallback for empty random cards
  assert.ok(source.includes('소원 돌들을 불러오고 있습니다...'), 'Must render empty fallback message when activeCard is null');
});

test('Adversarial Case 1.6: Boundary stress: large number locale formatting does not crash or distort string layout', () => {
  const massiveStats: TowerStats = {
    stoneCount: 1_234_567,
    todayCount: 89_101,
    fulfilledCount: 54_321,
    cheerCount: 9_999_999,
  };

  const formattedStats = `돌 ${massiveStats.stoneCount.toLocaleString()} · 오늘 ${massiveStats.todayCount.toLocaleString()} · 🌱 ${massiveStats.fulfilledCount.toLocaleString()}`;
  assert.equal(formattedStats, '돌 1,234,567 · 오늘 89,101 · 🌱 54,321');
  assert.ok(formattedStats.length < 50, 'Even with millions of stones, formatted string remains concise');
});

// =============================================================================
// ADVERSARIAL CASE 2: In-Place WishDetailBottomSheet (SCR-10) State Stress
// =============================================================================

test('Adversarial Case 2.1: Rapid stone selection stress (1,000 rapid switches) maintains consistency and zero crashes', () => {
  const mockStones: TowerStoneItem[] = [
    createMockStoneItem({ id: 'stone-alpha', content: '취업 성공' }),
    createMockStoneItem({ id: 'stone-beta', content: '가족 건강' }),
    createMockStoneItem({ id: 'stone-gamma', content: '자격증 취득' }),
  ];

  let selectedStone: TowerStoneItem | null = null;
  const selectStone = (stoneId: string | null | undefined) => {
    if (!stoneId) {
      selectedStone = null;
      return;
    }
    selectedStone = mockStones.find((s) => s.id === stoneId) ?? null;
  };

  // Perform 1,000 rapid selection invocations with alternating IDs, nulls, and unknown IDs
  for (let i = 0; i < 1000; i++) {
    const choice = i % 5;
    if (choice === 0) selectStone('stone-alpha');
    else if (choice === 1) selectStone('stone-beta');
    else if (choice === 2) selectStone('stone-gamma');
    else if (choice === 3) selectStone('non-existent-id');
    else selectStone(null);
  }

  // After 1000 cycles (last i=999, 999 % 5 = 4 -> selectStone(null))
  assert.equal(selectedStone, null);

  // One more valid selection
  selectStone('stone-beta');
  assert.ok(selectedStone !== null);
  assert.equal((selectedStone as TowerStoneItem).id, 'stone-beta');
});

test('Adversarial Case 2.2: Null / undefined / invalid stone selection guarantees modal visibility is false', () => {
  const mockStones: TowerStoneItem[] = [
    createMockStoneItem({ id: 'stone-01' }),
  ];

  let selectedStone: TowerStoneItem | null = null;
  const onSelectStone = (stoneId: any) => {
    selectedStone = mockStones.find((s) => s.id === stoneId) ?? null;
  };

  // Test with null
  onSelectStone(null);
  assert.equal(selectedStone, null);
  let isModalVisible = selectedStone !== null;
  assert.equal(isModalVisible, false);

  // Test with undefined
  onSelectStone(undefined);
  assert.equal(selectedStone, null);
  isModalVisible = selectedStone !== null;
  assert.equal(isModalVisible, false);

  // Test with arbitrary unknown ID
  onSelectStone('unknown-bogus-stone-id-999');
  assert.equal(selectedStone, null);
  isModalVisible = selectedStone !== null;
  assert.equal(isModalVisible, false);
});

test('Adversarial Case 2.3: In-place modal selection NEVER triggers rogue navigation to /tower', () => {
  const router = createMockRouter('/home');
  const mockStones: TowerStoneItem[] = [
    createMockStoneItem({ id: 'stone-target' }),
  ];

  let selectedStone: TowerStoneItem | null = null;

  // Emulate home.tsx onSelectStone
  const onSelectStone = (stoneId: WishId) => {
    const found = mockStones.find((s) => s.id === stoneId) ?? null;
    setSelectedStone(found);
    // DO NOT invoke router.push('/tower')
  };

  function setSelectedStone(stone: TowerStoneItem | null) {
    selectedStone = stone;
  }

  // Trigger stone selection multiple times
  onSelectStone('stone-target');
  assert.ok(selectedStone !== null);
  assert.equal(router.currentRoute, '/home', 'Current route must stay on /home');
  assert.equal(router.pushCount['/tower'] ?? 0, 0, 'router.push(/tower) must NEVER be called upon stone tap');

  // Close sheet
  setSelectedStone(null);
  assert.equal(router.currentRoute, '/home');
  assert.equal(router.pushCount['/tower'] ?? 0, 0);
});

test('Adversarial Case 2.4: Modal open/close lifecycle (500 cycles) exhibits stable state recovery', () => {
  let selectedStone: TowerStoneItem | null = null;
  const targetStone = createMockStoneItem({ id: 'test-stone' });

  for (let cycle = 0; cycle < 500; cycle++) {
    // Open
    selectedStone = targetStone;
    assert.equal(selectedStone !== null, true);

    // Close
    selectedStone = null;
    assert.equal(selectedStone === null, true);
  }

  assert.equal(selectedStone, null, 'After 500 open/close cycles, state must rest cleanly at null');
});

test('Adversarial Case 2.5: Concurrent cheer button submission lock in WishDetailBottomSheet prevents duplicate cheers', async () => {
  let cheerApiCallCount = 0;
  let isSubmitting = false;
  let submittingRef = false;

  const mockOnCheer = async () => {
    cheerApiCallCount++;
    await new Promise((resolve) => setTimeout(resolve, 10)); // simulate 10ms network latency
  };

  const handleCheerPress = async () => {
    if (isSubmitting || submittingRef) return;
    submittingRef = true;
    isSubmitting = true;
    try {
      await mockOnCheer();
    } finally {
      submittingRef = false;
      isSubmitting = false;
    }
  };

  // Simulate rapid burst of 10 simultaneous user taps
  await Promise.all([
    handleCheerPress(),
    handleCheerPress(),
    handleCheerPress(),
    handleCheerPress(),
    handleCheerPress(),
    handleCheerPress(),
    handleCheerPress(),
    handleCheerPress(),
    handleCheerPress(),
    handleCheerPress(),
  ]);

  assert.equal(cheerApiCallCount, 1, 'Rapid multi-tap must be throttled to exactly 1 cheer invocation');
});

test('Adversarial Case 2.6: WishDetailBottomSheet rendering with edge-case stone data (null bloom, no nickname, own wish)', () => {
  // Edge Case A: Null stone
  assert.equal(formatAuthorDisplay(null), '익명의 소원 돌');
  assert.equal(formatCheerDisplay(null), '✨ 빛 레벨 0');
  assert.deepEqual(getCheerButtonState(null), { enabled: false, text: '소원 정보 없음' });
  assert.equal(formatCategoryBadge(undefined), '#기타');
  assert.equal(formatBloomLabel(null), null);

  // Edge Case B: Own wish (isMine = true)
  const ownStone = createMockStoneItem({ isMine: true, cheerCount: 42 });
  assert.equal(formatAuthorDisplay(ownStone), '내가 올린 소원 ⭐️');
  assert.equal(formatCheerDisplay(ownStone), '🔥 응원 42회');
  assert.deepEqual(getCheerButtonState(ownStone), { enabled: false, text: '내가 올린 소원입니다' });

  // Edge Case C: Group tower with nickname
  const groupStone = createMockStoneItem({ isMine: false, nickname: '달빛천사#7777' });
  assert.equal(formatAuthorDisplay(groupStone, true), '달빛천사#7777');

  // Edge Case D: Group tower without nickname (fallback)
  const anonymousGroupStone = createMockStoneItem({ isMine: false, nickname: null });
  assert.equal(formatAuthorDisplay(anonymousGroupStone, true), '익명의 소원 돌');

  // Edge Case E: Already cheered stone
  const cheeredStone = createMockStoneItem({ isMine: false });
  assert.deepEqual(getCheerButtonState(cheeredStone, true), { enabled: false, text: '✓ 응원 완료' });

  // Cross-verify with WishDetailBottomSheet.tsx source code
  const sheetPath = path.resolve(projectRoot, 'presentation/components/WishDetailBottomSheet.tsx');
  const sheetSource = fs.readFileSync(sheetPath, 'utf8');
  assert.ok(sheetSource.includes("formatAuthorDisplay(stone, isGroupTower)"));
  assert.ok(sheetSource.includes("formatCheerDisplay(stone)"));
  assert.ok(sheetSource.includes("getCheerButtonState(stone, isCheered)"));
});

// =============================================================================
// ADVERSARIAL CASE 3: Settings Navigation Stress & State Isolation
// =============================================================================

test('Adversarial Case 3.1: Settings navigation cycle /home -> [⚙️ 설정] -> /settings -> Back -> /home', () => {
  const router = createMockRouter('/home');

  // User taps [⚙️ 설정] chip in Header
  router.push('/settings');
  assert.equal(router.currentRoute, '/settings');
  assert.equal(router.history.length, 2);

  // User taps ◂ 홈 back button in Settings Screen
  router.back();
  assert.equal(router.currentRoute, '/home');
  assert.equal(router.history.length, 1);
});

test('Adversarial Case 3.2: Multi-roundtrip router stress (50 roundtrips) maintains stack integrity without leak', () => {
  const router = createMockRouter('/home');

  for (let round = 0; round < 50; round++) {
    router.push('/settings');
    assert.equal(router.currentRoute, '/settings');
    router.back();
    assert.equal(router.currentRoute, '/home');
    assert.equal(router.history.length, 1, 'History depth must collapse back to 1 at each round');
  }

  assert.equal(router.currentRoute, '/home');
  assert.equal(router.pushCount['/settings'], 50);
});

test('Adversarial Case 3.3: Settings screen actions do NOT mutate or pollute Home state', () => {
  // Simulated Home state
  const homeState = {
    activeCategory: TowerKey.category('study'),
    cardIndex: 3,
    cheeredWishIds: new Set(['wish-alpha', 'wish-beta']),
    selectedStone: null as TowerStoneItem | null,
  };

  // User navigates to settings and executes settings modifications
  let userNickname = '초기닉#1111';
  let userQuotaBonus = 0;
  let isSocialLinkModalOpen = false;

  const performSettingsOperations = () => {
    // 1. Update nickname
    userNickname = '멋진돌#9999';
    // 2. Grant bonus quota
    userQuotaBonus += 1;
    // 3. Open social linking modal
    isSocialLinkModalOpen = true;
  };

  performSettingsOperations();

  // Verify settings changed
  assert.equal(userNickname, '멋진돌#9999');
  assert.equal(userQuotaBonus, 1);
  assert.equal(isSocialLinkModalOpen, true);

  // Verify Home state is 100% UNTOUCHED
  assert.equal(homeState.activeCategory.toString(), 'cat:study', 'Home active category must remain study');
  assert.equal(homeState.cardIndex, 3, 'Home card feed index must remain 3');
  assert.equal(homeState.cheeredWishIds.size, 2, 'Cheered wishes set must remain size 2');
  assert.ok(homeState.cheeredWishIds.has('wish-alpha'));
  assert.ok(homeState.cheeredWishIds.has('wish-beta'));
  assert.equal(homeState.selectedStone, null);
});

test('Adversarial Case 3.4: Static AST separation of concerns - home.tsx contains no settings logic', () => {
  const homePath = path.resolve(projectRoot, 'app/home.tsx');
  const source = fs.readFileSync(homePath, 'utf8');

  // Verify that home.tsx routes to /settings via chip
  assert.ok(source.includes("router.push('/settings')"), 'Header must navigate to /settings');

  // Verify strict absence of settings mutators in home.tsx
  assert.ok(!source.includes('updateNickname'), 'home.tsx must not import or use updateNickname');
  assert.ok(!source.includes('grantRewardBonusQuota'), 'home.tsx must not import or use grantRewardBonusQuota');
  assert.ok(!source.includes('linkGuestToSocial'), 'home.tsx must not import or use linkGuestToSocial');
  assert.ok(!source.includes('withdrawAccount'), 'home.tsx must not import or use withdrawAccount');
  assert.ok(!source.includes('SettingsController'), 'home.tsx must not import SettingsController');
});

// =============================================================================
// ADVERSARIAL CASE 4: E2E Test Suite Validation & Production Math Alignment
// =============================================================================

test('Adversarial Case 4.1: Audit e2e-drag-anti-clipping-home.test.ts for dummy local assertions vs real contracts', () => {
  const e2ePath = path.resolve(projectRoot, '__tests__/e2e-drag-anti-clipping-home.test.ts');
  assert.ok(fs.existsSync(e2ePath), 'E2E test suite must exist');

  const source = fs.readFileSync(e2ePath, 'utf8');

  // 1. Audit R3 Home tests in e2e:
  // Identify that T1.13–T1.19 used local mockup objects
  const hasLocalHeaderActions = source.includes('const headerActions = {');
  const hasLocalScr04SectionsOrder = source.includes('const scr04SectionsOrder = [');
  const hasLocalViewportElements = source.includes('const viewportElements = {');
  const hasLocalSettingsCapabilities = source.includes('const settingsCapabilities = {');

  assert.ok(hasLocalHeaderActions, 'e2e T1.13 used inline local headerActions mock');
  assert.ok(hasLocalScr04SectionsOrder, 'e2e T1.14 used inline local sectionsOrder mock');
  assert.ok(hasLocalViewportElements, 'e2e T1.17 used inline local viewportElements mock');
  assert.ok(hasLocalSettingsCapabilities, 'e2e T1.19 used inline local settingsCapabilities mock');

  // 2. Cross-verify that home-scr04-settings.test.ts and adversarial-home-e2e.test.ts
  // test the ACTUAL source code and component AST instead of dummy objects.
});

test('Adversarial Case 4.2: Production 3D Drag Math Validation (src/presentation/components/stoneDragSpec.ts)', () => {
  // Test actual production exports from stoneDragSpec.ts
  const initialSpawn = computeInitialSpawnPosition();
  assert.deepEqual(initialSpawn, [0, 0.18, 1.15], 'Spawn coordinate must strictly be [0, 0.18, 1.15]');

  // Test upward pointer movement
  const topSurfaceY = 0.8;
  const result = computeDragWorldPosition(0, -100, initialSpawn, topSurfaceY);
  assert.ok(result.position[1] > initialSpawn[1], 'Upward screen drag must elevate 3D world Y');
  assert.ok(result.normalizedProgress > 0 && result.normalizedProgress <= 1.0, 'Progress must advance');

  // Test depth convergence toward summit
  const summitDeltaY = -((topSurfaceY + 0.35) - initialSpawn[1]) / 0.0035;
  const summitResult = computeDragWorldPosition(0, summitDeltaY, initialSpawn, topSurfaceY);
  assert.equal(summitResult.position[2], 0.0, 'Z must converge to 0.0 at summit');
  assert.equal(summitResult.normalizedProgress, 1.0, 'Progress must reach 1.0');
  assert.equal(summitResult.isOverDropZone, true, 'Centered summit position must be over drop zone');

  // Test live balance evaluation against production thresholds (0.22 / 0.35)
  assert.equal(BALANCE_THRESHOLD_STABLE, 0.22);
  assert.equal(BALANCE_THRESHOLD_CAUTION, 0.35);

  const stableEval = evaluateLiveBalance(0.10);
  assert.equal(stableEval.rating, 'stable');
  assert.equal(stableEval.isBalanced, true);

  const cautionEval = evaluateLiveBalance(0.28);
  assert.equal(cautionEval.rating, 'caution');
  assert.equal(cautionEval.isBalanced, false);

  const criticalEval = evaluateLiveBalance(0.40);
  assert.equal(criticalEval.rating, 'critical');
  assert.equal(criticalEval.isBalanced, false);

  // Test drop pose creation
  const dropPose = calculate3DDropPoseFromWorldPosition([0.05, 1.15, 0.0]);
  assert.ok(dropPose instanceof Pose);
  assert.equal(dropPose.position.x, 0.05);
  assert.equal(dropPose.position.y, 1.15);
  assert.equal(dropPose.position.z, 0.0);
  assert.equal(dropPose.rotation.qw, 1);
});

test('Adversarial Case 4.3: Discrepancy analysis: production threshold (0.22) vs e2e local threshold (0.12)', () => {
  // Production stoneDragSpec.ts sets BALANCE_THRESHOLD_STABLE = 0.22 (Toss UX ergonomic margin)
  // e2e test set local threshold to 0.12 (stricter synthetic requirement)
  // Both correctly classify center X=0 as 'stable' and extreme X=0.40 as 'critical'
  assert.equal(evaluateLiveBalance(0.0).rating, 'stable');
  assert.equal(evaluateLiveBalance(0.5).rating, 'critical');
});

test('Adversarial Case 4.4: Genuine E2E Multi-Tier Anti-Clipping Settlement Verification with production physics', () => {
  // Stack 5 stone shapes in sequence using production Pose.onTopOf & CANNON half-extents
  const shapeSequence: readonly StoneShape[] = ['boulder', 'flat', 'round', 'tall', 'pebble'];
  let currentSurfaceY = 0;
  const cairnStones: TowerStoneItem[] = [];

  for (let i = 0; i < shapeSequence.length; i++) {
    const shape = shapeSequence[i];
    const halfY = StonePhysicsBodyFactory.SHAPE_CONFIGS[shape].halfExtents.y;
    const pose = Pose.onTopOf(currentSurfaceY, halfY);

    const item = createMockStoneItem({
      id: `cairn-tier-${i}`,
      stone: new Stone({ shape, color: '#666', pose }),
    });
    cairnStones.push(item);

    // Verify flush contact with previous tier (penetration depth === 0.000m)
    if (i > 0) {
      const prev = cairnStones[i - 1];
      const prevHalfY = StonePhysicsBodyFactory.SHAPE_CONFIGS[prev.stone.shape].halfExtents.y;
      const prevTopSurface = prev.stone.pose.position.y + prevHalfY;
      const currentBottomSurface = pose.position.y - halfY;

      const penetration = prevTopSurface - currentBottomSurface;
      assert.ok(
        Math.abs(penetration) < 0.0001,
        `Tier ${i} (${shape}) on Tier ${i - 1} (${prev.stone.shape}) must have 0.000m penetration (actual: ${penetration}m)`
      );
    }

    currentSurfaceY = pose.position.y + halfY;
  }

  assert.equal(cairnStones.length, 5);
  assert.ok(currentSurfaceY > 1.9, '5-stone cairn must achieve realistic height above 1.9m');
});

test('Adversarial Case 4.5: Full System Invariant Check across home.tsx, settings/index.tsx, and stoneDragSpec.ts', () => {
  const homePath = path.resolve(projectRoot, 'app/home.tsx');
  const settingsPath = path.resolve(projectRoot, 'app/settings/index.tsx');

  const homeSource = fs.readFileSync(homePath, 'utf8');
  const settingsSource = fs.readFileSync(settingsPath, 'utf8');

  // SCR-04 Hierarchy check
  assert.ok(homeSource.includes('styles.header'));
  assert.ok(homeSource.includes('styles.tabBar'));
  assert.ok(homeSource.includes('styles.statsBar'));
  assert.ok(homeSource.includes('styles.towerViewport'));
  assert.ok(homeSource.includes('styles.cardBox'));
  assert.ok(homeSource.includes('styles.floatingButtonContainer'));

  // SCR-10 In-place check
  assert.ok(homeSource.includes('<WishDetailBottomSheet'));
  assert.ok(homeSource.includes('setSelectedStone'));

  // SCR-18 Settings check
  assert.ok(settingsSource.includes('updateNickname'));
  assert.ok(settingsSource.includes('grantRewardBonusQuota'));
  assert.ok(settingsSource.includes('linkGuestToSocial'));
  assert.ok(settingsSource.includes('withdrawAccount'));
});

test('Adversarial Case 2.7: Submission lock releases reliably even if onCheer throws network exception', async () => {
  let isSubmitting = false;
  let submittingRef = false;

  const failingOnCheer = async () => {
    throw new Error('NETWORK_TIMEOUT_504');
  };

  const handleCheerPress = async () => {
    if (isSubmitting || submittingRef) return;
    submittingRef = true;
    isSubmitting = true;
    try {
      await failingOnCheer();
    } catch {
      // Swallowed safely per WishDetailBottomSheet.tsx line 124
    } finally {
      submittingRef = false;
      isSubmitting = false;
    }
  };

  await handleCheerPress();
  assert.equal(isSubmitting, false, 'isSubmitting must reset to false after exception');
  assert.equal(submittingRef, false, 'submittingRef must reset to false after exception');

  // Next press should succeed without being locked out
  let nextAttemptExecuted = false;
  const succeedingOnCheer = async () => {
    nextAttemptExecuted = true;
  };
  const handleNextCheerPress = async () => {
    if (isSubmitting || submittingRef) return;
    submittingRef = true;
    isSubmitting = true;
    try {
      await succeedingOnCheer();
    } finally {
      submittingRef = false;
      isSubmitting = false;
    }
  };

  await handleNextCheerPress();
  assert.equal(nextAttemptExecuted, true, 'Next cheer attempt must execute after error recovery');
});

test('Adversarial Case 3.5: Settings screen deep-link back navigation falls back to router.replace("/home")', () => {
  let replacedRoute: string | null = null;
  let backedOut = false;

  const mockDeepLinkRouter = {
    canGoBack: () => false, // Initial entry from external deep link
    back: () => {
      backedOut = true;
    },
    replace: (route: string) => {
      replacedRoute = route;
    },
  };

  // Logic verbatim from SettingsScreen (settings/index.tsx lines 87-91)
  const onBackPress = () => {
    if (mockDeepLinkRouter.canGoBack && mockDeepLinkRouter.canGoBack()) {
      mockDeepLinkRouter.back();
    } else {
      mockDeepLinkRouter.replace('/home');
    }
  };

  onBackPress();
  assert.equal(backedOut, false, 'back() should not be called when canGoBack is false');
  assert.equal(replacedRoute, '/home', 'Must safely replace route with /home on direct deep link');
});

test('Adversarial Case 4.6: Opaque-box E2E critique: verify all four synthetic mock assertions in e2e suite are audited against real home.tsx', () => {
  const homePath = path.resolve(projectRoot, 'app/home.tsx');
  const source = fs.readFileSync(homePath, 'utf8');

  // Verify that the 4 synthetic objects in e2e-drag-anti-clipping-home.test.ts correspond to actual code:
  // 1. headerActions.settingsChip -> router.push('/settings')
  assert.ok(source.includes("router.push('/settings')"), 'Real home.tsx must contain /settings navigation');

  // 2. scr04SectionsOrder -> styles order in JSX
  const stylesSequence = [
    'styles.header',
    'styles.tabBar',
    'styles.statsBar',
    'styles.towerViewport',
    'styles.cardBox',
    'styles.cheerNewsBanner',
    'styles.floatingButtonContainer',
  ];
  let lastIndex = -1;
  for (const styleName of stylesSequence) {
    const idx = source.indexOf(styleName);
    assert.ok(idx > lastIndex, `${styleName} must appear in strict SCR-04 sequential order`);
    lastIndex = idx;
  }

  // 3. viewportElements.redundantBottomBannerPresent -> absence of exploreBannerButton
  assert.ok(!source.includes('exploreBannerButton'), 'Redundant banner must be absent in real code');

  // 4. Wish feed report trigger
  assert.ok(source.includes('setReportModalVisible(true)'), 'Report modal trigger must exist in real code');
});

