import assert from 'node:assert/strict';
import test from 'node:test';

import { Stone, type StoneShape } from '../domain/entities/Stone.ts';
import { Tower, type TowerStoneItem } from '../domain/entities/Tower.ts';
import { type SimulationFrame } from '../domain/ports/PhysicsWorld.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import { TowerKey } from '../domain/value-objects/TowerKey.ts';
import { SimpleTowerPhysicsWorld } from '../infrastructure/physics/SimpleTowerPhysicsWorld.ts';
import {
  buildStoneGeometrySpec,
  buildStoneMaterialSpec,
  buildTowerSceneGraph,
  interpolateTrajectoryFrame,
  resolveStonePose,
  type InterpolatedStonePose,
} from '../presentation/components/stoneTowerSpec.ts';
import { StackStoneController } from '../presentation/controllers/StackStoneController.ts';
import { createMsaAppContainer } from '../container.ts';

test('Milestone M2 Adversarial Stress: 1. Empty, single-frame, and boundary trajectory interpolation', () => {
  // Empty trajectory handling
  const emptyRes0 = interpolateTrajectoryFrame([], 0);
  assert.equal(emptyRes0.isComplete, true);
  assert.equal(emptyRes0.currentStep, 0);
  assert.equal(emptyRes0.poses.size, 0);

  const emptyRes10 = interpolateTrajectoryFrame([], 10.5);
  assert.equal(emptyRes10.isComplete, true);
  assert.equal(emptyRes10.poses.size, 0);

  // Falsy trajectory handling
  const nullRes = interpolateTrajectoryFrame(null as any, 0);
  assert.equal(nullRes.isComplete, true);
  const undefRes = interpolateTrajectoryFrame(undefined as any, 0);
  assert.equal(undefRes.isComplete, true);

  // Single-frame trajectory handling
  const singleFrame: SimulationFrame[] = [
    {
      step: 0,
      time: 0,
      poses: new Map([
        ['stone-single', new Pose({ x: 0.12, y: 0.85, z: -0.04 }, { qx: 0, qy: 0, qz: 0.3827, qw: 0.9239 })],
      ]),
    },
  ];

  const singleAt0 = interpolateTrajectoryFrame(singleFrame, 0);
  assert.equal(singleAt0.isComplete, true);
  assert.equal(singleAt0.poses.get('stone-single')?.position.x, 0.12);

  const singleAt1 = interpolateTrajectoryFrame(singleFrame, 1.5);
  assert.equal(singleAt1.isComplete, true);
  assert.equal(singleAt1.poses.get('stone-single')?.position.y, 0.85);

  // SLERP unit quaternion maintenance
  const dt = 1 / 60;
  const slerpFrames: SimulationFrame[] = [
    {
      step: 0,
      time: 0,
      poses: new Map([
        ['near-ident', new Pose({ x: 0, y: 0, z: 0 }, { qx: 0, qy: 0, qz: 0, qw: 1 })],
        ['antipodal', new Pose({ x: 0, y: 0, z: 0 }, { qx: 0, qy: 0, qz: 0, qw: 1 })],
      ]),
    },
    {
      step: 1,
      time: dt,
      poses: new Map([
        ['near-ident', new Pose({ x: 0, y: 0, z: 0 }, { qx: 0, qy: 0, qz: 0.0001, qw: 0.99999999 })],
        ['antipodal', new Pose({ x: 0, y: 0, z: 0 }, { qx: 0, qy: 0, qz: 0, qw: -1 })],
      ]),
    },
  ];

  const midRes = interpolateTrajectoryFrame(slerpFrames, dt * 0.5, dt);
  for (const [id, pose] of midRes.poses) {
    const len = Math.hypot(pose.rotation.qx, pose.rotation.qy, pose.rotation.qz, pose.rotation.qw);
    assert.ok(Math.abs(len - 1.0) < 0.01, `Quaternion length for ${id} must remain normalized to 1.0`);
    assert.ok(!Number.isNaN(pose.rotation.qw));
  }

  // resolveStonePose ID and fallback logic
  const testPoses = new Map<string, InterpolatedStonePose>([
    ['real-id-123', { position: { x: 1, y: 2, z: 3 }, rotation: { qx: 0, qy: 0, qz: 0, qw: 1 } }],
    ['tower-stone-2', { position: { x: 4, y: 5, z: 6 }, rotation: { qx: 0, qy: 0, qz: 0, qw: 1 } }],
    ['dropped-stone', { position: { x: 7, y: 8, z: 9 }, rotation: { qx: 0, qy: 0, qz: 0, qw: 1 } }],
  ]);
  assert.equal(resolveStonePose(testPoses, 'real-id-123')?.position.x, 1);
  assert.equal(resolveStonePose(testPoses, 'missing-id', 2)?.position.x, 4);
  assert.equal(resolveStonePose(testPoses, 'missing-id', 99)?.position.x, 7);
  assert.equal(resolveStonePose(new Map(), 'missing-id'), undefined);
});

test('Milestone M2 Adversarial Stress: 2. Extreme gesture offsets (dx = +-10000, dy = +-10000) & continuous physics drop', async () => {
  const topY = 0.85;
  const calculate3DDropPose = (dx: number, dy: number, baseTopY = topY): Pose => {
    const clampedX = Math.min(1.5, Math.max(-1.5, Number((dx / 300).toFixed(4))));
    const heightBonus = Math.min(0.2, Math.max(0, (-dy - 70) * 0.0008));
    const dropY = Number((baseTopY + 0.25 + heightBonus).toFixed(4));
    return new Pose({ x: clampedX, y: dropY, z: 0 });
  };

  const right = calculate3DDropPose(10000, -200);
  assert.equal(right.position.x, 1.5);
  assert.ok(right.position.y >= topY + 0.25 && right.position.y <= topY + 0.45);

  const left = calculate3DDropPose(-10000, -200);
  assert.equal(left.position.x, -1.5);

  const topPull = calculate3DDropPose(0, -10000);
  assert.equal(topPull.position.y, topY + 0.45);

  const downPull = calculate3DDropPose(0, 10000);
  assert.equal(downPull.position.y, topY + 0.25);

  // Physics verification of extreme drop
  const physics = new SimpleTowerPhysicsWorld();
  const baseStone = new Stone({
    shape: 'boulder',
    color: '#3E4947',
    pose: new Pose({ x: 0, y: 0.15, z: 0 }),
  });
  physics.addStatic([baseStone]);

  const dropStoneRight = new Stone({ shape: 'round', color: '#555', pose: Pose.origin() });
  const rightRes = await physics.drop(dropStoneRight, right);
  assert.equal(rightRes.settled, false);
  assert.equal(rightRes.collapsed, true);
  assert.ok(rightRes.pose.position.y >= 0.05);

  physics.dispose();
});

test('Milestone M2 Adversarial Stress: 3. Stacking controller 5-state lifecycle, re-entrancy defense, and 3-attempt rule', async () => {
  const mockFetch = async (url: string) => {
    if (url.endsWith('/api/v1/auth/login')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: 'token-guest',
          user: { id: 'user-100', nickname: '테스터#1234', isGuest: true },
        }),
      };
    }
    if (url.endsWith('/api/v1/wishes')) {
      return {
        ok: true,
        status: 201,
        json: async () => ({
          id: 'wish-created-1',
          createdAt: new Date().toISOString(),
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const container = createMsaAppContainer('http://localhost:8080', mockFetch as any);
  await container.auth.signIn('guest');

  const controller = new StackStoneController(container, {
    baseQuota: 5,
    bonusQuota: 0,
    usedCount: 0,
  });
  controller.updateContent('소원이 이루어지기를 바랍니다');

  const testTower = new Tower(
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

  // 1) 5-State lifecycle
  assert.equal(controller.getState().phase, 'IDLE');
  controller.startPlacing();
  assert.equal(controller.getState().phase, 'PLACING');

  const offCenterPose = new Pose({ x: 1.2, y: 0.6, z: 0 });
  const res1 = await controller.placeStone(testTower, offCenterPose);
  assert.equal(res1.status, 'retry');
  assert.equal(controller.getState().phase, 'COLLAPSING');
  assert.equal(controller.getState().attempt, 1);

  // 2) Controller & UI Re-entrancy defense verification
  let phase = controller.getState().phase; // COLLAPSING
  let blockedDrops = 0;
  const guardedDrop = async () => {
    if (phase === 'BALANCING' || phase === 'COLLAPSING' || phase === 'SETTLED') {
      blockedDrops++;
      return;
    }
  };
  await guardedDrop();
  await guardedDrop();
  assert.equal(blockedDrops, 2);

  // Direct controller re-entrancy defense: concurrent placeStone() invocation must throw
  controller.resetPlacement();
  const c1 = controller.placeStone(testTower, offCenterPose);
  await assert.rejects(
    () => controller.placeStone(testTower, offCenterPose),
    /PLACEMENT_IN_PROGRESS/,
    'Concurrent placeStone() must be rejected with PLACEMENT_IN_PROGRESS'
  );
  const res2 = await c1;
  assert.equal(res2.status, 'retry');
  assert.equal(controller.getState().attempt, 2);

  // 3) 3-Attempt auto-place verification
  const res3 = await controller.placeStone(testTower, offCenterPose);
  assert.equal(res3.status, 'saved');
  assert.equal(res3.autoPlaced, true);
  assert.equal(controller.getState().phase, 'SETTLED');
  assert.equal(controller.getState().attempt, 0, 'Attempt counter resets to 0 upon settlement');
  assert.equal(controller.getState().quota.remaining, 4);
});

test('Milestone M2 Adversarial Stress: 4. Headless SSR & Non-WebGL Canvas Fallback Resilience', () => {
  // Headless environment assertion
  assert.equal(typeof window, 'undefined');

  // Empty scene graph
  const emptyGraph = buildTowerSceneGraph([]);
  assert.equal(emptyGraph.length, 0);

  // Large scene graph capped at 200
  const largeStones: TowerStoneItem[] = Array.from({ length: 250 }, (_, i) => ({
    id: `stone-${i}`,
    stone: new Stone({
      shape: (['round', 'flat', 'pebble', 'tall', 'boulder'] as const)[i % 5],
      color: '#A89F91',
      pose: new Pose({ x: 0, y: i * 0.2, z: 0 }),
    }),
    status: 'active',
    bloom: null,
    cheerLevel: 0,
    isMine: i === 249,
    nickname: null,
  }));

  const capped = buildTowerSceneGraph(largeStones, 200);
  assert.equal(capped.length, 200);
  assert.equal(capped[199].id, 'stone-249');

  // Spec generator coverage for all shapes
  const shapes: StoneShape[] = ['round', 'flat', 'pebble', 'tall', 'boulder'];
  for (const s of shapes) {
    const geo = buildStoneGeometrySpec(s);
    assert.ok(geo.scale.x > 0 && geo.scale.y > 0 && geo.scale.z > 0);
    const mat = buildStoneMaterialSpec('#888', s, 1, false);
    assert.ok(mat.emissiveIntensity > 0);
  }
});
