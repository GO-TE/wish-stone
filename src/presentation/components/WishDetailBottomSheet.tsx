import React, { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { type TowerStoneItem } from '../../domain/entities/Tower.ts';
import { type WishId } from '../../domain/entities/Wish.ts';
import { type BloomType } from '../../domain/value-objects/BloomType.ts';
import { type CategoryCode } from '../../domain/value-objects/TowerKey.ts';
import { TossTheme } from '../theme/tossTheme.ts';
import { defaultToastStore, ToastStore } from './toastStore.ts';

// Ensure ToastStore.instance singleton is initialized
if (!(ToastStore as any).instance) {
  (ToastStore as any).instance = defaultToastStore;
}

export const CATEGORY_NAMES: Record<CategoryCode, string> = {
  job: '#취업',
  study: '#학업',
  health: '#건강',
  relation: '#인간관계',
  etc: '#기타',
};

export function formatCategoryBadge(category?: CategoryCode): string {
  if (!category) return '#기타';
  return CATEGORY_NAMES[category] ?? `#${category}`;
}

export function formatAuthorDisplay(
  stone: TowerStoneItem | null,
  isGroupTower?: boolean
): string {
  if (!stone) return '익명의 소원 돌';
  if (stone.isMine) {
    return '내가 올린 소원 ⭐️';
  }
  if (isGroupTower && stone.nickname) {
    return stone.nickname;
  }
  return '익명의 소원 돌';
}

export function formatCheerDisplay(stone: TowerStoneItem | null): string {
  if (!stone) return '✨ 빛 레벨 0';
  if (stone.isMine) {
    return `🔥 응원 ${stone.cheerCount ?? 0}회`;
  }
  return `✨ 빛 레벨 ${stone.cheerLevel}`;
}

export interface CheerButtonState {
  readonly enabled: boolean;
  readonly text: string;
}

export function getCheerButtonState(
  stone: TowerStoneItem | null,
  isCheered?: boolean
): CheerButtonState {
  if (!stone) {
    return { enabled: false, text: '소원 정보 없음' };
  }
  if (stone.isMine) {
    return { enabled: false, text: '내가 올린 소원입니다' };
  }
  if (isCheered) {
    return { enabled: false, text: '✓ 응원 완료' };
  }
  return { enabled: true, text: '🔥 마음 담아 응원하기' };
}

export function formatBloomLabel(bloom?: BloomType | null): string | null {
  if (!bloom) return null;
  if (bloom === 'flower') return '🌸 산들꽃 피어남';
  if (bloom === 'sprout') return '🌱 초록 새싹 돋아남';
  if (bloom === 'moss') return '🍀 포근한 이끼 덮임';
  return null;
}

export interface WishDetailBottomSheetProps {
  readonly visible: boolean;
  readonly stone: TowerStoneItem | null;
  readonly onClose: () => void;
  readonly onCheer?: (wishId: WishId) => Promise<void> | void;
  readonly isCheered?: boolean;
  readonly isGroupTower?: boolean;
}

/**
 * SCR-10 소원 상세 모달/바텀시트 컴포넌트
 * - 토스(Toss) 감성의 미니멀 바텀시트
 * - 배경 터치 시 닫기 (onClose)
 * - 작성자 정보: 본인 소원이면 "내가 올린 소원 ⭐️", 그룹 돌탑이면 닉네임, 그 외에는 엄격한 익명 "익명의 소원 돌" (DB-023)
 * - 응원 정보: 본인 소원이면 정확한 응원 횟수, 타인 소원이면 빛 레벨만 표시 (DB-017, D-006)
 * - 응원 버튼: 본인 소원이거나 이미 응원했으면 비활성화, 활성 시 응원 호출 및 감성 토스트 발행
 */
export function WishDetailBottomSheet({
  visible,
  stone,
  onClose,
  onCheer,
  isCheered = false,
  isGroupTower = false,
}: WishDetailBottomSheetProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const authorDisplay = formatAuthorDisplay(stone, isGroupTower);
  const cheerDisplay = formatCheerDisplay(stone);
  const cheerButtonState = getCheerButtonState(stone, isCheered);
  const categoryBadge = formatCategoryBadge(stone?.category);
  const bloomLabel = formatBloomLabel(stone?.bloom);

  const handleCheerPress = async () => {
    if (!stone || isSubmitting || submittingRef.current) return;
    if (stone.isMine || isCheered) return;

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      await onCheer?.(stone.id);
      const store: ToastStore = (ToastStore as any).instance ?? defaultToastStore;
      store.showCheerSuccess();
    } catch {
      // 오류는 상위 호출자에서 처리하거나 기본 토스트에서 처리
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const isModalVisible = visible && stone !== null;

  return (
    <Modal
      visible={isModalVisible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={styles.sheetCard}
          onPress={(e) => {
            e.stopPropagation();
          }}
        >
          {/* 상단 핸들 바 인디케이터 */}
          <View style={styles.handleBar} />

          {/* 헤더: 카테고리 뱃지, 블룸 뱃지 및 닫기 버튼 */}
          <View style={styles.headerRow}>
            <View style={styles.badgesContainer}>
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryBadgeText}>{categoryBadge}</Text>
              </View>
              {bloomLabel && (
                <View style={styles.bloomBadge}>
                  <Text style={styles.bloomBadgeText}>{bloomLabel}</Text>
                </View>
              )}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.closeButton,
                pressed && styles.closeButtonPressed,
              ]}
              onPress={onClose}
              hitSlop={12}
              accessibilityLabel="닫기"
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </Pressable>
          </View>

          {/* 소원 본문 텍스트 */}
          <View style={styles.contentContainer}>
            <Text style={styles.wishContentText}>
              {stone?.content ?? '소원이 이루어지기를 바랍니다'}
            </Text>
          </View>

          {/* 메타데이터 정보 카드: 작성자 정보 및 응원 현황 */}
          <View style={styles.metaRow}>
            <View style={styles.metaCard}>
              <Text style={styles.metaLabel}>작성자</Text>
              <Text style={styles.metaValue} numberOfLines={1}>
                {authorDisplay}
              </Text>
            </View>
            <View style={styles.metaCard}>
              <Text style={styles.metaLabel}>응원</Text>
              <Text style={styles.metaValue} numberOfLines={1}>
                {cheerDisplay}
              </Text>
            </View>
          </View>

          {/* 응원하기 액션 버튼 */}
          <Pressable
            style={({ pressed }) => [
              styles.cheerButton,
              !cheerButtonState.enabled && styles.cheerButtonDisabled,
              pressed && cheerButtonState.enabled && styles.cheerButtonPressed,
            ]}
            disabled={!cheerButtonState.enabled || isSubmitting}
            onPress={handleCheerPress}
          >
            <Text
              style={[
                styles.cheerButtonText,
                !cheerButtonState.enabled && styles.cheerButtonTextDisabled,
              ]}
            >
              {cheerButtonState.text}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheetCard: {
    backgroundColor: TossTheme.colors.cardElevated,
    borderTopLeftRadius: TossTheme.radius.modal,
    borderTopRightRadius: TossTheme.radius.modal,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
    maxWidth: 480,
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: TossTheme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 20,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  badgesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    flex: 1,
  },
  categoryBadge: {
    backgroundColor: TossTheme.colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  categoryBadgeText: {
    color: TossTheme.colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  bloomBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  bloomBadgeText: {
    color: TossTheme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  closeButtonPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  closeButtonText: {
    color: TossTheme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  contentContainer: {
    marginBottom: 20,
    minHeight: 52,
    justifyContent: 'center',
  },
  wishContentText: {
    color: TossTheme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 26,
    letterSpacing: -0.3,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  metaCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  metaLabel: {
    color: TossTheme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 4,
  },
  metaValue: {
    color: TossTheme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  cheerButton: {
    backgroundColor: TossTheme.colors.primary,
    borderRadius: TossTheme.radius.button,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cheerButtonPressed: {
    backgroundColor: TossTheme.colors.primaryHover,
  },
  cheerButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: TossTheme.colors.border,
  },
  cheerButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  cheerButtonTextDisabled: {
    color: TossTheme.colors.textSecondary,
    fontWeight: '600',
  },
});
