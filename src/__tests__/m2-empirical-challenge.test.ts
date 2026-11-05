import assert from 'node:assert/strict';
import test from 'node:test';

import { Stone } from '../domain/entities/Stone.ts';
import { Tower } from '../domain/entities/Tower.ts';
import { type SimulationFrame } from '../domain/ports/PhysicsWorld.ts';
import { Pose, type Quat } from '../domain/value-objects/Pose.ts';
import { TowerKey } from '../domain/value-objects/TowerKey.ts';
import {
  interpolateTrajectoryFrame,
  resolveStonePose,
} from '../presentation/components/stoneTowerSpec.ts';
import { StackStoneController } from '../presentation/controllers/StackStoneController.ts';
import { createMsaAppContainer } from '../container.ts';

function createMockFetch() {
  let createdCount = 0;
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/v1/wishes') && init?.method === 'POST') {
      createdCount++;
      return new Response(
        JSON.stringify({
          id: `emp-wish-${createdCount}`,
          content: '소원',
          category: 'job',
          scope: 'global',
          stone: {
            shape: 'round',
            color: '#808080',
            pose: { position: { x: 0, y: 1.0, z: 0 }, rotation: { qx: 0, qy: 0, qz: 0, qw: 1 } },
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };
}

// -----------------------------------------------------------------------------
// PART 1: interpolateTrajectoryFrame & resolveStonePose Empirical Stress Tests
// -----------------------------------------------------------------------------

test('Empirical M2.1: interpolateTrajectoryFrame - Empty and Single-Frame Edge Cases', () => {
  // Empty trajectory
  const emptyRes = interpolateTrajectoryFrame([], 0);
  assert.equal(emptyRes.isComplete, true);
  assert.equal(emptyRes.currentStep, 0);
  assert.equal(emptyRes.poses.size, 0);

  // Single-frame trajectory
  const singleFrame: SimulationFrame[] = [
    {
      step: 0,
      time: 0,
      poses: new Map([
        ['stone-1', new Pose({ x: 1, y: 2, z: 3 }, { qx: 0, qy: 0, qz: 0, qw: 1 })],
      ]),
    },
  ];
  const singleAtZero = interpolateTrajectoryFrame(singleFrame, 0);
  assert.equal(singleAtZero.isComplete, true);
  assert.equal(singleAtZero.currentStep, 0);
  assert.deepEqual(singleAtZero.poses.get('stone-1')?.position, { x: 1, y: 2, z: 3 });

  const singleAtFuture = interpolateTrajectoryFrame(singleFrame, 10.0);
  assert.equal(singleAtFuture.isComplete, true);
  assert.equal(singleAtFuture.currentStep, 0);
  assert.deepEqual(singleAtFuture.poses.get('stone-1')?.position, { x: 1, y: 2, z: 3 });
});

test('Empirical M2.2: interpolateTrajectoryFrame - Boundary Timestamps (t < 0, t = 0, t = t_end, t > t_end)', () => {
  const dt = 1 / 60;
  const traj: SimulationFrame[] = [
    {
      step: 0,
      time: 0,
      poses: new Map([
        ['s1', new Pose({ x: 0, y: 0, z: 0 }, { qx: 0, qy: 0, qz: 0, qw: 1 })],
      ]),
    },
    {
      step: 1,
      time: dt,
      poses: new Map([
        ['s1', new Pose({ x: 1, y: 2, z: 3 }, { qx: 0, qy: 0.7071, qz: 0, qw: 0.7071 })],
      ]),
    },
    {
      step: 2,
      time: 2 * dt,
      poses: new Map([
        ['s1', new Pose({ x: 2, y: 4, z: 6 }, { qx: 0, qy: 1, qz: 0, qw: 0 })],
      ]),
    },
  ];

  // Negative time should clamp to frame 0
  const neg = interpolateTrajectoryFrame(traj, -0.5, dt);
  assert.equal(neg.isComplete, false);
  assert.equal(neg.currentStep, 0);
  assert.deepEqual(neg.poses.get('s1')?.position, { x: 0, y: 0, z: 0 });

  // Exact t = 0
  const t0 = interpolateTrajectoryFrame(traj, 0, dt);
  assert.equal(t0.isComplete, false);
  assert.equal(t0.currentStep, 0);
  assert.deepEqual(t0.poses.get('s1')?.position, { x: 0, y: 0, z: 0 });

  // Sub-frame epsilon: t = 0.000001s
  const tEps = interpolateTrajectoryFrame(traj, 0.000001, dt);
  assert.equal(tEps.isComplete, false);
  assert.equal(tEps.currentStep, 0);
  assert.ok(Math.abs((tEps.poses.get('s1')?.position.x ?? 999) - 0) < 0.01);

  // Exact t = t_end ((N - 1) * dt = 2 * dt)
  const tEnd = interpolateTrajectoryFrame(traj, 2 * dt, dt);
  assert.equal(tEnd.isComplete, true);
  assert.equal(tEnd.currentStep, 2);
  assert.deepEqual(tEnd.poses.get('s1')?.position, { x: 2, y: 4, z: 6 });

  // t > t_end
  const tPast = interpolateTrajectoryFrame(traj, 10.0, dt);
  assert.equal(tPast.isComplete, true);
  assert.equal(tPast.currentStep, 2);
  assert.deepEqual(tPast.poses.get('s1')?.position, { x: 2, y: 4, z: 6 });
});

test('Empirical M2.3: Quaternion SLERP Normalization Across Wide Angle Rotations', () => {
  const dt = 1 / 60;

  // Test cases: rotations around Y axis with various angle gaps:
  // 1) 0 deg difference (identical)
  // 2) 0.05 deg difference (near-identical, dot > 0.9995)
  // 3) 90 deg difference
  // 4) 179 deg difference (near-antipodal)
  // 5) Antipodal rotation (-q represents same rotation as q)
  const testAngles = [0, 0.05, 10, 45, 90, 135, 175, 179.9];

  for (const deg of testAngles) {
    const radA = 0;
    const radB = (deg * Math.PI) / 180;

    const qA: Quat = {
      qx: 0,
      qy: Math.sin(radA / 2),
      qz: 0,
      qw: Math.cos(radA / 2),
    };
    const qB: Quat = {
      qx: 0,
      qy: Math.sin(radB / 2),
      qz: 0,
      qw: Math.cos(radB / 2),
    };

    const traj: SimulationFrame[] = [
      { step: 0, time: 0, poses: new Map([['test', new Pose(Pose.origin().position, qA)]]) },
      { step: 1, time: dt, poses: new Map([['test', new Pose(Pose.origin().position, qB)]]) },
    ];

    // Sweep alpha from 0 to 1 at 20 intermediate steps
    for (let i = 0; i <= 20; i++) {
      const alpha = i / 20;
      const elapsed = alpha * dt;
      const res = interpolateTrajectoryFrame(traj, elapsed, dt);
      const pose = res.poses.get('test');
      assert.ok(pose, `Pose must exist for angle ${deg} at alpha ${alpha}`);

      const len = Math.hypot(
        pose.rotation.qx,
        pose.rotation.qy,
        pose.rotation.qz,
        pose.rotation.qw
      );
      // Due to Number.toFixed(4) rounding in interpolateTrajectoryFrame,
      // maximum rounding error per component is 0.00005, hypot error is <= 0.0005.
      assert.ok(
        Math.abs(len - 1.0) < 0.002,
        `Quaternion unit length must be preserved. Angle=${deg}, alpha=${alpha}, len=${len}`
      );
    }
  }

  // Antipodal test: qB = -qA (represents same orientation, dot = -1)
  const qA: Quat = { qx: 0, qy: 0, qz: 0.7071, qw: 0.7071 };
  const qNeg: Quat = { qx: -0, qy: -0, qz: -0.7071, qw: -0.7071 };
  const trajNeg: SimulationFrame[] = [
    { step: 0, time: 0, poses: new Map([['test', new Pose(Pose.origin().position, qA)]]) },
    { step: 1, time: dt, poses: new Map([['test', new Pose(Pose.origin().position, qNeg)]]) },
  ];
  const resNeg = interpolateTrajectoryFrame(trajNeg, dt * 0.5, dt);
  const poseNeg = resNeg.poses.get('test');
  assert.ok(poseNeg);
  const lenNeg = Math.hypot(
    poseNeg.rotation.qx,
    poseNeg.rotation.qy,
    poseNeg.rotation.qz,
    poseNeg.rotation.qw
  );
  assert.ok(
    Math.abs(lenNeg - 1.0) < 0.002,
    `Antipodal quaternion shortest path SLERP must remain unit length, len=${lenNeg}`
  );
});

test('Empirical M2.4: resolveStonePose Priority and Fallback Handling', () => {
  const poses = new Map([
    ['wish-abc', { position: { x: 1, y: 1, z: 1 }, rotation: { qx: 0, qy: 0, qz: 0, qw: 1 } }],
    ['tower-stone-0', { position: { x: 2, y: 2, z: 2 }, rotation: { qx: 0, qy: 0, qz: 0, qw: 1 } }],
    ['dropped-stone', { position: { x: 3, y: 3, z: 3 }, rotation: { qx: 0, qy: 0, qz: 0, qw: 1 } }],
  ]);

  // Priority 1: Match by exact stoneId
  const matchId = resolveStonePose(poses, 'wish-abc', 0);
  assert.equal(matchId?.position.x, 1);

  // Priority 2: Fallback to tower-stone-${index}
  const matchIndex = resolveStonePose(poses, 'unknown-id', 0);
  assert.equal(matchIndex?.position.x, 2);

  // Priority 3: Fallback to dropped-stone
  const matchDropped = resolveStonePose(poses, 'unknown-id');
  assert.equal(matchDropped?.position.x, 3);

  // When poses map is completely empty
  const emptyPoses = new Map();
  assert.equal(resolveStonePose(emptyPoses, 'any-id', 0), undefined);
});

// -----------------------------------------------------------------------------
// PART 2: StackStoneController State Machine & Subscriber Notifications
// -----------------------------------------------------------------------------

test('Empirical M2.5: StackStoneController State Machine 5-State Lifecycle & Observer', async () => {
  const fetchFn = createMockFetch();
  const container = createMsaAppContainer('http://localhost:8080', fetchFn as any);
  const controller = new StackStoneController(container, {
    baseQuota: 5,
    bonusQuota: 0,
    usedCount: 0,
  });

  const observedPhases: string[] = [];
  const unsubscribe = controller.subscribe((state) => {
    observedPhases.push(state.phase);
  });

  // Initial State
  assert.equal(controller.getState().phase, 'IDLE');
  assert.equal(controller.getState().attempt, 0);
  assert.equal(controller.getState().towerCollapsed, false);

  // 1. startPlacing() -> PLACING
  controller.startPlacing();
  assert.equal(controller.getState().phase, 'PLACING');

  // Tower setup
  const tower = new Tower(
    TowerKey.global(),
    [
      {
        id: 'stone-0',
        stone: new Stone({
          shape: 'round',
          color: '#777',
          pose: new Pose({ x: 0, y: 0.25, z: 0 }),
        }),
        status: 'active',
        bloom: null,
        cheerLevel: 0,
        isMine: false,
        nickname: null,
      },
    ],
    { stoneCount: 1, todayCount: 1, fulfilledCount: 0, cheerCount: 0 }
  );
  controller.updateContent('엠피리컬 챌린지 소원');

  // 2. placeStone with unstable position -> BALANCING -> COLLAPSING (attempt 1)
  const farDrop = new Pose({ x: 3.5, y: 1.2, z: 0 });
  const res1 = await controller.placeStone(tower, farDrop);
  assert.equal(res1.status, 'retry');
  assert.equal(controller.getState().phase, 'COLLAPSING');
  assert.equal(controller.getState().attempt, 1);
  assert.equal(controller.getState().towerCollapsed, true);

  // 3. resetPlacement() -> IDLE (preserving attempt counter for retry)
  controller.resetPlacement();
  assert.equal(controller.getState().phase, 'IDLE');
  assert.equal(controller.getState().towerCollapsed, false);
  assert.equal(controller.getState().attempt, 1, 'Attempt counter must be preserved across resetPlacement');

  // 4. Second unstable drop -> BALANCING -> COLLAPSING (attempt 2)
  const res2 = await controller.placeStone(tower, farDrop);
  assert.equal(res2.status, 'retry');
  assert.equal(controller.getState().phase, 'COLLAPSING');
  assert.equal(controller.getState().attempt, 2);

  // 5. Third drop -> BALANCING -> SETTLED (attempt 3 auto-settle)
  const res3 = await controller.placeStone(tower, farDrop);
  assert.equal(res3.status, 'saved');
  assert.equal(controller.getState().phase, 'SETTLED');
  assert.equal(controller.getState().attempt, 0, 'Attempt counter resets to 0 upon settlement');
  assert.equal(controller.getState().quota.remaining, 4, 'Quota consumed by 1 upon settlement');

  // Verify subscriber notification sequence
  assert.ok(observedPhases.includes('PLACING'));
  assert.ok(observedPhases.includes('BALANCING'));
  assert.ok(observedPhases.includes('COLLAPSING'));
  assert.ok(observedPhases.includes('SETTLED'));

  // Test unsubscribe
  const countBefore = observedPhases.length;
  unsubscribe();
  controller.startPlacing();
  assert.equal(observedPhases.length, countBefore, 'Unsubscribed listener must receive no further events');
});

test('Empirical M2.6: Stable Drop Settles on Attempt 1 and Verifies Attempt Behavior', async () => {
  const fetchFn = createMockFetch();
  const container = createMsaAppContainer('http://localhost:8080', fetchFn as any);
  const controller = new StackStoneController(container, {
    baseQuota: 5,
    bonusQuota: 0,
    usedCount: 0,
  });

  const tower = new Tower(
    TowerKey.global(),
    [
      {
        id: 'stone-0',
        stone: new Stone({
          shape: 'round',
          color: '#777',
          pose: new Pose({ x: 0, y: 0.25, z: 0 }),
        }),
        status: 'active',
        bloom: null,
        cheerLevel: 0,
        isMine: false,
        nickname: null,
      },
    ],
    { stoneCount: 1, todayCount: 1, fulfilledCount: 0, cheerCount: 0 }
  );

  controller.updateContent('안정적인 드롭 소원');
  // Perfectly centered drop directly above base stone
  const stableDrop = new Pose({ x: 0, y: 0.65, z: 0 });
  const result = await controller.placeStone(tower, stableDrop);

  assert.equal(result.status, 'saved');
  assert.equal(controller.getState().phase, 'SETTLED');
  assert.equal(controller.getState().attempt, 0, 'Attempt counter resets to 0 upon settlement');
  assert.equal(controller.getState().quota.remaining, 4);
});

test('Empirical M2.7: Multi-Stone Placement Lifecycle - Session Isolation Verification', async () => {
  const fetchFn = createMockFetch();
  const container = createMsaAppContainer('http://localhost:8080', fetchFn as any);
  const controller = new StackStoneController(container, {
    baseQuota: 5,
    bonusQuota: 0,
    usedCount: 0,
  });

  const tower = new Tower(
    TowerKey.global(),
    [
      {
        id: 'stone-0',
        stone: new Stone({
          shape: 'round',
          color: '#777',
          pose: new Pose({ x: 0, y: 0.25, z: 0 }),
        }),
        status: 'active',
        bloom: null,
        cheerLevel: 0,
        isMine: false,
        nickname: null,
      },
    ],
    { stoneCount: 1, todayCount: 1, fulfilledCount: 0, cheerCount: 0 }
  );

  // Stone 1: settles on attempt 1
  controller.updateContent('첫 번째 돌');
  const res1 = await controller.placeStone(tower, new Pose({ x: 0, y: 0.65, z: 0 }));
  assert.equal(res1.status, 'saved');
  assert.equal(controller.getState().phase, 'SETTLED');
  assert.equal(controller.getState().attempt, 0, 'Attempt counter resets to 0 upon settlement');

  // Stone 2: user starts a new wish placement
  controller.updateContent('두 번째 돌');
  controller.startPlacing();

  // Session isolation verification: attempt counter is clean 0 for Stone 2
  assert.equal(
    controller.getState().attempt,
    0,
    'Session isolation verified: attempt counter is 0 when starting Stone 2 placement'
  );
});

test('Empirical M2.8: Attempt Counter Reset Guarantees Normal 3 Attempts for Subsequent Stones', async () => {
  const fetchFn = createMockFetch();
  const container = createMsaAppContainer('http://localhost:8080', fetchFn as any);
  const controller = new StackStoneController(container, {
    baseQuota: 5,
    bonusQuota: 0,
    usedCount: 0,
  });

  const tower = new Tower(
    TowerKey.global(),
    [
      {
        id: 'stone-0',
        stone: new Stone({
          shape: 'round',
          color: '#777',
          pose: new Pose({ x: 0, y: 0.25, z: 0 }),
        }),
        status: 'active',
        bloom: null,
        cheerLevel: 0,
        isMine: false,
        nickname: null,
      },
    ],
    { stoneCount: 1, todayCount: 1, fulfilledCount: 0, cheerCount: 0 }
  );

  controller.updateContent('첫 번째 돌 - 3회차 자동 안착 유도');
  const farDrop = new Pose({ x: 3.5, y: 1.2, z: 0 });

  // Stone 1: 3 failed attempts leading to auto-settle
  await controller.placeStone(tower, farDrop); // attempt 1 -> retry
  controller.resetPlacement();
  await controller.placeStone(tower, farDrop); // attempt 2 -> retry
  controller.resetPlacement();
  const resStone1 = await controller.placeStone(tower, farDrop); // attempt 3 -> saved (autoPlaced)
  assert.equal(resStone1.status, 'saved');
  assert.equal(controller.getState().attempt, 0, 'Attempt counter resets to 0 upon settlement');
  assert.equal(controller.getState().phase, 'SETTLED');

  // Now, user starts a brand new stone placement for their next daily wish
  controller.updateContent('두 번째 돌 - 첫 번째 드롭 시도');
  controller.startPlacing();
  assert.equal(controller.getState().attempt, 0, 'Attempt counter must be 0 for new stone');

  // Attempt 1 of Stone 2: user makes an off-center drop.
  // With session isolation fixed, this is attempt 1 (status: 'retry'), NOT premature auto-place!
  const resStone2 = await controller.placeStone(tower, farDrop);
  assert.equal(resStone2.status, 'retry', 'Second stone properly receives retry on failed drop 1');
  assert.equal(resStone2.attempt, 1, 'Second stone is at attempt 1');
  assert.equal(controller.getState().attempt, 1, 'Controller state attempt is 1 on retry');
  assert.equal(controller.getState().phase, 'COLLAPSING');
});
