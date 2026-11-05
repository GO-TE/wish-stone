import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  defaultToastStore,
  type ToastMessage,
  ToastStore,
  type ToastVariant,
} from './toastStore.ts';

export * from './toastStore.ts';

const VARIANT_STYLES: Record<
  ToastVariant,
  { readonly bg: string; readonly border: string; readonly fg: string }
> = {
  cheer: { bg: '#2B2518', border: '#FF922B', fg: '#FFE066' },
  wish_deleted: { bg: '#1C1E24', border: '#6C6860', fg: '#D6C7B2' },
  quota_charged: { bg: '#1E2F23', border: '#69DB7C', fg: '#8CE99A' },
  network_error: { bg: '#3B1C1C', border: '#FF6B6B', fg: '#FFA8A8' },
  info: { bg: '#1C1E24', border: '#D6C7B2', fg: '#F5EFE6' },
};

export interface StoneWishToastProps {
  readonly store?: ToastStore;
}

/**
 * 감성 미니멀 토스트/피드백 알림 컴포넌트 (`SCR-01 ~ SCR-18`)
 * - 응원 성공: "누군가의 마음에 불꽃이 닿았습니다 🔥"
 * - 소원 삭제 안내, 쿼터 충전 알림, 오프라인/네트워크 에러 시 부드러운 안내를 렌더링한다.
 */
export function StoneWishToast({
  store = defaultToastStore,
}: StoneWishToastProps) {
  const [toasts, setToasts] = useState<readonly ToastMessage[]>(() =>
    store.getToasts()
  );

  useEffect(() => {
    setToasts(store.getToasts());
    return store.subscribe((next) => setToasts([...next]));
  }, [store]);

  if (toasts.length === 0) return null;

  return (
    <View style={styles.toastStack} pointerEvents="box-none">
      {toasts.map((toast) => {
        const theme = VARIANT_STYLES[toast.variant] ?? VARIANT_STYLES.info;
        return (
          <Pressable
            key={toast.id}
            style={[
              styles.toastBox,
              {
                backgroundColor: theme.bg,
                borderColor: theme.border,
              },
            ]}
            onPress={() => store.dismiss(toast.id)}
          >
            <Text style={[styles.toastText, { color: theme.fg }]}>
              {toast.text}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  toastStack: {
    position: 'absolute',
    bottom: 28,
    left: 20,
    right: 20,
    gap: 8,
    zIndex: 999,
  },
  toastBox: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  toastText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
