import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  GroupController,
  type GroupViewState,
} from '../../presentation/controllers/GroupController.ts';

/**
 * SCR-15 ~ SCR-16 지인 그룹 돌탑 목록·만들기·초대 코드 참여 화면 (`/groups`)
 * - 내가 속한 그룹 목록(인원, 돌 수, 초대 코드)을 표시한다.
 * - 게스트 계정이 그룹을 생성하거나 참여할 때 소셜 계정 연동 안내(`D-007`)를 노출한다.
 * 근거: 화면 설계서.md 5장, DB-005, API-12~15, D-007
 */
export default function GroupsScreen() {
  const router = useRouter();
  const [controller] = useState(() => new GroupController());
  const [state, setState] = useState<GroupViewState>(() =>
    controller.getState()
  );
  const [newGroupName, setNewGroupName] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  useEffect(() => {
    controller.checkGuestLinkRecommendation();
    controller
      .loadMyGroups()
      .then((next) => setState({ ...next }))
      .catch(() => setState({ ...controller.getState() }));
  }, [controller]);

  const handleCreateGroup = async () => {
    if (newGroupName.trim().length < 2) return;
    await controller.createGroup(newGroupName);
    setNewGroupName('');
    setState({ ...controller.getState() });
  };

  const handleJoinGroup = async () => {
    if (!inviteCode.trim()) return;
    await controller.joinGroup(inviteCode);
    setInviteCode('');
    setState({ ...controller.getState() });
  };

  const handleLinkSocial = async () => {
    await controller.linkGuestAccount('kakao');
    setState({ ...controller.getState() });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backBtn}>◂ 홈</Text>
        </Pressable>
        <Text style={styles.title}>지인 그룹 돌탑</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* 게스트 계정 소셜 연동 안내 배너 (D-007) */}
      {state.requiresSocialLinkPrompt && state.promptMessage ? (
        <View style={styles.guestBanner}>
          <Text style={styles.guestBannerText}>{state.promptMessage}</Text>
          <Pressable style={styles.linkBtn} onPress={handleLinkSocial}>
            <Text style={styles.linkBtnText}>카카오 계정으로 즉시 연동</Text>
          </Pressable>
        </View>
      ) : null}

      {/* SCR-16 그룹 만들기 */}
      <View style={styles.formBox}>
        <Text style={styles.sectionTitle}>새 그룹 돌탑 만들기</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={newGroupName}
            onChangeText={setNewGroupName}
            placeholder="그룹 이름 (2~20자)"
            placeholderTextColor="#6C6860"
          />
          <Pressable style={styles.submitBtn} onPress={handleCreateGroup}>
            <Text style={styles.submitBtnText}>생성</Text>
          </Pressable>
        </View>
      </View>

      {/* SCR-16 초대 코드로 참여 */}
      <View style={styles.formBox}>
        <Text style={styles.sectionTitle}>초대 코드로 참여</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={inviteCode}
            onChangeText={setInviteCode}
            placeholder="8자리 초대 코드 입력"
            placeholderTextColor="#6C6860"
          />
          <Pressable style={styles.submitBtn} onPress={handleJoinGroup}>
            <Text style={styles.submitBtnText}>참여</Text>
          </Pressable>
        </View>
      </View>

      {/* SCR-15 내 그룹 목록 */}
      <Text style={styles.sectionTitle}>내가 속한 그룹</Text>
      <ScrollView style={styles.list}>
        {state.groups.length === 0 ? (
          <Text style={styles.emptyText}>참여 중인 지인 그룹이 없습니다.</Text>
        ) : (
          state.groups.map((g) => (
            <View key={g.id} style={styles.groupCard}>
              <View>
                <Text style={styles.groupName}>{g.name}</Text>
                <Text style={styles.groupMeta}>
                  인원 {g.memberCount}/{g.maxMembers}명 · 돌 {g.stoneCount}개 ·
                  초대코드: {g.inviteCode}
                </Text>
              </View>
              <Pressable
                style={styles.leaveBtn}
                onPress={async () => {
                  await controller.leaveGroup(g.id);
                  setState({ ...controller.getState() });
                }}
              >
                <Text style={styles.leaveBtnText}>나가기</Text>
              </Pressable>
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
  guestBanner: {
    backgroundColor: '#2B2518',
    borderColor: '#FFD43B',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  guestBannerText: {
    color: '#FFE066',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
  },
  linkBtn: {
    backgroundColor: '#FEE500',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  linkBtnText: {
    color: '#191919',
    fontSize: 13,
    fontWeight: '700',
  },
  formBox: {
    backgroundColor: '#181A20',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#A89F91',
    fontSize: 13,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#1C1E24',
    color: '#F5EFE6',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    fontSize: 14,
  },
  submitBtn: {
    backgroundColor: '#D6C7B2',
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 8,
  },
  submitBtnText: {
    color: '#191919',
    fontSize: 13,
    fontWeight: '700',
  },
  list: {
    flex: 1,
  },
  emptyText: {
    color: '#6C6860',
    textAlign: 'center',
    marginTop: 24,
  },
  groupCard: {
    backgroundColor: '#1C1E24',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  groupName: {
    color: '#F5EFE6',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  groupMeta: {
    color: '#A89F91',
    fontSize: 12,
  },
  leaveBtn: {
    backgroundColor: '#2A2D34',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  leaveBtnText: {
    color: '#FF6B6B',
    fontSize: 12,
  },
});
