import React, { useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Stone } from '../../domain/entities/Stone.ts';
import { Tower } from '../../domain/entities/Tower.ts';
import { Pose } from '../../domain/value-objects/Pose.ts';
import { TowerKey } from '../../domain/value-objects/TowerKey.ts';
import { getSharedAppContainer } from '../../infrastructure/di/AppContainer.ts';
import { StoneTowerCanvas } from '../../presentation/components/StoneTowerCanvas.tsx';
import { TossTheme } from '../../presentation/theme/tossTheme.ts';

/**
 * SCR-07 쌓기 (일반 3D & 실감 드래그 인터랙션) 화면 (`/stack/place`)
 * Toss-Style Minimal Aesthetic Revamp
 * 근거: 화면 설계서.md 5장, DB-010, D-019
 */
export default function PlaceStone3DScreen() {
  const router = useRouter();
  const [controller] = useState(() => {
    const c = getSharedAppContainer().controllers.stackStone;
    if (!c.getState().content) {
      c.updateContent('소원이 이루어지기를 바랍니다');
    }
    return c;
  });
  const [state, setState] = useState(() => controller.getState());
  const [statusMessage, setStatusMessage] = useState(
    '돌을 타겟 원(🎯)으로 끌어올려 균형을 맞춰보세요'
  );
  const [isDragging, setIsDragging] = useState(false);

  // 시각적으로 돌탑 형태를 보여주기 위한 기본 바닥 돌 구성
  const sampleTower = new Tower(
    TowerKey.global(),
    [
      {
        id: 'base-1',
        stone: new Stone({
          shape: 'flat',
          color: '#374151',
          pose: new Pose({ x: 0, y: 0, z: 0 }),
        }),
        status: 'active',
        bloom: null,
        cheerLevel: 1,
        isMine: false,
        nickname: null,
      },
      {
        id: 'base-2',
        stone: new Stone({
          shape: 'round',
          color: '#4B5563',
          pose: new Pose({ x: 0.04, y: 0.22, z: 0 }),
        }),
        status: 'active',
        bloom: null,
        cheerLevel: 2,
        isMine: false,
        nickname: null,
      },
      {
        id: 'base-3',
        stone: new Stone({
          shape: 'pebble',
          color: '#6B7280',
          pose: new Pose({ x: -0.03, y: 0.44, z: 0 }),
        }),
        status: 'active',
        bloom: 'sprout',
        cheerLevel: 3,
        isMine: false,
        nickname: null,
      },
    ],
    {
      stoneCount: 15,
      todayCount: 3,
      fulfilledCount: 1,
      cheerCount: 42,
    }
  );

  const pan = useRef(new Animated.ValueXY()).current;

  const handleDrop = async (dropPose: Pose) => {
    const res = await controller.placeStone(sampleTower, dropPose);
    setState({ ...controller.getState() });
    if (res.status === 'retry') {
      setStatusMessage(
        `💥 중심을 잃어 돌탑이 무너졌어요! 다시 올려볼까요? (${res.attempt}/3회)`
      );
      Animated.spring(pan, {
        toValue: { x: 0, y: 0 },
        useNativeDriver: false,
      }).start();
      return;
    }
    setStatusMessage(
      res.autoPlaced
        ? '✨ 3회 시도로 돌탑 꼭대기에 자동 안착되었습니다!'
        : '🎉 돌탑 위에 무사히 안착했습니다!'
    );
    setTimeout(() => {
      router.replace('/home');
    }, 600);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setIsDragging(true);
        setStatusMessage('돌을 쥐었습니다. 위쪽 목표 지점(🎯)으로 끌어올리세요!');
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_, gestureState) => {
        setIsDragging(false);
        if (gestureState.dy < -70) {
          const offsetX = gestureState.dx;
          if (Math.abs(offsetX) <= 60) {
            handleDrop(new Pose({ x: offsetX / 300, y: 0.65, z: 0 }));
          } else {
            handleDrop(
              new Pose({ x: offsetX > 0 ? 1.8 : -1.8, y: 0.65, z: 0 })
            );
          }
        } else {
          setStatusMessage('위쪽 목표 지점(🎯)까지 더 높이 끌어올려 놓아보세요!');
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  const stoneColor = state.selectedStone?.color || '#8DA4C4';

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <Text style={styles.title}>돌탑에 올리기</Text>
        <Text style={styles.status}>{statusMessage}</Text>
      </View>

      {state.towerCollapsed ? (
        <View style={styles.collapsedBox}>
          <Text style={styles.collapsedAlert}>
            ⚠️ 균형을 잃고 돌탑이 무너졌습니다
          </Text>
        </View>
      ) : null}

      {/* Main Drag & Drop Zone */}
      <View style={styles.canvasContainer}>
        <View style={styles.dropZone}>
          <Text style={styles.dropZoneTarget}>🎯</Text>
          <Text style={styles.dropZoneText}>여기에 돌을 놓아주세요</Text>
        </View>

        <StoneTowerCanvas
          stones={sampleTower.stones}
          collapsedShake={state.towerCollapsed}
        />

        <View style={styles.dragTrackArea}>
          <Animated.View
            {...panResponder.panHandlers}
            style={[
              styles.draggableStone,
              {
                backgroundColor: stoneColor,
                transform: [{ translateX: pan.x }, { translateY: pan.y }],
                borderColor: isDragging
                  ? TossTheme.colors.primary
                  : 'rgba(255,255,255,0.4)',
              },
            ]}
          >
            <Text style={styles.stoneIcon}>🪨</Text>
            <Text style={styles.stoneLabel}>
              {isDragging ? '놓으면 투하!' : '드래그해서 올리기'}
            </Text>
          </Animated.View>
        </View>

        <Text style={styles.canvasCaption}>
          시도 {state.attempt}/3회 · 일일 쿼터 잔여 {state.quota.remaining}개
        </Text>
      </View>

      {/* Bottom Action Buttons */}
      <View style={styles.buttonRow}>
        <Pressable
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => handleDrop(new Pose({ x: 2.0, y: 1.5, z: 0 }))}
        >
          <Text style={styles.secondaryText}>빗맞힘 테스트</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && { opacity: 0.9 },
          ]}
          onPress={() => handleDrop(new Pose({ x: 0, y: 0.65, z: 0 }))}
        >
          <Text style={styles.primaryText}>🎯 즉시 안착하기</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TossTheme.colors.background,
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 24,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
    justifyContent: 'space-between',
  },
  header: {
    marginBottom: 12,
  },
  title: {
    ...TossTheme.typography.title,
    color: TossTheme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  status: {
    ...TossTheme.typography.caption,
    color: TossTheme.colors.primary,
    textAlign: 'center',
    fontWeight: '600',
  },
  collapsedBox: {
    backgroundColor: 'rgba(240, 68, 82, 0.12)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: TossTheme.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(240, 68, 82, 0.25)',
    marginBottom: 8,
  },
  collapsedAlert: {
    ...TossTheme.typography.micro,
    color: TossTheme.colors.danger,
    textAlign: 'center',
    fontWeight: '700',
  },
  canvasContainer: {
    flex: 1,
    backgroundColor: TossTheme.colors.card,
    borderRadius: TossTheme.radius.card,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 8,
    borderWidth: 1,
    borderColor: TossTheme.colors.border,
  },
  dropZone: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: TossTheme.radius.button,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: TossTheme.colors.primarySoft,
    backgroundColor: 'rgba(49, 130, 246, 0.05)',
  },
  dropZoneTarget: {
    fontSize: 22,
    marginBottom: 2,
  },
  dropZoneText: {
    ...TossTheme.typography.micro,
    color: TossTheme.colors.primary,
    fontWeight: '600',
  },
  dragTrackArea: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 10,
  },
  draggableStone: {
    width: 140,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  stoneIcon: {
    fontSize: 22,
    marginBottom: 2,
  },
  stoneLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  canvasCaption: {
    ...TossTheme.typography.micro,
    color: TossTheme.colors.textTertiary,
    marginTop: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: TossTheme.colors.card,
    paddingVertical: 15,
    borderRadius: TossTheme.radius.button,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: TossTheme.colors.border,
  },
  secondaryText: {
    ...TossTheme.typography.caption,
    color: TossTheme.colors.textSecondary,
    fontWeight: '600',
  },
  primaryButton: {
    flex: 1,
    backgroundColor: TossTheme.colors.primary,
    paddingVertical: 15,
    borderRadius: TossTheme.radius.button,
    alignItems: 'center',
  },
  primaryText: {
    ...TossTheme.typography.caption,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
