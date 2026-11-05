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
import {
  MyWishesController,
  type MyWishesFilter,
  type MyWishesViewState,
} from '../../presentation/controllers/MyWishesController.ts';

const FILTERS: readonly { key: MyWishesFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'active', label: '진행 중' },
  { key: 'fulfilled', label: '이루어짐' },
];

const BLOOM_OPTIONS: readonly { bloom?: BloomType; label: string }[] = [
  { bloom: undefined, label: '🎲 랜덤(기본)' },
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
 * - 필터(전체/진행 중/이루어짐) 및 본인에게만 정확한 응원 수 표시 (DB-019, D-006)
 * - 카테고리 사후 직접 변경 (D-016)
 * - 이루어짐 연출(랜덤/꽃/새싹/이끼) 선택 및 삭제 처리 (DB-020, DB-021, D-012)
 */
export default function MyWishesScreen() {
  const router = useRouter();
  const [controller] = useState(() => new MyWishesController());
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
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backBtn}>◂ 홈</Text>
        </Pressable>
        <Text style={styles.title}>내 소원 목록</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* 필터 탭 */}
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
        <Text style={styles.effectBanner}>
          최근 연출 이벤트: {state.lastEffect.type}
        </Text>
      ) : null}

      <ScrollView style={styles.list}>
        {state.wishes.length === 0 ? (
          <Text style={styles.emptyText}>아직 등록한 내 소원이 없습니다.</Text>
        ) : (
          state.wishes.map((wish) => (
            <View key={wish.id} style={styles.wishItem}>
              <Text style={styles.wishContent}>{wish.content}</Text>
              <Text style={styles.wishMeta}>
                카테고리: #{wish.category} · 받은 응원: 🔥{' '}
                {wish.visibleCheerCount ?? 0}개 · 상태: {wish.status}
                {wish.bloom ? ` (${wish.bloom})` : ''}
              </Text>

              {/* D-016 카테고리 사후 수정 */}
              <View style={styles.actionRow}>
                {CATEGORY_OPTIONS.map((c) => (
                  <Pressable
                    key={c.code}
                    style={[
                      styles.smallChip,
                      wish.category === c.code && styles.smallChipActive,
                    ]}
                    onPress={() => handleChangeCategory(wish, c.code)}
                  >
                    <Text style={styles.smallChipText}>{c.label}</Text>
                  </Pressable>
                ))}
              </View>

              {/* SCR-14 이루어짐 연출 선택 & 삭제 */}
              {wish.status === 'active' ? (
                <View style={styles.actionRow}>
                  {BLOOM_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.label}
                      style={styles.bloomBtn}
                      onPress={() => handleFulfill(wish, opt.bloom)}
                    >
                      <Text style={styles.bloomBtnText}>{opt.label}</Text>
                    </Pressable>
                  ))}
                  <Pressable
                    style={styles.deleteBtn}
                    onPress={() => handleDelete(wish)}
                  >
                    <Text style={styles.deleteBtnText}>삭제</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>
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
    fontSize: 20,
    fontWeight: '700',
    color: '#F5EFE6',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  filterChip: {
    backgroundColor: '#1C1E24',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
  },
  filterChipActive: {
    backgroundColor: '#D6C7B2',
  },
  filterText: {
    color: '#A89F91',
    fontSize: 13,
  },
  filterTextActive: {
    color: '#191919',
    fontWeight: '700',
  },
  effectBanner: {
    color: '#8CE99A',
    fontSize: 12,
    marginBottom: 10,
  },
  list: {
    flex: 1,
  },
  emptyText: {
    color: '#6C6860',
    textAlign: 'center',
    marginTop: 40,
  },
  wishItem: {
    backgroundColor: '#1C1E24',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  wishContent: {
    color: '#F5EFE6',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
  },
  wishMeta: {
    color: '#A89F91',
    fontSize: 12,
    marginBottom: 10,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  smallChip: {
    backgroundColor: '#2A2D34',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  smallChipActive: {
    borderWidth: 1,
    borderColor: '#D6C7B2',
  },
  smallChipText: {
    color: '#D6C7B2',
    fontSize: 11,
  },
  bloomBtn: {
    backgroundColor: '#2B8A3E',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  bloomBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  deleteBtn: {
    backgroundColor: '#C92A2A',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  deleteBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
});
