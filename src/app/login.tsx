import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
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
  simulatedEmail: string;
  simulatedName: string;
}[] = [
  {
    provider: 'kakao',
    icon: '💬',
    label: '카카오로 시작하기',
    bg: TossTheme.colors.kakao,
    fg: TossTheme.colors.kakaoText,
    simulatedName: '카카오 사용자',
    simulatedEmail: 'user_kakao@kakao.com',
  },
  {
    provider: 'apple',
    icon: '',
    label: 'Apple로 계속하기',
    bg: TossTheme.colors.apple,
    fg: TossTheme.colors.appleText,
    simulatedName: 'Apple 사용자',
    simulatedEmail: 'user@privaterelay.appleid.com',
  },
  {
    provider: 'google',
    icon: 'G',
    label: 'Google로 계속하기',
    bg: TossTheme.colors.card,
    fg: TossTheme.colors.textPrimary,
    border: TossTheme.colors.border,
    simulatedName: 'Google 사용자',
    simulatedEmail: 'user.wishstone@gmail.com',
  },
];

/**
 * SCR-02 로그인 화면 (`/login`)
 * Toss-Style Minimal Aesthetic Revamp
 * 소셜 OAuth2(카카오, 구글, 애플) 인증 모달 및 게스트 로그인 지원
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
  const [oauthModalProvider, setOauthModalProvider] = useState<AuthProvider | null>(null);

  const activeOAuthSpec = LOGIN_BUTTONS.find((b) => b.provider === oauthModalProvider) ?? null;

  const handleSignIn = async (provider: AuthProvider) => {
    try {
      setLoadingProvider(provider);
      setError(null);
      const next = await controller.signIn(provider);
      setOauthModalProvider(null);
      router.replace(next.nextRoute);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'LOGIN_FAILED');
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleOpenOAuthModal = (provider: AuthProvider) => {
    if (provider === 'guest') {
      handleSignIn('guest');
    } else {
      setOauthModalProvider(provider);
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Header & Visual Pebble */}
      <View style={styles.header}>
        <View style={styles.logoPebble}>
          <Text style={styles.pebbleIcon}>⛰️</Text>
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
            onPress={() => handleOpenOAuthModal(btn.provider)}
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
          <Text style={styles.guestButtonText}>로그인 없이 둘러보기 (게스트)</Text>
        </Pressable>

        <Text style={styles.environmentHint}>
          🔒 OAuth2 모드: 실제 운영 배포 시 각사 개발자 센터 Client ID와 자동 연동됩니다.
        </Text>
      </View>

      {/* Social OAuth Authentication Dialog Modal */}
      {activeOAuthSpec && (
        <Modal
          visible={Boolean(oauthModalProvider)}
          transparent
          animationType="fade"
          onRequestClose={() => setOauthModalProvider(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={[styles.modalHeader, { backgroundColor: activeOAuthSpec.bg }]}>
                <Text style={styles.modalHeaderIcon}>{activeOAuthSpec.icon}</Text>
                <Text style={[styles.modalHeaderTitle, { color: activeOAuthSpec.fg }]}>
                  {activeOAuthSpec.label.replace('로 시작하기', '').replace('로 계속하기', '')} 간편 로그인
                </Text>
              </View>

              <View style={styles.modalBody}>
                <Text style={styles.modalSubtitle}>계정 정보 확인</Text>
                <View style={styles.accountBox}>
                  <Text style={styles.accountName}>{activeOAuthSpec.simulatedName}</Text>
                  <Text style={styles.accountEmail}>{activeOAuthSpec.simulatedEmail}</Text>
                </View>

                <View style={styles.consentRow}>
                  <Text style={styles.consentCheck}>✓</Text>
                  <Text style={styles.consentText}>
                    위시스톤 서비스 이용을 위한 기본 프로필 정보 제공에 동의합니다.
                  </Text>
                </View>

                <View style={styles.oauthDevBadge}>
                  <Text style={styles.oauthDevText}>
                    ⚡ OAuth2 인증 토큰(JWT) 발급 준비 완료
                  </Text>
                </View>

                <View style={styles.modalActions}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.modalSubmitButton,
                      pressed && { opacity: 0.8 },
                    ]}
                    disabled={loadingProvider !== null}
                    onPress={() => handleSignIn(activeOAuthSpec.provider)}
                  >
                    {loadingProvider !== null ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.modalSubmitText}>이 계정으로 계속하기</Text>
                    )}
                  </Pressable>

                  <Pressable
                    style={styles.modalCancelButton}
                    onPress={() => setOauthModalProvider(null)}
                  >
                    <Text style={styles.modalCancelText}>취소</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      )}
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
    fontSize: TossTheme.typography.hero.fontSize,
    lineHeight: TossTheme.typography.hero.lineHeight,
    fontWeight: TossTheme.typography.hero.fontWeight,
    color: TossTheme.colors.textPrimary,
    marginBottom: 12,
  },
  description: {
    fontSize: TossTheme.typography.body.fontSize,
    lineHeight: TossTheme.typography.body.lineHeight,
    color: TossTheme.colors.textSecondary,
  },
  illustrationBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  stoneAura: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(49, 130, 246, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(49, 130, 246, 0.2)',
  },
  stoneObject: {
    width: 80,
    height: 64,
    borderRadius: 36,
    backgroundColor: '#3E4947',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  stoneSparkle: {
    fontSize: 20,
  },
  stoneHint: {
    fontSize: TossTheme.typography.caption.fontSize,
    color: TossTheme.colors.textTertiary,
  },
  errorBox: {
    padding: 14,
    borderRadius: TossTheme.radius.button,
    backgroundColor: 'rgba(240, 68, 82, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(240, 68, 82, 0.3)',
    marginBottom: 16,
  },
  errorText: {
    color: TossTheme.colors.danger,
    fontSize: TossTheme.typography.caption.fontSize,
    textAlign: 'center',
  },
  buttonGroup: {
    width: '100%',
    gap: 12,
  },
  button: {
    height: 52,
    borderRadius: TossTheme.radius.button,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  buttonIcon: {
    fontSize: 18,
    marginRight: 10,
    fontWeight: '700',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  guestButton: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  guestButtonText: {
    color: TossTheme.colors.textTertiary,
    fontSize: TossTheme.typography.caption.fontSize,
    fontWeight: '500',
  },
  environmentHint: {
    color: '#6C6860',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#1E2026',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#30343F',
  },
  modalHeader: {
    paddingVertical: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalHeaderIcon: {
    fontSize: 22,
  },
  modalHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalBody: {
    padding: 20,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#8B95A1',
    marginBottom: 8,
  },
  accountBox: {
    backgroundColor: '#262930',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#353A45',
  },
  accountName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F2F4F6',
    marginBottom: 4,
  },
  accountEmail: {
    fontSize: 13,
    color: '#8B95A1',
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 16,
  },
  consentCheck: {
    fontSize: 13,
    color: '#3182F6',
    fontWeight: '700',
    marginTop: 1,
  },
  consentText: {
    fontSize: 12,
    color: '#B0B8C1',
    lineHeight: 18,
    flex: 1,
  },
  oauthDevBadge: {
    backgroundColor: 'rgba(49, 130, 246, 0.12)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(49, 130, 246, 0.25)',
  },
  oauthDevText: {
    fontSize: 11,
    color: '#3182F6',
    textAlign: 'center',
    fontWeight: '600',
  },
  modalActions: {
    gap: 10,
  },
  modalSubmitButton: {
    backgroundColor: '#3182F6',
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  modalCancelButton: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    color: '#8B95A1',
    fontSize: 14,
  },
});
