import test from 'node:test';
import assert from 'node:assert/strict';
import { Stone } from '../domain/entities/Stone.ts';
import { Tower } from '../domain/entities/Tower.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import { TowerKey } from '../domain/value-objects/TowerKey.ts';
import { createMsaAppContainer } from '../container.ts';
import { StackStoneController } from '../presentation/controllers/StackStoneController.ts';
import {
  resetTowerMeshTransforms,
} from '../presentation/components/stoneTowerSpec.ts';

type MockMesh = {
  position: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void };
  quaternion: { x: number; y: number; z: number; w: number; set: (x: number, y: number, z: number, w: number) => void };
  scale: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void };
};

function createTestTower(): Tower {
  return new Tower(
    TowerKey.global(),
    [
      {
        id: 'stone-0',
        stone: new Stone({
          shape: 'boulder',
          color: '#333333',
          pose: new Pose({ x: 0, y: 0.15, z: 0 }),
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
}

function createMockContainer(opts?: { shouldFailExecute?: boolean }) {
  const mockFetch = async (url: string) => {
    if (url.endsWith('/api/v1/auth/login')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: 'token-guest',
          user: { id: 'user-emp', nickname: 'Challenger#9999', isGuest: true },
        }),
      };
    }
    if (url.endsWith('/api/v1/wishes')) {
      return {
        ok: true,
        status: 201,
        json: async () => ({
          id: `wish-${Date.now()}-${Math.random()}`,
          createdAt: new Date().toISOString(),
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const container = createMsaAppContainer('http://localhost:8080', mockFetch as any);

  if (opts?.shouldFailExecute) {
    container.useCases.stackStone.execute = async (..._args: any[]) => {
      throw new Error('SIMULATED_PHYSICS_FAILURE');
    };
  }

  return container;
}

test('Challenger M2 Gate 2: Multi-Stone Session Isolation across 5 sequential stones', async () => {
  const container = createMockContainer();
  const controller = new StackStoneController(container, {
    baseQuota: 5,
    bonusQuota: 0,
    usedCount: 0,
  });

  const testTower = createTestTower();
  const farDrop = new Pose({ x: 3.5, y: 1.2, z: 0 }); // Unstable drop
  const centerDrop = new Pose({ x: 0, y: 0.65, z: 0 }); // Stable drop

  // Stone 1: 3 attempts -> auto-settles
  controller.updateContent('돌 1: 3회 실패 후 자동 안착');
  const s1_a1 = await controller.placeStone(testTower, farDrop);
  assert.equal(s1_a1.status, 'retry');
  assert.equal(controller.getState().attempt, 1);

  controller.resetPlacement();
  const s1_a2 = await controller.placeStone(testTower, farDrop);
  assert.equal(s1_a2.status, 'retry');
  assert.equal(controller.getState().attempt, 2);

  controller.resetPlacement();
  const s1_a3 = await controller.placeStone(testTower, farDrop);
  assert.equal(s1_a3.status, 'saved');
  assert.equal(s1_a3.autoPlaced, true);
  assert.equal(controller.getState().phase, 'SETTLED');
  assert.equal(controller.getState().attempt, 0, 'Clean attempt reset upon settlement');
  assert.equal(controller.getState().quota.remaining, 4);

  // Stone 2: starts fresh at attempt 0, receives retry on drop 1 and 2, auto-settles on 3
  controller.updateContent('돌 2: 새로운 소원');
  controller.startPlacing();
  assert.equal(controller.getState().attempt, 0);

  const s2_a1 = await controller.placeStone(testTower, farDrop);
  assert.equal(s2_a1.status, 'retry');
  assert.equal(s2_a1.attempt, 1);
  assert.equal(controller.getState().attempt, 1);

  controller.resetPlacement();
  const s2_a2 = await controller.placeStone(testTower, farDrop);
  assert.equal(s2_a2.status, 'retry');
  assert.equal(s2_a2.attempt, 2);

  controller.resetPlacement();
  const s2_a3 = await controller.placeStone(testTower, farDrop);
  assert.equal(s2_a3.status, 'saved');
  assert.equal(s2_a3.autoPlaced, true);
  assert.equal(controller.getState().attempt, 0);
  assert.equal(controller.getState().quota.remaining, 3);

  // Stone 3: direct drop from SETTLED without calling startPlacing()
  controller.updateContent('돌 3: 바로 드롭');
  const s3_a1 = await controller.placeStone(testTower, farDrop);
  assert.equal(s3_a1.status, 'retry');
  assert.equal(s3_a1.attempt, 1);

  controller.resetPlacement();
  const s3_a2 = await controller.placeStone(testTower, centerDrop);
  assert.equal(s3_a2.status, 'saved');
  assert.equal(s3_a2.autoPlaced, false);
  assert.equal(controller.getState().attempt, 0);
  assert.equal(controller.getState().quota.remaining, 2);

  // Stone 4: settles on attempt 1
  controller.updateContent('돌 4: 1회차 즉시 안착');
  controller.startPlacing();
  const s4_a1 = await controller.placeStone(testTower, centerDrop);
  assert.equal(s4_a1.status, 'saved');
  assert.equal(controller.getState().attempt, 0);
  assert.equal(controller.getState().quota.remaining, 1);

  // Stone 5: starts clean at attempt 0
  controller.updateContent('돌 5: 마지막 소원');
  controller.startPlacing();
  assert.equal(controller.getState().attempt, 0);
  const s5_a1 = await controller.placeStone(testTower, farDrop);
  assert.equal(s5_a1.status, 'retry');
  assert.equal(s5_a1.attempt, 1);
});

test('Challenger M2 Gate 2: isPlacing Re-Entrancy Defense under Burst Concurrency and Exception Safety', async () => {
  const container = createMockContainer();
  const controller = new StackStoneController(container, {
    baseQuota: 5,
    bonusQuota: 0,
    usedCount: 0,
  });

  const testTower = createTestTower();
  const farDrop = new Pose({ x: 3.5, y: 1.2, z: 0 });
  controller.updateContent('동시성 방어 테스트 소원');

  // 1. Burst concurrency of 10 simultaneous calls
  const burst = await Promise.allSettled(
    Array.from({ length: 10 }, () => controller.placeStone(testTower, farDrop))
  );

  const fulfilled = burst.filter((r) => r.status === 'fulfilled');
  const rejected = burst.filter((r) => r.status === 'rejected');

  assert.equal(fulfilled.length, 1, 'Exactly 1 burst call executed');
  assert.equal(rejected.length, 9, 'Exactly 9 burst calls rejected');
  for (const r of rejected) {
    if (r.status === 'rejected') {
      assert.equal((r.reason as Error).message, 'PLACEMENT_IN_PROGRESS');
    }
  }

  // 2. Controller is usable after burst resolution
  controller.resetPlacement();
  const res2 = await controller.placeStone(testTower, farDrop);
  assert.equal(res2.status, 'retry');
  assert.equal(controller.getState().attempt, 2);

  // 3. Exception safety: try/finally clears isPlacing
  const failingContainer = createMockContainer({ shouldFailExecute: true });
  const failingController = new StackStoneController(failingContainer, {
    baseQuota: 5,
    bonusQuota: 0,
    usedCount: 0,
  });
  failingController.updateContent('예외 안전성 검증 소원');

  await assert.rejects(
    () => failingController.placeStone(testTower, farDrop),
    /SIMULATED_PHYSICS_FAILURE/
  );

  failingController.resetPlacement();
  await assert.rejects(
    () => failingController.placeStone(testTower, farDrop),
    /SIMULATED_PHYSICS_FAILURE/,
    'isPlacing was properly unlocked in finally block'
  );

  // 4. Quota check precedes isPlacing
  const zeroQuota = new StackStoneController(container, {
    baseQuota: 0,
    bonusQuota: 0,
    usedCount: 0,
  });
  await assert.rejects(
    () => zeroQuota.placeStone(testTower, farDrop),
    /DAILY_QUOTA_EXCEEDED/
  );
});

test('Challenger M2 Gate 2: resetTowerMeshTransforms resets position and orientation without altering geometry scale', () => {
  const nodes = [
    {
      id: 'stone-0',
      position: { x: 0, y: 0.25, z: 0 },
      stone: new Stone({ shape: 'round', color: '#888', pose: Pose.origin() }),
    },
    {
      id: 'stone-1',
      position: { x: 0.05, y: 0.55, z: -0.02 },
      stone: new Stone({ shape: 'flat', color: '#999', pose: Pose.origin() }),
    },
  ];

  const meshMap = new Map<string, MockMesh>();
  const createMockMesh = (): MockMesh => ({
    position: {
      x: 99.9,
      y: 99.9,
      z: 99.9,
      set(x: number, y: number, z: number) {
        this.x = x;
        this.y = y;
        this.z = z;
      },
    },
    quaternion: {
      x: 0.5,
      y: 0.5,
      z: 0.5,
      w: 0.5,
      set(x: number, y: number, z: number, w: number) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.w = w;
      },
    },
    scale: {
      x: 0.25,
      y: 0.25,
      z: 0.25,
      set(x: number, y: number, z: number) {
        this.x = x;
        this.y = y;
        this.z = z;
      },
    },
  });

  meshMap.set('stone-0', createMockMesh());
  meshMap.set('stone-1', createMockMesh());
  const droppedMesh = createMockMesh();
  meshMap.set('dropped-stone', droppedMesh);

  const droppedStone = new Stone({
    shape: 'pebble',
    color: '#aaa',
    pose: new Pose({ x: 0.1, y: 0.85, z: 0 }),
  });

  resetTowerMeshTransforms(meshMap, nodes as any, droppedStone);

  const m0 = meshMap.get('stone-0')!;
  assert.equal(m0.position.x, 0);
  assert.equal(m0.position.y, 0.25);
  assert.equal(m0.position.z, 0);
  assert.equal(m0.quaternion.x, 0);
  assert.equal(m0.quaternion.y, 0);
  assert.equal(m0.quaternion.z, 0);
  assert.equal(m0.quaternion.w, 1);
  assert.equal(m0.scale.x, 0.25, 'Scale must not be overwritten');

  assert.equal(droppedMesh.position.x, 0.1);
  assert.equal(droppedMesh.position.y, 0.85);
  assert.equal(droppedMesh.quaternion.w, 1);
});
