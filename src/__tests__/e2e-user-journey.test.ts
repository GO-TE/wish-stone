import assert from 'node:assert/strict';
import test from 'node:test';

import { type BloomType } from '../domain/value-objects/BloomType.ts';
import { type CheerLevelValue } from '../domain/value-objects/CheerLevel.ts';
import { Pose, type PoseJSON } from '../domain/value-objects/Pose.ts';
import {
  type CategoryCode,
  TowerKey,
} from '../domain/value-objects/TowerKey.ts';
import { createAppContainer } from '../infrastructure/di/AppContainer.ts';

interface StoredWishRecord {
  id: string;
  content: string;
  categoryCode: CategoryCode;
  groupId: string | null;
  stoneShape: 'round' | 'flat' | 'pebble' | 'boulder';
  stoneColor: string;
  pose: PoseJSON;
  status: string;
  bloomType: BloomType | null;
  cheerLevel: CheerLevelValue;
  cheerCount: number;
  cheeredByMe: boolean;
  isMine: boolean;
  nickname: string | null;
  createdAt: string;
  fulfilledAt: string | null;
}

test('End-to-End User Journey (SCR-01 ~ SCR-18): 게스트 시작 -> 닉네임#태그 설정 -> 소원 작성(자동 분류) -> 3D 돌 쌓기(무너짐 & 3회차 자동 안착) -> 랜덤 탐색·응원·신고 -> 내 소원 이루어짐 -> 소셜 계정 연동 & 지인 그룹 돌탑 참여', async () => {
  const authHeadersSeen: (string | undefined)[] = [];
  const nicknamePayloads: string[] = [];

  let currentUser = {
    id: 'user-e2e-1',
    nickname: null as string | null,
    tag: null as string | null,
    isGuest: true,
  };

  const myWishesDb: StoredWishRecord[] = [];
  const randomWishesDb: StoredWishRecord[] = [
    {
      id: 'other-wish-1',
      content: '부모님 수술 잘 끝나고 건강 회복하시길',
      categoryCode: 'health',
      groupId: null,
      stoneShape: 'pebble',
      stoneColor: '#D6C7B2',
      pose: { x: 0, y: 0.25, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 },
      status: 'ACTIVE',
      bloomType: null,
      cheerLevel: 1,
      cheerCount: 4, // 응원 1회 추가 시 5개가 되어 2단계(1/5/15 기준)로 levelUp!
      cheeredByMe: false,
      isMine: false,
      nickname: '타인닉네임#9999', // 공개 돌탑이므로 익명(null) 마스킹 검증
      createdAt: new Date().toISOString(),
      fulfilledAt: null,
    },
    {
      id: 'spam-wish-2',
      content: '부적절한 불법 광고 스팸 소원입니다',
      categoryCode: 'etc',
      groupId: null,
      stoneShape: 'flat',
      stoneColor: '#6C757D',
      pose: { x: 0, y: 0.5, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 },
      status: 'ACTIVE',
      bloomType: null,
      cheerLevel: 0,
      cheerCount: 0,
      cheeredByMe: false,
      isMine: false,
      nickname: null,
      createdAt: new Date().toISOString(),
      fulfilledAt: null,
    },
  ];

  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;

    authHeadersSeen.push(headers['Authorization']);

    // 1. 게스트 로그인 (API-17)
    if (method === 'POST' && url.endsWith('/api/v1/auth/login')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: 'jwt-guest-e2e-token',
          user: {
            id: currentUser.id,
            nickname: currentUser.nickname,
            tag: currentUser.tag,
            isGuest: true,
          },
        }),
      } as Response;
    }

    // 2. 닉네임 설정 (API-01)
    if (method === 'PUT' && url.endsWith('/api/v1/users/me/nickname')) {
      const requested = (body as { nickname: string }).nickname;
      nicknamePayloads.push(requested);
      const hasHash = requested.includes('#');
      currentUser = {
        ...currentUser,
        nickname: hasHash ? requested.split('#')[0] : requested,
        tag: hasHash ? requested.split('#')[1] : '7788', // 태그 미입력 시 서버가 4자리 태그 자동 발급
      };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: currentUser.id,
          nickname: currentUser.nickname,
          tag: currentUser.tag,
          isGuest: currentUser.isGuest,
        }),
      } as Response;
    }

    // 3. 돌탑 통계 및 돌 목록 조회 (API-03, API-04)
    if (method === 'GET' && url.includes('/api/v1/towers/') && url.endsWith('/stats')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          stoneCount: 50 + myWishesDb.length,
          todayCount: 5 + myWishesDb.length,
          fulfilledCount: myWishesDb.filter((w) => w.status === 'FULFILLED').length,
          cheerCount: 120,
        }),
      } as Response;
    }

    if (method === 'GET' && url.includes('/api/v1/towers/')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          towerKey: 'global',
          stones: [
            {
              id: 'base-stone-1',
              stoneShape: 'round',
              stoneColor: '#A89F91',
              pose: { x: 0, y: 1.0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 },
              status: 'ACTIVE',
              bloomType: null,
              cheerLevel: 1,
              isMine: false,
              nickname: '익명보장대상#0001',
            },
          ],
          hasMore: false,
        }),
      } as Response;
    }

    // 4. 소원 등록 (API-05)
    if (method === 'POST' && url.endsWith('/api/v1/wishes')) {
      const payload = body as {
        content: string;
        categoryCode: CategoryCode;
        groupId: string | null;
        stoneShape: 'round' | 'flat' | 'pebble' | 'boulder';
        stoneColor: string;
        pose: PoseJSON;
      };
      const newWish: StoredWishRecord = {
        id: `my-wish-${myWishesDb.length + 1}`,
        content: payload.content,
        categoryCode: payload.categoryCode,
        groupId: payload.groupId,
        stoneShape: payload.stoneShape,
        stoneColor: payload.stoneColor,
        pose: payload.pose,
        status: 'ACTIVE',
        bloomType: null,
        cheerLevel: 0,
        cheerCount: 3,
        cheeredByMe: false,
        isMine: true,
        nickname: `${currentUser.nickname}#${currentUser.tag}`,
        createdAt: new Date().toISOString(),
        fulfilledAt: null,
      };
      myWishesDb.push(newWish);
      return {
        ok: true,
        status: 201,
        json: async () => ({
          id: newWish.id,
          createdAt: newWish.createdAt,
        }),
      } as Response;
    }

    // 5. 랜덤 소원 조회 (API-06)
    if (method === 'GET' && url.includes('/api/v1/wishes/random')) {
      return {
        ok: true,
        status: 200,
        json: async () => randomWishesDb,
      } as Response;
    }

    // 6. 소원 응원하기 (API-07)
    if (method === 'POST' && url.endsWith('/api/v1/wishes/other-wish-1/cheers')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          cheerLevel: 2, // 4 -> 5개로 2단계(1/5/15 기준) 승격!
          levelUp: true,
        }),
      } as Response;
    }

    // 7. 소원 신고하기 (API-08)
    if (method === 'POST' && url.endsWith('/api/v1/wishes/spam-wish-2/reports')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ reported: true }),
      } as Response;
    }

    // 8. 내 소원 목록 조회 (API-09)
    if (method === 'GET' && url.includes('/api/v1/wishes/me')) {
      return {
        ok: true,
        status: 200,
        json: async () => myWishesDb,
      } as Response;
    }

    // 9. 내 소원 이루어짐 처리 (API-10)
    if (method === 'PATCH' && url.includes('/api/v1/wishes/') && url.endsWith('/fulfill')) {
      const requestedBloom =
        (body as { bloomType?: BloomType })?.bloomType ?? 'flower';
      if (myWishesDb[0]) {
        myWishesDb[0].status = 'FULFILLED';
        myWishesDb[0].bloomType = requestedBloom;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ bloomType: requestedBloom }),
      } as Response;
    }

    // 10. 게스트 계정을 소셜 계정으로 연결 (API-18)
    if (method === 'POST' && url.endsWith('/api/v1/auth/link')) {
      currentUser = {
        ...currentUser,
        isGuest: false,
      };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: 'jwt-social-linked-token',
          user: {
            id: currentUser.id,
            nickname: currentUser.nickname,
            tag: currentUser.tag,
            isGuest: false,
          },
        }),
      } as Response;
    }

    // 11. 초대 코드로 지인 그룹 참여 (API-13)
    if (method === 'POST' && url.endsWith('/api/v1/groups/join')) {
      const inviteCode = (body as { inviteCode: string }).inviteCode;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'group-e2e-1',
          name: '네카라쿠배 취업 스터디',
          inviteCode,
          ownerId: 'owner-99',
          maxMembers: 30,
          memberCount: 6,
          stoneCount: 18,
        }),
      } as Response;
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({ code: 'NOT_FOUND', message: url }),
    } as Response;
  };

  // Composition Root 컨테이너 생성
  const container = createAppContainer({
    baseUrl: 'http://localhost:8080',
    fetchImpl,
  });

  const {
    onboarding,
    dashboard,
    stackStone,
    exploreWishes,
    myWishes,
    groups,
    settings,
  } = container.controllers;

  // =========================================================================
  // Step 1: 게스트 로그인 & 배틀태그(닉네임#태그) 설정 (SCR-01 ~ SCR-03)
  // =========================================================================
  assert.equal(onboarding.checkAutoLogin().nextRoute, '/login');

  const guestState = await onboarding.signIn('guest');
  assert.equal(guestState.isAuthenticated, true);
  assert.equal(guestState.user?.isGuest, true);
  assert.equal(guestState.nextRoute, '/onboarding/nickname');
  assert.equal(container.http.getAccessToken(), 'jwt-guest-e2e-token');

  // 태그를 생략하고 '소원빌기'만 입력 -> 서버에는 '#0000' 없이 '소원빌기'만 전송되고 서버 발급 태그('#7788')가 적용됨 (D-015)
  const nickState = await onboarding.submitNickname('소원빌기');
  assert.equal(nicknamePayloads[0], '소원빌기');
  assert.equal(nickState.user?.nickname?.displayName, '소원빌기#7788');
  assert.equal(nickState.nextRoute, '/home');

  // =========================================================================
  // Step 2: 대시보드 로드 & 소원 작성(자동 카테고리 프리뷰) & 3D 돌 쌓기 (SCR-04 ~ SCR-07)
  // =========================================================================
  const dashState = await dashboard.loadDashboard(TowerKey.global());
  assert.equal(dashState.tower?.stones.length, 1);
  assert.equal(dashState.tower?.stones[0].nickname, null); // 공개 돌탑 익명 마스킹 확인

  stackStone.selectStone('round', '#D6C7B2');
  stackStone.updateContent('하반기 백엔드 개발자 공채 면접 꼭 최종 합격하게 해주세요!');
  assert.equal(stackStone.getState().autoCategory, 'job');
  assert.equal(stackStone.getState().effectiveCategory, 'job');

  const activeTower = dashState.tower!;
  // 물리 월드에 기존 탑 돌 정적 바디 추가
  container.physics.addStatic(activeTower.stones.map((s) => s.stone));

  // 1차 & 2차 드롭: 중심에서 멀리 떨어져 안착 실패 -> tower_collapsed 물리 연출 발생 (D-019)
  const offCenterPose = new Pose({ x: 3.0, y: 1.5, z: 0 });
  const try1 = await stackStone.placeStone(activeTower, offCenterPose);
  assert.equal(try1.status, 'retry');
  assert.equal(stackStone.getState().towerCollapsed, true);

  const try2 = await stackStone.placeStone(activeTower, offCenterPose);
  assert.equal(try2.status, 'retry');

  // 3차 드롭: 3회 연속 실패 시 돌탑 꼭대기(topY + 0.25 = 1.25)에 자동 안착 및 저장 성공!
  const try3 = await stackStone.placeStone(activeTower, offCenterPose);
  assert.equal(try3.status, 'saved');
  if (try3.status === 'saved') {
    assert.equal(try3.autoPlaced, true);
    assert.equal(try3.category, 'job');
    assert.equal(try3.pose.position.y, 1.25);
  }
  assert.equal(stackStone.getState().quota.remaining, 4); // 일일 쿼터 5 -> 4 차감 (D-018)

  // =========================================================================
  // Step 3: 타인 소원 랜덤 탐색 · 응원(1/5/15 빛 단계 + cheer_spark) · 신고 (SCR-10 ~ SCR-11)
  // =========================================================================
  const exploreState = await exploreWishes.loadRandomWishes(5);
  assert.equal(exploreState.wishes.length, 2);
  assert.equal(exploreState.currentWish?.id, 'other-wish-1');
  assert.equal(exploreState.currentWish?.displayNickname, null); // 익명 보장

  const cheerResult = await exploreWishes.cheerWish();
  assert.equal(cheerResult.level.level, 2);
  assert.equal(cheerResult.levelUp, true);
  assert.equal(exploreWishes.getState().lastEffect?.type, 'cheer_spark');

  // 다음 카드(스팸 소원)로 이동 후 신고 제출 -> 목록에서 즉시 숨김 처리
  const secondCard = exploreWishes.nextWish();
  assert.equal(secondCard?.id, 'spam-wish-2');
  const afterReport = await exploreWishes.submitReport('spam', secondCard);
  assert.equal(afterReport.wishes.length, 1);
  assert.ok(afterReport.reportedWishIds.includes('spam-wish-2'));

  // =========================================================================
  // Step 4: 내 소원 조회 및 이루어짐 연출(flower|sprout|moss) 선택 (SCR-12 ~ SCR-14)
  // =========================================================================
  const myLoaded = await myWishes.loadMyWishes('all');
  assert.equal(myLoaded.wishes.length, 1);
  const myWish = myLoaded.wishes[0];
  assert.equal(myWish.id, 'my-wish-1');
  assert.equal(myWish.visibleCheerCount, 3); // 본인에게만 응원 수 노출 (D-006)

  const fulfilledBloom = await myWishes.fulfillWish(myWish, 'flower');
  assert.equal(fulfilledBloom, 'flower');
  assert.equal(myWish.status, 'fulfilled');
  assert.equal(myWishes.getState().lastEffect?.type, 'fulfilled');

  // =========================================================================
  // Step 5: 게스트 계정 소셜 연동 & 지인 그룹 돌탑 참여 (SCR-15 ~ SCR-18)
  // =========================================================================
  // 게스트 상태에서 그룹 참여 시 소셜 연동 권고 확인 (D-007)
  assert.equal(groups.checkGuestLinkRecommendation(), true);

  // 설정 컨트롤러에서 카카오 소셜 계정으로 연동 -> 토큰 자동 갱신 및 게스트 해제
  settings.refreshProfile();
  const linkedUser = await settings.linkGuestToSocial('kakao');
  assert.equal(linkedUser.isGuest, false);
  assert.equal(linkedUser.nickname?.displayName, '소원빌기#7788');
  assert.equal(container.http.getAccessToken(), 'jwt-social-linked-token');

  // 초대 코드로 지인 그룹 참여
  const joinedGroup = await groups.joinGroup('STUDY777');
  assert.equal(joinedGroup.name, '네카라쿠배 취업 스터디');
  assert.equal(groups.getState().requiresSocialLinkPrompt, false);
  assert.equal(groups.getState().groups.length, 1);

  // 전체 여정 동안 발생한 시각 연출 이펙트 히스토리 검증
  const emittedEffects = container.effects.getHistory().map((e) => e.type);
  assert.ok(emittedEffects.includes('tower_collapsed'));
  assert.ok(emittedEffects.includes('stone_stacked'));
  assert.ok(emittedEffects.includes('cheered'));
  assert.ok(emittedEffects.includes('cheer_spark'));
  assert.ok(emittedEffects.includes('fulfilled'));
});
