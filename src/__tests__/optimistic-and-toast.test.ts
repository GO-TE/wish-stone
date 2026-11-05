import assert from 'node:assert/strict';
import test from 'node:test';

import { Stone } from '../domain/entities/Stone.ts';
import { Tower } from '../domain/entities/Tower.ts';
import { Wish, type WishId } from '../domain/entities/Wish.ts';
import { InMemoryEffectBus } from '../domain/ports/EffectBus.ts';
import {
  type NewWishInput,
  type WishRepository,
} from '../domain/ports/repositories.ts';
import { CheerLevel } from '../domain/value-objects/CheerLevel.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import { TowerKey } from '../domain/value-objects/TowerKey.ts';
import { OptimisticMutationManager } from '../infrastructure/cache/OptimisticMutationManager.ts';
import {
  EMOTIONAL_TOAST_PRESETS,
  ToastStore,
} from '../presentation/components/toastStore.ts';

class ControllableWishRepository implements WishRepository {
  shouldFailCheer = false;
  shouldFailCreate = false;
  createdCount = 0;

  async create(_input: NewWishInput): Promise<WishId> {
    if (this.shouldFailCreate) {
      throw new Error('NETWORK_TIMEOUT');
    }
    this.createdCount += 1;
    return `server-wish-${this.createdCount}`;
  }

  async random(): Promise<Wish[]> {
    return [];
  }

  async mine(): Promise<Wish[]> {
    return [];
  }

  async cheer(_id: WishId): Promise<{ level: CheerLevel; levelUp: boolean }> {
    if (this.shouldFailCheer) {
      throw new Error('NETWORK_OFFLINE');
    }
    return {
      level: CheerLevel.of(2),
      levelUp: true,
    };
  }

  async report(): Promise<void> {}

  async fulfill(_id: WishId, bloom = 'flower' as const) {
    return bloom;
  }

  async remove(): Promise<void> {}
}

test('ToastStore (SCR-01 ~ SCR-18): 응원 성공, 소원 삭제, 쿼터 충전, 네트워크 에러 감성 토스트 생성·구독·해제가 정상 동작한다', () => {
  const store = new ToastStore();
  let observedCount = 0;
  const unsub = store.subscribe((list) => {
    observedCount = list.length;
  });

  const cheerToast = store.showCheerSuccess();
  assert.equal(cheerToast.text, EMOTIONAL_TOAST_PRESETS.cheer.text);
  assert.ok(cheerToast.text.includes('누군가의 마음에 불꽃이 닿았습니다 🔥'));
  assert.equal(observedCount, 1);

  const deleteToast = store.showWishDeleted();
  assert.equal(deleteToast.variant, 'wish_deleted');
  assert.equal(observedCount, 2);

  const quotaToast = store.showQuotaCharged(2);
  assert.ok(quotaToast.text.includes('+2회'));
  assert.equal(observedCount, 3);

  store.dismiss(cheerToast.id);
  assert.equal(store.getToasts().length, 2);

  store.clear();
  assert.equal(store.getToasts().length, 0);
  unsub();
});

test('OptimisticMutationManager: 응원하기(cheerWish) 및 돌 올리기(placeStone) 호출 시 즉시 로컬 반영하고 서버 실패 시 스냅샷으로 롤백한다', async () => {
  const repo = new ControllableWishRepository();
  const effects = new InMemoryEffectBus();
  const toasts = new ToastStore();
  const manager = new OptimisticMutationManager(repo, effects, toasts);

  const baseStone = new Stone({
    shape: 'round',
    color: '#A89F91',
    pose: new Pose({ x: 0, y: 0.5, z: 0 }),
  });

  // 1) 응원하기 낙관적 업데이트 성공 시나리오
  const targetWish = new Wish({
    id: 'wish-opt-1',
    isMine: false,
    content: '올해 꼭 좋은 소식 있기를',
    scope: TowerKey.global(),
    stone: baseStone,
    status: 'active',
    bloom: null,
    cheerCount: 4, // 낙관적 +1 시 5개가 되어 2단계 상승
    createdAt: new Date(),
  });

  let optimisticObservedCheered = false;
  const cheerRes = await manager.cheerWishOptimistically(targetWish, (w) => {
    optimisticObservedCheered = w.cheeredByMe;
  });

  assert.equal(optimisticObservedCheered, true);
  assert.equal(cheerRes.rolledBack, false);
  assert.equal(cheerRes.confirmedLevel.level, 2);
  assert.equal(toasts.getToasts()[0]?.variant, 'cheer');

  // 2) 응원하기 서버 실패 시 스냅샷 롤백 및 네트워크 에러 토스트 검증
  toasts.clear();
  repo.shouldFailCheer = true;

  const failingWish = new Wish({
    id: 'wish-opt-2',
    isMine: false,
    content: '네트워크 오프라인 롤백 테스트 소원',
    scope: TowerKey.global(),
    stone: baseStone,
    status: 'active',
    bloom: null,
    cheerCount: 0,
    createdAt: new Date(),
  });

  let rolledBackWish: Wish | null = null;
  await assert.rejects(
    () =>
      manager.cheerWishOptimistically(
        failingWish,
        undefined,
        (restored) => {
          rolledBackWish = restored;
        }
      ),
    /NETWORK_OFFLINE/
  );
  assert.ok(rolledBackWish !== null);
  assert.equal((rolledBackWish as Wish).cheeredByMe, false);
  assert.equal((rolledBackWish as Wish).cheerLevel().level, 0);
  assert.equal(toasts.getToasts()[0]?.variant, 'network_error');

  // 3) 돌 올리기(placeStone) 낙관적 반영 및 확정 ID 치환 검증
  toasts.clear();
  repo.shouldFailCreate = false;

  const initialTower = new Tower(
    TowerKey.global(),
    [
      {
        id: 'existing-1',
        stone: baseStone,
        status: 'active',
        bloom: null,
        cheerLevel: 1,
        isMine: false,
        nickname: null,
      },
    ],
    { stoneCount: 1, todayCount: 1, fulfilledCount: 0, cheerCount: 1 }
  );

  let optimisticStoneCount = 0;
  const placeRes = await manager.placeStoneOptimistically(
    initialTower,
    {
      content: '새로 올리는 소원 돌',
      category: 'job',
      scope: TowerKey.global(),
      stone: new Stone({ shape: 'tall', color: '#D6C7B2', pose: Pose.origin() }),
    },
    new Pose({ x: 0, y: 0.85, z: 0 }),
    (optTower) => {
      optimisticStoneCount = optTower.stones.length;
    }
  );

  assert.equal(optimisticStoneCount, 2); // 네트워크 응답 전에 이미 2개로 증가
  assert.ok(placeRes.tempId.startsWith('optimistic-stone-'));
  assert.equal(placeRes.savedId, 'server-wish-1');
  assert.equal(placeRes.finalTower.stones[1].id, 'server-wish-1');
  assert.equal(placeRes.finalTower.stats.stoneCount, 2);

  // 4) 돌 올리기 서버 실패 시 원본 Tower로 즉시 롤백 검증
  repo.shouldFailCreate = true;
  let restoredTowerSnapshot: Tower | null = null;

  await assert.rejects(
    () =>
      manager.placeStoneOptimistically(
        initialTower,
        {
          content: '실패 시 롤백될 소원 돌',
          category: 'study',
          scope: TowerKey.global(),
          stone: baseStone,
        },
        new Pose({ x: 0, y: 0.85, z: 0 }),
        undefined,
        (restored) => {
          restoredTowerSnapshot = restored;
        }
      ),
    /NETWORK_TIMEOUT/
  );

  assert.ok(restoredTowerSnapshot !== null);
  assert.equal((restoredTowerSnapshot as Tower).stones.length, 1);
  assert.equal((restoredTowerSnapshot as Tower).stats.stoneCount, 1);
  assert.equal(toasts.getToasts()[0]?.variant, 'network_error');
});
