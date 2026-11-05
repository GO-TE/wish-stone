import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  type CategoryCode,
  TowerKey,
} from '../domain/value-objects/TowerKey.ts';
import { getSharedAppContainer } from '../infrastructure/di/AppContainer.ts';
import { CheerSparkEffect } from '../presentation/components/CheerSparkEffect.tsx';
import { StoneTowerCanvas } from '../presentation/components/StoneTowerCanvas.tsx';
import { type DashboardViewState } from '../presentation/controllers/DashboardController.ts';
import { TossTheme } from '../presentation/theme/tossTheme.ts';

const TOWER_TABS: readonly { label: string; key: TowerKey }[] = [
  { label: '전체', key: TowerKey.global() },
  { label: '취업', key: TowerKey.category('job') },
  { label: '학업', key: TowerKey.category('study') },
  { label: '건강', key: TowerKey.category('health') },
  { label: '인간관계', key: TowerKey.category('relation') },
  { label: '기타', key: TowerKey.category('etc') },
];

const CATEGORY_LABELS: Record<CategoryCode, string> = {
  job: '#취업',
  study: '#학업',
  health: '#건강',
  relation: '#인간관계',
  etc: '#기타',
};

/**
 * SCR-04 대시보드(홈) 화면 (`/home`)
 * Toss-Style Minimal Aesthetic Revamp
 * 근거: 화면 설계서.md 3장 (DB-002~007, 014~017, 022)
 */
export default function HomeScreen() {
  const router = useRouter();
  const [controller] = useState(
    () => getSharedAppContainer().controllers.dashboard
  );
  const [state, setState] = useState<DashboardViewState>(() =>
    controller.getState()
  );
  const [cardIndex, setCardIndex] = useState(0);

  useEffect(() => {
    controller
      .loadDashboard(TowerKey.global())
      .then((next) => setState({ ...next }))
      .catch(() => {});
  }, [controller]);

  const handleSwitchTab = async (key: TowerKey) => {
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
    try {
      await controller.cheerWish(activeCard);
      setState({ ...controller.getState() });
    } catch {
      // 이미 응원했거나 본인 소원인 경우 무시
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
            <Text style={styles.brandIcon}>🪨</Text>
            <Text style={styles.brand}>위시스톤</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              style={({ pressed }) => [
                styles.navChip,
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => router.push('/groups')}
            >
              <Text style={styles.navChipText}>그룹</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.navChip,
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => router.push('/me/wishes')}
            >
              <Text style={styles.navChipText}>내 소원</Text>
            </Pressable>
          </View>
        </View>

        {/* ① 토스형 통계 헤드라인 카드 */}
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>전체 소원 돌탑</Text>
          <View style={styles.statRow}>
            <Text style={styles.statMainNumber}>
              {state.tower?.stats.stoneCount ?? 0}
            </Text>
            <Text style={styles.statUnit}>개의 소원</Text>
            <View style={styles.badgeToday}>
              <Text style={styles.badgeTodayText}>
                오늘 +{state.tower?.stats.todayCount ?? 0}
              </Text>
            </View>
          </View>
          <Text style={styles.statFooterText}>
            🌱 이뤄진 소원 {state.tower?.stats.fulfilledCount ?? 0}개가 함께 빛나고 있어요
          </Text>
        </View>

        {/* ② 카테고리 전환 탭 (Pills) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabBar}
          contentContainerStyle={styles.tabContent}
        >
          {TOWER_TABS.map((tab) => {
            const active =
              state.currentTowerKey.toString() === tab.key.toString();
            return (
              <Pressable
                key={tab.key.toString()}
                style={[styles.tabButton, active && styles.tabButtonActive]}
                onPress={() => handleSwitchTab(tab.key)}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ③ 3D 돌탑 프리뷰 뷰포트 */}
        <View style={styles.towerViewport}>
          <View style={styles.towerHeader}>
            <Text style={styles.towerTitle}>
              {state.currentTowerKey.toString()} 돌탑 ({state.tower?.stones.length ?? 0}개)
            </Text>
            <Pressable
              style={styles.arViewButton}
              onPress={() => router.push('/stack/ar')}
            >
              <Text style={styles.arViewButtonText}>👓 AR 모드</Text>
            </Pressable>
          </View>

          <View style={styles.canvasContainer}>
            <StoneTowerCanvas stones={state.tower?.stones ?? []} />
            <CheerSparkEffect
              event={state.lastEffect}
              towerTopY={state.tower?.topY() ?? 1.0}
            />
          </View>
        </View>

        {/* ④ 토스형 소원 카드 피드 */}
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
                <Pressable
                  style={({ pressed }) => [
                    styles.cheerButton,
                    pressed && { transform: [{ scale: 0.97 }] },
                  ]}
                  onPress={handleCheer}
                >
                  <Text style={styles.cheerButtonText}>
                    🔥 응원하기 {activeCard.cheerLevel().level > 0 ? `Lv.${activeCard.cheerLevel().level}` : ''}
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.nextCardButton}
                  onPress={() =>
                    setCardIndex((i) => (i + 1) % state.randomCards.length)
                  }
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

        {/* 여백 확보 */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* ⑤ 플로팅 CTA 버튼 (Toss Blue Pill) */}
      <View style={styles.floatingButtonContainer}>
        <Pressable
          style={({ pressed }) => [
            styles.stackMainButton,
            pressed && styles.stackMainButtonPressed,
          ]}
          onPress={() => router.push('/stack/stone')}
        >
          <Text style={styles.stackMainButtonIcon}>🪨</Text>
          <Text style={styles.stackMainButtonText}>소원 돌 올리기</Text>
        </Pressable>
      </View>
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
  statCard: {
    backgroundColor: TossTheme.colors.card,
    borderRadius: TossTheme.radius.card,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: TossTheme.colors.border,
  },
  statLabel: {
    ...TossTheme.typography.caption,
    color: TossTheme.colors.textSecondary,
    marginBottom: 6,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  statMainNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: TossTheme.colors.textPrimary,
    letterSpacing: -0.5,
  },
  statUnit: {
    fontSize: 15,
    fontWeight: '600',
    color: TossTheme.colors.primary,
  },
  badgeToday: {
    marginLeft: 'auto',
    backgroundColor: TossTheme.colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: TossTheme.radius.full,
  },
  badgeTodayText: {
    ...TossTheme.typography.micro,
    color: TossTheme.colors.primary,
    fontWeight: '700',
  },
  statFooterText: {
    ...TossTheme.typography.caption,
    color: TossTheme.colors.textTertiary,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: TossTheme.colors.border,
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
});
