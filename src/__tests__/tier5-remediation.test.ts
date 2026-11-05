import test from 'node:test';
import assert from 'node:assert/strict';

import { StabilityEvaluator } from '../infrastructure/physics/StabilityEvaluator.ts';
import { interpolateTrajectoryFrame } from '../presentation/components/stoneTowerSpec.ts';
import { StackStoneController } from '../presentation/controllers/StackStoneController.ts';
import { createMsaAppContainer } from '../container.ts';
import { Tower } from '../domain/entities/Tower.ts';
import { TowerKey } from '../domain/value-objects/TowerKey.ts';
import { Stone } from '../domain/entities/Stone.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import type { SimulationFrame } from '../domain/ports/PhysicsWorld.ts';

test('Tier 5 Remediation 1: StabilityEvaluator Non-Finite COM Coordinate Sanitization', () => {
  const polygon: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];

  // NaN variations
  const testCases = [
    { x: NaN, y: 1.0, z: NaN, desc: 'x and z NaN' },
    { x: NaN, y: 1.0, z: 0.0, desc: 'x NaN only' },
    { x: 0.0, y: 1.0, z: NaN, desc: 'z NaN only' },
    { x: 0.0, y: NaN, z: 0.0, desc: 'y NaN only' },
    { x: Infinity, y: 1.0, z: 0.0, desc: 'x +Infinity' },
    { x: -Infinity, y: 1.0, z: 0.0, desc: 'x -Infinity' },
    { x: 0.0, y: Infinity, z: 0.0, desc: 'y +Infinity' },
    { x: 0.0, y: -Infinity, z: 0.0, desc: 'y -Infinity' },
    { x: 0.0, y: 1.0, z: Infinity, desc: 'z +Infinity' },
    { x: 0.0, y: 1.0, z: -Infinity, desc: 'z -Infinity' },
  ];

  for (const tc of testCases) {
    const res = StabilityEvaluator.evaluateStability(
      { x: tc.x, y: tc.y, z: tc.z },
      polygon,
      1.0
    );

    assert.equal(
      res.isStable,
      false,
      `Non-finite COM (${tc.desc}) must evaluate to isStable: false`
    );
    assert.equal(
      res.marginDistance,
      -Infinity,
      `Non-finite COM (${tc.desc}) must evaluate to marginDistance: -Infinity`
    );
    assert.equal(
      res.nearestEdgeDistance,
      0,
      `Non-finite COM (${tc.desc}) must evaluate to nearestEdgeDistance: 0`
    );
  }

  // Normal finite coordinates must still work correctly
  const stableRes = StabilityEvaluator.evaluateStability(
    { x: 0, y: 1.0, z: 0 },
    polygon,
    1.0
  );
  assert.equal(stableRes.isStable, true, 'Finite COM inside polygon must be stable');
  assert.ok(stableRes.marginDistance > 0, 'Finite COM inside polygon has positive margin');

  const unstableRes = StabilityEvaluator.evaluateStability(
    { x: 2.0, y: 1.0, z: 0 },
    polygon,
    1.0
  );
  assert.equal(unstableRes.isStable, false, 'Finite COM outside polygon must be unstable');
  assert.ok(unstableRes.marginDistance < 0, 'Finite COM outside polygon has negative margin');
});

test('Tier 5 Remediation 2: interpolateTrajectoryFrame Non-Finite Elapsed Time Sanitization', () => {
  const trajectory: SimulationFrame[] = [
    {
      step: 0,
      time: 0,
      poses: new Map([
        ['stone-1', new Pose({ x: 0, y: 0.1, z: 0 }, { qx: 0, qy: 0, qz: 0, qw: 1 })],
      ]),
    },
    {
      step: 1,
      time: 1 / 60,
      poses: new Map([
        ['stone-1', new Pose({ x: 0.1, y: 0.2, z: 0.3 }, { qx: 0, qy: 0, qz: 0, qw: 1 })],
      ]),
    },
    {
      step: 2,
      time: 2 / 60,
      poses: new Map([
        ['stone-1', new Pose({ x: 0.2, y: 0.3, z: 0.6 }, { qx: 0, qy: 0, qz: 0, qw: 1 })],
      ]),
    },
  ];

  // Test NaN, +Infinity, -Infinity, negative numbers
  const nonFiniteTimes = [NaN, Infinity, -Infinity, -0.5, 0];

  for (const t of nonFiniteTimes) {
    const res = interpolateTrajectoryFrame(trajectory, t);
    assert.equal(typeof res, 'object');
    assert.equal(res.currentStep, 0, `Elapsed time ${t} should fall back to step 0`);
    assert.equal(res.isComplete, false, `Multi-step trajectory at fallback step 0 is not complete`);
    const pose = res.poses.get('stone-1');
    assert.ok(pose, `Pose for stone-1 exists at time ${t}`);
    assert.equal(pose?.position.y, 0.1, `Pose position corresponds to frame 0`);
  }

  // Normal interpolation between frame 0 and 1
  const midRes = interpolateTrajectoryFrame(trajectory, 0.5 / 60);
  assert.equal(midRes.isComplete, false);
  const midPose = midRes.poses.get('stone-1');
  assert.ok(midPose);
  assert.ok(Math.abs(midPose.position.x - 0.05) < 1e-4);

  // Normal completion at or past end
  const endRes = interpolateTrajectoryFrame(trajectory, 10.0);
  assert.equal(endRes.isComplete, true);
  assert.equal(endRes.currentStep, 2);
  const endPose = endRes.poses.get('stone-1');
  assert.ok(endPose);
  assert.equal(endPose.position.y, 0.3);
});

test('Tier 5 Remediation 3: StackStoneController Exception Recovery & Lockout Defense', async () => {
  let shouldFail = true;

  const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/v1/auth')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: 'test-jwt',
          user: { id: 'tester', nickname: 'Tester', isGuest: true },
        }),
      };
    }
    if (url.includes('/api/v1/wishes') && init?.method === 'POST') {
      if (shouldFail) {
        throw new Error('MSA_NETWORK_TIMEOUT_DISRUPTION');
      }
      return {
        ok: true,
        status: 201,
        json: async () => ({
          id: 'wish-recovered-1',
          content: '복구 완료 소원',
          category: 'peace',
          scope: 'global',
          createdAt: new Date().toISOString(),
          cheerCount: 0,
          isFulfilled: false,
          isMine: true,
          stone: {
            id: 'stone-rec',
            shape: 'round',
            color: '#888888',
            pose: { position: { x: 0, y: 0.3, z: 0 }, rotation: { qx: 0, qy: 0, qz: 0, qw: 1 } },
          },
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const container = createMsaAppContainer('http://localhost:8080', mockFetch as any);
  await container.auth.signIn('guest');
  const controller = new StackStoneController(container);
  controller.updateContent('복구 검증 소원');

  const emptyTower = new Tower(TowerKey.global(), [], {
    stoneCount: 0,
    todayCount: 0,
    fulfilledCount: 0,
    cheerCount: 0,
  });

  // 1. Initial attempt fails with network exception
  shouldFail = true;
  await assert.rejects(
    () => controller.placeStone(emptyTower, new Pose({ x: 0, y: 0.5, z: 0 })),
    /MSA_NETWORK_TIMEOUT_DISRUPTION/
  );

  // 2. Controller phase MUST be IDLE (not locked in BALANCING)
  assert.equal(
    controller.getState().phase,
    'IDLE',
    'Controller phase must reset to IDLE on use-case exception'
  );

  // 3. Second attempt immediately afterwards must NOT throw PLACEMENT_IN_PROGRESS
  // Instead, it executes cleanly!
  shouldFail = false;
  const result = await controller.placeStone(emptyTower, new Pose({ x: 0, y: 0.5, z: 0 }));
  assert.equal(result.status, 'saved');
  assert.equal(controller.getState().phase, 'SETTLED');
  assert.equal(controller.getState().attempt, 0);

  // 4. Repeated exceptions maintain phase IDLE
  controller.resetPlacement();
  assert.equal(controller.getState().phase, 'IDLE');
  shouldFail = true;
  for (let i = 0; i < 3; i++) {
    await assert.rejects(
      () => controller.placeStone(emptyTower, new Pose({ x: 0, y: 0.5, z: 0 })),
      /MSA_NETWORK_TIMEOUT_DISRUPTION/
    );
    assert.equal(
      controller.getState().phase,
      'IDLE',
      `After exception ${i + 1}, phase must always return to IDLE`
    );
  }
});
