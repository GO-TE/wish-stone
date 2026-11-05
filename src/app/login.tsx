import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { type AuthProvider } from '../domain/ports/AuthService.ts';
import { getSharedAppContainer } from '../infrastructure/di/AppContainer.ts';

const LOGIN_BUTTONS: readonly {
  provider: AuthProvider;
  label: string;
  bg: string;
  fg: string;
}[] = [
  { provider: 'kakao', label: '카카오로 시작하기', bg: '#FEE500', fg: '#191919' },
  { provider: 'apple', label: 'Apple로 계속하기', bg: '#FFFFFF', fg: '#000000' },
  { provider: 'google', label: 'Google로 계속하기', bg: '#2A2D34', fg: '#F5EFE6' },
  { provider: 'guest', label: '게스트로 둘러보기', bg: '#1C1E24', fg: '#A89F91' },
];

/**
 * SCR-02 로그인 화면 (`/login`)
 * Apple / Kakao / Google 소셜 로그인 및 게스트 시작을 제공한다.
 * 근거: 화면 설계서.md 1·2장, DB-001, D-007
 */
export default function LoginScreen() {
  const router = useRouter();
  const [controller] = useState(
    () => getSharedAppContainer().controllers.onboarding
  );
  const [loadingProvider, setLoadingProvider] = useState<AuthProvider | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async (provider: AuthProvider) => {
    try {
      setLoadingProvider(provider);
      setError(null);
      const next = await controller.signIn(provider);
      router.replace(next.nextRoute);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'LOGIN_FAILED');
    } finally {
      setLoadingProvider(null);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>StoneWish</Text>
      <Text style={styles.description}>
        소원을 담은 돌을 올리고 서로의 바람을 조용히 응원해 보세요.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.buttonGroup}>
        {LOGIN_BUTTONS.map((btn) => (
          <Pressable
            key={btn.provider}
            style={[styles.button, { backgroundColor: btn.bg }]}
            disabled={loadingProvider !== null}
            onPress={() => handleSignIn(btn.provider)}
          >
            <Text style={[styles.buttonText, { color: btn.fg }]}>
              {loadingProvider === btn.provider ? '연결 중...' : btn.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#121316',
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: '#F5EFE6',
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    color: '#A89F91',
    textAlign: 'center',
    marginBottom: 36,
  },
  error: {
    color: '#FF6B6B',
    textAlign: 'center',
    marginBottom: 16,
  },
  buttonGroup: {
    gap: 12,
  },
  button: {
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
