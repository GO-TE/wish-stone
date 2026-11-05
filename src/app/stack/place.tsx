import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Tower } from '../../domain/entities/Tower.ts';
import { Pose } from '../../domain/value-objects/Pose.ts';
import { TowerKey } from '../../domain/value-objects/TowerKey.ts';
import { StackStoneController } from '../../presentation/controllers/StackStoneController.ts';

/**
 * SCR-07 쌓기 (일반 3D) 화면 (`/stack/place`)
 * 3D 돌탑 위로 돌을 드래그해 놓거나 [자동으로 올리기]를 누르고,
 * 중심에서 벗어나 실패하면 `tower_collapsed` 물리 흔들림 안내를 보여준 뒤 최대 3회차에 자동 안착시킨다.
 * 근거: 화면 설계서.md 5장, DB-010, D-019
 */
export default function PlaceStone3DScreen() {
  const router = useRouter();
  const [controller] = useState(() => {
    const c = new StackStoneController();
    c.updateContent('소원이 이루어지기를 바랍니다');
    return c;
  });
  const [state, setState] = useState(() => controller.getState());
  const [statusMessage, setStatusMessage] = useState(
    '돌을 드래그해 돌탑 꼭대기에 올려놓으세요.'
  );

  const sampleTower = new Tower(TowerKey.global(), [], {
    stoneCount: 10,
    todayCount: 2,
    fulfilledCount: 1,
    cheerCount: 20,
  });

  const handleDrop = async (dropPose: Pose) => {
    const res = await controller.placeStone(sampleTower, dropPose);
    setState({ ...controller.getState() });
    if (res.status === 'retry') {
      setStatusMessage(
        `돌탑 중심에서 벗어나 무너졌어요! 다시 올려볼까요? (${res.attempt}/3회)`
      );
      return;
    }
    setStatusMessage(
      res.autoPlaced
        ? '3회 시도로 돌탑 꼭대기에 자동 안착되었습니다!'
        : '돌탑 위에 무사히 안착했습니다!'
    );
    router.replace('/home');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>3D 돌탑에 올리기</Text>
      <Text style={styles.status}>{statusMessage}</Text>

      {state.towerCollapsed ? (
        <Text style={styles.collapsedAlert}>
          ⚠️ 물리 연출: 돌탑 상단이 흔들리며 무너졌습니다 (tower_collapsed)
        </Text>
      ) : null}

      <View style={styles.canvasPlaceholder}>
        <Text style={styles.canvasEmoji}>🪨</Text>
        <Text style={styles.canvasCaption}>
          시도 횟수: {state.attempt}회 · 남은 일일 쿼터: {state.quota.remaining}회
        </Text>
      </View>

      <View style={styles.buttonRow}>
        <Pressable
          style={styles.secondaryButton}
          onPress={() => handleDrop(new Pose({ x: 2.0, y: 1.5, z: 0 }))}
        >
          <Text style={styles.secondaryText}>가장자리에 놓기 (실패 테스트)</Text>
        </Pressable>
        <Pressable
          style={styles.primaryButton}
          onPress={() => handleDrop(new Pose({ x: 0, y: 0.25, z: 0 }))}
        >
          <Text style={styles.primaryText}>중앙에 올리기 (완료)</Text>
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
    marginBottom: 8,
  },
  status: {
    color: '#A89F91',
    fontSize: 14,
    marginBottom: 12,
  },
  collapsedAlert: {
    color: '#FF6B6B',
    fontSize: 13,
    marginBottom: 12,
  },
  canvasPlaceholder: {
    flex: 1,
    backgroundColor: '#181A20',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  canvasEmoji: {
    fontSize: 56,
    marginBottom: 10,
  },
  canvasCaption: {
    color: '#D6C7B2',
    fontSize: 13,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#2A2D34',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryText: {
    color: '#F5EFE6',
    fontSize: 13,
    fontWeight: '600',
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#D6C7B2',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryText: {
    color: '#191919',
    fontSize: 14,
    fontWeight: '700',
  },
});
