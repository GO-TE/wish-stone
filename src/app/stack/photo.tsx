import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

/**
 * SCR-09 사진 미리보기·공유 화면 (`/stack/photo`)
 * AR 돌탑 촬영본에 대해 [저장], [공유], [다시 찍기] 및 소원 본문 오버레이 토글을 제공한다.
 * 근거: 화면 설계서.md 5장, DB-013
 */
export default function ARPhotoPreviewScreen() {
  const router = useRouter();
  const [showWishOverlay, setShowWishOverlay] = useState(true);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>AR 돌탑 사진 미리보기</Text>

      <View style={styles.photoFrame}>
        <Text style={styles.photoPlaceholder}>📸 StoneWish AR Snapshot</Text>
        {showWishOverlay ? (
          <Text style={styles.wishOverlay}>
            "오늘 쌓은 소원이 꼭 이루어지기를"
          </Text>
        ) : null}
        <Text style={styles.watermark}>StoneWish</Text>
      </View>

      <Pressable
        style={styles.toggleRow}
        onPress={() => setShowWishOverlay((v) => !v)}
      >
        <Text style={styles.toggleText}>
          소원 글 함께 표시: {showWishOverlay ? '켜짐' : '꺼짐'}
        </Text>
      </Pressable>

      {savedNotice ? <Text style={styles.notice}>{savedNotice}</Text> : null}

      <View style={styles.buttonRow}>
        <Pressable
          style={styles.secondaryBtn}
          onPress={() => router.replace('/stack/ar')}
        >
          <Text style={styles.secondaryText}>다시 찍기</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryBtn}
          onPress={() => setSavedNotice('기기에 사진이 저장되었습니다.')}
        >
          <Text style={styles.secondaryText}>저장</Text>
        </Pressable>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => router.replace('/home')}
        >
          <Text style={styles.primaryText}>공유 후 홈으로</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121316',
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F5EFE6',
    marginBottom: 16,
  },
  photoFrame: {
    flex: 1,
    backgroundColor: '#181A20',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  photoPlaceholder: {
    color: '#D6C7B2',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  wishOverlay: {
    color: '#F5EFE6',
    fontSize: 15,
    fontStyle: 'italic',
    marginBottom: 16,
  },
  watermark: {
    color: '#6C6860',
    fontSize: 12,
  },
  toggleRow: {
    backgroundColor: '#1C1E24',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  toggleText: {
    color: '#A89F91',
    fontSize: 13,
  },
  notice: {
    color: '#8CE99A',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: '#2A2D34',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryText: {
    color: '#F5EFE6',
    fontSize: 13,
    fontWeight: '600',
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: '#D6C7B2',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryText: {
    color: '#191919',
    fontSize: 13,
    fontWeight: '700',
  },
});
