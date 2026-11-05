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

/**
 * SCR-07 쌓기 (일반 3D & 실감 드래그 인터랙션) 화면 (`/stack/place`)
 * - 마우스/터치 드래그 앤 드롭(PanResponder)으로 돌을 직접 움직여 돌탑 꼭대기 타겟(🎯)에 올립니다.
 * - 중심(반경 55px 이내)에 놓으면 성공 안착되고, 너무 빗나가면 `tower_collapsed` 물리 연출과 함께 다시 시도합니다.
 * - 3회차 실패 시 자동으로 꼭대기에 안착 보정됩니다 (D-019).
 * - 클릭 한 번으로 빠르게 올릴 수 있는 보조 버튼도 함께 제공합니다.
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
    '돌을 마우스로 잡고 위쪽 돌탑 꼭대기(🎯)로 끌어올려 놓아보세요.'
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
          color: '#4A433A',
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
          color: '#6E6659',
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
          color: '#8C8373',
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
        `💥 중심에서 벗어나 돌탑이 무너졌어요! 다시 올려볼까요? (${res.attempt}/3회)`
      );
      // 드래그 위치 원위치 복원
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

  // 실시간 마우스 & 터치 드래그 리스폰더
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
        // dy가 위쪽(음수)으로 충분히 올라갔는지 판정 (위로 70px 이상 이동)
        if (gestureState.dy < -70) {
          const offsetX = gestureState.dx;
          // 중심 60px 이내면 성공 안착, 60px 초과면 빗맞힘(무너짐)
          if (Math.abs(offsetX) <= 60) {
            handleDrop(new Pose({ x: offsetX / 300, y: 0.65, z: 0 }));
          } else {
            handleDrop(new Pose({ x: (offsetX > 0 ? 1.8 : -1.8), y: 0.65, z: 0 }));
          }
        } else {
          // 위로 충분히 올리지 않고 놓은 경우: 제자리로 복귀
          setStatusMessage('위쪽 목표 지점(🎯)까지 더 높이 끌어올려 놓아보세요!');
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>3D 돌탑에 올리기</Text>
      <Text style={styles.status}>{statusMessage}</Text>

      {state.towerCollapsed ? (
        <Text style={styles.collapsedAlert}>
          ⚠️ 물리 연출: 중심을 잃고 돌탑이 무너졌습니다 (tower_collapsed)
        </Text>
      ) : null}

      <View style={styles.canvasContainer}>
        {/* 돌탑 상단 착지 목표 구역 (Drop Target Zone) */}
        <View style={styles.dropZone}>
          <Text style={styles.dropZoneTarget}>🎯</Text>
          <Text style={styles.dropZoneText}>여기에 돌을 놓으세요</Text>
        </View>

        {/* 3D 돌탑 시각화 */}
        <StoneTowerCanvas
          stones={sampleTower.stones}
          collapsedShake={state.towerCollapsed}
        />

        {/* 인터랙티브 드래그 가능한 사용자 소원 돌 */}
        <View style={styles.dragTrackArea}>
          <Animated.View
            {...panResponder.panHandlers}
            style={[
              styles.draggableStone,
              {
                backgroundColor: state.stone.color || '#C7B9A5',
                transform: [{ translateX: pan.x }, { translateY: pan.y }],
                borderColor: isDragging ? '#FFD166' : '#E8DFD0',
                elevation: isDragging ? 10 : 3,
              },
            ]}
          >
            <Text style={styles.stoneIcon}>🪨</Text>
            <Text style={styles.stoneLabel}>
              {isDragging ? '놓으면 투하!' : '여기를 마우스로 드래그'}
            </Text>
          </Animated.View>
        </View>

        <Text style={styles.canvasCaption}>
          시도 횟수: {state.attempt}/3회 · 오늘 남은 쿼터: {state.quota.remaining}회
        </Text>
      </View>

      {/* 마우스 드래그가 어려운 사용자를 위한 즉시 실행 버튼 */}
      <View style={styles.buttonRow}>
        <Pressable
          style={styles.secondaryButton}
          onPress={() => handleDrop(new Pose({ x: 2.0, y: 1.5, z: 0 }))}
        >
          <Text style={styles.secondaryText}>💥 빗맞혀서 무너뜨리기 (실패 테스트)</Text>
        </Pressable>
        <Pressable
          style={styles.primaryButton}
          onPress={() => handleDrop(new Pose({ x: 0, y: 0.65, z: 0 }))}
        >
          <Text style={styles.primaryText}>🎯 꼭대기에 바로 안착 (완료)</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121316',
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F5EFE6',
    marginBottom: 6,
    textAlign: 'center',
  },
  status: {
    color: '#D6C7B2',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
  collapsedAlert: {
    color: '#FF6B6B',
    fontSize: 13,
    marginBottom: 10,
    textAlign: 'center',
    fontWeight: '700',
  },
  canvasContainer: {
    flex: 1,
    backgroundColor: '#181A20',
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A2D34',
  },
  dropZone: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#5C5446',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  dropZoneTarget: {
    fontSize: 24,
    marginBottom: 2,
  },
  dropZoneText: {
    color: '#A89F91',
    fontSize: 12,
    fontWeight: '600',
  },
  dragTrackArea: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 12,
  },
  draggableStone: {
    width: 150,
    height: 70,
    borderRadius: 35,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'grab',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  stoneIcon: {
    fontSize: 26,
    marginBottom: 2,
  },
  stoneLabel: {
    color: '#191919',
    fontSize: 11,
    fontWeight: '700',
  },
  canvasCaption: {
    color: '#8C8373',
    fontSize: 12,
    marginTop: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#2A2D34',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryText: {
    color: '#FF8A8A',
    fontSize: 12,
    fontWeight: '600',
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#D6C7B2',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryText: {
    color: '#191919',
    fontSize: 13,
    fontWeight: '700',
  },
});
