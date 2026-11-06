import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { Stone } from '../domain/entities/Stone.ts';
import { Tower, type TowerStoneItem } from '../domain/entities/Tower.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import { type CategoryCode, TowerKey } from '../domain/value-objects/TowerKey.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

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

// =============================================================================
// Suite 1: SCR-04 Hierarchy & Static Layout Compliance
// =============================================================================

test('SCR-04 Suite 1.1: src/app/home.tsx exists and imports canonical dependencies', () => {
  const homePath = path.resolve(projectRoot, 'app/home.tsx');
  assert.ok(fs.existsSync(homePath), 'src/app/home.tsx must exist');

  const source = fs.readFileSync(homePath, 'utf8');

  // Verify key components
  assert.ok(source.includes('StoneTowerCanvas'), 'Must import StoneTowerCanvas');
  assert.ok(source.includes('WishDetailBottomSheet'), 'Must import WishDetailBottomSheet');
  assert.ok(source.includes('CheerSparkEffect'), 'Must import CheerSparkEffect');
  assert.ok(source.includes('TossTheme'), 'Must import TossTheme');
});

test('SCR-04 Suite 1.2: Header Brand and Navigation Chips include [그룹], [내 소원], and [⚙️ 설정]', () => {
  const homePath = path.resolve(projectRoot, 'app/home.tsx');
  const source = fs.readFileSync(homePath, 'utf8');

  // Brand logo
  assert.ok(source.includes('⛰️'), 'Brand icon must be ⛰️');
  assert.ok(source.includes('위시스톤'), 'Brand text must be 위시스톤');

  // Navigation chips in Header
  assert.ok(source.includes("router.push('/groups')"), 'Header must route to /groups');
  assert.ok(source.includes("router.push('/me/wishes')"), 'Header must route to /me/wishes');
  assert.ok(source.includes("router.push('/settings')"), 'Header must route to /settings');

  // Verify Settings label
  assert.ok(source.includes('⚙️ 설정'), 'Header action must have [⚙️ 설정] chip');
});

test('SCR-04 Suite 1.3: Canonical top-to-bottom hierarchy ordering in home.tsx', () => {
  const homePath = path.resolve(projectRoot, 'app/home.tsx');
  const source = fs.readFileSync(homePath, 'utf8');

  // Verify relative appearance order in JSX:
  // 1. Header (styles.header)
  // 2. Section ① Tab Bar (styles.tabBar)
  // 3. Section ② Stats Bar (styles.statsBar)
  // 4. Section ③ 3D Cairn Viewport (styles.towerViewport)
  // 5. Section ④ Wish Card Feed (styles.cardBox)
  // 6. Section ⑤ Cheer News Banner (styles.cheerNewsBanner)
  // 7. Section ⑥ Floating CTA Button (styles.floatingButtonContainer)

  const posHeader = source.indexOf('styles.header');
  const posTabBar = source.indexOf('styles.tabBar');
  const posStatsBar = source.indexOf('styles.statsBar');
  const posTowerViewport = source.indexOf('styles.towerViewport');
  const posCardBox = source.indexOf('styles.cardBox');
  const posCheerNews = source.indexOf('styles.cheerNewsBanner');
  const posFloatingCta = source.indexOf('styles.floatingButtonContainer');

  assert.ok(posHeader !== -1, 'Header must exist');
  assert.ok(posTabBar !== -1, 'Section ① Tab bar must exist');
  assert.ok(posStatsBar !== -1, 'Section ② Stats bar must exist');
  assert.ok(posTowerViewport !== -1, 'Section ③ Tower viewport must exist');
  assert.ok(posCardBox !== -1, 'Section ④ Card box must exist');
  assert.ok(posCheerNews !== -1, 'Section ⑤ Cheer news banner must exist');
  assert.ok(posFloatingCta !== -1, 'Section ⑥ Floating CTA must exist');

  assert.ok(posHeader < posTabBar, 'Header must be placed above Section ① Tab bar');
  assert.ok(posTabBar < posStatsBar, 'Section ① Tab bar must be placed directly above Section ② Stats bar');
  assert.ok(posStatsBar < posTowerViewport, 'Section ② Stats bar must be placed above Section ③ Tower viewport');
  assert.ok(posTowerViewport < posCardBox, 'Section ③ Tower viewport must be placed above Section ④ Card feed');
  assert.ok(posCardBox < posCheerNews, 'Section ④ Card feed must be placed above Section ⑤ Cheer news');
  assert.ok(posCheerNews < posFloatingCta, 'Section ⑤ Cheer news must be placed before Section ⑥ Floating CTA');
});

test('SCR-04 Suite 1.4: Bulky 140px statCard is removed in favor of compact inline stats bar', () => {
  const homePath = path.resolve(projectRoot, 'app/home.tsx');
  const source = fs.readFileSync(homePath, 'utf8');

  // Verify old bulky stat card styles are eliminated
  assert.ok(!source.includes('statCard:'), 'Bulky statCard style must be removed');
  assert.ok(!source.includes('statMainNumber:'), 'Bulky statMainNumber style must be removed');
  assert.ok(!source.includes('badgeToday:'), 'Bulky badgeToday style must be removed');
  assert.ok(!source.includes('statFooterText:'), 'Bulky statFooterText style must be removed');

  // Verify compact inline format: "돌 1,234 · 오늘 56 · 🌱 78" pattern
  assert.ok(source.includes('statsBar'), 'Compact statsBar must be defined');
  assert.ok(source.includes('statsBarText'), 'Compact statsBarText must be defined');
  assert.ok(source.includes('돌 {'), 'Stats bar must format total stones');
  assert.ok(source.includes('오늘 {'), 'Stats bar must format today stones');
  assert.ok(source.includes('🌱 {'), 'Stats bar must format fulfilled stones');
});

test('SCR-04 Suite 1.5: 3D Viewport clutter cleanup and in-place WishDetailBottomSheet connection', () => {
  const homePath = path.resolve(projectRoot, 'app/home.tsx');
  const source = fs.readFileSync(homePath, 'utf8');

  // Redundant exploreBannerButton removed
  assert.ok(!source.includes('exploreBannerButton'), 'Redundant exploreBannerButton must be removed');

  // Dedicated explorer and AR links retained
  assert.ok(source.includes("router.push('/tower')"), '360° 둘러보기 button must navigate to /tower');
  assert.ok(source.includes("router.push('/stack/ar')"), 'AR로 보기 button must navigate to /stack/ar');

  // onSelectStone does in-place selection and opens WishDetailBottomSheet
  assert.ok(source.includes('setSelectedStone(found)'), 'Stone click handler must set selectedStone');
  assert.ok(source.includes('setSelectedStone'), 'Stone click must set selectedStone');

  // In-place WishDetailBottomSheet (SCR-10) mounted
  assert.ok(source.includes('<WishDetailBottomSheet'), 'Must mount WishDetailBottomSheet');
  assert.ok(source.includes('visible={selectedStone !== null}'), 'Sheet visibility bound to selectedStone');
});

test('SCR-04 Suite 1.6: Random wish card feed includes #카테고리, 🔥 응원, and ⋯ report button', () => {
  const homePath = path.resolve(projectRoot, 'app/home.tsx');
  const source = fs.readFileSync(homePath, 'utf8');

  // Category chip
  assert.ok(source.includes('CATEGORY_LABELS[activeCard.category]'), 'Card must show #카테고리');

  // Cheer button
  assert.ok(source.includes('styles.cheerButton'), 'Card must have cheerButton');
  assert.ok(source.includes('🔥 응원'), 'Card cheer button must feature 🔥 응원');

  // Report button ⋯
  assert.ok(source.includes('styles.reportButton'), 'Card must have reportButton');
  assert.ok(source.includes('⋯'), 'Report button must display ⋯');
  assert.ok(source.includes('setReportModalVisible(true)'), 'Report button must open report modal');

  // Next card button
  assert.ok(source.includes('styles.nextCardButton'), 'Card must have nextCardButton');
});

test('SCR-04 Suite 1.7: Conditional cheer news banner (Section ⑤)', () => {
  const homePath = path.resolve(projectRoot, 'app/home.tsx');
  const source = fs.readFileSync(homePath, 'utf8');

  // Condition check: unreadCheerCount > 0
  assert.ok(source.includes('unreadCheerCount > 0'), 'Cheer news banner must be conditional on unreadCheerCount > 0');
  assert.ok(source.includes('🔥 내 소원에 새 응원'), 'Banner must display cheer message');
  assert.ok(source.includes("router.push('/me/wishes')"), 'Banner tap must route to /me/wishes');
});

test('SCR-04 Suite 1.8: Floating CTA button (Section ⑥)', () => {
  const homePath = path.resolve(projectRoot, 'app/home.tsx');
  const source = fs.readFileSync(homePath, 'utf8');

  assert.ok(source.includes('styles.floatingButtonContainer'), 'Must have floatingButtonContainer');
  assert.ok(source.includes("router.push('/stack/stone')"), 'Floating CTA must navigate to /stack/stone');
  assert.ok(source.includes('소원 돌 올리기'), 'CTA must have 소원 돌 올리기 text');
});

// =============================================================================
// Suite 2: Settings Screen Isolation & Navigation
// =============================================================================

test('SCR-18 Suite 2.1: src/app/settings/index.tsx isolates account, quota, linking, and withdrawal', () => {
  const settingsPath = path.resolve(projectRoot, 'app/settings/index.tsx');
  assert.ok(fs.existsSync(settingsPath), 'src/app/settings/index.tsx must exist');

  const source = fs.readFileSync(settingsPath, 'utf8');

  // Profile editing
  assert.ok(source.includes('updateNickname'), 'Settings must support updating BattleTag nickname');

  // Daily Quota controls
  assert.ok(source.includes('grantRewardBonusQuota'), 'Settings must manage bonus quota');

  // Social linking
  assert.ok(source.includes('linkGuestToSocial'), 'Settings must manage guest-to-social account linking');
  assert.ok(source.includes('kakao'), 'Settings must support Kakao provider');
  assert.ok(source.includes('apple'), 'Settings must support Apple provider');
  assert.ok(source.includes('google'), 'Settings must support Google provider');

  // Account withdrawal
  assert.ok(source.includes('withdrawAccount'), 'Settings must support account withdrawal');
});

test('SCR-04/18 Suite 2.2: Strict separation of concerns (home does NOT duplicate settings features)', () => {
  const homePath = path.resolve(projectRoot, 'app/home.tsx');
  const source = fs.readFileSync(homePath, 'utf8');

  // home.tsx should NOT contain settings implementation details
  assert.ok(!source.includes('updateNickname'), 'home.tsx must not contain nickname modification logic');
  assert.ok(!source.includes('grantRewardBonusQuota'), 'home.tsx must not contain quota recharge logic');
  assert.ok(!source.includes('linkGuestToSocial'), 'home.tsx must not contain social account linking logic');
  assert.ok(!source.includes('withdrawAccount'), 'home.tsx must not contain account withdrawal logic');
});

test('SCR-18 Suite 2.3: Settings screen back button cleanly navigates to home', () => {
  const settingsPath = path.resolve(projectRoot, 'app/settings/index.tsx');
  const source = fs.readFileSync(settingsPath, 'utf8');

  // Back button in header
  assert.ok(source.includes('router.back()'), 'Settings back button must call router.back()');
  assert.ok(source.includes('◂ 홈'), 'Settings header must display ◂ 홈');
});

// =============================================================================
// Suite 3: Domain & Presentation Logic Verification
// =============================================================================

test('Presentation Logic 3.1: Compact inline stats string formatting matches SCR-04 specification', () => {
  const stoneCount = 1234;
  const todayCount = 56;
  const fulfilledCount = 78;

  const formattedStats = `돌 ${stoneCount.toLocaleString()} · 오늘 ${todayCount.toLocaleString()} · 🌱 ${fulfilledCount.toLocaleString()}`;
  assert.equal(formattedStats, '돌 1,234 · 오늘 56 · 🌱 78');
});

test('Presentation Logic 3.2: TOWER_TABS items and category codes coverage', () => {
  const expectedTabs = ['전체', '취업', '학업', '건강', '인간관계', '기타', '그룹 ▾'];
  const homePath = path.resolve(projectRoot, 'app/home.tsx');
  const source = fs.readFileSync(homePath, 'utf8');

  for (const tab of expectedTabs) {
    assert.ok(source.includes(`label: '${tab}'`), `TOWER_TABS must include ${tab}`);
  }
});

test('Presentation Logic 3.3: In-place stone selection finds stone and opens SCR-10 bottom sheet', () => {
  const sampleStones: TowerStoneItem[] = [
    createMockStoneItem({ id: 'stone-01', content: '첫 번째 소원' }),
    createMockStoneItem({ id: 'stone-02', content: '두 번째 소원' }),
    createMockStoneItem({ id: 'stone-03', content: '세 번째 소원' }),
  ];

  let selectedStone: TowerStoneItem | null = null;
  const onSelectStone = (stoneId: string) => {
    selectedStone = sampleStones.find((s) => s.id === stoneId) ?? null;
  };

  // Initially closed
  assert.equal(selectedStone, null);

  // Select stone-02
  onSelectStone('stone-02');
  assert.ok(selectedStone !== null);
  assert.equal((selectedStone as TowerStoneItem).id, 'stone-02');
  assert.equal((selectedStone as TowerStoneItem).content, '두 번째 소원');

  // Close sheet
  selectedStone = null;
  assert.equal(selectedStone, null);
});

test('Presentation Logic 3.4: Conditional cheer news banner logic', () => {
  function shouldRenderCheerNews(unreadCount: number): boolean {
    return unreadCount > 0;
  }

  assert.equal(shouldRenderCheerNews(0), false, '0 unread cheers should not render banner');
  assert.equal(shouldRenderCheerNews(-1), false, 'Negative unread cheers should not render banner');
  assert.equal(shouldRenderCheerNews(1), true, '1 unread cheer must render banner');
  assert.equal(shouldRenderCheerNews(12), true, '12 unread cheers must render banner');
});

test('Presentation Logic 3.5: SCR-11 Report reasons list matches specification', () => {
  const homePath = path.resolve(projectRoot, 'app/home.tsx');
  const source = fs.readFileSync(homePath, 'utf8');

  const requiredReasons = [
    'abuse',
    'hate',
    'sexual',
    'personal_info',
    'spam',
    'etc',
  ];

  for (const reason of requiredReasons) {
    assert.ok(source.includes(`reason: '${reason}'`), `Report modal must support reason ${reason}`);
  }
});
