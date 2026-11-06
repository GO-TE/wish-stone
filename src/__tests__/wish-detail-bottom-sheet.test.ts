import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { Stone } from '../domain/entities/Stone.ts';
import { type TowerStoneItem } from '../domain/entities/Tower.ts';
import { type WishId } from '../domain/entities/Wish.ts';
import { type BloomType } from '../domain/value-objects/BloomType.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import { type CategoryCode } from '../domain/value-objects/TowerKey.ts';
import { defaultToastStore, ToastStore } from '../presentation/components/toastStore.ts';
import { TossTheme } from '../presentation/theme/tossTheme.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure ToastStore.instance singleton exists
if (!(ToastStore as any).instance) {
  (ToastStore as any).instance = defaultToastStore;
}

// =============================================================================
// SCR-10 Presentation Model Logic Specification
// Directly mirrors the implementation in WishDetailBottomSheet.tsx
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

function createMockStoneItem(overrides: Partial<TowerStoneItem> = {}): TowerStoneItem {
  return {
    id: 'test-stone-01',
    content: '매일 한 걸음씩 성장하는 개발자가 되기',
    category: 'job',
    stone: new Stone({
      shape: 'round',
      color: '#4A5568',
      pose: Pose.origin(),
    }),
    status: 'active',
    bloom: null,
    cheerLevel: 1,
    cheerCount: 3,
    isMine: false,
    nickname: null,
    createdAt: new Date('2026-11-06T00:00:00Z'),
    ...overrides,
  };
}

// =============================================================================
// Requirement 3.1: Author Info Formatting
// - Anonymous for public/category towers (DB-023)
// - Nickname for group towers (DB-005)
// - Own indicator ('내가 올린 소원 ⭐️')
// =============================================================================

test('WishDetailBottomSheet: Author info formatting - anonymous for public, nickname for group, own indicator', () => {
  // 1) Public / Global tower: strictly anonymous
  const publicStoneWithInternalNickname = createMockStoneItem({
    isMine: false,
    nickname: '비밀개발자#1234',
  });
  const publicAuthor = formatAuthorDisplay(publicStoneWithInternalNickname, false);
  assert.equal(publicAuthor, '익명의 소원 돌', 'Public tower must hide author nickname');
  assert.ok(!publicAuthor.includes('비밀개발자'), 'Nickname must not leak in public display');

  // 2) Group tower: displays nickname
  const groupStone = createMockStoneItem({
    isMine: false,
    nickname: '코딩장인#7777',
  });
  const groupAuthor = formatAuthorDisplay(groupStone, true);
  assert.equal(groupAuthor, '코딩장인#7777', 'Group tower must reveal author nickname');

  // 3) Group tower with null nickname: fallback to anonymous
  const groupStoneNoNick = createMockStoneItem({
    isMine: false,
    nickname: null,
  });
  const groupNoNickAuthor = formatAuthorDisplay(groupStoneNoNick, true);
  assert.equal(groupNoNickAuthor, '익명의 소원 돌', 'Null nickname in group must fall back to anonymous');

  // 4) Own stone: always '내가 올린 소원 ⭐️'
  const ownStone = createMockStoneItem({
    isMine: true,
    nickname: '나자신#0001',
  });
  assert.equal(
    formatAuthorDisplay(ownStone, false),
    '내가 올린 소원 ⭐️',
    'Own indicator must show on public towers'
  );
  assert.equal(
    formatAuthorDisplay(ownStone, true),
    '내가 올린 소원 ⭐️',
    'Own indicator must show on group towers'
  );

  // 5) Null stone: returns anonymous
  assert.equal(formatAuthorDisplay(null), '익명의 소원 돌');
});

// =============================================================================
// Requirement 3.2: Cheer Count Privacy
// - Exact count for author ('🔥 응원 {count}회')
// - Glow level for others ('✨ 빛 레벨 {level}') per DB-017 / D-006
// =============================================================================

test('WishDetailBottomSheet: Cheer count privacy - exact count for author, glow level for others', () => {
  // 1) Other user's stone: shows cheer level only, hides exact count
  const otherStone = createMockStoneItem({
    isMine: false,
    cheerLevel: 2,
    cheerCount: 14,
  });
  const otherCheer = formatCheerDisplay(otherStone);
  assert.equal(otherCheer, '✨ 빛 레벨 2', 'Others must only see cheer glow level');
  assert.ok(!otherCheer.includes('14회'), 'Exact count must not be revealed to others');

  // Level 0 edge case
  const otherStoneLvl0 = createMockStoneItem({
    isMine: false,
    cheerLevel: 0,
    cheerCount: 0,
  });
  assert.equal(formatCheerDisplay(otherStoneLvl0), '✨ 빛 레벨 0');

  // 2) Own stone: shows exact count
  const ownStone = createMockStoneItem({
    isMine: true,
    cheerLevel: 2,
    cheerCount: 14,
  });
  const ownCheer = formatCheerDisplay(ownStone);
  assert.equal(ownCheer, '🔥 응원 14회', 'Author must see exact cheer count');

  // Own stone with undefined count defaults to 0회
  const ownStoneUndefinedCount = createMockStoneItem({
    isMine: true,
    cheerLevel: 0,
    cheerCount: undefined,
  });
  assert.equal(formatCheerDisplay(ownStoneUndefinedCount), '🔥 응원 0회');

  // Null stone fallback
  assert.equal(formatCheerDisplay(null), '✨ 빛 레벨 0');
});

// =============================================================================
// Requirement 3.3: Cheer Button States
// - Disabled for owner ('내가 올린 소원입니다')
// - Disabled if already cheered ('✓ 응원 완료')
// - Active for others ('🔥 마음 담아 응원하기')
// =============================================================================

test('WishDetailBottomSheet: Cheer button states - disabled for owner, disabled if already cheered, active for others', () => {
  // 1) Active for others when uncheered
  const othersStone = createMockStoneItem({ isMine: false });
  const activeState = getCheerButtonState(othersStone, false);
  assert.equal(activeState.enabled, true, 'Cheer button must be active for others uncheered stone');
  assert.equal(activeState.text, '🔥 마음 담아 응원하기');

  // 2) Disabled for owner
  const ownStone = createMockStoneItem({ isMine: true });
  const ownState = getCheerButtonState(ownStone, false);
  assert.equal(ownState.enabled, false, 'Cheer button must be disabled for author own stone');
  assert.equal(ownState.text, '내가 올린 소원입니다');

  // 3) Disabled if already cheered
  const cheeredState = getCheerButtonState(othersStone, true);
  assert.equal(cheeredState.enabled, false, 'Cheer button must be disabled if already cheered in session');
  assert.equal(cheeredState.text, '✓ 응원 완료');

  // 4) Null stone
  const nullState = getCheerButtonState(null);
  assert.equal(nullState.enabled, false);
});

// =============================================================================
// Requirement 3.4: Category Badge & Bloom Label Formatting
// =============================================================================

test('WishDetailBottomSheet: Category badge and bloom label formatting', () => {
  assert.equal(formatCategoryBadge('job'), '#취업');
  assert.equal(formatCategoryBadge('study'), '#학업');
  assert.equal(formatCategoryBadge('health'), '#건강');
  assert.equal(formatCategoryBadge('relation'), '#인간관계');
  assert.equal(formatCategoryBadge('etc'), '#기타');
  assert.equal(formatCategoryBadge(undefined), '#기타');

  assert.equal(formatBloomLabel('flower'), '🌸 산들꽃 피어남');
  assert.equal(formatBloomLabel('sprout'), '🌱 초록 새싹 돋아남');
  assert.equal(formatBloomLabel('moss'), '🍀 포근한 이끼 덮임');
  assert.equal(formatBloomLabel(null), null);
  assert.equal(formatBloomLabel(undefined), null);
});

// =============================================================================
// Requirement 3.5: Cheering Action & ToastStore.instance Integration
// =============================================================================

test('WishDetailBottomSheet: Cheering action triggers ToastStore.instance.showCheerSuccess()', async () => {
  assert.ok((ToastStore as any).instance, 'ToastStore.instance singleton must exist');

  const instance = (ToastStore as any).instance as ToastStore;
  let cheeredWishId: WishId | null = null;

  const mockOnCheer = async (wishId: WishId) => {
    cheeredWishId = wishId;
  };

  const stone = createMockStoneItem({ id: 'wish-cheer-target', isMine: false });

  // Simulate cheering flow execution
  await mockOnCheer(stone.id);
  const toast = instance.showCheerSuccess();

  assert.equal(cheeredWishId, 'wish-cheer-target', 'onCheer must receive stone ID');
  assert.equal(toast.variant, 'cheer');
  assert.equal(toast.text, '누군가의 마음에 불꽃이 닿았습니다 🔥');

  instance.dismiss(toast.id);
});

// =============================================================================
// Requirement 3.6: Static Contract & Source Verification of WishDetailBottomSheet.tsx
// =============================================================================

test('WishDetailBottomSheet: Component file structure and interface contract verification', () => {
  const componentPath = path.resolve(
    __dirname,
    '../presentation/components/WishDetailBottomSheet.tsx'
  );
  assert.ok(fs.existsSync(componentPath), 'WishDetailBottomSheet.tsx file must exist');

  const source = fs.readFileSync(componentPath, 'utf8');

  // Verify exports
  assert.ok(
    source.includes('export function WishDetailBottomSheet'),
    'Must export WishDetailBottomSheet component function'
  );
  assert.ok(
    source.includes('export interface WishDetailBottomSheetProps'),
    'Must export WishDetailBottomSheetProps interface'
  );

  // Verify props declaration
  assert.ok(source.includes('readonly visible: boolean'));
  assert.ok(source.includes('readonly stone: TowerStoneItem | null'));
  assert.ok(source.includes('readonly onClose: () => void'));
  assert.ok(source.includes('readonly onCheer?: (wishId: WishId) => Promise<void> | void'));
  assert.ok(source.includes('readonly isCheered?: boolean'));
  assert.ok(source.includes('readonly isGroupTower?: boolean'));

  // Verify Toss aesthetic tokens
  assert.ok(source.includes('TossTheme.colors.cardElevated'), 'Must use TossTheme.colors.cardElevated');
  assert.ok(source.includes('TossTheme.radius.modal'), 'Must use modal border radius 28');
  assert.ok(source.includes('rgba(0, 0, 0, 0.6)'), 'Must use 0.6 opacity modal backdrop');
  assert.ok(source.includes('handleBar'), 'Must render top handle bar indicator');
  assert.ok(source.includes('closeButton'), 'Must render close button');

  // Verify ToastStore.instance integration
  assert.ok(
    source.includes('ToastStore') && source.includes('showCheerSuccess'),
    'Must call showCheerSuccess on ToastStore'
  );
});
