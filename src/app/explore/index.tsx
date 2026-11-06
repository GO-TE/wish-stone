import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { type ReportReason } from '../../domain/ports/repositories.ts';
import { getSharedAppContainer } from '../../infrastructure/di/AppContainer.ts';
import { CheerSparkEffect } from '../../presentation/components/CheerSparkEffect.tsx';
import { StoneTowerCanvas } from '../../presentation/components/StoneTowerCanvas.tsx';
import { type ExploreWishesViewState } from '../../presentation/controllers/ExploreWishesController.ts';
import { TossTheme } from '../../presentation/theme/tossTheme.ts';

const REPORT_REASONS: readonly { reason: ReportReason; label: string }[] = [
  { reason: 'abuse', label: '욕설 · 비방' },
  { reason: 'hate', label: '혐오 · 차별 표현' },
  { reason: 'sexual', label: '음란 · 불건전 내용' },
  { reason: 'personal_info', label: '타인 개인정보 노출' },
  { reason: 'spam', label: '도배 · 불법 광고' },
  { reason: 'etc', label: '기타 부적절한 내용' },
];

/**
 * SCR-10 타인의 소원 상세·둘러보기 및 익명 응원 화면 + SCR-11 부적절 소원 신고 모달 (`/explore`)
 * Toss-Style Minimal Aesthetic Revamp
 * - 3D 돌 미리보기, 소원 본문, 카테고리, 응원 빛 단계(`1/5/15` -> 0~3단계) 및 `cheer_spark` 불꽃 연출 표시
 * - 그룹 소원일 때만 작성자 `닉네임#태그` 노출, 공개 돌탑 소원은 익명 보장 (DB-005, D-015)
 * - ⋯(신고) 클릭 시 SCR-11 신고 바텀시트/모달을 열어 사유별 신고 및 중복 신고 차단 처리 (DB-018)
 */
export default function ExploreWishesScreen() {
  const router = useRouter();
  const [controller] = useState(
    () => getSharedAppContainer().controllers.exploreWishes
  );
  const [state, setState] = useState<ExploreWishesViewState>(() =>
    controller.getState()
  );
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  useEffect(() => {
    controller
      .loadRandomWishes(5)
      .then((next) => setState({ ...next }))
      .catch(() => {});
  }, [controller]);

  const activeWish = state.currentWish;
  const isCheered = activeWish
    ? state.cheeredWishIds.includes(activeWish.id) || activeWish.cheeredByMe
    : false;

  const handleCheer = async () => {
    if (!activeWish) return;
    try {
      setErrorBanner(null);
      await controller.cheerWish(activeWish);
      setState({ ...controller.getState() });
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'CHEER_FAILED');
    }
  };

  const handleReportSubmit = async (reason: ReportReason) => {
    try {
      setErrorBanner(null);
      const next = await controller.submitReport(reason);
      setState({ ...next });
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'REPORT_FAILED');
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header */}
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
            onPress={() => router.back()}
          >
            <Text style={styles.backBtnText}>◂ 홈</Text>
          </Pressable>
          <Text style={styles.title}>소원 둘러보기</Text>
          <Pressable
            style={({ pressed }) => [styles.reportTrigger, pressed && { opacity: 0.7 }]}
            onPress={() => {
              if (activeWish) {
                setState({ ...controller.openReportModal(activeWish) });
              }
            }}
          >
            <Text style={styles.reportTriggerText}>신고</Text>
          </Pressable>
        </View>

        {state.reportConfirmationMessage ? (
          <View style={styles.confirmBanner}>
            <Text style={styles.confirmText}>
              ✓ {state.reportConfirmationMessage}
            </Text>
          </View>
        ) : null}

        {errorBanner ? <Text style={styles.errorText}>{errorBanner}</Text> : null}

        <CheerSparkEffect event={state.lastEffect} towerTopY={1.5} />

        {activeWish ? (
          <View style={styles.card}>
            {/* 3D Stone Single Visual Preview */}
            <View style={styles.stonePreview}>
              <StoneTowerCanvas
                stones={[
                  {
                    id: activeWish.id,
                    stone: activeWish.stone,
                    status:
                      activeWish.status === 'fulfilled' ? 'fulfilled' : 'active',
                    bloom: activeWish.bloom,
                    cheerLevel: activeWish.cheerLevel().level,
                    isMine: activeWish.isMine,
                    nickname: activeWish.displayNickname,
                  },
                ]}
                showControls={false}
              />
              <View style={styles.glowPill}>
                <Text style={styles.glowBadge}>
                  🔥 응원 {activeWish.cheerCount}회 · 빛 레벨 {activeWish.cheerLevel().level}
                </Text>
              </View>
            </View>

            {/* Wish Text Box */}
            <View style={styles.wishTextContainer}>
              <Text style={styles.wishQuoteMark}>“</Text>
              <Text style={styles.wishContent}>{activeWish.content}</Text>
              <Text style={styles.wishQuoteMarkRight}>”</Text>
            </View>

            {/* Meta Tags */}
            <View style={styles.metaRow}>
              <View style={styles.categoryPill}>
                <Text style={styles.categoryTag}>#{activeWish.category}</Text>
              </View>
              <Text style={styles.authorTag}>
                {activeWish.displayNickname
                  ? `${activeWish.displayNickname}`
                  : '익명의 소원 돌'}
              </Text>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.cheerButton,
                  isCheered && styles.cheerButtonDisabled,
                  pressed && !isCheered && styles.btnPressed,
                ]}
                disabled={isCheered}
                onPress={handleCheer}
              >
                <Text
                  style={[
                    styles.cheerButtonText,
                    isCheered && styles.cheerButtonDisabledText,
                  ]}
                >
                  {isCheered ? '✓ 응원 완료' : '🔥 마음 담아 응원하기'}
                </Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.nextButton,
                  pressed && styles.btnPressed,
                ]}
                onPress={() => {
                  controller.nextWish();
                  setState({ ...controller.getState() });
                }}
              >
                <Text style={styles.nextButtonText}>다음 소원 ▸</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>⛰️</Text>
            <Text style={styles.emptyTitle}>
              모든 소원 돌을 둘러보았습니다
            </Text>
            <Text style={styles.emptySubtext}>
              다른 이용자들이 정성껏 올린 새로운 소원들을 다시 탐색해보세요.
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.reloadBtn,
                pressed && styles.btnPressed,
              ]}
              onPress={() => {
                controller
                  .loadRandomWishes(5)
                  .then((next) => setState({ ...next }))
                  .catch(() => {});
              }}
            >
              <Text style={styles.reloadBtnText}>새로운 소원 불러오기</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* SCR-11 부적절 소원 신고 모달 (바텀시트) */}
      <Modal
        visible={state.reportModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setState({ ...controller.closeReportModal() })}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>소원 신고하기</Text>
            <Text style={styles.modalSub}>
              누적 5회 이상 신고된 소원은 검토를 위해 돌탑과 피드에서 자동으로 숨김 처리됩니다.
            </Text>

            <View style={styles.reasonList}>
              {REPORT_REASONS.map((item) => (
                <Pressable
                  key={item.reason}
                  style={({ pressed }) => [
                    styles.reasonOption,
                    pressed && styles.reasonOptionPressed,
                  ]}
                  onPress={() => handleReportSubmit(item.reason)}
                >
                  <Text style={styles.reasonText}>{item.label}</Text>
                  <Text style={styles.reasonArrow}>›</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={styles.cancelButton}
              onPress={() => setState({ ...controller.closeReportModal() })}
            >
              <Text style={styles.cancelText}>닫기</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
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
  reportTrigger: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: TossTheme.radius.sm,
    backgroundColor: 'rgba(240, 68, 82, 0.08)',
  },
  reportTriggerText: {
    color: TossTheme.colors.danger,
    fontSize: 12,
    fontWeight: '600',
  },
  confirmBanner: {
    backgroundColor: 'rgba(5, 214, 134, 0.1)',
    padding: 12,
    borderRadius: TossTheme.radius.md,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(5, 214, 134, 0.25)',
  },
  confirmText: {
    color: TossTheme.colors.success,
    fontSize: 13,
    fontWeight: '600',
  },
  errorText: {
    color: TossTheme.colors.danger,
    fontSize: 13,
    marginBottom: 12,
  },
  card: {
    backgroundColor: TossTheme.colors.card,
    borderRadius: TossTheme.radius.card,
    padding: 20,
    borderWidth: 1,
    borderColor: TossTheme.colors.border,
  },
  stonePreview: {
    alignItems: 'center',
    paddingVertical: 14,
    backgroundColor: TossTheme.colors.cardElevated,
    borderRadius: TossTheme.radius.button,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: TossTheme.colors.border,
  },
  glowPill: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: TossTheme.radius.full,
    marginTop: 8,
  },
  glowBadge: {
    color: TossTheme.colors.warmAmber,
    fontSize: 12,
    fontWeight: '700',
  },
  wishTextContainer: {
    paddingHorizontal: 12,
    marginVertical: 12,
  },
  wishQuoteMark: {
    fontSize: 28,
    color: TossTheme.colors.textTertiary,
    lineHeight: 28,
    fontFamily: 'serif',
  },
  wishQuoteMarkRight: {
    fontSize: 28,
    color: TossTheme.colors.textTertiary,
    lineHeight: 28,
    textAlign: 'right',
    fontFamily: 'serif',
  },
  wishContent: {
    color: TossTheme.colors.textPrimary,
    fontSize: 17,
    lineHeight: 26,
    textAlign: 'center',
    fontWeight: '500',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: TossTheme.colors.border,
    marginBottom: 20,
  },
  categoryPill: {
    backgroundColor: TossTheme.colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: TossTheme.radius.sm,
  },
  categoryTag: {
    color: TossTheme.colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  authorTag: {
    color: TossTheme.colors.textSecondary,
    fontSize: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cheerButton: {
    flex: 2,
    backgroundColor: TossTheme.colors.primary,
    height: 50,
    borderRadius: TossTheme.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: TossTheme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  cheerButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    shadowOpacity: 0,
    elevation: 0,
  },
  cheerButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  cheerButtonDisabledText: {
    color: TossTheme.colors.textTertiary,
  },
  nextButton: {
    flex: 1,
    backgroundColor: TossTheme.colors.cardElevated,
    height: 50,
    borderRadius: TossTheme.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: TossTheme.colors.border,
  },
  nextButtonText: {
    color: TossTheme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  btnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    backgroundColor: TossTheme.colors.card,
    borderRadius: TossTheme.radius.card,
    borderWidth: 1,
    borderColor: TossTheme.colors.border,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    ...TossTheme.typography.cardTitle,
    color: TossTheme.colors.textPrimary,
    marginBottom: 8,
  },
  emptySubtext: {
    ...TossTheme.typography.caption,
    color: TossTheme.colors.textTertiary,
    textAlign: 'center',
    marginBottom: 24,
  },
  reloadBtn: {
    backgroundColor: TossTheme.colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: TossTheme.radius.button,
  },
  reloadBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: TossTheme.colors.card,
    borderTopLeftRadius: TossTheme.radius.modal,
    borderTopRightRadius: TossTheme.radius.modal,
    padding: 24,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
    borderTopWidth: 1,
    borderTopColor: TossTheme.colors.border,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    ...TossTheme.typography.title,
    color: TossTheme.colors.textPrimary,
    marginBottom: 6,
  },
  modalSub: {
    ...TossTheme.typography.caption,
    color: TossTheme.colors.textSecondary,
    marginBottom: 20,
    lineHeight: 18,
  },
  reasonList: {
    gap: 8,
    marginBottom: 20,
  },
  reasonOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: TossTheme.colors.cardElevated,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: TossTheme.radius.button,
    borderWidth: 1,
    borderColor: TossTheme.colors.border,
  },
  reasonOptionPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  reasonText: {
    color: TossTheme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  reasonArrow: {
    color: TossTheme.colors.textTertiary,
    fontSize: 18,
  },
  cancelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: 14,
    borderRadius: TossTheme.radius.button,
    alignItems: 'center',
  },
  cancelText: {
    color: TossTheme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
});
