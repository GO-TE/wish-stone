import React from 'react';
import { Stack } from 'expo-router';

/**
 * StoneWish 루트 레이아웃 (expo-router)
 * 모바일 세로 화면 기준, 웹에서는 중앙 정렬(최대 너비 480px) 레이아웃을 적용한다.
 * 근거: 화면 설계서.md 1장
 */
export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#121316' },
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
      <Stack.Screen name="me/wishes" />
      <Stack.Screen name="groups/index" />
    </Stack>
  );
}
