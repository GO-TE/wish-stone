import assert from 'node:assert/strict';
import test from 'node:test';

import { createMsaAppContainer } from '../container.ts';
import { Stone } from '../domain/entities/Stone.ts';
import { Tower } from '../domain/entities/Tower.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import { TowerKey } from '../domain/value-objects/TowerKey.ts';
import { type PlatformCapabilities } from '../infrastructure/platform/PlatformCapabilities.ts';
import { ExploreWishesController } from '../presentation/controllers/ExploreWishesController.ts';
import { GroupController } from '../presentation/controllers/GroupController.ts';
import { MyWishesController } from '../presentation/controllers/MyWishesController.ts';
import { OnboardingController } from '../presentation/controllers/OnboardingController.ts';
import { SettingsController } from '../presentation/controllers/SettingsController.ts';
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

    if (method === 'DELETE' && url.endsWith('/api/v1/users/me')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ withdrawn: true }),
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

    if (method === 'GET' && url.includes('/api/v1/wishes/random?')) {
      return {
        ok: true,
        status: 200,
        json: async () => [
          {
            id: 'explore-wish-1',
            content: '올해 취업 면접 꼭 최종 합격하게 해주세요',
            categoryCode: 'job',
            groupId: null,
            stoneShape: 'round',
            stoneColor: '#A89F91',
            pose: { x: 0, y: 0.25, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 },
            status: 'active',
            bloomType: null,
            cheerLevel: 0,
            cheerCount: 0,
            cheeredByMe: false,
            isMine: false,
            nickname: '숨겨져야할닉네임#1234',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'explore-wish-2',
            content: '부적절한 도배 광고 소원',
            categoryCode: 'etc',
            groupId: null,
            stoneShape: 'flat',
            stoneColor: '#8D99AE',
            pose: { x: 0, y: 0.5, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 },
            status: 'active',
            bloomType: null,
            cheerLevel: 1,
            cheerCount: 2,
            cheeredByMe: false,
            isMine: false,
            createdAt: new Date().toISOString(),
          },
        ],
      };
    }

    if (method === 'POST' && url.endsWith('/api/v1/wishes/explore-wish-1/cheers')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          cheerLevel: 1,
          levelUp: true,
        }),
      };
    }

    if (method === 'POST' && url.endsWith('/api/v1/wishes/explore-wish-2/reports')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ reported: true }),
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

  // F07: 초기 5-상태 라이프사이클 및 옵저버 구독 검증
  assert.equal(stackController.getState().phase, 'IDLE');
  assert.equal(stackController.getState().lastSimulationTrajectory, undefined);

  const observedPhases: string[] = [];
  const unsubscribe = stackController.subscribe((s) => observedPhases.push(s.phase));

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

  // 1차 드롭: 중심에서 벗어나 실패 -> tower_collapsed 물리 연출 및 COLLAPSING 전이 (D-019, F07)
  const failAttempt = await stackController.placeStone(
    tower,
    new Pose({ x: 2.5, y: 1.5, z: 0 })
  );
  assert.equal(failAttempt.status, 'retry');
  assert.equal(stackController.getState().phase, 'COLLAPSING');
  assert.equal(stackController.getState().towerCollapsed, true);
  assert.equal(stackController.getState().quota.remaining, 1); // 실패 시 쿼터 미차감
  assert.ok(stackController.getState().lastSimulationTrajectory !== undefined);
  assert.ok(stackController.getState().lastSimulationTrajectory!.length > 0);
  assert.ok(
    stackController.getState().lastSimulationTrajectory![0].poses.has('dropped-stone')
  );

  // 재시도 시작: startPlacing() -> PLACING 전이
  stackController.startPlacing();
  assert.equal(stackController.getState().phase, 'PLACING');

  // 2차 드롭: 중앙에 성공적으로 안착 -> BALANCING -> SETTLED 전이 및 쿼터 1 차감 (F07)
  const successAttempt = await stackController.placeStone(
    tower,
    new Pose({ x: 0.05, y: 0.75, z: 0 })
  );
  assert.equal(successAttempt.status, 'saved');
  assert.equal(stackController.getState().phase, 'SETTLED');
  assert.equal(stackController.getState().towerCollapsed, false);
  assert.equal(stackController.getState().quota.remaining, 0);
  assert.equal(stackController.getState().savedWishId, 'wish-created-1');
  assert.ok(stackController.getState().lastSimulationTrajectory !== undefined);

  // 옵저버 구독을 통한 5단계 전이 순서 확인
  assert.ok(observedPhases.includes('PLACING'));
  assert.ok(observedPhases.includes('BALANCING'));
  assert.ok(observedPhases.includes('COLLAPSING'));
  assert.ok(observedPhases.includes('SETTLED'));

  // resetPlacement(): IDLE 복귀
  stackController.resetPlacement();
  assert.equal(stackController.getState().phase, 'IDLE');
  assert.equal(stackController.getState().towerCollapsed, false);

  // D-022: 돌이 미끄러져 떨어졌을 때 [이 자리에 그대로 두기] 선택 시 확정 저장 검증
  stackController.grantRewardQuotaBonus(1);
  const fallenPose = new Pose({ x: 0.65, y: 0.05, z: 0 });
  const fallenConfirmed = await stackController.confirmFallenPlacement(fallenPose);
  assert.equal(fallenConfirmed.status, 'saved');
  assert.equal(fallenConfirmed.pose.position.x, 0.65);
  assert.equal(stackController.getState().phase, 'SETTLED');
  assert.equal(stackController.getState().quota.remaining, 0);

  // retryPlacement(): IDLE 복귀 검증
  stackController.retryPlacement();
  assert.equal(stackController.getState().phase, 'IDLE');

  unsubscribe();

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

test('Unit 4 ExploreWishesController (SCR-10 ~ SCR-11): 타인 소원 랜덤 둘러보기, 응원 빛 단계 상승(cheer_spark) 및 중복 신고 방지 검증', async () => {
  const { fetchFn } = createMockGatewayFetch();
  const container = createMsaAppContainer('http://localhost:8080', fetchFn);
  const explore = new ExploreWishesController(container);

  // 1) 랜덤 소원 카드 로드 및 공개 돌탑 익명성(displayNickname === null) 확인
  const initial = await explore.loadRandomWishes(5);
  assert.equal(initial.wishes.length, 2);
  assert.equal(initial.currentWish?.id, 'explore-wish-1');
  assert.equal(initial.currentWish?.displayNickname, null);

  // 2) 첫 번째 소원 응원하기 -> 빛 단계 상승(0 -> 1) + cheer_spark 연출 이벤트 발행
  const cheerRes = await explore.cheerWish();
  assert.equal(cheerRes.level.level, 1);
  assert.equal(cheerRes.levelUp, true);
  assert.equal(explore.getState().lastEffect?.type, 'cheer_spark');

  // 동일 소원 중복 응원 차단
  await assert.rejects(() => explore.cheerWish(), /ALREADY_CHEERED/);

  // 3) 다음 카드로 스와이프 후 신고 모달 열기 & 신고 제출 (SCR-11)
  const secondWish = explore.nextWish();
  assert.equal(secondWish?.id, 'explore-wish-2');

  explore.openReportModal(secondWish);
  assert.equal(explore.getState().reportModalOpen, true);

  const afterReport = await explore.submitReport('spam', secondWish);
  assert.equal(afterReport.reportModalOpen, false);
  assert.equal(afterReport.wishes.length, 1); // 신고된 소원은 목록에서 즉시 제외
  assert.ok(afterReport.reportConfirmationMessage?.includes('신고가 접수'));

  // 동일 소원 중복 신고 시도 시 ALREADY_REPORTED 에러 발생
  await assert.rejects(
    () => explore.submitReport('spam', secondWish),
    /ALREADY_REPORTED/
  );
});

test('Unit 5 SettingsController (SCR-17 ~ SCR-18): 배틀태그(닉네임#태그) 변경, 일일 쿼터 보너스 충전, 게스트 소셜 연동 및 회원 탈퇴 검증', async () => {
  const { fetchFn } = createMockGatewayFetch();
  const container = createMsaAppContainer('http://localhost:8080', fetchFn);

  await container.auth.signIn('guest');
  const settings = new SettingsController(container, {
    baseQuota: 5,
    bonusQuota: 0,
    usedCount: 3,
  });

  // 1) 초기 프로필 및 쿼터 상태 확인
  assert.equal(settings.getState().user?.isGuest, true);
  assert.equal(settings.getState().quota.remaining, 2);

  // 2) 배틀태그(닉네임#태그) 변경 (SCR-17)
  const updatedUser = await settings.updateNickname('제미나이#real');
  assert.equal(updatedUser.nickname?.displayName, '제미나이#real');

  // 3) 리워드 보너스 쿼터 충전 (D-018)
  const updatedQuota = settings.grantRewardBonusQuota(2);
  assert.equal(updatedQuota.remaining, 4);

  // 4) SCR-18 게스트 계정 소셜 연동 모달 -> 카카오 계정 승격 연결
  settings.openLinkAccountModal();
  assert.equal(settings.getState().linkAccountModalOpen, true);

  const linkedUser = await settings.linkGuestToSocial('kakao');
  assert.equal(linkedUser.isGuest, false);
  assert.equal(settings.getState().linkAccountModalOpen, false);

  // 5) SCR-18 회원 탈퇴 확인 모달 -> 회원 탈퇴 완료
  settings.openWithdrawModal();
  assert.equal(settings.getState().withdrawModalOpen, true);

  const afterWithdraw = await settings.withdrawAccount();
  assert.equal(afterWithdraw.accountDeleted, true);
  assert.equal(afterWithdraw.user, null);
  assert.equal(afterWithdraw.withdrawModalOpen, false);
});

test('QA Contract Defensive Fixes (M-02, M-04, M-06, M-08): 서버 발급 tag 우선 적용, pose 누락 시 Pose.identity() 폴백, 대문자 status 소문자 정규화, isMine 기본값 검증', async () => {
  const qaFetch = async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method === 'PUT' && url.endsWith('/api/v1/users/me/nickname')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'user-qa',
          nickname: '돌탑지기',
          tag: '4821',
          isGuest: false,
        }),
      };
    }
    if (url.includes('/api/v1/wishes/me')) {
      return {
        ok: true,
        status: 200,
        json: async () => [
          {
            id: 'qa-wish-me',
            content: '내 소원 방어적 매핑 테스트',
            categoryCode: 'job',
            groupId: null,
            stoneShape: 'round',
            stoneColor: '#A89F91',
            pose: null, // pose 누락 -> Pose.identity() 폴백
            status: 'FULFILLED', // 대문자 -> 'fulfilled' 정규화
            bloomType: 'flower',
            cheerLevel: 2,
            cheerCount: 6,
            // isMine 누락 -> /me 이므로 true 기본값
            createdAt: new Date().toISOString(),
          },
        ],
      };
    }
    if (url.includes('/api/v1/wishes/random')) {
      return {
        ok: true,
        status: 200,
        json: async () => [
          {
            id: 'qa-wish-random',
            content: '랜덤 소원 방어적 매핑 테스트',
            categoryCode: 'health',
            groupId: null,
            stoneShape: 'pebble',
            stoneColor: '#D6C7B2',
            // pose 및 isMine 누락 -> Pose.identity(), false 기본값
            status: 'ACTIVE',
            bloomType: null,
            cheerLevel: 1,
            createdAt: new Date().toISOString(),
          },
        ],
      };
    }
    if (url.includes('/api/v1/towers/global/stats')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          stoneCount: 1,
          todayCount: 1,
          fulfilledCount: 1,
          cheerCount: 2,
        }),
      };
    }
    if (url.includes('/api/v1/towers/global')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          towerKey: 'global',
          stones: [
            {
              id: 'qa-tower-stone',
              stoneShape: 'round',
              stoneColor: '#A89F91',
              pose: null,
              status: 'ACTIVE',
              bloomType: null,
              cheerLevel: 1,
              nickname: null,
            },
          ],
          hasMore: false,
        }),
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  const container = createMsaAppContainer('http://localhost:8080', qaFetch);
  const onboarding = new OnboardingController(container.auth);

  // M-06: 클라이언트가 태그 없이('돌탑지기' -> 임시 #0000) 보냈을 때 서버가 발급한 res.tag('4821')로 덮어써야 함
  const nickState = await onboarding.submitNickname('돌탑지기');
  assert.equal(nickState.user?.nickname?.displayName, '돌탑지기#4821');

  // M-04 / M-08: /me 조회 시 pose 누락 폴백, status 소문자 정규화, isMine=true 기본값
  const myWishes = await container.repositories.wishes.mine();
  assert.equal(myWishes[0].isMine, true);
  assert.equal(myWishes[0].status, 'fulfilled');
  assert.equal(myWishes[0].stone.pose.position.y, 0);

  // /random 조회 시 isMine=false 기본값 및 status 소문자 정규화
  const randomWishes = await container.repositories.wishes.random(1, []);
  assert.equal(randomWishes[0].isMine, false);
  assert.equal(randomWishes[0].status, 'active');

  // M-02: MsaTowerRepository status 소문자 정규화
  const tower = await container.repositories.towers.get(TowerKey.global());
  assert.equal(tower.stones[0].status, 'active');
  assert.equal(tower.stones[0].stone.pose.position.x, 0);
});

test('QA Re-verification (N-01, N-02, N-03): 태그 미입력 시 #0000 없이 순수 닉네임만 전송해 서버 자동 태그를 부여받고, 서버 ALREADY_REPORTED/ALREADY_CHEERED 응답 시 우아하게 상태를 동기화한다', async () => {
  const sentNicknameBodies: string[] = [];

  const nFetch = async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;

    if (method === 'PUT' && url.endsWith('/api/v1/users/me/nickname')) {
      const requested = (body as { nickname: string }).nickname;
      sentNicknameBodies.push(requested);
      const hasHash = requested.includes('#');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'user-n1',
          nickname: hasHash ? requested.split('#')[0] : requested,
          tag: hasHash ? requested.split('#')[1] : '8392',
          isGuest: false,
        }),
      };
    }

    if (url.includes('/api/v1/wishes/random')) {
      return {
        ok: true,
        status: 200,
        json: async () => [
          {
            id: 'wish-server-dup-1',
            content: '다른 기기에서 이미 응원/신고한 소원',
            categoryCode: 'job',
            groupId: null,
            stoneShape: 'round',
            stoneColor: '#A89F91',
            status: 'ACTIVE',
            bloomType: null,
            cheerLevel: 2,
            createdAt: new Date().toISOString(),
          },
        ],
      };
    }

    if (method === 'POST' && url.endsWith('/api/v1/wishes/wish-server-dup-1/cheers')) {
      return {
        ok: false,
        status: 409,
        json: async () => ({
          code: 'ALREADY_CHEERED',
          message: '이미 응원한 소원입니다.',
        }),
      };
    }

    if (method === 'POST' && url.endsWith('/api/v1/wishes/wish-server-dup-1/reports')) {
      return {
        ok: false,
        status: 409,
        json: async () => ({
          code: 'ALREADY_REPORTED',
          message: '이미 신고한 소원입니다.',
        }),
      };
    }

    return { ok: false, status: 404, json: async () => ({}) };
  };

  const container = createMsaAppContainer('http://localhost:8080', nFetch);
  const onboarding = new OnboardingController(container.auth);
  const settings = new SettingsController(container);

  // N-01: 태그 미입력('민수') 시 서버에 '민수#0000'이 아닌 '민수'만 전송하고 서버 자동 생성 태그('8392')를 적용한다
  const autoTagState = await onboarding.submitNickname('민수');
  assert.equal(sentNicknameBodies[0], '민수');
  assert.equal(autoTagState.user?.nickname?.displayName, '민수#8392');

  // N-01: 태그 명시('민수#real') 시 서버에 '민수#real'을 전송한다
  const explicitProfile = await settings.updateNickname('민수#real');
  assert.equal(sentNicknameBodies[1], '민수#real');
  assert.equal(explicitProfile.nickname?.displayName, '민수#real');

  // N-02: 서버에서 ALREADY_CHEERED(409)가 반환될 때 예외로 죽지 않고 cheeredWishIds에 반영한다
  const explore = new ExploreWishesController(container);
  await explore.loadRandomWishes(1);
  const cheerFallback = await explore.cheerWish();
  assert.equal(cheerFallback.levelUp, false);
  assert.equal(cheerFallback.level.level, 2);
  assert.ok(explore.getState().cheeredWishIds.includes('wish-server-dup-1'));

  // N-02: 서버에서 ALREADY_REPORTED(409)가 반환될 때 reportedWishIds에 추가하고 카드를 목록에서 숨긴다
  const reportFallbackState = await explore.submitReport('spam');
  assert.ok(reportFallbackState.reportedWishIds.includes('wish-server-dup-1'));
  assert.equal(reportFallbackState.wishes.length, 0);
  assert.equal(reportFallbackState.reportModalOpen, false);

  // N-03: 미사용 getById 메서드가 제거되었는지 확인
  assert.equal('getById' in container.repositories.wishes, false);
});
