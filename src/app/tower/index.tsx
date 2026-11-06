import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { Tower, type TowerStoneItem } from '../../domain/entities/Tower.ts';
import { type WishId } from '../../domain/entities/Wish.ts';
import { type VisualEffectEvent } from '../../domain/ports/EffectBus.ts';
import { type CheerLevelValue } from '../../domain/value-objects/CheerLevel.ts';
import {
  type CategoryCode,
  TowerKey,
} from '../../domain/value-objects/TowerKey.ts';
import { getSharedAppContainer } from '../../infrastructure/di/AppContainer.ts';
import { CheerSparkEffect } from '../../presentation/components/CheerSparkEffect.tsx';
import {
  StoneTowerCanvas,
  type CameraPresetType,
} from '../../presentation/components/StoneTowerCanvas.tsx';
import {
  defaultToastStore,
  ToastStore,
} from '../../presentation/components/toastStore.ts';
import { WishDetailBottomSheet } from '../../presentation/components/WishDetailBottomSheet.tsx';
import { TossTheme } from '../../presentation/theme/tossTheme.ts';

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

/**
 * 전용 소원 돌탑 탐색 화면 (`/tower`)
 * - 자유로운 360° 회전(OrbitControls), 줌(Zoom), 팬(Pan) 3D 뷰포트
 * - 상단: 뒤로가기, 타이틀, AR 모드 네비게이션
 * - 카테고리 필터 탭 (전체, 취업, 학업, 건강, 관계, 기타)
 * - 4대 카메라 프리셋 플로팅 HUD (정면, 측면 45°, 탑뷰, 360° 자유)
 * - 돌 탭/클릭 시 3D Toss Blue 하이라이트 및 SCR-10 소원 상세 바텀시트
 * - 응원하기(wishes.cheer), 로컬 카운트 증가, cheer_spark 파티클, 감성 토스트 연동
 * 근거: ORIGINAL_REQUEST R2, R3, 화면 설계서 SCR-04/SCR-10
 */
export default function TowerExplorationScreen() {
  const router = useRouter();
  const [container] = useState(() => getSharedAppContainer());

  // 상태 관리
  const [activeKeyRaw, setActiveKeyRaw] = useState<string>('global');
  const [activeKey, setActiveKey] = useState<TowerKey>(() => TowerKey.global());
  const [tower, setTower] = useState<Tower | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // 비동기 요청 시퀀스 ref (탭 전환 레이스 컨디션 방지)
  const loadSeqRef = useRef(0);

  // 3D 카메라 프리셋 상태
  const [cameraPreset, setCameraPreset] = useState<CameraPresetType>('front');

  // 돌 선택 및 SCR-10 바텀시트 상태
  const [selectedStone, setSelectedStone] = useState<TowerStoneItem | null>(null);
  const [cheeredStoneIds, setCheeredStoneIds] = useState<Set<WishId>>(
    () => new Set()
  );
  // 응원 동시 버스트 방지 동기 in-flight guard ref
  const cheerInFlightRef = useRef<Set<WishId>>(new Set());
  const [lastEffect, setLastEffect] = useState<VisualEffectEvent | null>(null);

  // 이펙트 버스 및 토스트 스토어 바인딩 보장
  useEffect(() => {
    const bus = (container as any).effectBus ?? container.effects;
    if (!(container as any).effectBus) {
      (container as any).effectBus = bus;
    }
    const unsubscribe = bus.subscribe((ev: VisualEffectEvent) => {
      setLastEffect(ev);
    });
    return () => {
      unsubscribe();
    };
  }, [container]);

  // 돌탑 데이터 불러오기
  const loadTowerForKey = useCallback(
    async (key: TowerKey) => {
      const seq = ++loadSeqRef.current;
      setIsLoading(true);
      try {
        const repo = container.repositories.towers as any;
        if (
          typeof repo.findByKey !== 'function' &&
          typeof repo.get === 'function'
        ) {
          repo.findByKey = (k: TowerKey) => repo.get(k);
        }
        const result: Tower =
          typeof repo.findByKey === 'function'
            ? await repo.findByKey(key)
            : await repo.get(key);
        if (seq === loadSeqRef.current) {
          setTower(result);
        }
      } catch {
        // 네트워크 장애 시 빈 돌탑으로 복원
        if (seq === loadSeqRef.current) {
          setTower(
            new Tower(key, [], {
              stoneCount: 0,
              todayCount: 0,
              fulfilledCount: 0,
              cheerCount: 0,
            })
          );
        }
      } finally {
        if (seq === loadSeqRef.current) {
          setIsLoading(false);
        }
      }
    },
    [container]
  );

  useEffect(() => {
    loadTowerForKey(activeKey);
  }, [activeKey, loadTowerForKey]);

  // 탭 전환 핸들러
  const handleSelectTab = (keyRaw: string) => {
    setActiveKeyRaw(keyRaw);
    const parsed = TowerKey.parse(keyRaw);
    setActiveKey(parsed);
    setSelectedStone(null);
  };

  // 돌 선택 핸들러
  const handleSelectStone = (stoneId: WishId) => {
    const target = tower?.stones.find((s) => s.id === stoneId) ?? null;
    setSelectedStone(target);
  };

  // 응원하기 핸들러
  const handleCheer = async (wishId?: WishId) => {
    const targetStone = selectedStone;
    const targetId = wishId ?? targetStone?.id;
    if (!targetStone || !targetId) return;

    if (cheerInFlightRef.current.has(targetId) || cheeredStoneIds.has(targetId)) {
      return;
    }

    cheerInFlightRef.current.add(targetId);

    try {
      // 1. 소원 저장소 응원 호출
      await container.repositories.wishes.cheer(targetId);

      // 2. 세션 응원 목록에 추가
      setCheeredStoneIds((prev) => new Set([...prev, targetId]));

      // 3. 로컬 응원 수 및 빛 레벨 갱신
      const updatedCount = (targetStone.cheerCount ?? 0) + 1;
      const updatedLevel = Math.min(
        3,
        (targetStone.cheerLevel ?? 0) + 1
      ) as CheerLevelValue;
      const updatedStone: TowerStoneItem = {
        ...targetStone,
        cheerCount: updatedCount,
        cheerLevel: updatedLevel,
      };
      setSelectedStone(updatedStone);

      // 전체 돌탑 상태 갱신
      if (tower) {
        const nextStones = tower.stones.map((s) =>
          s.id === targetId ? updatedStone : s
        );
        setTower(
          new Tower(tower.key, nextStones, {
            ...tower.stats,
            cheerCount: (tower.stats.cheerCount ?? 0) + 1,
          })
        );
      }

      // 4. cheer_spark 시각 연출 이벤트 발행
      const sparkEvent: VisualEffectEvent = {
        type: 'cheer_spark',
        wishId: targetId,
        level: updatedLevel,
        levelUp: updatedLevel > targetStone.cheerLevel,
      };
      const bus = (container as any).effectBus ?? container.effects;
      bus?.emit(sparkEvent);
      setLastEffect(sparkEvent);

      // 5. 전역 감성 토스트 발행
      const toast =
        (ToastStore as any).instance ??
        container.toastStore ??
        defaultToastStore;
      toast.showCheerSuccess();
    } catch {
      // 실패 시 상위 롤백 처리
    } finally {
      cheerInFlightRef.current.delete(targetId);
    }
  };

  const isSheetOpen = selectedStone !== null;
  const isGroupTower = Boolean(
    typeof (activeKey as any).isGroup === 'function'
      ? (activeKey as any).isGroup()
      : activeKey.type === 'group'
  );

  return (
    <View style={styles.container}>
      {/* 1. 상단 네비게이션 헤더 */}
      <View style={styles.topHeader}>
        <Pressable
          style={({ pressed }) => [
            styles.backButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="뒤로가기"
        >
          <Text style={styles.backButtonText}>← 뒤로</Text>
        </Pressable>

        <Text style={styles.headerTitle}>소원 돌탑 둘러보기</Text>

        <Pressable
          style={({ pressed }) => [styles.arButton, pressed && { opacity: 0.8 }]}
          onPress={() => router.push('/stack/ar')}
          accessibilityRole="button"
          accessibilityLabel="AR 모드"
        >
          <Text style={styles.arButtonText}>👓 AR</Text>
        </Pressable>
      </View>

      {/* 2. 카테고리 필터 탭 */}
      <View style={styles.tabBarWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarContent}
        >
          {TOWER_CATEGORY_TABS.map((tab) => {
            const isActive = activeKeyRaw === tab.keyRaw;
            return (
              <Pressable
                key={tab.keyRaw}
                style={[
                  styles.categoryTab,
                  isActive && styles.categoryTabActive,
                ]}
                onPress={() => handleSelectTab(tab.keyRaw)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
              >
                <Text
                  style={[
                    styles.categoryTabText,
                    isActive && styles.categoryTabTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* 3. 3D 인터랙티브 캔버스 뷰포트 */}
      <View style={styles.canvasWrapper}>
        {isLoading && !tower ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={TossTheme.colors.primary} />
            <Text style={styles.loadingText}>돌탑을 불러오는 중입니다...</Text>
          </View>
        ) : (
          <StoneTowerCanvas
            enableOrbitControls={!isSheetOpen}
            enablePan={true}
            enableZoom={true}
            cameraPreset={cameraPreset}
            onCameraPresetChange={setCameraPreset}
            towerTopY={tower?.topY()}
            selectedStoneId={selectedStone?.id ?? null}
            onSelectStone={(stoneId) => handleSelectStone(stoneId)}
            stones={tower?.stones ?? []}
          />
        )}

        {/* 연출 파티클 오버레이 */}
        <View style={styles.sparkOverlayContainer}>
          <CheerSparkEffect
            event={lastEffect}
            towerTopY={tower?.topY() ?? 1.0}
          />
        </View>

        {/* 안내 뱃지 */}
        <View style={styles.hintBadge}>
          <Text style={styles.hintBadgeText}>
            💡 360° 드래그로 회전하고 돌을 탭해 소원을 확인해 보세요
          </Text>
        </View>
      </View>

      {/* 4. 카메라 프리셋 플로팅 HUD */}
      <View style={styles.floatingHudContainer}>
        <View style={styles.presetBar}>
          {CAMERA_PRESET_ITEMS.map((chip) => {
            const isActive = cameraPreset === chip.preset;
            return (
              <Pressable
                key={chip.preset}
                style={[
                  styles.presetChip,
                  isActive && styles.presetChipActive,
                ]}
                onPress={() => setCameraPreset(chip.preset)}
                accessibilityRole="button"
                accessibilityLabel={`${chip.label} 시점`}
              >
                <Text
                  style={[
                    styles.presetChipText,
                    isActive && styles.presetChipTextActive,
                  ]}
                >
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* 5. SCR-10 소원 상세 바텀시트 */}
      <WishDetailBottomSheet
        visible={isSheetOpen}
        stone={selectedStone}
        onClose={() => setSelectedStone(null)}
        onCheer={handleCheer}
        isCheered={
          selectedStone ? cheeredStoneIds.has(selectedStone.id) : false
        }
        isGroupTower={isGroupTower}
      />
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
    position: 'relative',
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: TossTheme.colors.border,
    backgroundColor: TossTheme.colors.card,
    zIndex: 10,
  },
  backButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: TossTheme.radius.md,
  },
  backButtonText: {
    ...TossTheme.typography.caption,
    color: TossTheme.colors.textPrimary,
    fontWeight: '700',
  },
  headerTitle: {
    ...TossTheme.typography.body,
    fontWeight: '700',
    color: TossTheme.colors.textPrimary,
  },
  arButton: {
    backgroundColor: TossTheme.colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: TossTheme.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(49, 130, 246, 0.3)',
  },
  arButtonText: {
    ...TossTheme.typography.micro,
    color: TossTheme.colors.primary,
    fontWeight: '700',
  },
  tabBarWrapper: {
    backgroundColor: TossTheme.colors.card,
    borderBottomWidth: 1,
    borderBottomColor: TossTheme.colors.border,
    zIndex: 9,
  },
  tabBarContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  categoryTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: TossTheme.radius.button,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: TossTheme.colors.border,
  },
  categoryTabActive: {
    backgroundColor: TossTheme.colors.textPrimary,
    borderColor: TossTheme.colors.textPrimary,
  },
  categoryTabText: {
    ...TossTheme.typography.caption,
    color: TossTheme.colors.textSecondary,
    fontWeight: '600',
  },
  categoryTabTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  canvasWrapper: {
    flex: 1,
    position: 'relative',
    backgroundColor: TossTheme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    ...TossTheme.typography.caption,
    color: TossTheme.colors.textSecondary,
  },
  sparkOverlayContainer: {
    position: 'absolute',
    top: 16,
    left: 20,
    right: 20,
    zIndex: 5,
    pointerEvents: 'none',
  },
  hintBadge: {
    position: 'absolute',
    top: 16,
    alignSelf: 'center',
    backgroundColor: 'rgba(24, 26, 34, 0.85)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: TossTheme.radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    pointerEvents: 'none',
  },
  hintBadgeText: {
    ...TossTheme.typography.micro,
    color: TossTheme.colors.textTertiary,
  },
  floatingHudContainer: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 10,
  },
  presetBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(24, 26, 34, 0.92)',
    borderRadius: TossTheme.radius.card,
    padding: 6,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: TossTheme.radius.md,
    backgroundColor: 'transparent',
  },
  presetChipActive: {
    backgroundColor: TossTheme.colors.primary,
  },
  presetChipText: {
    ...TossTheme.typography.caption,
    color: TossTheme.colors.textSecondary,
    fontWeight: '600',
  },
  presetChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
