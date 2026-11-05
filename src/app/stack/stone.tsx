import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { type StoneShape } from '../../domain/entities/Stone.ts';
import { getSharedAppContainer } from '../../infrastructure/di/AppContainer.ts';
import { TossTheme } from '../../presentation/theme/tossTheme.ts';

const STONE_SHAPES: readonly {
  shape: StoneShape;
  label: string;
  desc: string;
}[] = [
  { shape: 'round', label: '둥근 몽돌', desc: '모나지 않고 매끄러운 조약돌' },
  { shape: 'flat', label: '납작한 강돌', desc: '돌탑의 든든한 받침돌' },
  { shape: 'pebble', label: '작은 자갈돌', desc: '가볍고 귀여운 산돌' },
  { shape: 'tall', label: '우뚝 선 선돌', desc: '곧게 뻗은 기원의 돌' },
  { shape: 'boulder', label: '우직한 바위', desc: '무게감 있는 단단한 기초' },
];

const STONE_COLORS: readonly { color: string; name: string }[] = [
  { color: '#3A3F4D', name: '흑요석' },
  { color: '#566070', name: '청회석' },
  { color: '#8D99AE', name: '백옥석' },
  { color: '#9E8E7D', name: '황토석' },
  { color: '#C5B5A2', name: '화강암' },
];

interface StoneVisualProfile {
  width: number;
  height: number;
  borderTopLeftRadius: number;
  borderTopRightRadius: number;
  borderBottomRightRadius: number;
  borderBottomLeftRadius: number;
}

const SHAPE_PROFILES: Record<StoneShape, StoneVisualProfile> = {
  flat: {
    width: 176,
    height: 44,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 20,
    borderBottomLeftRadius: 26,
  },
  round: {
    width: 142,
    height: 54,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 30,
    borderBottomRightRadius: 32,
    borderBottomLeftRadius: 38,
  },
  tall: {
    width: 98,
    height: 72,
    borderTopLeftRadius: 38,
    borderTopRightRadius: 34,
    borderBottomRightRadius: 26,
    borderBottomLeftRadius: 28,
  },
  pebble: {
    width: 86,
    height: 38,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 22,
  },
  boulder: {
    width: 196,
    height: 60,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 32,
    borderBottomRightRadius: 24,
    borderBottomLeftRadius: 26,
  },
};

/**
 * SCR-05 돌 선택 화면 (`/stack/stone`)
 * Toss-Style Minimal Aesthetic Revamp
 * 근거: 화면 설계서.md 5장, DB-008
 */
export default function SelectStoneScreen() {
  const router = useRouter();
  const [controller] = useState(
    () => getSharedAppContainer().controllers.stackStone
  );
  const [state, setState] = useState(() => controller.getState());

  const handleSelect = (shape: StoneShape, color: string) => {
    controller.selectStone(shape, color);
    setState({ ...controller.getState() });
  };

  const selectedShape = state.selectedStone.shape;
  const selectedColor = state.selectedStone.color || '#566070';
  const profile = SHAPE_PROFILES[selectedShape] ?? SHAPE_PROFILES.round;

  const currentShapeMeta =
    STONE_SHAPES.find((s) => s.shape === selectedShape) ?? STONE_SHAPES[0];
  const currentColorMeta =
    STONE_COLORS.find((c) => c.color === selectedColor) ?? STONE_COLORS[0];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>소원을 담을 돌 고르기</Text>
        <Text style={styles.subtitle}>
          정성을 담아 올릴 돌의 모양과 질감을 선택해 보세요
        </Text>
      </View>

      {/* 3D Visual Pebble Preview Box */}
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
          <View style={styles.groundShadow} />
        </View>

        <Text style={styles.previewName}>{currentShapeMeta.label}</Text>
        <Text style={styles.previewDesc}>
          {currentShapeMeta.desc} · {currentColorMeta.name}
        </Text>
      </View>

      {/* Options 1: Stone Shape */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>돌 모양</Text>
        <View style={styles.shapeOptionRow}>
          {STONE_SHAPES.map((item) => {
            const active = selectedShape === item.shape;
            return (
              <Pressable
                key={item.shape}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => handleSelect(item.shape, selectedColor)}
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Options 2: Stone Color / Material */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>돌 색상</Text>
        <View style={styles.colorRow}>
          {STONE_COLORS.map((item) => {
            const active = selectedColor === item.color;
            return (
              <Pressable
                key={item.color}
                style={[
                  styles.colorButton,
                  active && styles.colorButtonActive,
                ]}
                onPress={() => handleSelect(selectedShape, item.color)}
              >
                <View
                  style={[
                    styles.colorCircle,
                    { backgroundColor: item.color },
                  ]}
                />
                <Text
                  style={[
                    styles.colorName,
                    active && styles.colorNameActive,
                  ]}
                >
                  {item.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
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
    backgroundColor: TossTheme.colors.card,
    borderRadius: TossTheme.radius.card,
    borderWidth: 1,
    borderColor: TossTheme.colors.border,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  pebbleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 100,
  },
  realStoneVisual: {
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 2.5,
    borderTopColor: 'rgba(255, 255, 255, 0.4)',
    borderBottomWidth: 3.5,
    borderBottomColor: 'rgba(0, 0, 0, 0.45)',
    borderLeftWidth: 1.5,
    borderLeftColor: 'rgba(255, 255, 255, 0.15)',
    borderRightWidth: 1.5,
    borderRightColor: 'rgba(0, 0, 0, 0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  stoneSurfaceHighlight: {
    position: 'absolute',
    top: 4,
    left: 8,
    right: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  groundShadow: {
    width: 160,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    marginTop: 6,
  },
  previewName: {
    ...TossTheme.typography.cardTitle,
    color: TossTheme.colors.textPrimary,
    marginTop: 12,
  },
  previewDesc: {
    ...TossTheme.typography.micro,
    color: TossTheme.colors.textSecondary,
    marginTop: 3,
  },
  section: {
    marginBottom: 8,
  },
  sectionTitle: {
    ...TossTheme.typography.caption,
    color: TossTheme.colors.textSecondary,
    fontWeight: '600',
    marginBottom: 8,
  },
  shapeOptionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: TossTheme.colors.card,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: TossTheme.radius.button,
    borderWidth: 1,
    borderColor: TossTheme.colors.border,
  },
  chipActive: {
    backgroundColor: TossTheme.colors.textPrimary,
    borderColor: TossTheme.colors.textPrimary,
  },
  chipText: {
    ...TossTheme.typography.caption,
    color: TossTheme.colors.textSecondary,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  colorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  colorButton: {
    alignItems: 'center',
    padding: 6,
    borderRadius: TossTheme.radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  colorButtonActive: {
    borderColor: TossTheme.colors.primary,
    backgroundColor: TossTheme.colors.primarySoft,
  },
  colorCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.3)',
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(0, 0, 0, 0.3)',
    marginBottom: 4,
  },
  colorName: {
    ...TossTheme.typography.micro,
    color: TossTheme.colors.textTertiary,
  },
  colorNameActive: {
    color: TossTheme.colors.primary,
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
