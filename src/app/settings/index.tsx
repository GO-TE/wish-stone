import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { type AuthProvider } from '../../domain/ports/AuthService.ts';
import { getSharedAppContainer } from '../../infrastructure/di/AppContainer.ts';
import { type SettingsViewState } from '../../presentation/controllers/SettingsController.ts';

const SOCIAL_PROVIDERS: readonly {
  provider: Exclude<AuthProvider, 'guest'>;
  label: string;
  bg: string;
  fg: string;
}[] = [
  { provider: 'kakao', label: '카카오 계정으로 연동', bg: '#FEE500', fg: '#191919' },
  { provider: 'apple', label: 'Apple 계정으로 연동', bg: '#FFFFFF', fg: '#000000' },
  { provider: 'google', label: 'Google 계정으로 연동', bg: '#2A2D34', fg: '#F5EFE6' },
];

/**
 * SCR-17 설정·프로필·닉네임#태그 변경·일일 쿼터 현황 화면 + SCR-18 게스트 소셜 연동 & 회원 탈퇴 모달 (`/settings`)
 * - 배틀태그(`닉네임#태그`) 수정 (API-01, D-015)
 * - 일일 소원 쿼터 현황(기본 5회 + 보너스 충전) 확인 (D-018)
 * - 게스트 계정을 소셜 계정으로 연동하는 모달 및 회원 탈퇴 확인 모달 제공 (D-007, API-18)
 */
export default function SettingsScreen() {
  const router = useRouter();
  const [controller] = useState(() => {
    const c = getSharedAppContainer().controllers.settings;
    c.refreshProfile();
    return c;
  });
  const [state, setState] = useState<SettingsViewState>(() =>
    controller.getState()
  );
  const [nicknameInput, setNicknameInput] = useState(
    state.user?.nickname?.displayName ?? ''
  );
  const [errorText, setErrorText] = useState<string | null>(null);

  const handleUpdateNickname = async () => {
    try {
      setErrorText(null);
      await controller.updateNickname(nicknameInput);
      setState({ ...controller.getState() });
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'NICKNAME_INVALID');
    }
  };

  const handleBonusQuota = () => {
    controller.grantRewardBonusQuota(1);
    setState({ ...controller.getState() });
  };

  const handleLinkSocial = async (
    provider: Exclude<AuthProvider, 'guest'>
  ) => {
    try {
      setErrorText(null);
      await controller.linkGuestToSocial(provider);
      setState({ ...controller.getState() });
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'LINK_FAILED');
    }
  };

  const handleWithdraw = async () => {
    await controller.withdrawAccount();
    setState({ ...controller.getState() });
    router.replace('/login');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backBtn}>◂ 홈</Text>
        </Pressable>
        <Text style={styles.title}>설정 및 계정 관리</Text>
        <View style={{ width: 40 }} />
      </View>

      {state.statusMessage ? (
        <View style={styles.statusBanner}>
          <Text style={styles.statusText}>{state.statusMessage}</Text>
        </View>
      ) : null}

      {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

      {/* 프로필 & 닉네임#태그 수정 섹션 */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>내 프로필 (닉네임#태그)</Text>
        <Text style={styles.profileInfo}>
          현재 표시명: {state.user?.nickname?.displayName ?? '미설정'} · 계정
          유형: {state.user?.isGuest ? '게스트' : '소셜 연동 회원'}
        </Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={nicknameInput}
            onChangeText={setNicknameInput}
            placeholder="새 닉네임#태그 (예: 제미나이#real)"
            placeholderTextColor="#6C6860"
          />
          <Pressable style={styles.primaryBtn} onPress={handleUpdateNickname}>
            <Text style={styles.primaryBtnText}>변경</Text>
          </Pressable>
        </View>
      </View>

      {/* 오늘의 소원 쿼터 현황 (D-018) */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>오늘의 소원 돌 올리기 쿼터</Text>
        <Text style={styles.profileInfo}>
          남은 횟수: {state.quota.remaining}회 (기본 {state.quota.baseQuota}회 +
          보너스 {state.quota.bonusQuota}회 / 사용 {state.quota.usedCount}회)
        </Text>
        <Pressable style={styles.secondaryBtn} onPress={handleBonusQuota}>
          <Text style={styles.secondaryBtnText}>
            🎁 리워드 광고 보고 +1회 보너스 충전
          </Text>
        </Pressable>
      </View>

      {/* 계정 연동 & 로그아웃/탈퇴 */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>계정 보안 및 연동</Text>
        <Pressable
          style={styles.secondaryBtn}
          onPress={() => setState({ ...controller.openLinkAccountModal() })}
        >
          <Text style={styles.secondaryBtnText}>
            🔗 게스트 계정 소셜 연동 (데이터 보존)
          </Text>
        </Pressable>

        <View style={styles.bottomActions}>
          <Pressable
            style={styles.outlineBtn}
            onPress={async () => {
              await controller.signOut();
              router.replace('/login');
            }}
          >
            <Text style={styles.outlineBtnText}>로그아웃</Text>
          </Pressable>

          <Pressable
            style={styles.dangerBtn}
            onPress={() => setState({ ...controller.openWithdrawModal() })}
          >
            <Text style={styles.dangerBtnText}>회원 탈퇴</Text>
          </Pressable>
        </View>
      </View>

      {/* SCR-18 게스트 계정 소셜 연동 모달 */}
      <Modal
        visible={state.linkAccountModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() =>
          setState({ ...controller.closeLinkAccountModal() })
        }
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>소셜 계정 연동하기</Text>
            <Text style={styles.modalDesc}>
              지금까지 쌓은 소원 돌과 지인 그룹 돌탑 데이터를 그대로 유지하면서
              소셜 계정으로 전환합니다.
            </Text>

            {SOCIAL_PROVIDERS.map((p) => (
              <Pressable
                key={p.provider}
                style={[styles.socialBtn, { backgroundColor: p.bg }]}
                onPress={() => handleLinkSocial(p.provider)}
              >
                <Text style={[styles.socialBtnText, { color: p.fg }]}>
                  {p.label}
                </Text>
              </Pressable>
            ))}

            <Pressable
              style={styles.cancelBtn}
              onPress={() =>
                setState({ ...controller.closeLinkAccountModal() })
              }
            >
              <Text style={styles.cancelText}>닫기</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* SCR-18 회원 탈퇴 확인 모달 */}
      <Modal
        visible={state.withdrawModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setState({ ...controller.closeWithdrawModal() })}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>정말 탈퇴하시겠어요?</Text>
            <Text style={styles.modalDesc}>
              회원 탈퇴 시 내 계정 정보와 그룹 참여 정보가 삭제되며 복구할 수
              없습니다.
            </Text>

            <Pressable style={styles.dangerConfirmBtn} onPress={handleWithdraw}>
              <Text style={styles.dangerConfirmText}>탈퇴 확인</Text>
            </Pressable>

            <Pressable
              style={styles.cancelBtn}
              onPress={() => setState({ ...controller.closeWithdrawModal() })}
            >
              <Text style={styles.cancelText}>취소</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  statusBanner: {
    backgroundColor: '#1E2F23',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  statusText: {
    color: '#8CE99A',
    fontSize: 13,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 13,
    marginBottom: 12,
  },
  sectionCard: {
    backgroundColor: '#1C1E24',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  sectionTitle: {
    color: '#D6C7B2',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  profileInfo: {
    color: '#A89F91',
    fontSize: 13,
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#121316',
    color: '#F5EFE6',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    fontSize: 14,
  },
  primaryBtn: {
    backgroundColor: '#D6C7B2',
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 8,
  },
  primaryBtnText: {
    color: '#191919',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryBtn: {
    backgroundColor: '#2A2D34',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  secondaryBtnText: {
    color: '#F5EFE6',
    fontSize: 13,
    fontWeight: '600',
  },
  bottomActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  outlineBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#6C6860',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  outlineBtnText: {
    color: '#A89F91',
    fontSize: 13,
  },
  dangerBtn: {
    flex: 1,
    backgroundColor: '#3B1C1C',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  dangerBtnText: {
    color: '#FF6B6B',
    fontSize: 13,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#1C1E24',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
  },
  modalTitle: {
    color: '#F5EFE6',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  modalDesc: {
    color: '#A89F91',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 18,
  },
  socialBtn: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  socialBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  dangerConfirmBtn: {
    backgroundColor: '#C92A2A',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  dangerConfirmText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  cancelBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: {
    color: '#A89F91',
    fontSize: 14,
  },
});
