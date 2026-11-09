import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { type StoneShape } from '../../domain/entities/Stone.ts';
import { getSharedAppContainer } from '../../infrastructure/di/AppContainer.ts';
import { NATURAL_PEBBLE_PALETTE } from '../../presentation/components/pebbleGeometrySpec.ts';
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

const STONE_SHAPES: readonly {
  shape: StoneShape;
  label: string;
  desc: string;
}[] = [
  { shape: 'round', label: '둥근 자갈돌', desc: '모나지 않고 동그란 강변 자갈돌' },
  { shape: 'flat', label: '납작한 자갈돌', desc: '돌탑의 든든한 받침이 되는 동그란 자갈' },
  { shape: 'pebble', label: '작은 자갈돌', desc: '가볍고 아담한 여울 자갈돌' },
  { shape: 'tall', label: '통통한 자갈돌', desc: '동글동글하게 빚어진 기원의 자갈돌' },
  { shape: 'boulder', label: '단단한 몽돌', desc: '무게감 있는 둥근 강변 자갈돌' },
];

const STONE_COLORS: readonly { color: string; name: string }[] =
  NATURAL_PEBBLE_PALETTE.map((item) => ({
    color: item.code,
    name: item.name,
  }));

interface StoneVisualProfile {
  width: number;
  height: number;
  borderTopLeftRadius: number;
  borderTopRightRadius: number;
  borderBottomRightRadius: number;
  borderBottomLeftRadius: number;
}

/**
 * 아담하고 매끄러운 조약돌 비례 스펙 (v2.1 크기 축소 및 완전 곡면화)
 */
const SHAPE_PROFILES: Record<StoneShape, StoneVisualProfile> = {
  flat: {
    width: 84,
    height: 36,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 28,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 18,
  },
  round: {
    width: 78,
    height: 40,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 30,
    borderBottomRightRadius: 20,
    borderBottomLeftRadius: 20,
  },
  tall: {
    width: 74,
    height: 38,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 18,
  },
  pebble: {
    width: 66,
    height: 34,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderBottomRightRadius: 16,
    borderBottomLeftRadius: 16,
  },
  boulder: {
    width: 88,
    height: 42,
    borderTopLeftRadius: 34,
    borderTopRightRadius: 32,
    borderBottomRightRadius: 20,
    borderBottomLeftRadius: 20,
  },
};

/**
 * SCR-05 돌 선택 화면 (`/stack/stone`)
 * v2.1: 수동 모양/색상 선택 UI를 제거하고 오직 자연스러운 랜덤 조약돌 뽑기(`🎲 다른 돌 찾아보기`)만 제공
 */
export default function SelectStoneScreen() {
  const router = useRouter();
  const [controller] = useState(
    () => getSharedAppContainer().controllers.stackStone
  );
  const [state, setState] = useState(() => controller.getState());

  useEffect(() => {
    return controller.subscribe((next) => {
      setState(next);
    });
  }, [controller]);

  const handleReroll = () => {
    safeHaptic('grab');
    controller.rerollStone();
  };

  const selectedShape = state.selectedStone.shape;
  const selectedColor = state.selectedStone.color || '#4A5568';
  const profile = SHAPE_PROFILES[selectedShape] ?? SHAPE_PROFILES.round;

  const currentShapeMeta =
    STONE_SHAPES.find((s) => s.shape === selectedShape) ?? STONE_SHAPES[0];
  const currentColorMeta =
    STONE_COLORS.find((c) => c.color === selectedColor) ?? STONE_COLORS[0];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>소원을 담을 조약돌 만나기</Text>
        <Text style={styles.subtitle}>
          강가에서 우연히 마주친 자연 조약돌에 소원을 담아보세요
        </Text>
      </View>

      {/* Compact Pebble Random Encounter Card */}
      <View style={styles.previewCard}>
        <View style={styles.pebbleContainer}>
          <View
            style={[
              styles.realStoneVisual,
              {
                width: profile.width,
                height: profile.height,
                borderTopLeftRadius: profile.borderTopLeftRadius,
                borderTopRightRadius: profile.borderTopRightRadius,
                borderBottomRightRadius: profile.borderBottomRightRadius,
                borderBottomLeftRadius: profile.borderBottomLeftRadius,
                backgroundColor: selectedColor,
              },
            ]}
          >
            <View style={styles.stoneSurfaceHighlight} />
          </View>
          <View
            style={[
              styles.groundShadow,
              { width: Math.round(profile.width * 0.88) },
            ]}
          />
        </View>

        <Text style={styles.previewName}>{currentShapeMeta.label}</Text>
        <Text style={styles.previewDesc}>
          {currentShapeMeta.desc} · {currentColorMeta.name}
        </Text>
        <Text style={styles.zenGuideText}>
          모양과 빛깔은 자연의 우연으로 정해집니다
        </Text>

        {/* Random Reroll Action Button (F21) */}
        <Pressable
          style={({ pressed }) => [
            styles.rerollButton,
            pressed && styles.rerollButtonPressed,
          ]}
          onPress={handleReroll}
          accessibilityRole="button"
          accessibilityLabel="다른 돌 찾아보기"
        >
          <Text style={styles.rerollButtonText}>🎲 다른 돌 찾아보기</Text>
        </Pressable>
      </View>

      {/* Primary Action Button */}
      <Pressable
        style={({ pressed }) => [
          styles.nextButton,
          pressed && styles.nextButtonPressed,
        ]}
        onPress={() => router.push('/stack/write')}
      >
        <Text style={styles.nextButtonText}>이 돌에 소원 적기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TossTheme.colors.background,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 28,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
    justifyContent: 'space-between',
  },
  header: {
    marginBottom: 8,
  },
  title: {
    ...TossTheme.typography.title,
    color: TossTheme.colors.textPrimary,
    marginBottom: 6,
  },
  subtitle: {
    ...TossTheme.typography.caption,
    color: TossTheme.colors.textSecondary,
  },
  previewCard: {
    flex: 1,
    maxHeight: 360,
    backgroundColor: TossTheme.colors.card,
    borderRadius: TossTheme.radius.card,
    borderWidth: 1,
    borderColor: TossTheme.colors.border,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
  },
  pebbleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 82,
    marginBottom: 8,
  },
  realStoneVisual: {
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 2,
    borderTopColor: 'rgba(255, 255, 255, 0.38)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(0, 0, 0, 0.42)',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255, 255, 255, 0.14)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(0, 0, 0, 0.24)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.36,
    shadowRadius: 8,
    elevation: 6,
  },
  stoneSurfaceHighlight: {
    position: 'absolute',
    top: 4,
    left: 10,
    right: 10,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  groundShadow: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    marginTop: 6,
  },
  previewName: {
    ...TossTheme.typography.cardTitle,
    color: TossTheme.colors.textPrimary,
    marginTop: 10,
  },
  previewDesc: {
    ...TossTheme.typography.micro,
    color: TossTheme.colors.textSecondary,
    marginTop: 4,
  },
  zenGuideText: {
    ...TossTheme.typography.micro,
    color: TossTheme.colors.textTertiary,
    marginTop: 6,
  },
  rerollButton: {
    marginTop: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: TossTheme.radius.button,
    paddingHorizontal: 20,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rerollButtonPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    transform: [{ scale: 0.98 }],
  },
  rerollButtonText: {
    ...TossTheme.typography.caption,
    color: TossTheme.colors.textPrimary,
    fontWeight: '700',
  },
  nextButton: {
    backgroundColor: TossTheme.colors.primary,
    height: 54,
    borderRadius: TossTheme.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: TossTheme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  nextButtonPressed: {
    backgroundColor: TossTheme.colors.primaryHover,
    transform: [{ scale: 0.985 }],
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
