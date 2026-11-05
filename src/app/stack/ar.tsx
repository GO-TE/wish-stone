import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Tower } from '../../domain/entities/Tower.ts';
import { Pose } from '../../domain/value-objects/Pose.ts';
import { TowerKey } from '../../domain/value-objects/TowerKey.ts';
import { StackStoneController } from '../../presentation/controllers/StackStoneController.ts';

/**
 * SCR-08 쌓기 (AR) 화면 (`/stack/ar`)
 * - `ARSessionFactory`로 플랫폼별 AR 세션(Viro / WebXR / CameraOverlay)을 시작하고,
 *   카메라·AR 미지원 환경이면 일반 3D 모드(`/stack/place`)로 안내 후 이동한다 (DB-027~029, D-003).
 * - 바닥 인식 → 드래그 → 물리 안착 판정(3회 실패 시 자동 안착) → [📷] 촬영(`/stack/photo`) 흐름을 제어한다.
 * 근거: 화면 설계서.md 4장 (DB-011, 012, 027~029)
 */
export default function PlaceStoneARScreen() {
  const router = useRouter();
  const [controller] = useState(() => {
    const c = new StackStoneController();
    c.updateContent('AR 돌탑에 올리는 소원');
    return c;
  });
  const [state, setState] = useState(() => controller.getState());
  const [guideText, setGuideText] = useState('바닥을 비춰주세요...');

  const sampleTower = new Tower(TowerKey.global(), [], {
    stoneCount: 25,
    todayCount: 4,
    fulfilledCount: 3,
    cheerCount: 60,
  });

  useEffect(() => {
    controller
      .initPlacementMode('ar', sampleTower, Pose.origin())
      .then((next) => {
        setState({ ...next });
        if (!next.arSession) {
          setGuideText(
            '현재 환경에서 AR/카메라를 사용할 수 없어 일반 3D 모드로 전환합니다.'
          );
          return;
        }
        setGuideText(
          next.arSession.supportsPlaneDetection
            ? `바닥이 인식되었습니다 (${next.arSession.kind}). 내 돌을 끌어 올려보세요.`
            : `간이 AR(${next.arSession.kind}) 모드: 화면 하단 돌탑 위로 돌을 올려보세요.`
        );
      })
      .catch(() => {});

    return () => {
      controller.stopARSession().catch(() => {});
    };
  }, [controller]);

  const handlePlaceInAR = async () => {
    const res = await controller.placeStone(
      sampleTower,
      new Pose({ x: 0, y: 0.25, z: 0 })
    );
    setState({ ...controller.getState() });
    if (res.status === 'saved') {
      setGuideText('돌탑 위에 안착했습니다! 사진을 찍거나 완료를 눌러주세요.');
    } else {
      setGuideText(`다시 올려볼까요? (${res.attempt}/3회)`);
    }
  };

  const handleCapturePhoto = async () => {
    try {
      await controller.captureARPhoto();
      setState({ ...controller.getState() });
      router.push('/stack/photo');
    } catch {
      router.push('/stack/photo');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.topButton}>✕ 닫기</Text>
        </Pressable>
        <Text style={styles.sessionBadge}>
          AR: {state.arSession?.kind ?? '일반 3D 폴백'}
        </Text>
      </View>

      <View style={styles.cameraViewport}>
        <Text style={styles.towerGraphic}>◯{'\n'}◯ ◯ ◯</Text>
        <Text style={styles.guideText}>{guideText}</Text>
      </View>

      <View style={styles.bottomControls}>
        <Pressable style={styles.dragButton} onPress={handlePlaceInAR}>
          <Text style={styles.dragButtonText}>[ 내 돌 🪨 올리기 ]</Text>
        </Pressable>

        <View style={styles.actionRow}>
          <Pressable style={styles.photoButton} onPress={handleCapturePhoto}>
            <Text style={styles.photoButtonText}>📷 촬영</Text>
          </Pressable>
          <Pressable
            style={styles.doneButton}
            onPress={() => router.replace('/home')}
          >
            <Text style={styles.doneButtonText}>완료</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0C0E',
    padding: 20,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  topButton: {
    color: '#F5EFE6',
    fontSize: 15,
    fontWeight: '600',
  },
  sessionBadge: {
    color: '#8CE99A',
    fontSize: 12,
  },
  cameraViewport: {
    flex: 1,
    backgroundColor: '#181A20',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    marginBottom: 16,
  },
  towerGraphic: {
    color: '#D6C7B2',
    fontSize: 28,
    textAlign: 'center',
    marginBottom: 16,
  },
  guideText: {
    color: '#F5EFE6',
    fontSize: 14,
    textAlign: 'center',
  },
  bottomControls: {
    gap: 12,
  },
  dragButton: {
    backgroundColor: '#2A2D34',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  dragButtonText: {
    color: '#F5EFE6',
    fontSize: 15,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  photoButton: {
    flex: 1,
    backgroundColor: '#1C1E24',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  photoButtonText: {
    color: '#D6C7B2',
    fontSize: 14,
    fontWeight: '600',
  },
  doneButton: {
    flex: 1,
    backgroundColor: '#D6C7B2',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneButtonText: {
    color: '#191919',
    fontSize: 14,
    fontWeight: '700',
  },
});
