import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { type ReportReason } from '../../domain/ports/repositories.ts';
import { getSharedAppContainer } from '../../infrastructure/di/AppContainer.ts';
import { CheerSparkEffect } from '../../presentation/components/CheerSparkEffect.tsx';
import { StoneTowerCanvas } from '../../presentation/components/StoneTowerCanvas.tsx';
import { type ExploreWishesViewState } from '../../presentation/controllers/ExploreWishesController.ts';

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
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backBtn}>◂ 홈</Text>
        </Pressable>
        <Text style={styles.title}>소원 둘러보기 · 응원</Text>
        <Pressable
          onPress={() => {
            if (activeWish) {
              setState({ ...controller.openReportModal(activeWish) });
            }
          }}
        >
          <Text style={styles.reportTrigger}>⋯ 신고</Text>
        </Pressable>
      </View>

      {state.reportConfirmationMessage ? (
        <View style={styles.confirmBanner}>
          <Text style={styles.confirmText}>
            {state.reportConfirmationMessage}
          </Text>
        </View>
      ) : null}

      {errorBanner ? <Text style={styles.errorText}>{errorBanner}</Text> : null}

      <CheerSparkEffect event={state.lastEffect} towerTopY={1.5} />

      {activeWish ? (
        <View style={styles.card}>
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
            />
            <Text style={styles.glowBadge}>
              빛 단계 {activeWish.cheerLevel().level} (기준 1/5/15)
            </Text>
          </View>

          <Text style={styles.wishContent}>"{activeWish.content}"</Text>

          <View style={styles.metaRow}>
            <Text style={styles.categoryTag}>#{activeWish.category}</Text>
            <Text style={styles.authorTag}>
              {activeWish.displayNickname
                ? `작성자: ${activeWish.displayNickname}`
                : '익명의 소원'}
            </Text>
          </View>

          <View style={styles.actionRow}>
            <Pressable
              style={[
                styles.cheerButton,
                isCheered && styles.cheerButtonDisabled,
              ]}
              disabled={isCheered}
              onPress={handleCheer}
            >
              <Text style={styles.cheerButtonText}>
                {isCheered ? '🔥 응원 완료' : '🔥 익명 응원하기'}
              </Text>
            </Pressable>

            <Pressable
              style={styles.nextButton}
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
          <Text style={styles.emptyText}>
            주변 소원 카드를 모두 둘러보았습니다.
          </Text>
          <Pressable
            style={styles.reloadBtn}
            onPress={() => {
              controller
                .loadRandomWishes(5)
                .then((next) => setState({ ...next }))
                .catch(() => {});
            }}
          >
            <Text style={styles.reloadBtnText}>새 소원 불러오기</Text>
          </Pressable>
        </View>
      )}

      {/* SCR-11 부적절 소원 신고 모달 (바텀시트) */}
      <Modal
        visible={state.reportModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setState({ ...controller.closeReportModal() })}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>소원 신고하기</Text>
            <Text style={styles.modalSub}>
              신고 누적 5회 시 해당 소원은 돌탑과 랜덤 카드에서 자동으로 숨김
              처리됩니다.
            </Text>

            {REPORT_REASONS.map((item) => (
              <Pressable
                key={item.reason}
                style={styles.reasonOption}
                onPress={() => handleReportSubmit(item.reason)}
              >
                <Text style={styles.reasonText}>{item.label}</Text>
              </Pressable>
            ))}

            <Pressable
              style={styles.cancelButton}
              onPress={() => setState({ ...controller.closeReportModal() })}
            >
              <Text style={styles.cancelText}>취소</Text>
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
    backgroundColor: '#121316',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  backBtn: {
    color: '#D6C7B2',
    fontSize: 15,
    fontWeight: '600',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F5EFE6',
  },
  reportTrigger: {
    color: '#A89F91',
    fontSize: 14,
  },
  confirmBanner: {
    backgroundColor: '#1E2F23',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  confirmText: {
    color: '#8CE99A',
    fontSize: 13,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 13,
    marginBottom: 10,
  },
  sparkBanner: {
    backgroundColor: '#2B2518',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  sparkText: {
    color: '#FFD43B',
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    flex: 1,
    backgroundColor: '#1C1E24',
    borderRadius: 16,
    padding: 24,
    justifyContent: 'space-between',
  },
  stonePreview: {
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: '#181A20',
    borderRadius: 14,
  },
  stoneEmoji: {
    fontSize: 54,
    marginBottom: 8,
  },
  glowBadge: {
    color: '#FFD43B',
    fontSize: 12,
    fontWeight: '600',
  },
  wishContent: {
    color: '#F5EFE6',
    fontSize: 18,
    lineHeight: 28,
    textAlign: 'center',
    marginVertical: 20,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  categoryTag: {
    color: '#D6C7B2',
    fontSize: 14,
    fontWeight: '700',
  },
  authorTag: {
    color: '#A89F91',
    fontSize: 13,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cheerButton: {
    flex: 2,
    backgroundColor: '#FF922B',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  cheerButtonDisabled: {
    backgroundColor: '#2A2D34',
  },
  cheerButtonText: {
    color: '#191919',
    fontSize: 15,
    fontWeight: '700',
  },
  nextButton: {
    flex: 1,
    backgroundColor: '#2A2D34',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  nextButtonText: {
    color: '#F5EFE6',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#A89F91',
    fontSize: 14,
    marginBottom: 16,
  },
  reloadBtn: {
    backgroundColor: '#D6C7B2',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
  },
  reloadBtnText: {
    color: '#191919',
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#1C1E24',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
  },
  modalTitle: {
    color: '#F5EFE6',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  modalSub: {
    color: '#A89F91',
    fontSize: 12,
    marginBottom: 16,
    lineHeight: 18,
  },
  reasonOption: {
    backgroundColor: '#2A2D34',
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
  },
  reasonText: {
    color: '#F5EFE6',
    fontSize: 14,
  },
  cancelButton: {
    marginTop: 6,
    paddingVertical: 13,
    alignItems: 'center',
  },
  cancelText: {
    color: '#A89F91',
    fontSize: 14,
  },
});
