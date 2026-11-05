import React, { useEffect, useRef, useState } from 'react';
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
import { type SimulationFrame } from '../../domain/ports/PhysicsWorld.ts';
import { Pose } from '../../domain/value-objects/Pose.ts';
import { TowerKey } from '../../domain/value-objects/TowerKey.ts';
import { getSharedAppContainer } from '../../infrastructure/di/AppContainer.ts';
import { StoneTowerCanvas } from '../../presentation/components/StoneTowerCanvas.tsx';
import {
  type StackPlacementPhase,
  type StackStoneViewState,
} from '../../presentation/controllers/StackStoneController.ts';
import { TossTheme } from '../../presentation/theme/tossTheme.ts';

function safeHaptic(type: 'grab' | 'warning' | 'success') {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      if (type === 'grab') navigator.vibrate(20);
      else if (type === 'warning') navigator.vibrate([80, 40, 80]);
      else if (type === 'success') navigator.vibrate([40, 80, 40]);
    }
  } catch {
    // Non-blocking fallback
  }
}

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
  const [state, setState] = useState<StackStoneViewState>(() => controller.getState());
  const [phase, setPhase] = useState<StackPlacementPhase>('IDLE');
  const [currentTrajectory, setCurrentTrajectory] = useState<
    readonly SimulationFrame[] | undefined
  >(undefined);
  const [renderedDroppedStone, setRenderedDroppedStone] = useState<Stone | null>(null);
  const [statusMessage, setStatusMessage] = useState(
    '돌을 타겟 원(🎯)으로 끌어올려 균형을 맞춰보세요'
  );
  const [isNearTarget, setIsNearTarget] = useState(false);
  const [isOffCenter, setIsOffCenter] = useState(false);

  const collapseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isResettingRef = useRef<boolean>(false);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (collapseTimerRef.current) {
        clearTimeout(collapseTimerRef.current);
      }
    };
  }, []);

  // Subscribe to controller state changes (clears trajectory when reset)
  useEffect(() => {
    return controller.subscribe((next) => {
      setState(next);
      setPhase(next.phase);
      setCurrentTrajectory(next.lastSimulationTrajectory);
    });
  }, [controller]);

  // Default sample tower fallback
  const [activeTower, setActiveTower] = useState<Tower>(() => {
    return new Tower(
      controller.getState().scope ?? TowerKey.global(),
      [
        {
          id: 'base-1',
          stone: new Stone({
            shape: 'boulder',
            color: '#3E4947',
            pose: new Pose({ x: -0.15, y: 0, z: 0 }),
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
            shape: 'flat',
            color: '#262930',
            pose: new Pose({ x: 0.15, y: 0, z: 0 }),
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
            shape: 'round',
            color: '#6E675F',
            pose: new Pose({ x: 0, y: 0.35, z: 0 }),
          }),
          status: 'active',
          bloom: 'sprout',
          cheerLevel: 3,
          isMine: false,
          nickname: null,
        },
      ],
      { stoneCount: 15, todayCount: 3, fulfilledCount: 1, cheerCount: 42 }
    );
  });

  // Load real tower if available
  useEffect(() => {
    const container = getSharedAppContainer();
    const scope = controller.getState().scope ?? TowerKey.global();
    container.repositories.towers
      .get(scope, 50)
      .then((tower) => {
        if (tower && tower.stones.length > 0) {
          setActiveTower(tower);
        }
      })
      .catch(() => {});
  }, [controller]);

  const pan = useRef(new Animated.ValueXY()).current;

  const calculate3DDropPose = (dx: number, dy: number): Pose => {
    const clampedX = Math.min(1.5, Math.max(-1.5, Number((dx / 300).toFixed(4))));
    const topY = activeTower.topY();
    const heightBonus = Math.min(0.2, Math.max(0, (-dy - 70) * 0.0008));
    const dropY = Number((topY + 0.25 + heightBonus).toFixed(4));
    return new Pose({ x: clampedX, y: dropY, z: 0 });
  };

  const resetAfterCollapse = () => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
    if (isResettingRef.current) return;
    isResettingRef.current = true;

    Animated.spring(pan, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
    }).start(() => {
      controller.resetPlacement();
      setPhase('IDLE');
      setRenderedDroppedStone(null);
      setCurrentTrajectory(undefined);
      setIsNearTarget(false);
      setIsOffCenter(false);
      setStatusMessage('돌을 타겟 원(🎯)으로 끌어올려 균형을 맞춰보세요');
      isResettingRef.current = false;
    });
  };

  const handleCollapseComplete = () => {
    if (phase !== 'COLLAPSING') return;
    // Allow 300ms post-collapse settling pause before triggering spring reset
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
    }
    collapseTimerRef.current = setTimeout(() => {
      resetAfterCollapse();
    }, 300);
  };

  const handleDrop = async (dropPose: Pose) => {
    if (phase === 'BALANCING' || phase === 'COLLAPSING' || phase === 'SETTLED') {
      return;
    }

    setPhase('BALANCING');
    setStatusMessage('돌이 안착하는 중입니다... 균형을 측정하고 있어요 ⚖️');

    // Mount dropped stone immediately with initial drop pose (avoids origin jump)
    const initialDroppedStone = state.selectedStone.withPose(dropPose);
    setRenderedDroppedStone(initialDroppedStone);

    try {
      const res = await controller.placeStone(activeTower, dropPose);
      setState({ ...controller.getState() });

      if (res.trajectory) {
        setCurrentTrajectory(res.trajectory);
      }

      if (res.status === 'retry') {
        setPhase('COLLAPSING');
        safeHaptic('warning');
        setStatusMessage(
          `💥 중심을 잃어 돌탑이 무너졌어요! 다시 올려볼까요? (${res.attempt}/3회)`
        );

        // Keep renderedDroppedStone mounted for trajectory playback!
        // Dynamic playback duration based on trajectory length with safety margin
        const trajectoryFrames = res.trajectory?.length ?? 0;
        const dynamicTimeoutMs = Math.max(
          1200,
          Math.ceil(trajectoryFrames * (1000 / 60)) + 500
        );

        if (collapseTimerRef.current) {
          clearTimeout(collapseTimerRef.current);
        }
        collapseTimerRef.current = setTimeout(() => {
          resetAfterCollapse();
        }, dynamicTimeoutMs);
        return;
      }

      // Settled or 3rd-attempt auto-placed
      setPhase('SETTLED');
      safeHaptic('success');
      // Keep dropped stone mounted with settled pose
      setRenderedDroppedStone(state.selectedStone.withPose(res.pose));
      setStatusMessage(
        res.autoPlaced
          ? '✨ 3회 시도로 돌탑 꼭대기에 자동 안착되었습니다!'
          : '🎉 돌탑 위에 무사히 안착했습니다!'
      );

      setTimeout(() => {
        router.replace('/home');
      }, 1200);
    } catch {
      controller.resetPlacement();
      setPhase('IDLE');
      setRenderedDroppedStone(null);
      setCurrentTrajectory(undefined);
      setStatusMessage('일일 소원 쿼터를 모두 소진했거나 오류가 발생했습니다.');
      Animated.spring(pan, {
        toValue: { x: 0, y: 0 },
        useNativeDriver: false,
      }).start();
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => phase === 'IDLE',
      onMoveShouldSetPanResponder: () => phase === 'IDLE' || phase === 'PLACING',
      onPanResponderGrant: () => {
        if (phase !== 'IDLE') return;
        setPhase('PLACING');
        controller.startPlacing();
        safeHaptic('grab');
        setStatusMessage('돌을 쥐었습니다. 위쪽 목표 지점(🎯)으로 끌어올리세요!');
      },
      onPanResponderMove: (_, gestureState) => {
        pan.setValue({ x: gestureState.dx, y: gestureState.dy });
        const near = gestureState.dy < -60;
        const off = Math.abs(gestureState.dx) > 50;
        setIsNearTarget(near);
        setIsOffCenter(off);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy < -70) {
          const dropPose = calculate3DDropPose(gestureState.dx, gestureState.dy);
          handleDrop(dropPose);
        } else {
          setPhase('IDLE');
          setIsNearTarget(false);
          setIsOffCenter(false);
          setStatusMessage('위쪽 목표 지점(🎯)까지 더 높이 끌어올려 놓아보세요!');
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  const stoneColor = state.selectedStone?.color || '#5A6577';
  const isInteracting = phase === 'PLACING';
  const isBusy = phase === 'BALANCING' || phase === 'COLLAPSING' || phase === 'SETTLED';

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <Text style={styles.title}>돌탑에 올리기</Text>
        <Text
          style={[
            styles.status,
            phase === 'COLLAPSING' && styles.statusDanger,
            phase === 'SETTLED' && styles.statusSuccess,
          ]}
        >
          {statusMessage}
        </Text>
      </View>

      {/* Collapse Alert Banner */}
      {phase === 'COLLAPSING' || state.towerCollapsed ? (
        <View style={styles.collapsedBox}>
          <Text style={styles.collapsedAlert}>
            ⚠️ 균형을 잃고 돌탑이 무너졌습니다 (동적 물리 붕괴 연출 중)
          </Text>
        </View>
      ) : null}

      {/* Main Drag & Drop Zone */}
      <View style={styles.canvasContainer}>
        {/* Drop Target Zone */}
        <View
          style={[
            styles.dropZone,
            isNearTarget && !isOffCenter && styles.dropZoneActive,
            isNearTarget && isOffCenter && styles.dropZoneWarning,
          ]}
        >
          <Text style={styles.dropZoneTarget}>🎯</Text>
          <Text
            style={[
              styles.dropZoneText,
              isNearTarget && !isOffCenter && styles.dropZoneTextActive,
              isNearTarget && isOffCenter && styles.dropZoneTextWarning,
            ]}
          >
            {isNearTarget
              ? isOffCenter
                ? '⚠️ 중심에서 벗어남 (전복 위험!)'
                : '✨ 안정적인 균형 위치 (놓으면 투하)'
              : '여기에 돌을 놓아주세요'}
          </Text>
        </View>

        {/* Stone Tower Canvas */}
        <StoneTowerCanvas
          stones={activeTower.stones}
          collapsedShake={phase === 'COLLAPSING'}
          trajectory={currentTrajectory ?? state.lastSimulationTrajectory}
          phase={phase}
          droppedStone={renderedDroppedStone}
          showControls={false}
          onCollapseAnimationComplete={handleCollapseComplete}
          onPlaybackComplete={handleCollapseComplete}
        />

        {/* Draggable User Stone */}
        <View style={styles.dragTrackArea}>
          <Animated.View
            {...(isBusy ? {} : panResponder.panHandlers)}
            style={[
              styles.draggableStone,
              {
                backgroundColor: stoneColor,
                opacity: isBusy ? 0 : 1,
                transform: [{ translateX: pan.x }, { translateY: pan.y }],
                borderColor: isInteracting
                  ? TossTheme.colors.primary
                  : 'rgba(255, 255, 255, 0.4)',
                cursor: isInteracting ? ('grabbing' as any) : ('grab' as any),
              },
            ]}
          >
            <View style={styles.stoneSurfaceHighlight} />
            <Text style={styles.stoneBadge}>내 소원 돌</Text>
            <Text style={styles.stoneActionText}>
              {isInteracting ? '놓으면 투하!' : '손으로 위로 끌어올리기'}
            </Text>
          </Animated.View>
        </View>

        <Text style={styles.canvasCaption}>
          시도 {Math.min(state.attempt + 1, 3)}/3회 · 일일 쿼터 잔여 {state.quota.remaining}개
        </Text>
      </View>

      {/* Bottom Action Buttons */}
      <View style={styles.buttonRow}>
        <Pressable
          style={({ pressed }) => [
            styles.secondaryButton,
            isBusy && styles.disabledButton,
            pressed && !isBusy && { opacity: 0.7 },
          ]}
          disabled={isBusy}
          onPress={() =>
            handleDrop(
              new Pose({
                x: 0.45,
                y: Number((activeTower.topY() + 0.3).toFixed(4)),
                z: 0,
              })
            )
          }
        >
          <Text style={styles.secondaryText}>빗맞힘 테스트 (전복)</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            isBusy && styles.disabledButton,
            pressed && !isBusy && { opacity: 0.9 },
          ]}
          disabled={isBusy}
          onPress={() =>
            handleDrop(
              new Pose({
                x: 0,
                y: Number((activeTower.topY() + 0.25).toFixed(4)),
                z: 0,
              })
            )
          }
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
    userSelect: 'none' as any,
  },
  header: {
    marginBottom: 8,
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
  statusDanger: {
    color: TossTheme.colors.danger,
    fontWeight: '700',
  },
  statusSuccess: {
    color: '#2E7D32',
    fontWeight: '700',
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
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 6,
    borderWidth: 1,
    borderColor: TossTheme.colors.border,
    userSelect: 'none' as any,
  },
  dropZone: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: TossTheme.radius.button,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: TossTheme.colors.primarySoft,
    backgroundColor: 'rgba(49, 130, 246, 0.05)',
  },
  dropZoneActive: {
    borderColor: '#3182F6',
    backgroundColor: 'rgba(49, 130, 246, 0.12)',
  },
  dropZoneWarning: {
    borderColor: '#FF6B6B',
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
  },
  dropZoneTarget: {
    fontSize: 20,
    marginBottom: 2,
  },
  dropZoneText: {
    ...TossTheme.typography.micro,
    color: TossTheme.colors.primary,
    fontWeight: '600',
  },
  dropZoneTextActive: {
    color: '#3182F6',
    fontWeight: '700',
  },
  dropZoneTextWarning: {
    color: '#FF6B6B',
    fontWeight: '700',
  },
  dragTrackArea: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 8,
  },
  draggableStone: {
    width: 154,
    height: 68,
    // 자연석 실루엣: 상단 큰 곡선, 하단 완만한 기초면 (알약/캡슐 방지)
    borderTopLeftRadius: 42,
    borderTopRightRadius: 36,
    borderBottomRightRadius: 20,
    borderBottomLeftRadius: 22,
    borderWidth: 2,
    borderTopWidth: 3,
    borderTopColor: 'rgba(255, 255, 255, 0.45)',
    borderBottomWidth: 4,
    borderBottomColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
    userSelect: 'none' as any,
  },
  stoneSurfaceHighlight: {
    position: 'absolute',
    top: 4,
    left: 10,
    right: 10,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  stoneBadge: {
    color: '#D1D5DB',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  stoneActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  canvasCaption: {
    ...TossTheme.typography.micro,
    color: TossTheme.colors.textTertiary,
    marginTop: 2,
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
  disabledButton: {
    opacity: 0.45,
  },
});
