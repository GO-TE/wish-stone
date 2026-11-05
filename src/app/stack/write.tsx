import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { type CategoryCode } from '../../domain/value-objects/TowerKey.ts';
import { getSharedAppContainer } from '../../infrastructure/di/AppContainer.ts';

const CATEGORIES: readonly { code: CategoryCode; label: string }[] = [
  { code: 'job', label: '#취업' },
  { code: 'study', label: '#학업' },
  { code: 'health', label: '#건강' },
  { code: 'relation', label: '#인간관계' },
  { code: 'etc', label: '#기타' },
];

/**
 * SCR-06 소원 작성 화면 (`/stack/write`)
 * - 본문 입력 시 `CategoryAutoClassifier`로 실시간 자동 분류 카테고리 배지를 프리뷰한다 (D-016).
 * - 사용자가 원하면 카테고리 칩을 직접 눌러 수동 오버라이드할 수 있다 (D-016).
 * - `DailyWishQuota`(오늘 남은 무료 소원 횟수 + 리워드 광고 보너스 충전)를 표시한다 (D-018).
 * - [일반으로 쌓기] (`/stack/place`) 및 [AR로 쌓기] (`/stack/ar`) 이동을 제공한다 (DB-009).
 */
export default function WriteWishScreen() {
  const router = useRouter();
  const [controller] = useState(
    () => getSharedAppContainer().controllers.stackStone
  );
  const [state, setState] = useState(() => controller.getState());

  const handleContentChange = (text: string) => {
    setState({ ...controller.updateContent(text) });
  };

  const handleCategorySelect = (code: CategoryCode) => {
    const nextManual = state.manualCategory === code ? null : code;
    setState({ ...controller.overrideCategory(nextManual) });
  };

  const handleGrantBonus = () => {
    controller.grantRewardQuotaBonus(1);
    setState({ ...controller.getState() });
  };

  const canProceed =
    state.content.trim().length > 0 && state.quota.canStack();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>소원 적기</Text>

      {/* 일일 쿼터 안내 및 리워드 충전 (D-018) */}
      <View style={styles.quotaBar}>
        <Text style={styles.quotaText}>
          오늘 남은 돌 올리기: {state.quota.remaining}회 (기본{' '}
          {state.quota.baseQuota} + 보너스 {state.quota.bonusQuota})
        </Text>
        <Pressable style={styles.rewardButton} onPress={handleGrantBonus}>
          <Text style={styles.rewardButtonText}>+1 리워드 충전</Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.textArea}
        multiline
        maxLength={200}
        value={state.content}
        onChangeText={handleContentChange}
        placeholder="간절한 소원을 적어주세요 (최대 200자)"
        placeholderTextColor="#6C6860"
      />
      <Text style={styles.counter}>{state.content.length} / 200자</Text>

      {/* 자동 분류 카테고리 배지 및 수동 선택 칩 (D-016) */}
      <View style={styles.categoryHeader}>
        <Text style={styles.sectionLabel}>
          자동 분류 프리뷰: #{state.autoCategory}
          {state.manualCategory ? ` (수동 선택: #${state.manualCategory})` : ''}
        </Text>
      </View>
      <View style={styles.chipRow}>
        {CATEGORIES.map((cat) => {
          const active = state.effectiveCategory === cat.code;
          return (
            <Pressable
              key={cat.code}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => handleCategorySelect(cat.code)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {cat.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.modeButtons}>
        <Pressable
          style={[styles.modeBtn, !canProceed && styles.disabledBtn]}
          disabled={!canProceed}
          onPress={() => router.push('/stack/place')}
        >
          <Text style={styles.modeBtnText}>일반 3D로 쌓기</Text>
        </Pressable>
        <Pressable
          style={[
            styles.modeBtn,
            styles.arModeBtn,
            !canProceed && styles.disabledBtn,
          ]}
          disabled={!canProceed}
          onPress={() => router.push('/stack/ar')}
        >
          <Text style={styles.arModeBtnText}>AR로 쌓기</Text>
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
    marginBottom: 14,
  },
  quotaBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#181A20',
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
  },
  quotaText: {
    color: '#D6C7B2',
    fontSize: 12,
  },
  rewardButton: {
    backgroundColor: '#2A2D34',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  rewardButtonText: {
    color: '#FFD43B',
    fontSize: 12,
    fontWeight: '600',
  },
  textArea: {
    backgroundColor: '#1C1E24',
    color: '#F5EFE6',
    borderRadius: 12,
    padding: 16,
    minHeight: 120,
    textAlignVertical: 'top',
    fontSize: 15,
  },
  counter: {
    color: '#6C6860',
    fontSize: 12,
    textAlign: 'right',
    marginTop: 6,
    marginBottom: 16,
  },
  categoryHeader: {
    marginBottom: 8,
  },
  sectionLabel: {
    color: '#A89F91',
    fontSize: 13,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 28,
  },
  chip: {
    backgroundColor: '#1C1E24',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
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
  modeButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modeBtn: {
    flex: 1,
    backgroundColor: '#2A2D34',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  arModeBtn: {
    backgroundColor: '#D6C7B2',
  },
  disabledBtn: {
    opacity: 0.4,
  },
  modeBtnText: {
    color: '#F5EFE6',
    fontSize: 14,
    fontWeight: '700',
  },
  arModeBtnText: {
    color: '#191919',
    fontSize: 14,
    fontWeight: '700',
  },
});
