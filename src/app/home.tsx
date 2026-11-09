import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { type TowerStoneItem } from '../domain/entities/Tower.ts';
import { type WishId } from '../domain/entities/Wish.ts';
import { type ReportReason } from '../domain/ports/repositories.ts';
import {
  type CategoryCode,
  TowerKey,
} from '../domain/value-objects/TowerKey.ts';
import { getCachedWishContent, setCachedWishContent } from '../infrastructure/api/wishContentCache.ts';
import { getSharedAppContainer } from '../infrastructure/di/AppContainer.ts';
import { CheerSparkEffect } from '../presentation/components/CheerSparkEffect.tsx';
import { StoneTowerCanvas } from '../presentation/components/StoneTowerCanvas.tsx';
import { WishDetailBottomSheet } from '../presentation/components/WishDetailBottomSheet.tsx';
import { type DashboardViewState } from '../presentation/controllers/DashboardController.ts';
import { TossTheme } from '../presentation/theme/tossTheme.ts';

export interface TabItem {
  readonly label: string;
  readonly key: TowerKey | 'group_select';
}

const TOWER_TABS: readonly TabItem[] = [
  { label: '전체', key: TowerKey.global() },
  { label: '취업', key: TowerKey.category('job') },
  { label: '학업', key: TowerKey.category('study') },
  { label: '건강', key: TowerKey.category('health') },
  { label: '인간관계', key: TowerKey.category('relation') },
  { label: '기타', key: TowerKey.category('etc') },
  { label: '그룹 ▾', key: 'group_select' },
];

const CATEGORY_LABELS: Record<CategoryCode, string> = {
  job: '#취업',
  study: '#학업',
  health: '#건강',
  relation: '#인간관계',
  etc: '#기타',
};

const REPORT_REASONS: readonly { reason: ReportReason; label: string }[] = [
  { reason: 'abuse', label: '욕설 · 비방' },
  { reason: 'hate', label: '혐오 · 차별 표현' },
  { reason: 'sexual', label: '음란 · 불건전 내용' },
  { reason: 'personal_info', label: '타인 개인정보 노출' },
  { reason: 'spam', label: '도배 · 불법 광고' },
  { reason: 'etc', label: '기타 부적절한 내용' },
];

function formatTowerTitle(key: TowerKey): string {
  if (key.type === 'global') return '전체 소원 돌탑';
  if (key.type === 'category') {
    const code = key.value as CategoryCode;
    const catName = CATEGORY_LABELS[code] ? CATEGORY_LABELS[code].replace('#', '') : key.value;
    return `${catName} 소원 돌탑`;
  }
  return '그룹 소원 돌탑';
}

export interface HomeScreenProps {
  readonly initialUnreadCheerCount?: number;
}

/**
 * SCR-04 대시보드(홈) 화면 (`/home`)
 * Toss-Style Minimal Aesthetic Revamp
 * 근거: 화면 설계서.md 3장 (DB-002~007, 014~017, 022)
 */
export default function HomeScreen({ initialUnreadCheerCount }: HomeScreenProps = {}) {
  const router = useRouter();
  const [controller] = useState(
    () => getSharedAppContainer().controllers.dashboard
  );
  const [state, setState] = useState<DashboardViewState>(() =>
    controller.getState()
  );
  const [cardIndex, setCardIndex] = useState(0);
  const [cheeredWishIds, setCheeredWishIds] = useState<Set<string>>(new Set());
  const [selectedStone, setSelectedStone] = useState<TowerStoneItem | null>(null);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [unreadCheerCount, setUnreadCheerCount] = useState<number>(
    initialUnreadCheerCount ?? 0
  );
  const toastStore = getSharedAppContainer().toastStore;

  useEffect(() => {
    controller
      .loadDashboard(TowerKey.global())
      .then((next) => {
        for (const w of next.randomCards ?? []) {
          setCachedWishContent(w.id, w.content);
        }
        setState({ ...next });
      })
      .catch(() => {});

    if (initialUnreadCheerCount !== undefined) {
      setUnreadCheerCount(initialUnreadCheerCount);
    } else {
      getSharedAppContainer()
        .repositories.wishes.mine()
        .then((myWishes) => {
          const totalCheers = myWishes.reduce(
            (sum, w) => sum + (w.visibleCheerCount ?? 0),
            0
          );
          setUnreadCheerCount(totalCheers);
        })
        .catch(() => {});
    }
  }, [controller, initialUnreadCheerCount]);

  const handleSwitchTab = async (tab: TabItem) => {
    if (tab.key === 'group_select') {
      router.push('/groups');
      return;
    }
    const key = tab.key as TowerKey;
    try {
      await controller.switchTower(key);
      setState({ ...controller.getState() });
    } catch {
      setState({ ...controller.getState(), currentTowerKey: key });
    }
  };

  const activeCard = state.randomCards[cardIndex] ?? null;

    const handleCheer = async () => {
    if (!activeCard) return;
    if (cheeredWishIds.has(activeCard.id)) {
      toastStore.show('info', '이미 응원한 소원입니다 🔥');
      return;
    }
    if (activeCard.isMine) {
      toastStore.show('info', '내가 작성한 소원입니다 ⛰️');
      return;
    }
    try {
      await controller.cheerWish(activeCard);
      setCheeredWishIds((prev) => new Set(prev).add(activeCard.id));
      toastStore.show('cheer', '따뜻한 응원의 마음을 보냈어요! 🔥');
      setState({
        ...controller.getState(),
        lastEffect: {
          type: 'cheered',
          wishId: activeCard.id,
          level: Math.min(3, (activeCard.cheerLevel().level || 0) + 1) as 0 | 1 | 2 | 3,
          levelUp: true,
        },
      });
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ALREADY_CHEERED')) {
        setCheeredWishIds((prev) => new Set(prev).add(activeCard.id));
        toastStore.show('info', '이미 응원한 소원입니다 🔥');
      } else if (msg.includes('CANNOT_CHEER_OWN')) {
        toastStore.show('info', '내가 작성한 소원입니다 ⛰️');
      } else {
        setCheeredWishIds((prev) => new Set(prev).add(activeCard.id));
        toastStore.show('cheer', '따뜻한 응원의 마음을 보냈어요! 🔥');
      }
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 상단 네비게이션 헤더 */}
        <View style={styles.header}>
          <View style={styles.brandGroup}>
            <Text style={styles.brandIcon}>⛰️</Text>
            <Text style={styles.brand}>위시스톤</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              style={({ pressed }) => [
                styles.navChip,
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => router.push('/groups')}
              accessibilityLabel="그룹"
              accessibilityRole="button"
            >
              <Text style={styles.navChipText}>그룹</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.navChip,
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => router.push('/me/wishes')}
              accessibilityLabel="내 소원"
              accessibilityRole="button"
            >
              <Text style={styles.navChipText}>내 소원</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.navChip,
                styles.settingsNavChip,
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => router.push('/settings')}
              accessibilityLabel="설정"
              accessibilityRole="button"
            >
              <Text style={styles.navChipText}>⚙️ 설정</Text>
            </Pressable>
          </View>
        </View>

        {/* Section ①: 돌탑 전환 탭 (Pills) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabBar}
          contentContainerStyle={styles.tabContent}
        >
          {TOWER_TABS.map((tab) => {
            const isGroupSelect = tab.key === 'group_select';
            const active =
              !isGroupSelect &&
              state.currentTowerKey.toString() === (tab.key as TowerKey).toString();
            return (
              <Pressable
                key={isGroupSelect ? 'group_select' : (tab.key as TowerKey).toString()}
                style={[styles.tabButton, active && styles.tabButtonActive]}
                onPress={() => handleSwitchTab(tab)}
                accessibilityRole="tab"
                accessibilityLabel={tab.label}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Section ②: 컴팩트 인라인 통계 바 */}
        <View style={styles.statsBar}>
          <Text style={styles.statsBarText}>
            돌 {(state.tower?.stats.stoneCount ?? 0).toLocaleString()} · 오늘 {(state.tower?.stats.todayCount ?? 0).toLocaleString()} · 🌱 {(state.tower?.stats.fulfilledCount ?? 0).toLocaleString()}
          </Text>
        </View>

        {/* Section ③: 3D 돌탑 프리뷰 뷰포트 */}
        <View style={styles.towerViewport}>
          <View style={styles.towerHeader}>
            <Text style={styles.towerTitle}>
              {formatTowerTitle(state.currentTowerKey)} ({state.tower?.stones.length ?? 0}개)
            </Text>
            <View style={styles.towerHeaderActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.exploreViewButton,
                  pressed && { opacity: 0.75 },
                ]}
                onPress={() => router.push('/tower')}
                accessibilityLabel="360° 둘러보기"
                accessibilityRole="button"
              >
                <Text style={styles.exploreViewButtonText}>🔍 360° 둘러보기</Text>
              </Pressable>
              <Pressable
                style={styles.arViewButton}
                onPress={() => router.push('/stack/ar')}
                accessibilityLabel="AR로 보기"
                accessibilityRole="button"
              >
                <Text style={styles.arViewButtonText}>AR로 보기</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.canvasContainer}>
            <StoneTowerCanvas
              stones={state.tower?.stones ?? []}
              enableOrbitControls={true}
              cameraPreset="front"
              towerTopY={state.tower?.topY() ?? 1.0}
              onSelectStone={(stoneId: WishId) => {
                // SCR-04 in-place modal: previously onSelectStone={() => router.push('/tower')} setSelectedStone(found);
                const found = state.tower?.stones.find((s) => s.id === stoneId) ?? null;
                if (!found) {
                  setSelectedStone(null);
                  return;
                }
                const resolvedContent =
                  found.content ??
                  state.randomCards.find((w) => w.id === stoneId)?.content ??
                  getCachedWishContent(stoneId);
                setSelectedStone({
                  ...found,
                  content: resolvedContent,
                });
                if (!resolvedContent) {
                  const repos = getSharedAppContainer().repositories;
                  Promise.all([
                    typeof repos.wishes?.random === 'function'
                      ? repos.wishes.random(200, []).catch(() => [])
                      : Promise.resolve([]),
                    typeof repos.wishes?.mine === 'function'
                      ? repos.wishes.mine().catch(() => [])
                      : Promise.resolve([]),
                  ]).then(([rnd, mine]) => {
                    const allWishes = [...(rnd ?? []), ...(mine ?? [])];
                    for (const w of allWishes) {
                      if (w?.id && w?.content) setCachedWishContent(w.id, w.content);
                    }
                    const matched = allWishes.find((w) => w?.id === stoneId);
                    if (matched?.content) {
                      setSelectedStone((prev) =>
                        prev && prev.id === stoneId
                          ? { ...prev, content: matched.content }
                          : prev
                      );
                    }
                  });
                }
              }}
            />
            <CheerSparkEffect
              event={state.lastEffect}
              towerTopY={state.tower?.topY() ?? 1.0}
            />
          </View>
        </View>

        {/* Section ④: 랜덤 익명 소원 카드 피드 */}
        <View style={styles.cardBox}>
          {activeCard ? (
            <>
              <View style={styles.cardHeader}>
                <Text style={styles.cardCategory}>
                  {CATEGORY_LABELS[activeCard.category]}
                </Text>
                <Text style={styles.cardTime}>따끈따끈한 소원</Text>
              </View>

              <Text style={styles.cardContent}>"{activeCard.content}"</Text>

              <View style={styles.cardFooter}>
                <View style={styles.cardFooterLeft}>
                  {(() => {
                    const isCheered = cheeredWishIds.has(activeCard.id);
                    return (
                      <Pressable
                        style={({ pressed }) => [
                          styles.cheerButton,
                          isCheered && styles.cheerButtonActive,
                          pressed && !isCheered && { transform: [{ scale: 0.96 }] },
                        ]}
                        onPress={handleCheer}
                        disabled={isCheered}
                        accessibilityLabel="응원하기"
                        accessibilityRole="button"
                      >
                        <Text
                          style={[
                            styles.cheerButtonText,
                            isCheered && styles.cheerButtonActiveText,
                          ]}
                        >
                          {isCheered
                            ? '✓ 응원 완료 🔥'
                            : `🔥 응원 ${activeCard.cheerLevel().level > 0 ? `Lv.${activeCard.cheerLevel().level}` : ''}`}
                        </Text>
                      </Pressable>
                    );
                  })()}

                  <Pressable
                    style={({ pressed }) => [
                      styles.reportButton,
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={() => setReportModalVisible(true)}
                    accessibilityLabel="신고"
                    accessibilityRole="button"
                  >
                    <Text style={styles.reportButtonText}>⋯</Text>
                  </Pressable>
                </View>

                <Pressable
                  style={styles.nextCardButton}
                  onPress={() =>
                    setCardIndex((i) => (i + 1) % state.randomCards.length)
                  }
                  accessibilityLabel="다음 소원"
                  accessibilityRole="button"
                >
                  <Text style={styles.nextCardText}>다음 소원 ▸</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <Text style={styles.emptyCardText}>
              소원 돌들을 불러오고 있습니다...
            </Text>
          )}
        </View>

        {/* Section ⑤: 조건부 응원 소식 배너 */}
        {unreadCheerCount > 0 ? (
          <Pressable
            style={({ pressed }) => [
              styles.cheerNewsBanner,
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => router.push('/me/wishes')}
            accessibilityLabel="응원 소식"
            accessibilityRole="button"
          >
            <Text style={styles.cheerNewsText}>
              🔥 내 소원에 새 응원 {unreadCheerCount}개
            </Text>
            <Text style={styles.cheerNewsArrow}>›</Text>
          </Pressable>
        ) : null}

        {/* 여백 확보 */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Section ⑥: 플로팅 CTA 버튼 */}
      <View style={styles.floatingButtonContainer}>
        <Pressable
          style={({ pressed }) => [
            styles.stackMainButton,
            pressed && styles.stackMainButtonPressed,
          ]}
          onPress={() => router.push('/stack/stone')}
          accessibilityLabel="소원 돌 올리기"
          accessibilityRole="button"
        >
          <Text style={styles.stackMainButtonIcon}>🪨</Text>
          <Text style={styles.stackMainButtonText}>소원 돌 올리기</Text>
        </Pressable>
      </View>

      {/* SCR-10 소원 상세 바텀시트 (In-Place) */}
      <WishDetailBottomSheet
        visible={selectedStone !== null}
        stone={selectedStone}
        onClose={() => setSelectedStone(null)}
        onCheer={async (wishId) => {
          const foundWish = state.randomCards.find((w) => w.id === wishId);
          if (foundWish) {
            await handleCheer();
          } else {
            await getSharedAppContainer().repositories.wishes.cheer(wishId);
            setCheeredWishIds((prev) => new Set(prev).add(wishId));
            toastStore.show('cheer', '따뜻한 응원의 마음을 보냈어요! 🔥');
          }
        }}
        isCheered={selectedStone ? cheeredWishIds.has(selectedStone.id) : false}
        isGroupTower={state.currentTowerKey.showsNickname()}
      />

      {/* SCR-11 소원 신고 모달/바텀시트 */}
      <Modal
        visible={reportModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReportModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>소원 신고하기</Text>
            <Text style={styles.modalSub}>
              누적 5회 이상 신고된 소원은 검토를 위해 돌탑과 피드에서 자동으로 숨김 처리됩니다.
            </Text>

            <View style={styles.reasonList}>
              {REPORT_REASONS.map((item) => (
                <Pressable
                  key={item.reason}
                  style={({ pressed }) => [
                    styles.reasonOption,
                    pressed && styles.reasonOptionPressed,
                  ]}
                  onPress={async () => {
                    if (activeCard) {
                      try {
                        await getSharedAppContainer().repositories.wishes.report(
                          activeCard.id,
                          item.reason
                        );
                        toastStore.show('info', '소원 신고가 접수되었습니다.');
                      } catch {
                        toastStore.show('info', '신고 처리 중 오류가 발생했습니다.');
                      }
                    }
                    setReportModalVisible(false);
                  }}
                  accessibilityLabel={item.label}
                  accessibilityRole="button"
                >
                  <Text style={styles.reasonText}>{item.label}</Text>
                  <Text style={styles.reasonArrow}>›</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={styles.cancelButton}
              onPress={() => setReportModalVisible(false)}
              accessibilityLabel="닫기"
              accessibilityRole="button"
            >
              <Text style={styles.cancelText}>닫기</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TossTheme.colors.background,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandIcon: {
    fontSize: 22,
  },
  brand: {
    ...TossTheme.typography.title,
    color: TossTheme.colors.textPrimary,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  navChip: {
    backgroundColor: TossTheme.colors.card,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: TossTheme.radius.md,
    borderWidth: 1,
    borderColor: TossTheme.colors.border,
  },
  navChipText: {
    ...TossTheme.typography.caption,
    color: TossTheme.colors.textSecondary,
    fontWeight: '600',
  },
  settingsNavChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: TossTheme.colors.border,
  },
  statsBar: {
    backgroundColor: TossTheme.colors.card,
    borderRadius: TossTheme.radius.card,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: TossTheme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsBarText: {
    ...TossTheme.typography.caption,
    color: TossTheme.colors.textPrimary,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  tabBar: {
    marginBottom: 16,
  },
  tabContent: {
    gap: 8,
  },
  tabButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: TossTheme.radius.button,
    backgroundColor: TossTheme.colors.card,
    borderWidth: 1,
    borderColor: TossTheme.colors.border,
  },
  tabButtonActive: {
    backgroundColor: TossTheme.colors.textPrimary,
    borderColor: TossTheme.colors.textPrimary,
  },
  tabText: {
    ...TossTheme.typography.caption,
    color: TossTheme.colors.textSecondary,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  towerViewport: {
    backgroundColor: TossTheme.colors.card,
    borderRadius: TossTheme.radius.card,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: TossTheme.colors.border,
    minHeight: 280,
  },
  towerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  towerTitle: {
    ...TossTheme.typography.caption,
    color: TossTheme.colors.textSecondary,
    fontWeight: '600',
  },
  towerHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  exploreViewButton: {
    backgroundColor: TossTheme.colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: TossTheme.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(49, 130, 246, 0.3)',
  },
  exploreViewButtonText: {
    ...TossTheme.typography.micro,
    color: TossTheme.colors.primary,
    fontWeight: '700',
  },
  arViewButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: TossTheme.radius.md,
  },
  arViewButtonText: {
    ...TossTheme.typography.micro,
    color: TossTheme.colors.textPrimary,
    fontWeight: '600',
  },
  canvasContainer: {
    minHeight: 200,
    width: '100%',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  

  cheerButtonActive: {
    backgroundColor: 'rgba(255, 146, 43, 0.22)',
    borderColor: '#FF922B',
  },
  cheerButtonActiveText: {
    color: '#FF922B',
    fontWeight: '700',
  },
  cardBox: {
    backgroundColor: TossTheme.colors.card,
    borderRadius: TossTheme.radius.card,
    padding: 20,
    borderWidth: 1,
    borderColor: TossTheme.colors.border,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardCategory: {
    ...TossTheme.typography.caption,
    color: TossTheme.colors.primary,
    fontWeight: '700',
  },
  cardTime: {
    ...TossTheme.typography.micro,
    color: TossTheme.colors.textTertiary,
  },
  cardContent: {
    ...TossTheme.typography.cardTitle,
    color: TossTheme.colors.textPrimary,
    lineHeight: 24,
    marginBottom: 16,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: TossTheme.colors.border,
  },
  cardFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reportButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: TossTheme.radius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: TossTheme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: TossTheme.colors.textSecondary,
    lineHeight: 18,
  },
  cheerButton: {
    backgroundColor: TossTheme.colors.primarySoft,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: TossTheme.radius.md,
  },
  cheerButtonText: {
    ...TossTheme.typography.caption,
    color: TossTheme.colors.primary,
    fontWeight: '700',
  },
  nextCardButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  nextCardText: {
    ...TossTheme.typography.caption,
    color: TossTheme.colors.textSecondary,
  },
  emptyCardText: {
    ...TossTheme.typography.caption,
    color: TossTheme.colors.textTertiary,
    textAlign: 'center',
    paddingVertical: 12,
  },
  cheerNewsBanner: {
    backgroundColor: 'rgba(255, 146, 43, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 146, 43, 0.4)',
    borderRadius: TossTheme.radius.card,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  cheerNewsText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FF922B',
  },
  cheerNewsArrow: {
    fontSize: 18,
    color: '#FF922B',
    fontWeight: '700',
  },
  floatingButtonContainer: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
  },
  stackMainButton: {
    backgroundColor: TossTheme.colors.primary,
    height: 56,
    borderRadius: TossTheme.radius.button,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: TossTheme.colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  stackMainButtonPressed: {
    transform: [{ scale: 0.985 }],
    backgroundColor: TossTheme.colors.primaryHover,
  },
  stackMainButtonIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  stackMainButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: TossTheme.colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderColor: TossTheme.colors.border,
  },
  modalHandle: {
    width: 36,
    height: 4,
    backgroundColor: TossTheme.colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: TossTheme.colors.textPrimary,
    marginBottom: 6,
  },
  modalSub: {
    fontSize: 13,
    color: TossTheme.colors.textTertiary,
    lineHeight: 18,
    marginBottom: 16,
  },
  reasonList: {
    gap: 8,
    marginBottom: 16,
  },
  reasonOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#1E232A',
    borderRadius: TossTheme.radius.md,
    borderWidth: 1,
    borderColor: TossTheme.colors.border,
  },
  reasonOptionPressed: {
    backgroundColor: '#262D37',
  },
  reasonText: {
    fontSize: 14,
    color: TossTheme.colors.textPrimary,
    fontWeight: '600',
  },
  reasonArrow: {
    fontSize: 16,
    color: TossTheme.colors.textTertiary,
  },
  cancelButton: {
    paddingVertical: 14,
    borderRadius: TossTheme.radius.md,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: TossTheme.colors.textSecondary,
  },
});
