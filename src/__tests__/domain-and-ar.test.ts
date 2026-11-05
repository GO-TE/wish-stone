import assert from 'node:assert/strict';
import test from 'node:test';

import { CheerWishUseCase } from '../application/usecases/CheerWishUseCase.ts';
import { FulfillWishUseCase } from '../application/usecases/FulfillWishUseCase.ts';
import { StackStoneUseCase } from '../application/usecases/StackStoneUseCase.ts';
import { createMsaAppContainer } from '../container.ts';
import { Stone } from '../domain/entities/Stone.ts';
import { Tower } from '../domain/entities/Tower.ts';
import { Wish, type WishId } from '../domain/entities/Wish.ts';
import { EffectBus, type VisualEffectEvent } from '../domain/ports/EffectBus.ts';
import {
  type NewWishInput,
  type WishRepository,
} from '../domain/ports/repositories.ts';
import { CheerLevel } from '../domain/value-objects/CheerLevel.ts';
import { DailyWishQuota } from '../domain/value-objects/DailyWishQuota.ts';
import { Nickname } from '../domain/value-objects/Nickname.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import { TowerKey } from '../domain/value-objects/TowerKey.ts';
import { ARSessionFactory } from '../infrastructure/ar/ARSessionFactory.ts';
import { SimpleTowerPhysicsWorld } from '../infrastructure/physics/SimpleTowerPhysicsWorld.ts';
import { type PlatformCapabilities } from '../infrastructure/platform/PlatformCapabilities.ts';
import { DashboardController } from '../presentation/controllers/DashboardController.ts';

class InMemoryWishRepository implements WishRepository {
  readonly saved: NewWishInput[] = [];
  private cheerCountMap = new Map<WishId, number>();

  async create(input: NewWishInput): Promise<WishId> {
    this.saved.push(input);
    return `wish-${this.saved.length}`;
  }

  async random(): Promise<Wish[]> {
    return [];
  }

  async mine(): Promise<Wish[]> {
    return [];
  }

  async cheer(id: WishId): Promise<{ level: CheerLevel; levelUp: boolean }> {
    const prev = this.cheerCountMap.get(id) ?? 0;
    const next = prev + 1;
    this.cheerCountMap.set(id, next);
    const prevLevel = CheerLevel.fromCount(prev);
    const nextLevel = CheerLevel.fromCount(next);
    return {
      level: nextLevel,
      levelUp: nextLevel.isHigherThan(prevLevel),
    };
  }

  async report(): Promise<void> {}

  async fulfill(_id: WishId, bloom = 'sprout' as const) {
    return bloom;
  }

  async remove(): Promise<void> {}
}

test('익명성 & D-015/D-017 규칙: 공개 돌탑에서는 닉네임을 숨기고 그룹 돌탑에서만 닉네임#태그를 노출하며 초기 응원 구간(1/5/15)을 적용한다', () => {
  const stone = new Stone({
    shape: 'round',
    color: '#A89F91',
    pose: Pose.origin(),
  });

  const publicWish = new Wish({
    id: 'w-1',
    authorNickname: '제미나이#real',
    isMine: false,
    content: '올해 취업 성공하게 해주세요',
    scope: TowerKey.global(),
    stone,
    status: 'active',
    bloom: null,
    cheerCount: 5,
    createdAt: new Date(),
  });

  const groupWish = new Wish({
    id: 'w-2',
    authorNickname: '제미나이#real',
    isMine: false,
    content: '우리 스터디 수능 전원 만점!',
    scope: TowerKey.group('group-123'),
    stone,
    status: 'active',
    bloom: null,
    cheerCount: 15,
    createdAt: new Date(),
  });

  assert.equal(publicWish.displayNickname, null);
  assert.equal(groupWish.displayNickname, '제미나이#real');
  assert.equal(publicWish.category, 'job'); // D-016 자동 분류 검증
  assert.equal(groupWish.category, 'study'); // D-016 자동 분류 검증
  assert.equal(publicWish.visibleCheerCount, null);
  assert.equal(publicWish.cheerLevel().level, 2); // 응원 5개 -> 2단계 (D-017)
  assert.equal(groupWish.cheerLevel().level, 3); // 응원 15개 -> 3단계 (D-017)
});

test('응원 유스케이스 (D-017): 첫 응원(0 -> 1) 시 즉시 1단계 빛 상승(levelUp) 이벤트가 발행된다', async () => {
  const repo = new InMemoryWishRepository();
  const effects = new EffectBus();
  const events: VisualEffectEvent[] = [];
  effects.subscribe((e) => events.push(e));

  const useCase = new CheerWishUseCase(repo, effects);
  const stone = new Stone({
    shape: 'round',
    color: '#A89F91',
    pose: Pose.origin(),
  });
  const targetWish = new Wish({
    id: 'w-10',
    isMine: false,
    content: '수술 잘 끝나고 건강 회복하게 해주세요',
    scope: TowerKey.global(),
    stone,
    status: 'active',
    bloom: null,
    cheerCount: 0,
    createdAt: new Date(),
  });

  const res = await useCase.execute(targetWish);
  assert.equal(res.level.level, 1);
  assert.equal(res.levelUp, true);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'cheered');
});

test('돌 쌓기 & 돌탑 무너짐 연출 (D-016, D-019): 반경 밖 드롭 시 tower_collapsed 연출이 발행되고 3회차 실패 시 자동 안착한다', async () => {
  const repo = new InMemoryWishRepository();
  const physics = new SimpleTowerPhysicsWorld(0.4, 0.25);
  const effects = new EffectBus();
  const events: VisualEffectEvent[] = [];
  effects.subscribe((e) => events.push(e));

  const useCase = new StackStoneUseCase(repo, physics, effects);

  const baseStone = new Stone({
    shape: 'round',
    color: '#888888',
    pose: new Pose({ x: 0, y: 1.0, z: 0 }),
  });
  physics.addStatic([baseStone]);

  const tower = new Tower(
    TowerKey.global(),
    [
      {
        id: 'w-base',
        stone: baseStone,
        status: 'active',
        bloom: null,
        cheerLevel: 0,
        isMine: false,
        nickname: null,
      },
    ],
    { stoneCount: 1, todayCount: 1, fulfilledCount: 0, cheerCount: 0 }
  );

  const draft = {
    content: '올해 공채 면접 꼭 최종 합격하게 해주세요 010-1234-5678', // 전화번호 허용(D-019) & 취업 자동분류(D-016)
    scope: TowerKey.global(),
    stone: new Stone({ shape: 'pebble', color: '#CCCCCC', pose: Pose.origin() }),
  };

  const farDrop = new Pose({ x: 2.0, y: 1.5, z: 0 });

  const attempt1 = await useCase.execute(draft, tower, farDrop, 1);
  assert.equal(attempt1.status, 'retry');
  if (attempt1.status === 'retry') {
    assert.equal(attempt1.collapsed, true);
  }
  assert.equal(events[0].type, 'tower_collapsed');

  const attempt2 = await useCase.execute(draft, tower, farDrop, 2);
  assert.equal(attempt2.status, 'retry');

  const attempt3 = await useCase.execute(draft, tower, farDrop, 3);
  assert.equal(attempt3.status, 'saved');
  if (attempt3.status === 'saved') {
    assert.equal(attempt3.autoPlaced, true);
    assert.equal(attempt3.category, 'job');
    assert.equal(attempt3.pose.position.y, 1.25);
  }
});

test('ARSessionFactory: 플랫폼 역량에 따라 Viro / WebXR / CameraOverlay / null 중 알맞은 세션을 생성한다 (D-003)', async () => {
  const factory = new ARSessionFactory(() => new SimpleTowerPhysicsWorld());

  const nativeCaps: PlatformCapabilities = {
    isNative: true,
    hasARKitOrARCore: async () => true,
    hasWebXRImmersiveAR: async () => false,
    hasCamera: async () => true,
  };
  const viro = await factory.create(nativeCaps);
  assert.equal(viro?.kind, 'viro');
  assert.equal(viro?.supportsPlaneDetection, true);

  const webxrCaps: PlatformCapabilities = {
    isNative: false,
    hasARKitOrARCore: async () => false,
    hasWebXRImmersiveAR: async () => true,
    hasCamera: async () => true,
  };
  const webxr = await factory.create(webxrCaps);
  assert.equal(webxr?.kind, 'webxr');

  const iosSafariCaps: PlatformCapabilities = {
    isNative: false,
    hasARKitOrARCore: async () => false,
    hasWebXRImmersiveAR: async () => false,
    hasCamera: async () => true,
  };
  const overlay = await factory.create(iosSafariCaps);
  assert.equal(overlay?.kind, 'overlay');
  assert.equal(overlay?.supportsPlaneDetection, false);

  const noCameraCaps: PlatformCapabilities = {
    isNative: false,
    hasARKitOrARCore: async () => false,
    hasWebXRImmersiveAR: async () => false,
    hasCamera: async () => false,
  };
  const fallback = await factory.create(noCameraCaps);
  assert.equal(fallback, null);
});

test('배틀태그 닉네임(D-015), 일일 5개+보너스 쿼터(D-018), 카테고리 사후 수정(D-016) 및 소원 이루어짐 검증', async () => {
  assert.throws(() => new Nickname('a'), /NICKNAME_INVALID/);
  assert.throws(() => new Nickname('관리자사칭#real'), /NICKNAME_INVALID/);
  assert.throws(() => new Nickname('StoneWish#real'), /NICKNAME_INVALID/);

  const customTagNick = new Nickname('제미나이#real');
  assert.equal(customTagNick.value, '제미나이');
  assert.equal(customTagNick.tag, 'real');
  assert.equal(customTagNick.displayName, '제미나이#real');

  // 일일 5개 기본 쿼터 및 광고/결제 보너스 쿼터 검증 (D-018)
  let quota = new DailyWishQuota({ baseQuota: 5, bonusQuota: 0, usedCount: 5 });
  assert.equal(quota.canStack(), false);
  assert.throws(() => quota.consumeOne(), /DAILY_QUOTA_EXCEEDED/);
  quota = quota.grantRewardBonus(1);
  assert.equal(quota.remaining, 1);
  quota = quota.consumeOne();
  assert.equal(quota.remaining, 0);

  const repo = new InMemoryWishRepository();
  const effects = new EffectBus();
  const fulfillUseCase = new FulfillWishUseCase(repo, effects);

  const myWish = new Wish({
    id: 'w-99',
    isMine: true,
    content: '자격증 시험 합격',
    scope: TowerKey.global(),
    stone: new Stone({ shape: 'flat', color: '#AABBCC', pose: Pose.origin() }),
    status: 'active',
    bloom: null,
    cheerCount: 3,
    createdAt: new Date(),
  });

  assert.equal(myWish.category, 'study');
  myWish.changeCategory('job'); // 사후 카테고리 직접 수정 (D-016)
  assert.equal(myWish.category, 'job');

  const bloom = await fulfillUseCase.execute(myWish, 'flower');
  assert.equal(bloom, 'flower');
  assert.equal(myWish.status, 'fulfilled');
});

test('Spring Boot MSA 게이트웨이 어댑터: 로그인(JWT) -> 대시보드 돌탑/통계/랜덤소원 조회 -> 응원하기 연동이 동작한다 (D-013)', async () => {
  const requests: { method: string; url: string; auth?: string }[] = [];

  const mockGatewayFetch = async (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    requests.push({
      method: init?.method ?? 'GET',
      url,
      auth: headers['Authorization'],
    });

    if (url.endsWith('/api/v1/auth/login')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: 'jwt-msa-token-123',
          user: { id: 'user-1', nickname: '제미나이#real', isGuest: false },
        }),
      };
    }

    if (url.includes('/api/v1/towers/global/stats')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          stoneCount: 120,
          todayCount: 15,
          fulfilledCount: 8,
          cheerCount: 450,
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
              id: 'stone-1',
              stoneShape: 'round',
              stoneColor: '#A89F91',
              pose: { x: 0, y: 0.25, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 },
              status: 'active',
              bloomType: null,
              cheerLevel: 2,
              isMine: false,
              nickname: '해커노출시도#9999', // 공개 돌탑이므로 도메인에서 null로 강제 마스킹되어야 함
            },
          ],
          hasMore: false,
        }),
      };
    }

    if (url.includes('/api/v1/wishes/random?')) {
      return {
        ok: true,
        status: 200,
        json: async () => [
          {
            id: 'random-wish-1',
            content: '가족 모두 건강하길',
            categoryCode: 'health',
            groupId: null,
            stoneShape: 'pebble',
            stoneColor: '#D0C8B8',
            pose: { x: 0, y: 0.5, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 },
            status: 'active',
            bloomType: null,
            cheerLevel: 1,
            isMine: false,
            createdAt: new Date().toISOString(),
          },
        ],
      };
    }

    if (url.endsWith('/api/v1/wishes/random-wish-1/cheers')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ cheerLevel: 2, levelUp: true }),
      };
    }

    return { ok: false, status: 404, json: async () => ({ code: 'NOT_FOUND', message: 'Not Found' }) };
  };

  const container = createMsaAppContainer('http://localhost:8080', mockGatewayFetch);
  const session = await container.auth.signIn('kakao');
  assert.equal(session.user.nickname?.displayName, '제미나이#real');

  const controller = new DashboardController(container);
  const state = await controller.loadDashboard(TowerKey.global());

  assert.equal(state.tower?.stats.stoneCount, 120);
  assert.equal(state.tower?.stones[0].nickname, null);
  assert.equal(state.randomCards.length, 1);

  const cheerResult = await controller.cheerWish(state.randomCards[0]);
  assert.equal(cheerResult.level.level, 2);
  assert.equal(cheerResult.levelUp, true);
  assert.equal(controller.getState().lastEffect?.type, 'cheered');
  assert.equal(requests[1].auth, 'Bearer jwt-msa-token-123');
});
