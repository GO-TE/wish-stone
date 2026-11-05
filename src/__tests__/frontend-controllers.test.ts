import assert from 'node:assert/strict';
import test from 'node:test';

import { createMsaAppContainer } from '../container.ts';
import { Stone } from '../domain/entities/Stone.ts';
import { Tower } from '../domain/entities/Tower.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import { TowerKey } from '../domain/value-objects/TowerKey.ts';
import { type PlatformCapabilities } from '../infrastructure/platform/PlatformCapabilities.ts';
import { GroupController } from '../presentation/controllers/GroupController.ts';
import { MyWishesController } from '../presentation/controllers/MyWishesController.ts';
import { OnboardingController } from '../presentation/controllers/OnboardingController.ts';
import { StackStoneController } from '../presentation/controllers/StackStoneController.ts';

function createMockGatewayFetch() {
  const calls: { method: string; url: string; body?: unknown }[] = [];

  const fetchFn = async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });

    if (url.endsWith('/api/v1/auth/login')) {
      const provider = (body as { provider: string })?.provider;
      const isGuest = provider === 'guest';
      return {
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: `token-${provider}`,
          user: {
            id: 'user-100',
            nickname: isGuest ? null : '기존유저#7777',
            isGuest,
          },
        }),
      };
    }

    if (url.endsWith('/api/v1/auth/link')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: 'token-linked-kakao',
          user: {
            id: 'user-100',
            nickname: '제미나이#real',
            isGuest: false,
          },
        }),
      };
    }

    if (url.endsWith('/api/v1/users/me/nickname')) {
      const nickname = (body as { nickname: string })?.nickname ?? '제미나이#real';
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'user-100',
          nickname,
          isGuest: true,
        }),
      };
    }

    if (method === 'POST' && url.endsWith('/api/v1/wishes')) {
      return {
        ok: true,
        status: 201,
        json: async () => ({
          id: 'wish-created-1',
          createdAt: new Date().toISOString(),
        }),
      };
    }

    if (method === 'GET' && url.includes('/api/v1/wishes/me')) {
      return {
        ok: true,
        status: 200,
        json: async () => [
          {
            id: 'my-wish-1',
            content: '올해 자격증 시험 꼭 합격하게 해주세요',
            categoryCode: 'study',
            groupId: null,
            stoneShape: 'round',
            stoneColor: '#A89F91',
            pose: { x: 0, y: 0.25, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 },
            status: 'active',
            bloomType: null,
            cheerLevel: 2,
            cheerCount: 7,
            cheeredByMe: false,
            isMine: true,
            createdAt: new Date().toISOString(),
          },
        ],
      };
    }

    if (method === 'PATCH' && url.endsWith('/api/v1/wishes/my-wish-1/category')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ updated: true }),
      };
    }

    if (method === 'PATCH' && url.endsWith('/api/v1/wishes/my-wish-1/fulfill')) {
      const requestedBloom =
        (body as { bloomType?: 'flower' | 'sprout' | 'moss' })?.bloomType ??
        'sprout';
      return {
        ok: true,
        status: 200,
        json: async () => ({ bloomType: requestedBloom }),
      };
    }

    if (method === 'DELETE' && url.endsWith('/api/v1/wishes/my-wish-1')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ deleted: true }),
      };
    }

    if (method === 'POST' && url.endsWith('/api/v1/groups')) {
      const name = (body as { name: string })?.name ?? '스터디 그룹';
      return {
        ok: true,
        status: 201,
        json: async () => ({
          id: 'group-1',
          name,
          inviteCode: 'SW8899AA',
          ownerId: 'user-100',
          maxMembers: 50,
          memberCount: 1,
          stoneCount: 0,
        }),
      };
    }

    if (method === 'POST' && url.endsWith('/api/v1/groups/join')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'group-2',
          name: '가족 소원 돌탑',
          inviteCode: 'FAM12345',
          ownerId: 'user-200',
          maxMembers: 20,
          memberCount: 4,
          stoneCount: 12,
        }),
      };
    }

    if (method === 'GET' && url.endsWith('/api/v1/groups/me')) {
      return {
        ok: true,
        status: 200,
        json: async () => [],
      };
    }

    if (method === 'DELETE' && url.includes('/api/v1/groups/') && url.endsWith('/members/me')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ left: true }),
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({ code: 'NOT_FOUND', message: url }),
    };
  };

  return { fetchFn, calls };
}

test('Unit 1 OnboardingController (SCR-01 ~ SCR-03): 자동 로그인 체크, 게스트/소셜 로그인, 배틀태그(닉네임#태그) 설정 흐름 검증', async () => {
  const { fetchFn } = createMockGatewayFetch();
  const container = createMsaAppContainer('http://localhost:8080', fetchFn);
  const onboarding = new OnboardingController(container.auth);

  // 1) 미인증 상태에서 스플래시 자동 로그인 확인 -> /login
  const splashState = onboarding.checkAutoLogin();
  assert.equal(splashState.isAuthenticated, false);
  assert.equal(splashState.nextRoute, '/login');

  // 2) 게스트 로그인 시 닉네임 미설정 상태이므로 -> /onboarding/nickname
  const guestLoginState = await onboarding.signIn('guest');
  assert.equal(guestLoginState.isAuthenticated, true);
  assert.equal(guestLoginState.user?.isGuest, true);
  assert.equal(guestLoginState.nextRoute, '/onboarding/nickname');

  // 3) SCR-03 닉네임#태그 실시간 검증 (태그 미입력 시 #0000 부여, 지정 시 해당 태그 사용)
  const defaultTagCheck = onboarding.validateNicknameInput('돌탑지기');
  assert.equal(defaultTagCheck.valid, true);
  assert.equal(defaultTagCheck.previewDisplayName, '돌탑지기#0000');

  const customTagCheck = onboarding.validateNicknameInput('제미나이#real');
  assert.equal(customTagCheck.valid, true);
  assert.equal(customTagCheck.previewDisplayName, '제미나이#real');

  const forbiddenCheck = onboarding.validateNicknameInput('관리자#real');
  assert.equal(forbiddenCheck.valid, false);
  assert.equal(forbiddenCheck.errorCode, 'NICKNAME_INVALID');

  // 4) 닉네임#태그 확정 저장 -> /home 이동
  const afterNicknameState = await onboarding.submitNickname('제미나이#real');
  assert.equal(afterNicknameState.user?.nickname?.displayName, '제미나이#real');
  assert.equal(afterNicknameState.nextRoute, '/home');
});

test('Unit 2 StackStoneController (SCR-05 ~ SCR-09): 자동 카테고리 프리뷰, 일일 쿼터+보너스, AR 세션/무너짐 연출/사진 촬영 검증', async () => {
  const { fetchFn } = createMockGatewayFetch();
  const nativeArCaps: PlatformCapabilities = {
    isNative: true,
    hasARKitOrARCore: async () => true,
    hasWebXRImmersiveAR: async () => false,
    hasCamera: async () => true,
  };
  const container = createMsaAppContainer(
    'http://localhost:8080',
    fetchFn,
    nativeArCaps
  );

  // 남은 횟수 0개인 상태에서 시작해 쿼터 초과 및 리워드 보너스 충전(D-018) 검증
  const stackController = new StackStoneController(container, {
    baseQuota: 5,
    bonusQuota: 0,
    usedCount: 5,
  });

  // SCR-05 돌 모양·색상 선택
  const chosenStone = stackController.selectStone('pebble', '#D6C7B2');
  assert.equal(chosenStone.shape, 'pebble');
  assert.equal(chosenStone.color, '#D6C7B2');

  // SCR-06 본문 입력 시 실시간 자동 카테고리 분류 프리뷰 (D-016)
  stackController.updateContent('올해 하반기 공채 면접 꼭 최종 합격하게 해주세요');
  assert.equal(stackController.getState().autoCategory, 'job');
  assert.equal(stackController.getState().effectiveCategory, 'job');

  // 사용자 수동 카테고리 오버라이드 및 해제 (D-016)
  stackController.overrideCategory('study');
  assert.equal(stackController.getState().effectiveCategory, 'study');
  stackController.overrideCategory(null);
  assert.equal(stackController.getState().effectiveCategory, 'job');

  const tower = new Tower(
    TowerKey.global(),
    [
      {
        id: 'base-1',
        stone: new Stone({
          shape: 'round',
          color: '#A89F91',
          pose: new Pose({ x: 0, y: 0.5, z: 0 }),
        }),
        status: 'active',
        bloom: null,
        cheerLevel: 1,
        isMine: false,
        nickname: null,
      },
    ],
    { stoneCount: 1, todayCount: 1, fulfilledCount: 0, cheerCount: 1 }
  );

  // 쿼터 소진 시 DAILY_QUOTA_EXCEEDED
  await assert.rejects(
    () => stackController.placeStone(tower, new Pose({ x: 0, y: 0.75, z: 0 })),
    /DAILY_QUOTA_EXCEEDED/
  );

  // 리워드 광고 보너스 +1 충전 (D-018)
  const quotaAfterBonus = stackController.grantRewardQuotaBonus(1);
  assert.equal(quotaAfterBonus.remaining, 1);

  // SCR-08 AR 모드 초기화 (ViroARSession 선택 확인)
  const arState = await stackController.initPlacementMode(
    'ar',
    tower,
    Pose.origin()
  );
  assert.equal(arState.mode, 'ar');
  assert.equal(arState.arSession?.kind, 'viro');

  // 1차 드롭: 중심에서 벗어나 실패 -> tower_collapsed 물리 연출 활성화 (D-019)
  const failAttempt = await stackController.placeStone(
    tower,
    new Pose({ x: 2.5, y: 1.5, z: 0 })
  );
  assert.equal(failAttempt.status, 'retry');
  assert.equal(stackController.getState().towerCollapsed, true);
  assert.equal(stackController.getState().quota.remaining, 1); // 실패 시 쿼터 미차감

  // 2차 드롭: 중앙에 성공적으로 안착 -> 쿼터 1 차감 및 저장 완료
  const successAttempt = await stackController.placeStone(
    tower,
    new Pose({ x: 0.05, y: 0.75, z: 0 })
  );
  assert.equal(successAttempt.status, 'saved');
  assert.equal(stackController.getState().towerCollapsed, false);
  assert.equal(stackController.getState().quota.remaining, 0);
  assert.equal(stackController.getState().savedWishId, 'wish-created-1');

  // SCR-09 AR 사진 촬영
  const photo = await stackController.captureARPhoto();
  assert.equal(photo.mimeType, 'image/jpeg');
  assert.equal(stackController.getState().capturedPhoto?.uri, photo.uri);

  await stackController.stopARSession();
  assert.equal(stackController.getState().arSession, null);
});

test('Unit 3 MyWishesController & GroupController (SCR-12 ~ SCR-16): 카테고리 사후 수정, 이루어짐 연출, 삭제 및 게스트 그룹 연동 안내 검증', async () => {
  const { fetchFn } = createMockGatewayFetch();
  const container = createMsaAppContainer('http://localhost:8080', fetchFn);

  // 게스트로 먼저 로그인
  await container.auth.signIn('guest');

  // 1) 내 소원 목록 조회 (SCR-12)
  const myWishesController = new MyWishesController(container);
  const loaded = await myWishesController.loadMyWishes('all');
  assert.equal(loaded.wishes.length, 1);
  const myWish = loaded.wishes[0];
  assert.equal(myWish.visibleCheerCount, 7); // 본인에게만 정확한 응원 수 노출 (D-006)
  assert.equal(myWish.category, 'study');

  // 2) 내 소원 카테고리 사후 직접 변경 (D-016: study -> job)
  await myWishesController.changeWishCategory(myWish, 'job');
  assert.equal(myWish.category, 'job');

  // 3) 내 소원 이루어짐 처리 및 피어남 연출 (SCR-14, D-012)
  const bloom = await myWishesController.fulfillWish(myWish, 'flower');
  assert.equal(bloom, 'flower');
  assert.equal(myWish.status, 'fulfilled');
  assert.equal(myWishesController.getState().lastEffect?.type, 'fulfilled');

  // 4) 내 소원 삭제 시 목록에서 제거되고 tower_collapsed 연출 발행 (SCR-13, D-019)
  const afterDelete = await myWishesController.deleteWish(myWish);
  assert.equal(afterDelete.wishes.length, 0);
  assert.equal(afterDelete.lastEffect?.type, 'tower_collapsed');

  // 5) 지인 그룹 컨트롤러: 게스트일 때 그룹 생성/참여 시 소셜 계정 연동 안내 활성화 (SCR-15~16, D-007)
  const groupController = new GroupController(container);
  const createdGroup = await groupController.createGroup('취업 뽀개기 스터디');
  assert.equal(createdGroup.inviteCode, 'SW8899AA');
  assert.equal(groupController.getState().requiresSocialLinkPrompt, true);
  assert.ok(groupController.getState().promptMessage?.includes('소셜 계정'));

  // 초대 코드로 두 번째 그룹 참여
  const joinedGroup = await groupController.joinGroup('FAM12345');
  assert.equal(joinedGroup.name, '가족 소원 돌탑');
  assert.equal(groupController.getState().groups.length, 2);

  // 게스트 -> 카카오 소셜 계정 연동 시 안내 배너 해제 및 데이터 유지 (D-007, API-18)
  const linkedProfile = await groupController.linkGuestAccount('kakao');
  assert.equal(linkedProfile.isGuest, false);
  assert.equal(linkedProfile.nickname?.displayName, '제미나이#real');
  assert.equal(groupController.getState().requiresSocialLinkPrompt, false);

  // 그룹 나가기
  const afterLeave = await groupController.leaveGroup(createdGroup.id);
  assert.equal(afterLeave.groups.length, 1);
});
