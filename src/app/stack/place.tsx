import React, { useEffect, useRef, useState } from 'react';
import {
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
import { StonePhysicsBodyFactory } from '../../infrastructure/physics/StonePhysicsBodyFactory.ts';
import { StoneTowerCanvas } from '../../presentation/components/StoneTowerCanvas.tsx';
import {
  calculate3DDropPoseFromWorldPosition,
  type DragWorldPositionResult,
} from '../../presentation/components/stoneDragSpec.ts';
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
 * v2.1: 실패 액션/경고 문구 제거 및 평온한 재시도 플로우(`FALLEN_CHOICE` / `다시 올려보기`) 보존
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
    '돌을 위로 끌어올려 돌탑 꼭대기에 균형을 맞춰보세요'
  );
  const [isNearTarget, setIsNearTarget] = useState(false);
  const [isOffCenter, setIsOffCenter] = useState(false);

  const collapseTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (collapseTimerRef.current) {
        clearTimeout(collapseTimerRef.current);
      }
    };
  }, []);

  // Ensure authenticated session exists so placing never fails with 401 on refresh
  useEffect(() => {
    const container = getSharedAppContainer();
    if (!container.http.getAccessToken() && !container.auth.currentUser()) {
      container.auth.signIn('guest').catch(() => {});
    }
  }, []);

  // Subscribe to controller state changes (clears trajectory when reset)
  useEffect(() => {
    return controller.subscribe((next) => {
      setState(next);
      setPhase(next.phase);
      setCurrentTrajectory(next.lastSimulationTrajectory);
    });
  }, [controller]);

  // Active tower state: defaults to empty tower, loads real stones from repository
  const [activeTower, setActiveTower] = useState<Tower>(() => {
    return new Tower(
      controller.getState().scope ?? TowerKey.global(),
      [],
      { stoneCount: 0, todayCount: 0, fulfilledCount: 0, cheerCount: 0 }
    );
  });

  // Load real tower from repository
  useEffect(() => {
    const container = getSharedAppContainer();
    const scope = controller.getState().scope ?? TowerKey.global();
    container.repositories.towers
      .get(scope, 50)
      .then((tower) => {
        if (tower) {
          setActiveTower(tower);
        }
      })
      .catch(() => {});
  }, [controller]);

  const getAutoPlacementDropPose = (lateralOffset = 0): Pose => {
    const dropConfig = StonePhysicsBodyFactory.getShapeConfig(state.selectedStone.shape);
    let targetX = lateralOffset;
    let targetZ = 0;
    let supportSurfaceY = 0;

    if (activeTower.stones.length > 0) {
      let highestStone = activeTower.stones[0].stone;
      let highestTopY = -Infinity;
      for (const item of activeTower.stones) {
        const s = item.stone;
        const hY = StonePhysicsBodyFactory.getShapeConfig(s.shape).halfExtents.y;
        const topY = s.pose.position.y + hY;
        if (topY > highestTopY) {
          highestTopY = topY;
          highestStone = s;
        }
      }
      targetX = Number((highestStone.pose.position.x + lateralOffset).toFixed(4));
      targetZ = Number(highestStone.pose.position.z.toFixed(4));
      supportSurfaceY = Math.max(0, highestTopY);
    }

    return new Pose({
      x: targetX,
      y: Number((supportSurfaceY + dropConfig.halfExtents.y + 0.25).toFixed(4)),
      z: targetZ,
    });
  };

  /**
   * 돌이 정원 바닥으로 내려앉았을 때의 처리:
   * 내려앉은 자리 그대로 안착시키거나 다시 올려볼 수 있는 선택 상태(FALLEN_CHOICE)로 진입 (D-022)
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
    setStatusMessage('🍃 돌이 정원 바닥에 내려앉았습니다. 다시 올려보거나 이 자리에 둘 수 있어요.');
  };

  /**
   * 내려앉은 그 자리에 그대로 소원 돌을 확정 안착하기
   */
  const handleConfirmFallen = async () => {
    if (!fallenPose || isConfirmingFallen) return;
    setIsConfirmingFallen(true);

    try {
      const container = getSharedAppContainer();
      if (!container.http.getAccessToken()) {
        await container.auth.signIn('guest');
      }
      if (!controller.getState().quota.canStack()) {
        controller.grantRewardQuotaBonus(999);
      }
      await controller.confirmFallenPlacement(fallenPose);
      safeHaptic('success');
      setPhase('SETTLED');
      setStatusMessage('✨ 내려앉은 자리 그대로 소원이 돌탑의 일부로 깃들었습니다.');
      setTimeout(() => {
        router.replace('/home');
      }, 1200);
    } catch (err: any) {
      if (
        err?.status === 401 ||
        err?.code === 'UNAUTHORIZED' ||
        err?.code === 'DAILY_QUOTA_EXCEEDED' ||
        err?.message?.includes('DAILY_QUOTA_EXCEEDED')
      ) {
        try {
          const container = getSharedAppContainer();
          await container.auth.signIn('guest');
          if (!controller.getState().quota.canStack()) {
            controller.grantRewardQuotaBonus(999);
          }
          await controller.confirmFallenPlacement(fallenPose);
          safeHaptic('success');
          setPhase('SETTLED');
          setStatusMessage('✨ 내려앉은 자리 그대로 소원이 돌탑의 일부로 깃들었습니다.');
          setTimeout(() => {
            router.replace('/home');
          }, 1200);
          return;
        } catch {}
      }
      setStatusMessage(err?.message ? `오류가 발생했습니다: ${err.message}` : '일시적인 네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
      setIsConfirmingFallen(false);
    }
  };

  /**
   * 사용자가 다시 탑 위로 올려보기를 선택했을 때 (재시도 플로우 유지)
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
    setStatusMessage('돌을 위로 끌어올려 돌탑 꼭대기에 균형을 맞춰보세요');
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
    setStatusMessage('돌이 사뿐히 내려앉는 중입니다... ⚖️');

    // Mount dropped stone immediately with initial drop pose (avoids origin jump)
    const initialDroppedStone = state.selectedStone.withPose(dropPose);
    setRenderedDroppedStone(initialDroppedStone);

    try {
      const container = getSharedAppContainer();
      if (!container.http.getAccessToken()) {
        await container.auth.signIn('guest');
      }
      if (!controller.getState().quota.canStack()) {
        controller.grantRewardQuotaBonus(999);
      }
      const res = await controller.placeStone(activeTower, dropPose);
      setState({ ...controller.getState() });

      if (res.trajectory) {
        setCurrentTrajectory(res.trajectory);
      }

      if (res.status === 'retry') {
        setPhase('COLLAPSING');
        safeHaptic('grab');
        setStatusMessage('🍃 돌이 정원 위로 사뿐히 내려앉는 중입니다...');

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
    } catch (err: any) {
      if (
        err?.status === 401 ||
        err?.code === 'UNAUTHORIZED' ||
        err?.message?.includes('UNAUTHORIZED') ||
        err?.code === 'DAILY_QUOTA_EXCEEDED' ||
        err?.message?.includes('DAILY_QUOTA_EXCEEDED')
      ) {
        try {
          const container = getSharedAppContainer();
          await container.auth.signIn('guest');
          if (!controller.getState().quota.canStack()) {
            controller.grantRewardQuotaBonus(999);
          }
          const retryRes = await controller.placeStone(activeTower, dropPose);
          setState({ ...controller.getState() });
          if (retryRes.status === 'saved') {
            setPhase('SETTLED');
            safeHaptic('success');
            setRenderedDroppedStone(state.selectedStone.withPose(retryRes.pose));
            setStatusMessage(
              retryRes.autoPlaced
                ? '✨ 3회 시도로 돌탑 꼭대기에 자동 안착되었습니다!'
                : '🎉 돌탑 위에 무사히 안착했습니다!'
            );
            setTimeout(() => {
              router.replace('/home');
            }, 1200);
            return;
          }
        } catch (retryErr: any) {
          err = retryErr;
        }
      }
      controller.resetPlacement();
      setPhase('IDLE');
      setRenderedDroppedStone(null);
      setCurrentTrajectory(undefined);
      setFallenPose(null);
      if (err?.message?.includes('DAILY_QUOTA_EXCEEDED') || err?.code === 'DAILY_QUOTA_EXCEEDED') {
        setStatusMessage('오늘의 소원 돌 쌓기 쿼터(5개)를 모두 소진했습니다.');
      } else {
        setStatusMessage(err?.message ? `오류가 발생했습니다: ${err.message}` : '일시적인 네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
      }
    }
  };

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
            (phase === 'IDLE' || phase === 'PLACING') && { display: 'none' },
            phase === 'FALLEN_CHOICE' && styles.statusPeaceful,
            phase === 'SETTLED' && styles.statusSuccess,
          ]}
        >
          {statusMessage}
        </Text>
      </View>

      {/* Peaceful Choice Banner when stone settled on garden floor */}
      {phase === 'FALLEN_CHOICE' ? (
        <View style={styles.peacefulBox}>
          <Text style={styles.peacefulAlert}>
            🍃 돌이 정원 바닥에 내려앉았습니다. 이것도 하나의 탑이 될 수 있어요.
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

        {/* Floating Reroll Action Button (F21) */}
        {!isBusy && (
          <View style={styles.floatingRerollContainer}>
            <Pressable
              style={({ pressed }) => [
                styles.floatingRerollButton,
                pressed && styles.floatingRerollButtonPressed,
              ]}
              onPress={() => {
                safeHaptic('grab');
                controller.rerollStone();
              }}
              accessibilityRole="button"
              accessibilityLabel="다른 돌 찾아보기"
            >
              <Text style={styles.floatingRerollText}>🎲 다른 돌 찾아보기</Text>
            </Pressable>
          </View>
        )}

        {/* Stone Tower Canvas with 3D Direct Drag Interaction */}
        <StoneTowerCanvas
          stones={activeTower.stones}
          activeStone={state.selectedStone}
          isDraggable={!isBusy}
          onStoneDragStart={() => {
            if (phase !== 'IDLE') return;
            setPhase('PLACING');
            controller.startPlacing();
            safeHaptic('grab');
            setStatusMessage('마음이 닿는 곳으로 돌을 자유롭게 옮겨보세요');
          }}
          onStoneDragMove={(result: DragWorldPositionResult) => {
            setIsNearTarget(result.isOverDropZone);
            setIsOffCenter(result.balanceRating !== 'stable');
            if (result.isOverDropZone) {
              setStatusMessage('✨ 손을 놓으면 이 자리에 돌이 안착합니다');
            } else {
              setStatusMessage('원하는 위치로 돌을 자유롭게 끌어올려 보세요');
            }
          }}
          onStoneDrop={(dropPose) => {
            handleDrop(dropPose);
          }}
          onStoneDragCancel={() => {
            setPhase('IDLE');
            setIsNearTarget(false);
            setIsOffCenter(false);
            setStatusMessage('원하는 높이와 위치에서 손을 놓아 돌을 올려보세요');
          }}
          collapsedShake={false}
          trajectory={currentTrajectory ?? state.lastSimulationTrajectory}
          phase={phase}
          droppedStone={renderedDroppedStone}
          showControls={false}
          enableOrbitControls
          enablePan={true}
          enableZoom={true}
          cameraPreset={cameraPreset}
          onCameraPresetChange={setCameraPreset}
          enableRecenterButton={true}
          onRecenter={() => setCameraPreset('front')}
          towerTopY={activeTower.topSurfaceY ? activeTower.topSurfaceY() : activeTower.topY()}
          onCollapseAnimationComplete={() => handleCollapseComplete()}
          onPlaybackComplete={() => handleCollapseComplete()}
        />

        <Text style={styles.canvasCaption}>
          시도 {Math.min(state.attempt + 1, 3)}/3회 · 일일 쿼터 잔여 {state.quota.remaining}개
        </Text>
      </View>

      {/* Bottom Action Buttons: Choice UX when stone settled on floor, or direct placement */}
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
              styles.primaryButton,
              isBusy && styles.disabledButton,
              pressed && !isBusy && { opacity: 0.9 },
            ]}
            disabled={isBusy}
            onPress={() => handleDrop(getAutoPlacementDropPose(0))}
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
    display: 'none',
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
  floatingRerollContainer: {
    display: 'none',
    position: 'absolute',
    top: 56,
    right: 14,
    zIndex: 15,
  },
  floatingRerollButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  floatingRerollButtonPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    transform: [{ scale: 0.97 }],
  },
  floatingRerollText: {
    ...TossTheme.typography.micro,
    color: TossTheme.colors.textPrimary,
    fontWeight: '700',
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
