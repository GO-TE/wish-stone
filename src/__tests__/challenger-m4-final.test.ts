import test from 'node:test';
import assert from 'node:assert/strict';

import { StabilityEvaluator } from '../infrastructure/physics/StabilityEvaluator.ts';
import {
  interpolateTrajectoryFrame,
  buildStoneGeometrySpec,
  buildStoneMaterialSpec,
  resetTowerMeshTransforms,
  resolveStonePose,
} from '../presentation/components/stoneTowerSpec.ts';
import { StackStoneController } from '../presentation/controllers/StackStoneController.ts';
import { SimpleTowerPhysicsWorld } from '../infrastructure/physics/SimpleTowerPhysicsWorld.ts';
import { StonePhysicsBodyFactory } from '../infrastructure/physics/StonePhysicsBodyFactory.ts';
import { createMsaAppContainer } from '../container.ts';
import { Tower } from '../domain/entities/Tower.ts';
import { TowerKey } from '../domain/value-objects/TowerKey.ts';
import { Stone } from '../domain/entities/Stone.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import type { SimulationFrame } from '../domain/ports/PhysicsWorld.ts';

// ============================================================================
// 1. F03: StabilityEvaluator Non-Finite Sanitization & Boundary Robustness
// ============================================================================
test('Empirical Audit 1: StabilityEvaluator Deep Adversarial Invariants & Finite Boundary', () => {
  const squarePolygon: [number, number][] = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ];

  // 1.1 COM NaN / Infinity in all permutations (x, y, z)
  const nonFiniteCombos = [
    { x: NaN, y: 0, z: 0, desc: 'x=NaN' },
    { x: 0, y: NaN, z: 0, desc: 'y=NaN' },
    { x: 0, y: 0, z: NaN, desc: 'z=NaN' },
    { x: Infinity, y: 0, z: 0, desc: 'x=+Inf' },
    { x: 0, y: Infinity, z: 0, desc: 'y=+Inf' },
    { x: 0, y: 0, z: Infinity, desc: 'z=+Inf' },
    { x: -Infinity, y: 0, z: 0, desc: 'x=-Inf' },
    { x: 0, y: -Infinity, z: 0, desc: 'y=-Inf' },
    { x: 0, y: 0, z: -Infinity, desc: 'z=-Inf' },
    { x: NaN, y: NaN, z: NaN, desc: 'all NaN' },
    { x: Infinity, y: -Infinity, z: NaN, desc: 'mixed Inf/NaN' },
  ];

  for (const c of nonFiniteCombos) {
    const res = StabilityEvaluator.evaluateStability(c, squarePolygon, 1.0);
    assert.equal(
      res.isStable,
      false,
      `COM (${c.desc}) must evaluate to isStable: false`
    );
    assert.equal(
      res.marginDistance,
      -Infinity,
      `COM (${c.desc}) marginDistance must be -Infinity`
    );
    assert.equal(res.nearestEdgeDistance, 0);
  }

  // 1.2 Extreme Floating Point Values (Subnormal & Max Float)
  const maxFloat = Number.MAX_VALUE;
  const resMax = StabilityEvaluator.evaluateStability(
    { x: maxFloat, y: 1.0, z: maxFloat },
    squarePolygon,
    1.0
  );
  assert.equal(resMax.isStable, false, 'Extreme positive float far outside polygon must be unstable');
  assert.ok(resMax.marginDistance < 0);

  const subnormal = Number.MIN_VALUE; // ~5e-324
  const resSubnormal = StabilityEvaluator.evaluateStability(
    { x: subnormal, y: 1.0, z: subnormal },
    squarePolygon,
    1.0
  );
  assert.equal(resSubnormal.isStable, true, 'Subnormal point near center (0,0) must be stable');
  assert.ok(resSubnormal.marginDistance > 0.49);

  // 1.3 Degenerate Support Polygon: < 3 points
  assert.equal(StabilityEvaluator.evaluateStability({ x: 0, y: 1, z: 0 }, [], 1.0).isStable, false);
  assert.equal(StabilityEvaluator.evaluateStability({ x: 0, y: 1, z: 0 }, [[0, 0]], 1.0).isStable, false);
  assert.equal(StabilityEvaluator.evaluateStability({ x: 0, y: 1, z: 0 }, [[0, 0], [1, 1]], 1.0).isStable, false);

  // 1.4 SupportPolygon object interface
  const polyObject = {
    vertices: squarePolygon,
    area: 1.0,
    centroid: [0, 0] as [number, number],
  };
  const resObj = StabilityEvaluator.evaluateStability({ x: 0, y: 1, z: 0 }, polyObject, 1.0);
  assert.equal(resObj.isStable, true);
  assert.ok(resObj.marginDistance > 0.4);

  // 1.5 Boundary tolerance test: exact boundary edge
  // At (0.5, 0), margin distance should be 0, isStable should be true (marginDistance >= -1e-4)
  const resBoundary = StabilityEvaluator.evaluateStability({ x: 0.5, y: 1.0, z: 0 }, squarePolygon, 1.0);
  assert.ok(
    Math.abs(resBoundary.marginDistance) < 1e-6,
    `Boundary point margin should be ~0, got ${resBoundary.marginDistance}`
  );
  assert.equal(resBoundary.isStable, true, 'Exact boundary point should be within stability threshold');

  // Slightly outside (+0.501, 0)
  const resOutside = StabilityEvaluator.evaluateStability({ x: 0.501, y: 1.0, z: 0 }, squarePolygon, 1.0);
  assert.equal(resOutside.isStable, false, 'Point 1mm outside boundary must be unstable');
  assert.ok(resOutside.marginDistance < -1e-4);
});

// ============================================================================
// 2. F08: interpolateTrajectoryFrame Non-Finite Time & Singularity Defense
// ============================================================================
test('Empirical Audit 2: interpolateTrajectoryFrame Adversarial Boundary & Singularity Robustness', () => {
  const frames: SimulationFrame[] = [
    {
      step: 0,
      time: 0,
      poses: new Map([
        ['stone-a', new Pose({ x: 1, y: 2, z: 3 }, { qx: 0, qy: 0, qz: 0, qw: 1 })],
        ['stone-b', new Pose({ x: 10, y: 20, z: 30 }, { qx: 0, qy: 1, qz: 0, qw: 0 })],
      ]),
    },
    {
      step: 1,
      time: 1 / 60,
      poses: new Map([
        ['stone-a', new Pose({ x: 2, y: 4, z: 6 }, { qx: 0, qy: 0, qz: 0.7071, qw: 0.7071 })],
      ]),
    },
  ];

  // 2.1 Non-finite elapsedSeconds safely returns frame 0 without throwing
  for (const badTime of [NaN, Infinity, -Infinity, -0, +0, -1e10, 1e20]) {
    assert.doesNotThrow(() => {
      const res = interpolateTrajectoryFrame(frames, badTime);
      assert.ok(res !== undefined);
      assert.equal(typeof res.isComplete, 'boolean');
      assert.ok(res.poses instanceof Map);
    });
  }

  // 2.2 Missing pose in frameB: stone-b is only in frameA
  // At t = 0.5 / 60, floatStep = 0.5 (between frame 0 and frame 1)
  const midRes = interpolateTrajectoryFrame(frames, 0.5 / 60);
  assert.ok(midRes.poses.has('stone-a'));
  assert.ok(midRes.poses.has('stone-b'));
  // Stone-b should fallback gracefully to frameA pose
  const poseB = midRes.poses.get('stone-b');
  assert.equal(poseB?.position.x, 10);
  assert.equal(poseB?.position.y, 20);

  // 2.3 Single frame trajectory
  const single = [frames[0]];
  const singleRes = interpolateTrajectoryFrame(single, 5.0);
  assert.equal(singleRes.isComplete, true);
  assert.equal(singleRes.currentStep, 0);

  // 2.4 Empty trajectory
  const emptyRes = interpolateTrajectoryFrame([], 1.0);
  assert.equal(emptyRes.isComplete, true);
  assert.equal(emptyRes.poses.size, 0);

  // 2.5 Degenerate fixedDeltaTime
  const resBadDt = interpolateTrajectoryFrame(frames, 0.5, 0);
  assert.ok(resBadDt !== undefined);
  assert.equal(resBadDt.isComplete, true);

  // 2.6 Antipodal and near-zero quaternion SLERP robustness
  const quatFrames: SimulationFrame[] = [
    {
      step: 0,
      time: 0,
      poses: new Map([
        ['stone-q', new Pose({ x: 0, y: 0, z: 0 }, { qx: 0, qy: 1, qz: 0, qw: 0 })],
      ]),
    },
    {
      step: 1,
      time: 1 / 60,
      poses: new Map([
        ['stone-q', new Pose({ x: 0, y: 0, z: 0 }, { qx: 0, qy: -1, qz: 0, qw: 0 })],
      ]),
    },
  ];
  const antipodalRes = interpolateTrajectoryFrame(quatFrames, 0.5 / 60);
  const qPose = antipodalRes.poses.get('stone-q');
  assert.ok(qPose !== undefined);
  const qNorm = Math.hypot(
    qPose.rotation.qx,
    qPose.rotation.qy,
    qPose.rotation.qz,
    qPose.rotation.qw
  );
  assert.ok(Math.abs(qNorm - 1.0) < 0.05, `Antipodal quaternion norm must remain unit, got ${qNorm}`);
});

// ============================================================================
// 3. F07: StackStoneController Error Recovery & Anti-Lockout Invariants
// ============================================================================
test('Empirical Audit 3: StackStoneController State Recovery Under Diverse Failures & Re-Entrancy', async () => {
  let errorToThrow: any = new Error('NETWORK_TIMEOUT');

  const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/v1/auth')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: 'jwt-audit',
          user: { id: 'tester-audit', nickname: 'AuditTester', isGuest: true },
        }),
      };
    }
    if (url.includes('/api/v1/wishes') && init?.method === 'POST') {
      if (errorToThrow) {
        throw errorToThrow;
      }
      return {
        ok: true,
        status: 201,
        json: async () => ({
          id: 'wish-audit-ok',
          content: '감사 소원',
          category: 'gratitude',
          scope: 'global',
          createdAt: new Date().toISOString(),
          cheerCount: 0,
          isFulfilled: false,
          isMine: true,
          stone: {
            id: 'stone-audit-1',
            shape: 'flat',
            color: '#444444',
            pose: { position: { x: 0, y: 0.2, z: 0 }, rotation: { qx: 0, qy: 0, qz: 0, qw: 1 } },
          },
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const container = createMsaAppContainer('http://localhost:8080', mockFetch as any);
  await container.auth.signIn('guest');
  const controller = new StackStoneController(container);
  controller.updateContent('심층 감사 소원');

  const emptyTower = new Tower(TowerKey.global(), [], {
    stoneCount: 0,
    todayCount: 0,
    fulfilledCount: 0,
    cheerCount: 0,
  });

  // 3.1 Non-Error rejection: throw string
  errorToThrow = 'STRING_REJECTION_ERROR';
  await assert.rejects(
    () => controller.placeStone(emptyTower, new Pose({ x: 0, y: 0.5, z: 0 })),
    (err: any) => err === 'STRING_REJECTION_ERROR'
  );
  assert.equal(controller.getState().phase, 'IDLE', 'Phase must be IDLE after string error');

  // 3.2 Non-Error rejection: throw object
  errorToThrow = { status: 503, message: 'SERVICE_UNAVAILABLE' };
  await assert.rejects(
    () => controller.placeStone(emptyTower, new Pose({ x: 0, y: 0.5, z: 0 })),
    (err: any) => err.status === 503
  );
  assert.equal(controller.getState().phase, 'IDLE', 'Phase must be IDLE after object error');

  // 3.3 Normal success execution after errors
  errorToThrow = null;
  const okResult = await controller.placeStone(emptyTower, new Pose({ x: 0, y: 0.5, z: 0 }));
  assert.equal(okResult.status, 'saved');
  assert.equal(controller.getState().phase, 'SETTLED');
  assert.equal(controller.getState().attempt, 0);

  // 3.4 Quota exhaustion protection
  for (let i = 0; i < 4; i++) {
    await controller.placeStone(emptyTower, new Pose({ x: 0, y: 0.5, z: 0 }));
  }
  assert.equal(controller.getState().quota.remaining, 0);

  // Next attempt must throw DAILY_QUOTA_EXCEEDED
  await assert.rejects(
    () => controller.placeStone(emptyTower, new Pose({ x: 0, y: 0.5, z: 0 })),
    /DAILY_QUOTA_EXCEEDED/
  );
  assert.notEqual(controller.getState().phase, 'BALANCING');
});

// ============================================================================
// 4. F01–F06: High-Stress Dynamic Collapse & PGS Solver Stability
// ============================================================================
test('Empirical Audit 4: High-Stress Dynamic Collapse & PGS Solver Invariants', async () => {
  const world = new SimpleTowerPhysicsWorld();

  // Create 6-stone cairn
  const stones: Stone[] = [];
  const shapes: Array<'boulder' | 'round' | 'flat' | 'pebble' | 'tall'> = [
    'boulder', 'flat', 'round', 'tall', 'round', 'pebble'
  ];
  let yPos = 0;
  for (let i = 0; i < shapes.length; i++) {
    const cfg = StonePhysicsBodyFactory.getShapeConfig(shapes[i]);
    yPos += cfg.halfExtents.y;
    stones.push(
      new Stone({
        shape: shapes[i],
        color: '#666',
        pose: new Pose({ x: 0, y: yPos, z: 0 }),
      })
    );
    yPos += cfg.halfExtents.y;
  }

  world.addStatic(stones);

  // Drop heavy boulder off-center (+0.35m) to trigger cascade collapse
  const dropStone = new Stone({
    shape: 'boulder',
    color: '#888',
    pose: Pose.origin(),
  });

  const res = await world.drop(dropStone, new Pose({ x: 0.35, y: yPos + 0.5, z: 0 }));
  assert.equal(res.settled, false, 'Off-center drop on 6-stone tower must tumble');
  assert.equal(res.collapsed, true, 'Tower must collapse dynamically');
  assert.ok(res.trajectory && res.trajectory.length > 0, 'Trajectory frames must be produced');

  // Verify all stone coordinates in trajectory remain strictly finite
  for (const frame of res.trajectory!) {
    for (const [id, pose] of frame.poses) {
      assert.ok(Number.isFinite(pose.position.x), `Frame step ${frame.step} stone ${id} X must be finite`);
      assert.ok(Number.isFinite(pose.position.y), `Frame step ${frame.step} stone ${id} Y must be finite`);
      assert.ok(Number.isFinite(pose.position.z), `Frame step ${frame.step} stone ${id} Z must be finite`);
      assert.ok(pose.position.y >= -0.05, `Stone ${id} must never sink below ground plane: y=${pose.position.y}`);
    }
  }

  // Verify radial scatter
  const scatter = Math.hypot(res.pose.position.x, res.pose.position.z);
  assert.ok(scatter > 0.35, `Scatter distance ${scatter} must be significant (> 0.35m)`);

  // Multiple dispose calls are safe
  world.dispose();
  assert.doesNotThrow(() => world.dispose(), 'dispose() must be safe to call repeatedly');
});

// ============================================================================
// 5. F08 & F09: Mesh Transform Restoration & resolveStonePose Priority
// ============================================================================
test('Empirical Audit 5: Mesh Transforms & Scene Graph Reset Invariants', () => {
  const meshMap = new Map<string, any>();
  const dummyMesh = {
    position: { x: 99, y: 99, z: 99, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; } },
    quaternion: { qx: 99, qy: 99, qz: 99, qw: 99, set(x: number, y: number, z: number, w: number) { this.qx = x; this.qy = y; this.qz = z; this.qw = w; } },
  };

  meshMap.set('stone-test-1', dummyMesh);

  const nodes = [
    {
      id: 'stone-test-1',
      position: { x: 0, y: 0.1, z: 0 },
      geometry: buildStoneGeometrySpec('round'),
      material: buildStoneMaterialSpec('#777', 'round', 0, false),
      decoration: null,
      nicknameLabel: null,
    },
  ];

  resetTowerMeshTransforms(meshMap, nodes, null);

  assert.equal(dummyMesh.position.x, 0);
  assert.equal(dummyMesh.position.y, 0.1);
  assert.equal(dummyMesh.position.z, 0);
  assert.equal(dummyMesh.quaternion.qx, 0);
  assert.equal(dummyMesh.quaternion.qw, 1);

  // resolveStonePose fallback
  const testPoses = new Map<string, any>([
    ['dropped-stone', { position: { x: 1, y: 1, z: 1 }, rotation: { qx: 0, qy: 0, qz: 0, qw: 1 } }],
  ]);
  const resolved = resolveStonePose(testPoses, 'non-existent-id');
  assert.equal(resolved?.position.x, 1, 'resolveStonePose falls back to dropped-stone pose');
});
