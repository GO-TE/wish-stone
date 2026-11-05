import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  type CategoryCode,
  TowerKey,
} from '../domain/value-objects/TowerKey.ts';
import { getSharedAppContainer } from '../infrastructure/di/AppContainer.ts';
import { type DashboardViewState } from '../presentation/controllers/DashboardController.ts';

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
 * 상단 바, 돌탑 전환 탭(전체/카테고리/그룹), 통계 바, 3D 돌탑 프리뷰, 랜덤 소원 카드 스와이프·응원하기, [돌 올리기] 버튼을 제공한다.
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
      {/* 상단 바 */}
      <View style={styles.header}>
        <Text style={styles.brand}>StoneWish</Text>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.navChip}
            onPress={() => router.push('/groups')}
          >
            <Text style={styles.navChipText}>그룹</Text>
          </Pressable>
          <Pressable
            style={styles.navChip}
            onPress={() => router.push('/me/wishes')}
          >
            <Text style={styles.navChipText}>내소원</Text>
          </Pressable>
        </View>
      </View>

      {/* ① 돌탑 전환 탭 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
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

      {/* ② 통계 바 */}
      <View style={styles.statsBar}>
        <Text style={styles.statsText}>
          돌 {state.tower?.stats.stoneCount ?? 0} · 오늘{' '}
          {state.tower?.stats.todayCount ?? 0} · 🌱{' '}
          {state.tower?.stats.fulfilledCount ?? 0}
        </Text>
      </View>

      {/* ③ 3D 돌탑 영역 */}
      <View style={styles.towerViewport}>
        <Text style={styles.towerEmoji}>🪨</Text>
        <Text style={styles.towerTitle}>
          {state.currentTowerKey.toString()} 돌탑 (
          {state.tower?.stones.length ?? 0}개 렌더링)
        </Text>
        {state.lastEffect ? (
          <Text style={styles.effectBadge}>
            연출 재생: {state.lastEffect.type}
          </Text>
        ) : null}
        <Pressable
          style={styles.arViewButton}
          onPress={() => router.push('/stack/ar')}
        >
          <Text style={styles.arViewButtonText}>AR로 보기</Text>
        </Pressable>
      </View>

      {/* ④ 랜덤 소원 카드 */}
      <View style={styles.cardBox}>
        {activeCard ? (
          <>
            <Text style={styles.cardContent}>"{activeCard.content}"</Text>
            <View style={styles.cardFooter}>
              <Text style={styles.cardCategory}>
                {CATEGORY_LABELS[activeCard.category]}
              </Text>
              <View style={styles.cardActions}>
                <Pressable style={styles.cheerButton} onPress={handleCheer}>
                  <Text style={styles.cheerButtonText}>
                    🔥 응원 (단계 {activeCard.cheerLevel().level})
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.nextCardButton}
                  onPress={() =>
                    setCardIndex((i) => (i + 1) % state.randomCards.length)
                  }
                >
                  <Text style={styles.nextCardText}>다음 ▸</Text>
                </Pressable>
              </View>
            </View>
          </>
        ) : (
          <Text style={styles.emptyCardText}>
            다른 사람들의 소원 카드를 불러오는 중입니다...
          </Text>
        )}
      </View>

      {/* ⑥ 메인 돌 올리기 버튼 */}
      <Pressable
        style={styles.stackMainButton}
        onPress={() => router.push('/stack/stone')}
      >
        <Text style={styles.stackMainButtonText}>🪨 돌 올리기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121316',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  brand: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F5EFE6',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  navChip: {
    backgroundColor: '#1C1E24',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  navChipText: {
    color: '#D6C7B2',
    fontSize: 13,
    fontWeight: '600',
  },
  tabBar: {
    maxHeight: 40,
    marginBottom: 12,
  },
  tabButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#1C1E24',
    marginRight: 8,
  },
  tabButtonActive: {
    backgroundColor: '#D6C7B2',
  },
  tabText: {
    color: '#A89F91',
    fontSize: 13,
  },
  tabTextActive: {
    color: '#191919',
    fontWeight: '700',
  },
  statsBar: {
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#181A20',
    borderRadius: 10,
    marginBottom: 14,
  },
  statsText: {
    color: '#D6C7B2',
    fontSize: 13,
    fontWeight: '600',
  },
  towerViewport: {
    flex: 1,
    backgroundColor: '#181A20',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    marginBottom: 14,
  },
  towerEmoji: {
    fontSize: 56,
    marginBottom: 8,
  },
  towerTitle: {
    color: '#A89F91',
    fontSize: 14,
    marginBottom: 10,
  },
  effectBadge: {
    color: '#FFD43B',
    fontSize: 12,
    marginBottom: 10,
  },
  arViewButton: {
    backgroundColor: '#2A2D34',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  arViewButtonText: {
    color: '#F5EFE6',
    fontSize: 12,
    fontWeight: '600',
  },
  cardBox: {
    backgroundColor: '#1C1E24',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  cardContent: {
    color: '#F5EFE6',
    fontSize: 15,
    marginBottom: 12,
    lineHeight: 22,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardCategory: {
    color: '#D6C7B2',
    fontSize: 13,
    fontWeight: '600',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  cheerButton: {
    backgroundColor: '#FF922B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  cheerButtonText: {
    color: '#191919',
    fontSize: 12,
    fontWeight: '700',
  },
  nextCardButton: {
    backgroundColor: '#2A2D34',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  nextCardText: {
    color: '#A89F91',
    fontSize: 12,
  },
  emptyCardText: {
    color: '#6C6860',
    fontSize: 13,
    textAlign: 'center',
  },
  stackMainButton: {
    backgroundColor: '#D6C7B2',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  stackMainButtonText: {
    color: '#191919',
    fontSize: 16,
    fontWeight: '700',
  },
});
