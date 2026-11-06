import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Wish } from '../../domain/entities/Wish.ts';
import { type BloomType } from '../../domain/value-objects/BloomType.ts';
import { type CategoryCode } from '../../domain/value-objects/TowerKey.ts';
import { getSharedAppContainer } from '../../infrastructure/di/AppContainer.ts';
import {
  type MyWishesFilter,
  type MyWishesViewState,
} from '../../presentation/controllers/MyWishesController.ts';
import { TossTheme } from '../../presentation/theme/tossTheme.ts';

const FILTERS: readonly { key: MyWishesFilter; label: string }[] = [
  { key: 'all', label: '전체 소원' },
  { key: 'active', label: '진행 중' },
  { key: 'fulfilled', label: '이루어짐 ✨' },
];

const BLOOM_OPTIONS: readonly { bloom?: BloomType; label: string }[] = [
  { bloom: undefined, label: '🎲 랜덤' },
  { bloom: 'flower', label: '🌸 꽃' },
  { bloom: 'sprout', label: '🌱 새싹' },
  { bloom: 'moss', label: '🍀 이끼' },
];

const CATEGORY_OPTIONS: readonly { code: CategoryCode; label: string }[] = [
  { code: 'job', label: '#취업' },
  { code: 'study', label: '#학업' },
  { code: 'health', label: '#건강' },
  { code: 'relation', label: '#인간관계' },
  { code: 'etc', label: '#기타' },
];

/**
 * SCR-12 ~ SCR-14 내 소원 목록·상세·이루어짐 연출 선택·카테고리 사후 수정 화면 (`/me/wishes`)
 * Toss-Style Minimal Aesthetic Revamp
 * - 필터(전체/진행 중/이루어짐) 및 본인에게만 정확한 응원 수 표시 (DB-019, D-006)
 * - 카테고리 사후 직접 변경 (D-016)
 * - 이루어짐 연출(랜덤/꽃/새싹/이끼) 선택 및 삭제 처리 (DB-020, DB-021, D-012)
 */
export default function MyWishesScreen() {
  const router = useRouter();
  const [controller] = useState(
    () => getSharedAppContainer().controllers.myWishes
  );
  const [state, setState] = useState<MyWishesViewState>(() =>
    controller.getState()
  );

  useEffect(() => {
    controller
      .loadMyWishes('all')
      .then((next) => setState({ ...next }))
      .catch(() => {});
  }, [controller]);

  const handleFilterChange = async (filter: MyWishesFilter) => {
    try {
      const next = await controller.loadMyWishes(filter);
      setState({ ...next });
    } catch {
      setState({ ...controller.getState(), filter });
    }
  };

  const handleChangeCategory = async (wish: Wish, cat: CategoryCode) => {
    await controller.changeWishCategory(wish, cat);
    setState({ ...controller.getState() });
  };

  const handleFulfill = async (wish: Wish, bloom?: BloomType) => {
    await controller.fulfillWish(wish, bloom);
    setState({ ...controller.getState() });
  };

  const handleDelete = async (wish: Wish) => {
    await controller.deleteWish(wish);
    setState({ ...controller.getState() });
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
          <Text style={styles.title}>내 소원 목록</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* 필터 탭 (Toss Style Pills) */}
        <View style={styles.filterRow}>
          {FILTERS.map((f) => {
            const active = state.filter === f.key;
            return (
              <Pressable
                key={f.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => handleFilterChange(f.key)}
              >
                <Text
                  style={[styles.filterText, active && styles.filterTextActive]}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {state.lastEffect ? (
          <View style={styles.effectBanner}>
            <Text style={styles.effectBannerText}>
              ✨ 소원 연출이 발행되었습니다 ({state.lastEffect.type})
            </Text>
          </View>
        ) : null}

        {/* 소원 카드 목록 */}
        <View style={styles.listContainer}>
          {state.wishes.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>⛰️</Text>
              <Text style={styles.emptyTitle}>
                {state.filter === 'fulfilled'
                  ? '아직 이루어진 소원이 없습니다'
                  : '등록된 내 소원이 없습니다'}
              </Text>
              <Text style={styles.emptySubtext}>
                마음을 담아 첫 번째 소원 돌을 올려보세요.
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.emptyCta,
                  pressed && { opacity: 0.8 },
                ]}
                onPress={() => router.push('/stack/stone')}
              >
                <Text style={styles.emptyCtaText}>소원 돌 올리기</Text>
              </Pressable>
            </View>
          ) : (
            state.wishes.map((wish) => {
              const isFulfilled = wish.status === 'fulfilled';
              return (
                <View key={wish.id} style={styles.wishItem}>
                  {/* 카드 헤더: 상태 배지 + 응원 카운트 */}
                  <View style={styles.itemHeader}>
                    <View
                      style={[
                        styles.statusBadge,
                        isFulfilled && styles.statusBadgeFulfilled,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeText,
                          isFulfilled && styles.statusBadgeTextFulfilled,
                        ]}
                      >
                        {isFulfilled ? '✨ 소원 이루어짐' : '🌱 돌탑에 쌓임'}
                        {wish.bloom ? ` (${wish.bloom})` : ''}
                      </Text>
                    </View>
                    <Text style={styles.cheerCountText}>
                      🔥 응원 {wish.visibleCheerCount ?? 0}회
                    </Text>
                  </View>

                  {/* 소원 본문 */}
                  <Text style={styles.wishContent}>"{wish.content}"</Text>

                  {/* 카테고리 태그 및 사후 수정 칩 */}
                  <View style={styles.categoryBlock}>
                    <Text style={styles.categoryLabel}>카테고리 변경:</Text>
                    <View style={styles.categoryChipRow}>
                      {CATEGORY_OPTIONS.map((c) => {
                        const isCurrent = wish.category === c.code;
                        return (
                          <Pressable
                            key={c.code}
                            style={[
                              styles.smallChip,
                              isCurrent && styles.smallChipActive,
                            ]}
                            onPress={() => handleChangeCategory(wish, c.code)}
                          >
                            <Text
                              style={[
                                styles.smallChipText,
                                isCurrent && styles.smallChipTextActive,
                              ]}
                            >
                              {c.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {/* 이루어짐 연출 선택 & 삭제 버튼 */}
                  <View style={styles.footerActionRow}>
                    {wish.status === 'active' ? (
                      <View style={styles.fulfillGroup}>
                        <Text style={styles.fulfillLabel}>소원 이루기:</Text>
                        <View style={styles.bloomOptionRow}>
                          {BLOOM_OPTIONS.map((opt) => (
                            <Pressable
                              key={opt.label}
                              style={styles.bloomBtn}
                              onPress={() => handleFulfill(wish, opt.bloom)}
                            >
                              <Text style={styles.bloomBtnText}>{opt.label}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    ) : null}

                    <Pressable
                      style={({ pressed }) => [
                        styles.deleteBtn,
                        pressed && { opacity: 0.7 },
                      ]}
                      onPress={() => handleDelete(wish)}
                    >
                      <Text style={styles.deleteBtnText}>소원 돌 내리기</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
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
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    backgroundColor: TossTheme.colors.card,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: TossTheme.radius.button,
    borderWidth: 1,
    borderColor: TossTheme.colors.border,
  },
  filterChipActive: {
    backgroundColor: TossTheme.colors.primarySoft,
    borderColor: TossTheme.colors.primary,
  },
  filterText: {
    color: TossTheme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  filterTextActive: {
    color: TossTheme.colors.primary,
    fontWeight: '700',
  },
  effectBanner: {
    backgroundColor: 'rgba(5, 214, 134, 0.1)',
    padding: 10,
    borderRadius: TossTheme.radius.md,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(5, 214, 134, 0.25)',
  },
  effectBannerText: {
    color: TossTheme.colors.success,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  listContainer: {
    gap: 12,
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
    marginTop: 10,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    ...TossTheme.typography.cardTitle,
    color: TossTheme.colors.textPrimary,
    marginBottom: 6,
  },
  emptySubtext: {
    ...TossTheme.typography.caption,
    color: TossTheme.colors.textTertiary,
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyCta: {
    backgroundColor: TossTheme.colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: TossTheme.radius.button,
  },
  emptyCtaText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  wishItem: {
    backgroundColor: TossTheme.colors.card,
    borderRadius: TossTheme.radius.card,
    padding: 18,
    borderWidth: 1,
    borderColor: TossTheme.colors.border,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  statusBadge: {
    backgroundColor: 'rgba(49, 130, 246, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: TossTheme.radius.sm,
  },
  statusBadgeFulfilled: {
    backgroundColor: 'rgba(5, 214, 134, 0.15)',
  },
  statusBadgeText: {
    color: TossTheme.colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  statusBadgeTextFulfilled: {
    color: TossTheme.colors.success,
  },
  cheerCountText: {
    fontSize: 12,
    color: TossTheme.colors.warmAmber,
    fontWeight: '600',
  },
  wishContent: {
    color: TossTheme.colors.textPrimary,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
    marginBottom: 12,
  },
  categoryBlock: {
    marginBottom: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: TossTheme.colors.border,
  },
  categoryLabel: {
    ...TossTheme.typography.micro,
    color: TossTheme.colors.textTertiary,
    marginBottom: 6,
  },
  categoryChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  smallChip: {
    backgroundColor: TossTheme.colors.cardElevated,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: TossTheme.radius.sm,
    borderWidth: 1,
    borderColor: TossTheme.colors.border,
  },
  smallChipActive: {
    backgroundColor: TossTheme.colors.primarySoft,
    borderColor: TossTheme.colors.primary,
  },
  smallChipText: {
    color: TossTheme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '500',
  },
  smallChipTextActive: {
    color: TossTheme.colors.primary,
    fontWeight: '700',
  },
  footerActionRow: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: TossTheme.colors.border,
    gap: 10,
  },
  fulfillGroup: {
    gap: 6,
  },
  fulfillLabel: {
    ...TossTheme.typography.micro,
    color: TossTheme.colors.textTertiary,
  },
  bloomOptionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  bloomBtn: {
    backgroundColor: 'rgba(5, 214, 134, 0.12)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: TossTheme.radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(5, 214, 134, 0.25)',
  },
  bloomBtnText: {
    color: TossTheme.colors.success,
    fontSize: 11,
    fontWeight: '700',
  },
  deleteBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: TossTheme.radius.sm,
    backgroundColor: 'rgba(240, 68, 82, 0.08)',
  },
  deleteBtnText: {
    color: TossTheme.colors.danger,
    fontSize: 11,
    fontWeight: '600',
  },
});
