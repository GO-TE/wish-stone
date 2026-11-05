import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { type StoneShape } from '../../domain/entities/Stone.ts';
import { getSharedAppContainer } from '../../infrastructure/di/AppContainer.ts';

const STONE_SHAPES: readonly { shape: StoneShape; label: string }[] = [
  { shape: 'round', label: '둥근 조약돌' },
  { shape: 'flat', label: '납작한 강돌' },
  { shape: 'pebble', label: '작은 자갈돌' },
  { shape: 'boulder', label: '묵직한 바위돌' },
];

const STONE_COLORS = ['#A89F91', '#8D99AE', '#D6C7B2', '#6C757D', '#C9ADA7'];

/**
 * SCR-05 돌 선택 화면 (`/stack/stone`)
 * 돌 모양·색상을 가로 선택지로 보여주고 선택한 돌을 미리보기로 표시한다.
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>소원을 담을 돌 고르기</Text>

      <View
        style={[
          styles.previewBox,
          { borderColor: state.selectedStone.color },
        ]}
      >
        <Text style={styles.previewEmoji}>🪨</Text>
        <Text style={styles.previewLabel}>
          모양: {state.selectedStone.shape} · 색상: {state.selectedStone.color}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>돌 모양</Text>
      <View style={styles.optionRow}>
        {STONE_SHAPES.map((item) => {
          const active = state.selectedStone.shape === item.shape;
          return (
            <Pressable
              key={item.shape}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() =>
                handleSelect(item.shape, state.selectedStone.color)
              }
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>돌 색상</Text>
      <View style={styles.optionRow}>
        {STONE_COLORS.map((color) => {
          const active = state.selectedStone.color === color;
          return (
            <Pressable
              key={color}
              style={[
                styles.colorCircle,
                { backgroundColor: color },
                active && styles.colorCircleActive,
              ]}
              onPress={() => handleSelect(state.selectedStone.shape, color)}
            />
          );
        })}
      </View>

      <Pressable
        style={styles.nextButton}
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
    backgroundColor: '#121316',
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F5EFE6',
    marginBottom: 20,
  },
  previewBox: {
    backgroundColor: '#181A20',
    borderRadius: 16,
    borderWidth: 2,
    padding: 28,
    alignItems: 'center',
    marginBottom: 24,
  },
  previewEmoji: {
    fontSize: 48,
    marginBottom: 10,
  },
  previewLabel: {
    color: '#D6C7B2',
    fontSize: 14,
  },
  sectionTitle: {
    color: '#A89F91',
    fontSize: 13,
    marginBottom: 10,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  chip: {
    backgroundColor: '#1C1E24',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  chipActive: {
    backgroundColor: '#D6C7B2',
  },
  chipText: {
    color: '#A89F91',
    fontSize: 13,
  },
  chipTextActive: {
    color: '#191919',
    fontWeight: '700',
  },
  colorCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  colorCircleActive: {
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  nextButton: {
    backgroundColor: '#D6C7B2',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  nextButtonText: {
    color: '#191919',
    fontSize: 15,
    fontWeight: '700',
  },
});
