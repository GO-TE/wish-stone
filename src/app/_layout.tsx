import React, { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { Stack } from 'expo-router';
import { getSharedAppContainer } from '../infrastructure/di/AppContainer.ts';
import { StoneWishToast } from '../presentation/components/StoneWishToast.tsx';

/**
 * StoneWish 루트 레이아웃 (expo-router)
 * 모바일 세로 화면 기준, 웹에서는 중앙 정렬(최대 너비 480px) 레이아웃을 적용하며 전역 감성 토스트(`StoneWishToast`)를 마운트한다.
 * 마우스 드래그 시 원치 않는 브라우저 텍스트 파란색 하이라이트(드래그) 방지 스타일을 웹에 자동 주입한다.
 * 근거: 화면 설계서.md 1장
 */
export default function RootLayout() {
  const toastStore = getSharedAppContainer().toastStore;

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const styleId = 'stonewish-disable-text-drag';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
          * {
            -webkit-user-select: none !important;
            -moz-user-select: none !important;
            -ms-user-select: none !important;
            user-select: none !important;
            -webkit-user-drag: none !important;
          }
          input, textarea {
            -webkit-user-select: auto !important;
            user-select: auto !important;
          }
        `;
        document.head.appendChild(style);
      }
    }
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#0F1015' }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0F1015' },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="onboarding/nickname" />
        <Stack.Screen name="home" />
        <Stack.Screen name="stack/stone" />
        <Stack.Screen name="stack/write" />
        <Stack.Screen name="stack/place" />
        <Stack.Screen name="stack/ar" />
        <Stack.Screen name="stack/photo" />
        <Stack.Screen name="explore/index" />
        <Stack.Screen name="me/wishes" />
        <Stack.Screen name="groups/index" />
        <Stack.Screen name="settings/index" />
        <Stack.Screen name="tower/index" options={{ headerShown: false }} />
      </Stack>
      <StoneWishToast store={toastStore} />
    </View>
  );
}
