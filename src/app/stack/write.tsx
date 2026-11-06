import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { type CategoryCode } from '../../domain/value-objects/TowerKey.ts';
import { getSharedAppContainer } from '../../infrastructure/di/AppContainer.ts';
import { TossTheme } from '../../presentation/theme/tossTheme.ts';

const CATEGORIES: readonly { code: CategoryCode; label: string }[] = [
  { code: 'job', label: '#취업' },
  { code: 'study', label: '#학업' },
  { code: 'health', label: '#건강' },
  { code: 'relation', label: '#인간관계' },
  { code: 'etc', label: '#기타' },
];

/**
 * SCR-06 소원 작성 화면 (`/stack/write`)
 * Toss-Style Minimal Aesthetic Revamp
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
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header with back navigation */}
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
            onPress={() => router.back()}
          >
            <Text style={styles.backBtnText}>◂ 이전</Text>
          </Pressable>
          <Text style={styles.title}>소원 적기</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* 일일 쿼터 카드 (D-018) */}
        <View style={styles.quotaCard}>
          <View style={styles.quotaTextGroup}>
            <Text style={styles.quotaLabel}>오늘의 소원 쿼터</Text>
            <Text style={styles.quotaCount}>
              잔여 <Text style={styles.quotaHighlight}>{state.quota.remaining}</Text>개
              <Text style={styles.quotaSub}> (기본 {state.quota.baseQuota} + 보너스 {state.quota.bonusQuota})</Text>
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.rewardButton,
              pressed && { opacity: 0.8 },
            ]}
            onPress={handleGrantBonus}
          >
            <Text style={styles.rewardButtonText}>+1 보너스 충전</Text>
          </Pressable>
        </View>

        {/* 소원 입력 텍스트 에어리어 */}
        <View style={styles.inputCard}>
          <TextInput
            style={styles.textArea}
            multiline
            maxLength={200}
            value={state.content}
            onChangeText={handleContentChange}
            placeholder="마음에 품고 있는 간절한 소원을 적어주세요&#10;(작성하신 소원은 돌에 새겨집니다)"
            placeholderTextColor={TossTheme.colors.textTertiary}
          />
          <View style={styles.counterRow}>
            <Text style={styles.counter}>
              {state.content.length} / 200자
            </Text>
          </View>
        </View>

        {/* 자동 분류 카테고리 배지 & 수동 선택 칩 (D-016) */}
        <View style={styles.categorySection}>
          <View style={styles.categoryHeader}>
            <Text style={styles.sectionLabel}>카테고리</Text>
            <View style={styles.autoTagBadge}>
              <Text style={styles.autoTagText}>
                자동 감지: #{state.autoCategory}
                {state.manualCategory ? ` (선택: #${state.manualCategory})` : ''}
              </Text>
            </View>
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
        </View>

        {/* 이동 버튼들 */}
        <View style={styles.modeButtons}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              !canProceed && styles.disabledBtn,
              pressed && canProceed && styles.btnPressed,
            ]}
            disabled={!canProceed}
            onPress={() => router.push('/stack/place')}
          >
            <Text style={styles.primaryBtnText}>3D 돌탑에 올리기 ▸</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.secondaryBtn,
              !canProceed && styles.disabledBtn,
              pressed && canProceed && styles.btnPressed,
            ]}
            disabled={!canProceed}
            onPress={() => router.push('/stack/ar')}
          >
            <Text style={styles.secondaryBtnText}>👓 증강현실(AR)로 올리기</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TossTheme.colors.background,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: TossTheme.radius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  backBtnText: {
    color: TossTheme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  title: {
    ...TossTheme.typography.title,
    color: TossTheme.colors.textPrimary,
  },
  quotaCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: TossTheme.colors.card,
    borderRadius: TossTheme.radius.card,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: TossTheme.colors.border,
  },
  quotaTextGroup: {
    flex: 1,
  },
  quotaLabel: {
    ...TossTheme.typography.micro,
    color: TossTheme.colors.textSecondary,
    marginBottom: 3,
  },
  quotaCount: {
    ...TossTheme.typography.cardTitle,
    color: TossTheme.colors.textPrimary,
  },
  quotaHighlight: {
    color: TossTheme.colors.primary,
    fontWeight: '700',
  },
  quotaSub: {
    fontSize: 12,
    color: TossTheme.colors.textTertiary,
    fontWeight: '400',
  },
  rewardButton: {
    backgroundColor: TossTheme.colors.warmSoft,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: TossTheme.radius.button,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  rewardButtonText: {
    color: TossTheme.colors.warmAmber,
    fontSize: 12,
    fontWeight: '700',
  },
  inputCard: {
    backgroundColor: TossTheme.colors.card,
    borderRadius: TossTheme.radius.card,
    padding: 18,
    borderWidth: 1,
    borderColor: TossTheme.colors.border,
    marginBottom: 20,
  },
  textArea: {
    color: TossTheme.colors.textPrimary,
    minHeight: 140,
    textAlignVertical: 'top',
    fontSize: 15,
    lineHeight: 22,
  },
  counterRow: {
    alignItems: 'flex-end',
    marginTop: 8,
  },
  counter: {
    ...TossTheme.typography.caption,
    color: TossTheme.colors.textTertiary,
  },
  categorySection: {
    marginBottom: 28,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionLabel: {
    ...TossTheme.typography.caption,
    color: TossTheme.colors.textSecondary,
    fontWeight: '600',
  },
  autoTagBadge: {
    backgroundColor: 'rgba(49, 130, 246, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: TossTheme.radius.sm,
  },
  autoTagText: {
    fontSize: 11,
    color: TossTheme.colors.primary,
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: TossTheme.colors.card,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: TossTheme.radius.button,
    borderWidth: 1,
    borderColor: TossTheme.colors.border,
  },
  chipActive: {
    backgroundColor: TossTheme.colors.primarySoft,
    borderColor: TossTheme.colors.primary,
  },
  chipText: {
    color: TossTheme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  chipTextActive: {
    color: TossTheme.colors.primary,
    fontWeight: '700',
  },
  modeButtons: {
    gap: 10,
  },
  primaryBtn: {
    backgroundColor: TossTheme.colors.primary,
    height: 52,
    borderRadius: TossTheme.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: TossTheme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  secondaryBtn: {
    backgroundColor: TossTheme.colors.card,
    height: 48,
    borderRadius: TossTheme.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: TossTheme.colors.border,
  },
  btnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
  disabledBtn: {
    opacity: 0.4,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryBtnText: {
    color: TossTheme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
});
