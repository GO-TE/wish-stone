import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { OnboardingController } from '../../presentation/controllers/OnboardingController.ts';

/**
 * SCR-03 닉네임#태그 설정 화면 (`/onboarding/nickname`)
 * 입력창(닉네임 2~12자 + 선택적 #태그 2~10자), 실시간 유효성 검사,
 * "닉네임은 그룹 친구에게만 보여요" 안내 문구를 제공한다.
 * 근거: 화면 설계서.md 5장, DB-001, D-008, D-015
 */
export default function NicknameOnboardingScreen() {
  const router = useRouter();
  const [controller] = useState(() => new OnboardingController());
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const validation = controller.validateNicknameInput(input);

  const handleSubmit = async () => {
    if (!validation.valid || submitting) return;
    try {
      setSubmitting(true);
      const next = await controller.submitNickname(input);
      router.replace(next.nextRoute);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>닉네임 설정</Text>
      <Text style={styles.notice}>
        닉네임은 그룹 친구에게만 보여요. 전체·카테고리 돌탑에서는 항상 익명으로
        표시됩니다.
      </Text>

      <TextInput
        style={styles.input}
        value={input}
        onChangeText={setInput}
        placeholder="예: 제미나이#real (태그 미입력 시 #0000 자동 부여)"
        placeholderTextColor="#6C6860"
        maxLength={23}
      />

      {validation.valid && validation.previewDisplayName ? (
        <Text style={styles.preview}>
          표시될 배틀태그: {validation.previewDisplayName}
        </Text>
      ) : input.trim().length > 0 ? (
        <Text style={styles.error}>
          닉네임은 2~12자(금칙어 제외), #태그는 2~10자 영문/숫자/한글이어야 합니다.
        </Text>
      ) : null}

      <Pressable
        style={[
          styles.submitButton,
          !validation.valid && styles.submitButtonDisabled,
        ]}
        disabled={!validation.valid || submitting}
        onPress={handleSubmit}
      >
        <Text style={styles.submitText}>
          {submitting ? '저장 중...' : '돌탑으로 입장하기'}
        </Text>
      </Pressable>
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
    fontSize: 24,
    fontWeight: '700',
    color: '#F5EFE6',
    marginBottom: 8,
  },
  notice: {
    fontSize: 13,
    color: '#A89F91',
    marginBottom: 24,
    lineHeight: 20,
  },
  input: {
    backgroundColor: '#1C1E24',
    color: '#F5EFE6',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  preview: {
    color: '#8CE99A',
    fontSize: 13,
    marginBottom: 20,
  },
  error: {
    color: '#FF6B6B',
    fontSize: 13,
    marginBottom: 20,
  },
  submitButton: {
    backgroundColor: '#D6C7B2',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.4,
  },
  submitText: {
    color: '#191919',
    fontSize: 15,
    fontWeight: '700',
  },
});
