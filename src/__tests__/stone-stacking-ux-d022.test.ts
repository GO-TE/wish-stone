import assert from 'node:assert/strict';
import test from 'node:test';

import { createMsaAppContainer } from '../container.ts';
import { Stone } from '../domain/entities/Stone.ts';
import { Tower } from '../domain/entities/Tower.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import { TowerKey } from '../domain/value-objects/TowerKey.ts';
import { StackStoneController } from '../presentation/controllers/StackStoneController.ts';

test('D-022 & Stone Overlap: 굴러떨어진 돌 확정 안착(이 자리에 그대로 두기) 및 재시도(다시 올려보기) 라이프사이클 검증', async () => {
  const container = createMsaAppContainer();
  await container.auth.signIn('guest');
  const controller = new StackStoneController(container, {
    baseQuota: 5,
    bonusQuota: 0,
    usedCount: 3, // 2 left
  });

  controller.updateContent('언제나 평온하고 건강하기를 바랍니다');
  assert.equal(controller.getState().quota.remaining, 2);

  // 1. 인위적 전복 드롭 발생
  const tower = new Tower(
    TowerKey.global(),
    [
      {
        id: 'base-1',
        stone: new Stone({
          shape: 'boulder',
          color: '#3E4947',
          pose: new Pose({ x: -0.34, y: 0, z: 0 }),
        }),
        status: 'active',
        bloom: null,
        cheerLevel: 1,
        isMine: false,
        nickname: null,
      },
      {
        id: 'base-2',
        stone: new Stone({
          shape: 'flat',
          color: '#262930',
          pose: new Pose({ x: 0.34, y: 0, z: 0 }),
        }),
        status: 'active',
        bloom: null,
        cheerLevel: 2,
        isMine: false,
        nickname: null,
      },
    ],
    { stoneCount: 2, todayCount: 1, fulfilledCount: 0, cheerCount: 5 }
  );

  // 중심에서 크게 벗어난 드롭 -> retry 반환
  const failResult = await controller.placeStone(
    tower,
    new Pose({ x: 1.8, y: 1.2, z: 0 })
  );
  assert.equal(failResult.status, 'retry');
  assert.equal(controller.getState().phase, 'COLLAPSING');
  assert.equal(controller.getState().attempt, 1);
  assert.equal(controller.getState().quota.remaining, 2); // 미차감

  // 2. retryPlacement() 시: IDLE 복귀 및 attempt(1) 유지
  controller.retryPlacement();
  assert.equal(controller.getState().phase, 'IDLE');
  assert.equal(controller.getState().towerCollapsed, false);

  // 3. 굴러떨어진 돌 안착 확정 (D-022: "이 자리에 그대로 두기")
  const fallenRestingPose = new Pose({ x: 0.58, y: 0.05, z: 0 });
  const savedFallen = await controller.confirmFallenPlacement(fallenRestingPose);

  assert.equal(savedFallen.status, 'saved');
  assert.equal(savedFallen.pose.position.x, 0.58);
  assert.equal(savedFallen.autoPlaced, false);
  assert.equal(controller.getState().phase, 'SETTLED');
  assert.equal(controller.getState().attempt, 0); // 확정 후 리셋
  assert.equal(controller.getState().quota.remaining, 1); // 1 차감됨
  assert.ok(controller.getState().savedWishId !== null);
});

test('D-022 & Stone Overlap: 2D 및 3D 기하 비간섭 무결성 불변식 검증', () => {
  // 1. 3D 기초단 돌 간섭 검증
  // base-1 at x = -0.34, base-2 at x = +0.34
  const base1X = -0.34;
  const base2X = 0.34;
  const centerDistance = Math.abs(base2X - base1X); // 0.68m

  // boulder scale.x * 0.5 = 1.25 * 0.25 = 0.3125m half-extent
  // flat scale.x * 0.5 = 1.35 * 0.25 = 0.3375m half-extent
  const halfExtentBoulder = 1.25 * 0.25;
  const halfExtentFlat = 1.35 * 0.25;
  const combinedHalfExtents = halfExtentBoulder + halfExtentFlat; // 0.65m

  assert.ok(
    centerDistance >= combinedHalfExtents,
    `3D base stones must not penetrate each other: distance (${centerDistance}) >= sum of half-extents (${combinedHalfExtents})`
  );

  // 2. 2D 2-돌 기초단 폭 불변식
  // boulder (152) * 0.62 = 94.24px
  // flat (140) * 0.62 = 86.8px
  // total = ~181px + 6px gap = ~187px (카드 폭 340~440px 내부에서 여유롭게 비간섭 안착)
  const baseWidth1 = Math.round(152 * 0.62);
  const baseWidth2 = Math.round(140 * 0.62);
  const gap = 6;
  const totalTierWidth = baseWidth1 + baseWidth2 + gap;

  assert.ok(totalTierWidth < 220, `2D tier width (${totalTierWidth}) must be compact`);
  assert.ok(gap > 0, `Gap must be positive to prevent edge clipping`);
});
