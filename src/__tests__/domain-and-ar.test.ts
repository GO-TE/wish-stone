import assert from 'node:assert/strict';
import test from 'node:test';

import { CheerWishUseCase } from '../application/usecases/CheerWishUseCase.ts';
import { FulfillWishUseCase } from '../application/usecases/FulfillWishUseCase.ts';
import { StackStoneUseCase } from '../application/usecases/StackStoneUseCase.ts';
import { Stone } from '../domain/entities/Stone.ts';
import { Tower } from '../domain/entities/Tower.ts';
import { Wish, type WishId } from '../domain/entities/Wish.ts';
import { EffectBus, type VisualEffectEvent } from '../domain/ports/EffectBus.ts';
import {
  type NewWishInput,
  type WishRepository,
} from '../domain/ports/repositories.ts';
import { CheerLevel } from '../domain/value-objects/CheerLevel.ts';
import { Nickname } from '../domain/value-objects/Nickname.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import { TowerKey } from '../domain/value-objects/TowerKey.ts';
import { ARSessionFactory } from '../infrastructure/ar/ARSessionFactory.ts';
import { createMsaAppContainer } from '../container.ts';
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

  async getById(): Promise<Wish | null> {
    return null;
  }

  async mine(): Promise<Wish[]> {
    return [];
  }

  async cheer(id: WishId): Promise<{ level: CheerLevel; levelUp: boolean }> {
    const prev = this.cheerCountMap.get(id) ?? 9;
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

test('익명성 규칙: 전체/카테고리 돌탑에서는 닉네임을 숨기고 그룹 돌탑에서만 노출한다 (DB-005, DB-023)', () => {
  const stone = new Stone({
    shape: 'round',
    color: '#A89F91',
    pose: Pose.origin(),
  });

  const publicWish = new Wish({
    id: 'w-1',
    authorNickname: '돌탑지기',
    isMine: false,
    content: '올해 취업 성공하게 해주세요',
    category: 'job',
    scope: TowerKey.global(),
    stone,
    status: 'active',
    bloom: null,
    cheerCount: 25,
    createdAt: new Date(),
  });

  const groupWish = new Wish({
    id: 'w-2',
    authorNickname: '돌탑지기',
    isMine: false,
    content: '우리 스터디 전원 합격!',
    category: 'study',
    scope: TowerKey.group('group-123'),
    stone,
    status: 'active',
    bloom: null,
    cheerCount: 25,
    createdAt: new Date(),
  });

  assert.equal(publicWish.displayNickname, null);
  assert.equal(groupWish.displayNickname, '돌탑지기');
  assert.equal(publicWish.visibleCheerCount, null);
  assert.equal(publicWish.cheerLevel().level, 1);
});

test('응원 유스케이스: 타인 소원 응원 시 10번째 응원에서 단계 상승(levelUp) 이벤트가 발행된다 (DB-016, DB-017)', async () => {
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
    content: '건강하게 해주세요',
    category: 'health',
    scope: TowerKey.global(),
    stone,
    status: 'active',
    bloom: null,
    cheerCount: 9,
    createdAt: new Date(),
  });

  const res = await useCase.execute(targetWish);
  assert.equal(res.level.level, 1);
  assert.equal(res.levelUp, true);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'cheered');
});

test('돌 쌓기 유스케이스: 반경 밖 드롭 시 1~2회차는 retry를 반환하고, 3회차 실패 시 탑 꼭대기에 자동 안착한다 (SCR-08)', async () => {
  const repo = new InMemoryWishRepository();
  const physics = new SimpleTowerPhysicsWorld(0.4, 0.25);
  const effects = new EffectBus();
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
    content: '소원을 담은 돌',
    category: 'etc' as const,
    scope: TowerKey.global(),
    stone: new Stone({ shape: 'pebble', color: '#CCCCCC', pose: Pose.origin() }),
  };

  // 중심에서 너무 먼 위치(x = 2.0)에 놓아 떨어지는 상황
  const farDrop = new Pose({ x: 2.0, y: 1.5, z: 0 });

  const attempt1 = await useCase.execute(draft, tower, farDrop, 1);
  assert.equal(attempt1.status, 'retry');

  const attempt2 = await useCase.execute(draft, tower, farDrop, 2);
  assert.equal(attempt2.status, 'retry');

  const attempt3 = await useCase.execute(draft, tower, farDrop, 3);
  assert.equal(attempt3.status, 'saved');
  if (attempt3.status === 'saved') {
    assert.equal(attempt3.autoPlaced, true);
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

test('소원 이루어짐 및 닉네임 검증 규칙이 정상 동작한다 (DB-001, DB-020)', async () => {
  assert.throws(() => new Nickname('a'), /NICKNAME_INVALID/);
  assert.throws(() => new Nickname('관리자사칭'), /NICKNAME_INVALID/);
  assert.equal(new Nickname('소원돌탑').value, '소원돌탑');

  const repo = new InMemoryWishRepository();
  const effects = new EffectBus();
  const fulfillUseCase = new FulfillWishUseCase(repo, effects);

  const myWish = new Wish({
    id: 'w-99',
    isMine: true,
    content: '자격증 시험 합격',
    category: 'study',
    scope: TowerKey.global(),
    stone: new Stone({ shape: 'flat', color: '#AABBCC', pose: Pose.origin() }),
    status: 'active',
    bloom: null,
    cheerCount: 3,
    createdAt: new Date(),
  });

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
          user: { id: 'user-1', nickname: '돌탑장인', isGuest: false },
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
              nickname: '해커노출시도', // 공개 돌탑이므로 도메인에서 null로 강제 마스킹되어야 함
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
  assert.equal(session.user.nickname?.value, '돌탑장인');

  const controller = new DashboardController(container);
  const state = await controller.loadDashboard(TowerKey.global());

  assert.equal(state.tower?.stats.stoneCount, 120);
  // 설령 서버에서 실수로 nickname을 내려주더라도 공개 돌탑 엔티티가 null로 마스킹하는지 검증
  assert.equal(state.tower?.stones[0].nickname, null);
  assert.equal(state.randomCards.length, 1);

  const cheerResult = await controller.cheerWish(state.randomCards[0]);
  assert.equal(cheerResult.level.level, 2);
  assert.equal(cheerResult.levelUp, true);
  assert.equal(controller.getState().lastEffect?.type, 'cheered');
  assert.equal(requests[1].auth, 'Bearer jwt-msa-token-123');
});
