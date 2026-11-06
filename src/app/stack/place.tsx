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
import { type CameraPresetType } from '../../presentation/components/cameraPresetSpec.ts';
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
 * 근거: 화면 설계서.md 5장, DB-010, D-019, D-022
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
  const [cameraPreset, setCameraPreset] = useState<CameraPresetType>('front');
  const [currentTrajectory, setCurrentTrajectory] = useState<
    readonly SimulationFrame[] | undefined
  >(undefined);
  const [renderedDroppedStone, setRenderedDroppedStone] = useState<Stone | null>(null);
  const [fallenPose, setFallenPose] = useState<Pose | null>(null);
  const [isConfirmingFallen, setIsConfirmingFallen] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    '돌을 타겟 원(🎯)으로 끌어올려 균형을 맞춰보세요'
  );
  const [isNearTarget, setIsNearTarget] = useState(false);
  const [isOffCenter, setIsOffCenter] = useState(false);
  const [hoverOffset, setHoverOffset] = useState<{ x: number; z: number }>({ x: 0, z: 0 });

  const collapseTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  // Default sample tower fallback - no overlap in 3D (base-1 at -0.34, base-2 at +0.34, base-3 on top at 0.48)
  const [activeTower, setActiveTower] = useState<Tower>(() => {
    return new Tower(
      controller.getState().scope ?? TowerKey.global(),
      [
        {
          id: 'base-1',
          stone: new Stone({
            shape: 'boulder',
            color: '#3E4947',
            pose: new Pose({ x: -0.34, y: 0, z: 0 }),
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
            pose: new Pose({ x: 0.34, y: 0, z: 0 }),
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
            pose: new Pose({ x: 0, y: 0.48, z: 0 }),
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

  /**
   * 돌이 미끄러져 굴러떨어졌을 때의 처리:
   * 자동으로 리셋하지 않고, 떨어진 자리 그대로 안착시키거나 다시 올려볼 수 있는 선택 상태(FALLEN_CHOICE)로 진입 (D-022)
   */
  const handleCollapseComplete = (finalPoseOverride?: Pose) => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
    const poseToUse =
      finalPoseOverride ?? fallenPose ?? new Pose({ x: 0.55, y: 0.05, z: 0 });
    setFallenPose(poseToUse);
    setRenderedDroppedStone(state.selectedStone.withPose(poseToUse));
    setPhase('FALLEN_CHOICE');
    setStatusMessage('🍃 돌이 아래로 굴러떨어졌습니다. 이것도 하나의 탑이 될 수 있어요.');
  };

  /**
   * 떨어진 그 자리에 그대로 소원 돌을 확정 안착하기
   */
  const handleConfirmFallen = async () => {
    if (!fallenPose || isConfirmingFallen) return;
    setIsConfirmingFallen(true);

    try {
      await controller.confirmFallenPlacement(fallenPose);
      safeHaptic('success');
      setPhase('SETTLED');
      setStatusMessage('✨ 떨어진 자리 그대로 소원이 돌탑의 일부로 깃들었습니다.');
      setTimeout(() => {
        router.replace('/home');
      }, 1200);
    } catch {
      setStatusMessage('일일 소원 쿼터를 모두 소진했거나 오류가 발생했습니다.');
      setIsConfirmingFallen(false);
    }
  };

  /**
   * 사용자가 원하여 다시 탑 위로 올려보기를 선택했을 때
   */
  const handleRetryPlacement = () => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
    controller.retryPlacement();
    setPhase('IDLE');
    setRenderedDroppedStone(null);
    setCurrentTrajectory(undefined);
    setFallenPose(null);
    setIsNearTarget(false);
    setIsOffCenter(false);
    setStatusMessage('돌을 타겟 원(🎯)으로 끌어올려 균형을 맞춰보세요');
    Animated.spring(pan, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
    }).start();
  };

  const handleDrop = async (dropPose: Pose) => {
    if (
      phase === 'BALANCING' ||
      phase === 'COLLAPSING' ||
      phase === 'FALLEN_CHOICE' ||
      phase === 'SETTLED'
    ) {
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
        setStatusMessage(`🍃 중심을 잃고 굴러떨어지는 중... (${res.attempt}/3회)`);

        // Record the final resting pose where it landed on the ground
        const finalPose =
          res.dropResult?.pose ?? new Pose({ x: 0.55, y: 0.05, z: 0 });
        setFallenPose(finalPose);

        // Keep renderedDroppedStone mounted for trajectory playback!
        const trajectoryFrames = res.trajectory?.length ?? 0;
        const dynamicTimeoutMs = Math.max(
          1200,
          Math.ceil(trajectoryFrames * (1000 / 60)) + 400
        );

        if (collapseTimerRef.current) {
          clearTimeout(collapseTimerRef.current);
        }
        collapseTimerRef.current = setTimeout(() => {
          handleCollapseComplete(finalPose);
        }, dynamicTimeoutMs);
        return;
      }

      // Settled or 3rd-attempt auto-placed
      setPhase('SETTLED');
      safeHaptic('success');
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
      setFallenPose(null);
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
  const isBusy =
    phase === 'BALANCING' ||
    phase === 'COLLAPSING' ||
    phase === 'FALLEN_CHOICE' ||
    phase === 'SETTLED';

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <Text style={styles.title}>돌탑에 올리기</Text>
        <Text
          style={[
            styles.status,
            phase === 'COLLAPSING' && styles.statusDanger,
            phase === 'FALLEN_CHOICE' && styles.statusPeaceful,
            phase === 'SETTLED' && styles.statusSuccess,
          ]}
        >
          {statusMessage}
        </Text>
      </View>

      {/* Dynamic Status / Alert Banner */}
      {phase === 'FALLEN_CHOICE' ? (
        <View style={styles.peacefulBox}>
          <Text style={styles.peacefulAlert}>
            🍃 돌이 굴러떨어져 바닥에 안착했습니다. 이것도 하나의 탑이 될 수 있어요.
          </Text>
        </View>
      ) : phase === 'COLLAPSING' || state.towerCollapsed ? (
        <View style={styles.collapsedBox}>
          <Text style={styles.collapsedAlert}>
            ⚠️ 균형을 잃고 돌탑이 무너졌습니다 (동적 물리 붕괴 연출 중)
          </Text>
        </View>
      ) : null}

      {/* Main Drag & Drop Zone */}
      <View style={styles.canvasContainer}>
        {/* Camera Preset Selector HUD */}
        <View style={styles.cameraPresetRow}>
          <Pressable
            style={[
              styles.cameraPresetChip,
              cameraPreset === 'front' && styles.cameraPresetChipActive,
            ]}
            onPress={() => setCameraPreset('front')}
          >
            <Text
              style={[
                styles.cameraPresetText,
                cameraPreset === 'front' && styles.cameraPresetTextActive,
              ]}
            >
              정면
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.cameraPresetChip,
              cameraPreset === 'side45' && styles.cameraPresetChipActive,
            ]}
            onPress={() => setCameraPreset('side45')}
          >
            <Text
              style={[
                styles.cameraPresetText,
                cameraPreset === 'side45' && styles.cameraPresetTextActive,
              ]}
            >
              측면 45°
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.cameraPresetChip,
              cameraPreset === 'top' && styles.cameraPresetChipActive,
            ]}
            onPress={() => setCameraPreset('top')}
          >
            <Text
              style={[
                styles.cameraPresetText,
                cameraPreset === 'top' && styles.cameraPresetTextActive,
              ]}
            >
              탑뷰
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.cameraPresetChip,
              cameraPreset === 'free' && styles.cameraPresetChipActive,
            ]}
            onPress={() => setCameraPreset('free')}
          >
            <Text
              style={[
                styles.cameraPresetText,
                cameraPreset === 'free' && styles.cameraPresetTextActive,
              ]}
            >
              360° 자유
            </Text>
          </Pressable>
        </View>

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
          enableOrbitControls
          cameraPreset={cameraPreset}
          onCameraPresetChange={setCameraPreset}
          towerTopY={activeTower.topY()}
          onCollapseAnimationComplete={() => handleCollapseComplete()}
          onPlaybackComplete={() => handleCollapseComplete()}
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

      {/* Bottom Action Buttons: Choice UX when stone fell, or direct drop controls */}
      {phase === 'FALLEN_CHOICE' ? (
        <View style={styles.buttonRow}>
          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              isConfirmingFallen && styles.disabledButton,
              pressed && !isConfirmingFallen && { opacity: 0.7 },
            ]}
            disabled={isConfirmingFallen}
            onPress={handleRetryPlacement}
          >
            <Text style={styles.secondaryText}>
              ↺ 다시 올려보기 ({Math.min(state.attempt + 1, 3)}/3회)
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              isConfirmingFallen && styles.disabledButton,
              pressed && !isConfirmingFallen && { opacity: 0.9 },
            ]}
            disabled={isConfirmingFallen}
            onPress={handleConfirmFallen}
          >
            <Text style={styles.primaryText}>⛰️ 이 자리에 그대로 두기</Text>
          </Pressable>
        </View>
      ) : (
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
      )}
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
  statusPeaceful: {
    color: '#34C759',
    fontWeight: '700',
  },
  statusSuccess: {
    color: '#2E7D32',
    fontWeight: '700',
  },
  peacefulBox: {
    backgroundColor: 'rgba(52, 199, 89, 0.12)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: TossTheme.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(52, 199, 89, 0.28)',
    marginBottom: 8,
  },
  peacefulAlert: {
    ...TossTheme.typography.micro,
    color: '#34C759',
    textAlign: 'center',
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
  cameraPresetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 8,
    zIndex: 10,
  },
  cameraPresetChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: TossTheme.radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  cameraPresetChipActive: {
    backgroundColor: TossTheme.colors.primary,
    borderColor: TossTheme.colors.primary,
  },
  cameraPresetText: {
    ...TossTheme.typography.micro,
    color: TossTheme.colors.textSecondary,
    fontWeight: '600',
  },
  cameraPresetTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
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
  
  placementControlPanel: {
    width: '100%',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  placementGuideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    backgroundColor: '#1E2026',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2F343F',
  },
  stabilityIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stabilityDot: {
    fontSize: 12,
  },
  stabilityText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#05D686',
  },
  stabilityTextWarning: {
    color: '#FA5252',
  },
  coordText: {
    fontSize: 11,
    color: '#8B95A1',
    fontWeight: '600',
  },
  nudgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 10,
  },
  nudgeButton: {
    flex: 1,
    backgroundColor: '#262930',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#353A45',
  },
  nudgeCenterButton: {
    backgroundColor: 'rgba(49, 130, 246, 0.16)',
    borderColor: '#3182F6',
  },
  nudgeButtonText: {
    color: '#E5E8EB',
    fontSize: 12,
    fontWeight: '600',
  },
  nudgeCenterText: {
    color: '#3182F6',
    fontSize: 12,
    fontWeight: '700',
  },
  dropActionButton: {
    backgroundColor: '#3182F6',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#3182F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  dropActionButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  dragTrackArea: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    height: 90,
  },
  draggableStone: {
    width: 130,
    height: 52,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 14,
    borderBottomLeftRadius: 16,
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
