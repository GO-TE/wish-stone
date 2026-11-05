import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { getSharedAppContainer } from '../infrastructure/di/AppContainer.ts';
import { type OnboardingViewState } from '../presentation/controllers/OnboardingController.ts';

/**
 * SCR-01 스플래시 화면 (`/`)
 * 자동 로그인 세션 및 닉네임 설정 여부를 확인하여 `/login`, `/onboarding/nickname`, `/home`으로 분기한다.
 * 근거: 화면 설계서.md 1·2장 (DB-001)
 */
export default function SplashScreen() {
  const router = useRouter();
  const [controller] = useState(
    () => getSharedAppContainer().controllers.onboarding
  );
  const [state, setState] = useState<OnboardingViewState>(() =>
    controller.getState()
  );

  useEffect(() => {
    const next = controller.checkAutoLogin();
    setState(next);
    const timer = setTimeout(() => {
      router.replace(next.nextRoute);
    }, 300);
    return () => clearTimeout(timer);
  }, [controller, router]);

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>⛰️ StoneWish</Text>
      <Text style={styles.subtitle}>마음을 담아 돌을 쌓는 소원 돌탑</Text>
      <ActivityIndicator size="large" color="#D6C7B2" style={styles.spinner} />
      <Text style={styles.routeHint}>이동 예정: {state.nextRoute}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121316',
    padding: 24,
  },
  logo: {
    fontSize: 32,
    fontWeight: '700',
    color: '#F5EFE6',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#A89F91',
    marginBottom: 28,
  },
  spinner: {
    marginBottom: 16,
  },
  routeHint: {
    fontSize: 12,
    color: '#6C6860',
  },
});
