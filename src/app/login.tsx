import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { type AuthProvider } from '../domain/ports/AuthService.ts';
import { getSharedAppContainer } from '../infrastructure/di/AppContainer.ts';
import { TossTheme } from '../presentation/theme/tossTheme.ts';

const LOGIN_BUTTONS: readonly {
  provider: AuthProvider;
  icon: string;
  label: string;
  bg: string;
  fg: string;
  border?: string;
}[] = [
  {
    provider: 'kakao',
    icon: '💬',
    label: '카카오로 시작하기',
    bg: TossTheme.colors.kakao,
    fg: TossTheme.colors.kakaoText,
  },
  {
    provider: 'apple',
    icon: '',
    label: 'Apple로 계속하기',
    bg: TossTheme.colors.apple,
    fg: TossTheme.colors.appleText,
  },
  {
    provider: 'google',
    icon: 'G',
    label: 'Google로 계속하기',
    bg: TossTheme.colors.card,
    fg: TossTheme.colors.textPrimary,
    border: TossTheme.colors.border,
  },
];

/**
 * SCR-02 로그인 화면 (`/login`)
 * Toss-Style Minimal Aesthetic Revamp
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
      {/* Top Header & Visual Pebble */}
      <View style={styles.header}>
        <View style={styles.logoPebble}>
          <Text style={styles.pebbleIcon}>🪨</Text>
        </View>
        <Text style={styles.title}>
          마음을 담은 돌을 쌓고{'\n'}오늘의 위로를 받아요
        </Text>
        <Text style={styles.description}>
          소원을 담은 돌을 올리고 서로의 바람을 조용히 응원해 보세요.
        </Text>
      </View>

      {/* Subtle Visual Pebble Accent */}
      <View style={styles.illustrationBox}>
        <View style={styles.stoneAura}>
          <View style={styles.stoneObject}>
            <Text style={styles.stoneSparkle}>✨</Text>
          </View>
        </View>
        <Text style={styles.stoneHint}>누적 1,400+개의 소원이 함께 쌓이고 있어요</Text>
      </View>

      {/* Error Banner */}
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Social Login Buttons & Guest Entry */}
      <View style={styles.buttonGroup}>
        {LOGIN_BUTTONS.map((btn) => (
          <Pressable
            key={btn.provider}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: btn.bg },
              btn.border ? { borderWidth: 1, borderColor: btn.border } : null,
              pressed && styles.buttonPressed,
            ]}
            disabled={loadingProvider !== null}
            onPress={() => handleSignIn(btn.provider)}
          >
            <Text style={[styles.buttonIcon, { color: btn.fg }]}>{btn.icon}</Text>
            <Text style={[styles.buttonText, { color: btn.fg }]}>
              {loadingProvider === btn.provider ? '연결 중...' : btn.label}
            </Text>
          </Pressable>
        ))}

        {/* Guest Preview Button */}
        <Pressable
          style={({ pressed }) => [
            styles.guestButton,
            pressed && { opacity: 0.6 },
          ]}
          disabled={loadingProvider !== null}
          onPress={() => handleSignIn('guest')}
        >
          <Text style={styles.guestButtonText}>로그인 없이 둘러보기</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TossTheme.colors.background,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
    justifyContent: 'space-between',
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    alignItems: 'flex-start',
  },
  logoPebble: {
    width: 48,
    height: 48,
    borderRadius: TossTheme.radius.button,
    backgroundColor: 'rgba(49, 130, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(49, 130, 246, 0.3)',
  },
  pebbleIcon: {
    fontSize: 24,
  },
  title: {
    ...TossTheme.typography.hero,
    color: TossTheme.colors.textPrimary,
    marginBottom: 10,
  },
  description: {
    ...TossTheme.typography.body,
    color: TossTheme.colors.textSecondary,
    lineHeight: 22,
  },
  illustrationBox: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 24,
  },
  stoneAura: {
    width: 100,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(49, 130, 246, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stoneObject: {
    width: 64,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#3A3F4D',
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  stoneSparkle: {
    fontSize: 18,
  },
  stoneHint: {
    ...TossTheme.typography.caption,
    color: TossTheme.colors.textTertiary,
    marginTop: 14,
  },
  errorBox: {
    backgroundColor: 'rgba(240, 68, 82, 0.12)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: TossTheme.radius.md,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(240, 68, 82, 0.25)',
  },
  errorText: {
    ...TossTheme.typography.caption,
    color: TossTheme.colors.danger,
    textAlign: 'center',
  },
  buttonGroup: {
    gap: 12,
  },
  button: {
    height: 54,
    borderRadius: TossTheme.radius.button,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  buttonPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.9,
  },
  buttonIcon: {
    fontSize: 16,
    marginRight: 8,
    fontWeight: '700',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  guestButton: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestButtonText: {
    ...TossTheme.typography.caption,
    color: TossTheme.colors.textSecondary,
    fontWeight: '600',
  },
});
