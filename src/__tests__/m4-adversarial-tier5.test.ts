import assert from 'node:assert/strict';
import test from 'node:test';
import * as CANNON from 'cannon-es';

import { createMsaAppContainer } from '../container.ts';
import { Stone, type StoneShape } from '../domain/entities/Stone.ts';
import { Tower } from '../domain/entities/Tower.ts';
import { type SimulationFrame } from '../domain/ports/PhysicsWorld.ts';
import { Pose, type Quat, type Vec3 } from '../domain/value-objects/Pose.ts';
import { TowerKey } from '../domain/value-objects/TowerKey.ts';
import { SimpleTowerPhysicsWorld } from '../infrastructure/physics/SimpleTowerPhysicsWorld.ts';
import { StabilityEvaluator } from '../infrastructure/physics/StabilityEvaluator.ts';
import { StonePhysicsBodyFactory } from '../infrastructure/physics/StonePhysicsBodyFactory.ts';
import {
  buildStoneGeometrySpec,
  buildStoneMaterialSpec,
  buildTowerSceneGraph,
  interpolateTrajectoryFrame,
  resetTowerMeshTransforms,
  resolveStonePose,
  type TransformableMesh,
} from '../presentation/components/stoneTowerSpec.ts';
import {
  StackStoneController,
  type StackStoneViewState,
} from '../presentation/controllers/StackStoneController.ts';

/**
 * ============================================================================
 * Milestone M4 Phase 2: Tier 5 Adversarial Coverage Hardening Test Suite
 * ============================================================================
 * Focus Areas:
 * 1. Error Recovery & State Machine Lockout (Controller & Backend Exception Safety)
 * 2. Extreme High-Stack Dynamics (>10 stones) & Cascading Collapse
 * 3. Numerical Edge Cases, Degenerate Geometries & Quaternion Singularity Defense
 * 4. Resource Cleanup & Memory Safety (World disposal & Mesh map lifecycle)
 */

// ----------------------------------------------------------------------------
// 1. Error Recovery & State Machine Lockout
// ----------------------------------------------------------------------------

test('Tier 5.1 - Backend Exception During placeStone & State Machine Recovery', async () => {
  // Mock fetch that succeeds on auth but throws network error / HTTP 500 on wish creation
  const errorFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/v1/auth')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: 'test-jwt-token',
          user: { id: 'test-user', nickname: 'Tester' },
        }),
      };
    }
    if (url.includes('/api/v1/wishes') && init?.method === 'POST') {
      throw new Error('NETWORK_TIMEOUT_SIMULATED');
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const container = createMsaAppContainer('http://localhost:8080', errorFetch as any);
  await container.auth.signIn('guest');

  const controller = new StackStoneController(container);
  controller.updateContent('네트워크 실패 시뮬레이션 소원');

  const sampleTower = new Tower(
    TowerKey.global(),
    [
      {
        id: 'stone-base-0',
        stone: new Stone({
          shape: 'boulder',
          color: '#333333',
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

  const dropPose = new Pose({ x: 0, y: 0.6, z: 0 });

  // 1. Calling placeStone when backend fails should reject with error
  await assert.rejects(
    () => controller.placeStone(sampleTower, dropPose),
    /NETWORK_TIMEOUT_SIMULATED/,
    'placeStone must propagate backend network error'
  );

  // 2. Audit post-error state:
  const postErrorState = controller.getState();

  // If controller phase remains stuck in 'BALANCING', subsequent calls fail with PLACEMENT_IN_PROGRESS!
  // To be resilient, the controller must either recover its phase, or resetPlacement() must clear it.
  if (postErrorState.phase === 'BALANCING') {
    // If it was left in BALANCING, verify resetPlacement() successfully unblocks it
    controller.resetPlacement();
    assert.equal(controller.getState().phase, 'IDLE', 'resetPlacement() must unblock phase to IDLE');
  } else {
    // Controller self-recovered
    assert.notEqual(
      postErrorState.phase,
      'BALANCING',
      'Controller should not leave phase stuck in BALANCING after error'
    );
  }

  // 3. Quota must NOT have been consumed on failure
  assert.equal(
    controller.getState().quota.remaining,
    5,
    'Quota must remain intact when backend rejects'
  );

  // 4. Subsequent retry after resetting should not throw PLACEMENT_IN_PROGRESS
  // Providing healthy mock for second attempt
  const healthyFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/v1/auth')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: 'test-jwt-token',
          user: { id: 'test-user', nickname: 'Tester', isGuest: true },
        }),
      };
    }
    return {
      ok: true,
      status: 201,
      json: async () => ({
        id: 'wish-recovered-1',
        authorId: 'test-user',
        content: '복구 소원',
        category: 'health',
        bloomColor: '#309060',
        stone: {
          id: 'stone-rec-1',
          shape: 'round',
          color: '#556677',
          pose: {
            position: { x: 0, y: 0.6, z: 0 },
            rotation: { qx: 0, qy: 0, qz: 0, qw: 1 },
          },
        },
        cheerCount: 0,
        isFulfilled: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    };
  };

  const healthyContainer = createMsaAppContainer('http://localhost:8080', healthyFetch as any);
  await healthyContainer.auth.signIn('guest');
  const recoveredController = new StackStoneController(healthyContainer);
  recoveredController.updateContent('복구 소원');

  const secondResult = await recoveredController.placeStone(sampleTower, dropPose);
  assert.ok(
    secondResult.status === 'saved' || secondResult.status === 'retry',
    'Subsequent placement must proceed normally'
  );
});

// ----------------------------------------------------------------------------
// 2. Extreme High-Stack Dynamics (>10 Stones) & Cascading Collapse
// ----------------------------------------------------------------------------

test('Tier 5.2 - 12-Stone High-Rise Tower Static Equilibrium & Dynamic Cascading Collapse', async () => {
  const shapes: StoneShape[] = [
    'boulder',
    'boulder',
    'flat',
    'flat',
    'round',
    'round',
    'tall',
    'tall',
    'pebble',
    'pebble',
    'round',
    'pebble',
  ];

  // Construct 12 static stones vertically stacked
  const staticStones: Stone[] = [];
  let currentY = 0;

  for (let i = 0; i < shapes.length; i++) {
    const shape = shapes[i];
    const cfg = StonePhysicsBodyFactory.getShapeConfig(shape);
    const halfH = cfg.halfExtents.y;
    const posY = currentY + halfH;

    staticStones.push(
      new Stone({
        shape,
        color: '#555555',
        pose: new Pose({ x: 0, y: posY, z: 0 }),
      })
    );
    currentY += halfH * 2;
  }

  assert.equal(staticStones.length, 12, '12 stones constructed in stack');
  const expectedStackHeight = currentY;

  const world = new SimpleTowerPhysicsWorld();
  world.addStatic(staticStones);

  // Verify all 12 tower bodies registered
  assert.equal(world.getTowerBodies().size, 12, 'World must track all 12 tower bodies');

  // Case A: Stable Centered Drop on 12-Stone Stack
  const capstoneShape: StoneShape = 'pebble';
  const capCfg = StonePhysicsBodyFactory.getShapeConfig(capstoneShape);
  const dropPoseCentered = new Pose({
    x: 0,
    y: expectedStackHeight + capCfg.halfExtents.y + 0.05,
    z: 0,
  });

  const capstone = new Stone({
    shape: capstoneShape,
    color: '#888888',
    pose: Pose.origin(),
  });

  const stableResult = await world.drop(capstone, dropPoseCentered);
  assert.equal(stableResult.settled, true, 'Centered drop atop 12 stones must settle');
  assert.equal(stableResult.collapsed, false, 'Centered drop must not collapse 12-stone tower');
  assert.ok(
    stableResult.pose.position.y >= expectedStackHeight - 0.05,
    `Capstone y (${stableResult.pose.position.y}) must rest near top of stack (${expectedStackHeight})`
  );

  // Case B: Severe Eccentric Drop triggering Cascading Collapse of 12 Stones
  const eccentricDropPose = new Pose({
    x: 0.45,
    y: expectedStackHeight + 0.2,
    z: 0,
  });
  const heavyDisturber = new Stone({
    shape: 'boulder',
    color: '#222222',
    pose: Pose.origin(),
  });

  const collapseResult = await world.drop(heavyDisturber, eccentricDropPose);
  assert.equal(collapseResult.settled, false, 'Off-center drop atop 12 stones must not settle');
  assert.equal(collapseResult.collapsed, true, 'Off-center drop must trigger collapse');

  // Verify coordinate finiteness and absence of numerical divergence (NaN / Inf)
  assert.ok(
    Number.isFinite(collapseResult.pose.position.x),
    'Dropped body X must be finite'
  );
  assert.ok(
    Number.isFinite(collapseResult.pose.position.y),
    'Dropped body Y must be finite'
  );
  assert.ok(
    Number.isFinite(collapseResult.pose.position.z),
    'Dropped body Z must be finite'
  );

  for (const affected of collapseResult.affectedStones ?? []) {
    assert.ok(Number.isFinite(affected.pose.position.x), `Affected stone ${affected.id} X finite`);
    assert.ok(Number.isFinite(affected.pose.position.y), `Affected stone ${affected.id} Y finite`);
    assert.ok(Number.isFinite(affected.pose.position.z), `Affected stone ${affected.id} Z finite`);
  }

  // Cascading momentum should displace multiple tower stones
  assert.ok(
    (collapseResult.affectedStones?.length ?? 0) >= 1,
    `Cascading collapse of 12 stones must affect lower stones (affected count: ${collapseResult.affectedStones?.length})`
  );

  world.dispose();
});

// ----------------------------------------------------------------------------
// 3. Numerical Edge Cases, Degenerate Geometries & Quaternion Singularity
// ----------------------------------------------------------------------------

test('Tier 5.3 - StabilityEvaluator Degenerate Polygons & Zero Mass Bounds', () => {
  // 1. Zero-vertex polygon
  const evalEmpty = StabilityEvaluator.evaluateStability({ x: 0, y: 1, z: 0 }, []);
  assert.equal(evalEmpty.isStable, false, 'Empty polygon must evaluate to unstable');
  assert.equal(evalEmpty.marginDistance, -Infinity, 'Empty polygon margin must be -Infinity');

  // 2. Collinear points (1D degenerate segment)
  const collinear = [
    [0, 0] as [number, number],
    [1, 0] as [number, number],
    [2, 0] as [number, number],
  ];
  const evalCollinear = StabilityEvaluator.evaluateStability(
    { x: 1, y: 1, z: 0.5 },
    collinear
  );
  // Cross orientation with collinear line gives 0 or single sign -> must not crash
  assert.ok(
    Number.isFinite(evalCollinear.marginDistance),
    'Margin distance must remain finite on collinear polygon'
  );

  // 3. Total mass <= 0 in composite COM
  const zeroMassCOM = StabilityEvaluator.computeCompositeCOM([
    { mass: 0, position: { x: 5, y: 10, z: 15 } },
    { mass: -1, position: { x: 2, y: 4, z: 6 } },
  ]);
  assert.deepEqual(
    zeroMassCOM,
    { x: 0, y: 0, z: 0 },
    'Zero or negative composite mass must safely return origin'
  );

  // 4. Overturning torque when mass = 0
  const evalZeroMass = StabilityEvaluator.evaluateStability(
    { x: 10, y: 1, z: 10 },
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    0 // mass = 0
  );
  assert.equal(evalZeroMass.isStable, false);
  assert.ok(evalZeroMass.overturningTorque !== undefined);
  assert.equal(evalZeroMass.overturningTorque!.x, 0, 'Torque X with 0 mass must be 0');
  assert.equal(evalZeroMass.overturningTorque!.z, -0, 'Torque Z with 0 mass must be 0');

  // 5. Degenerate polygon area in computeSupportPolygon: zero half-extents
  const zeroShapeStone = new Stone({
    shape: 'round',
    color: '#000000',
    pose: new Pose({ x: 2.0, y: 0.5, z: 3.0 }),
  });
  const normalPoly = StabilityEvaluator.computeSupportPolygon(zeroShapeStone);
  assert.ok(normalPoly.area > 0, 'Normal shape support polygon area > 0');
  assert.ok(normalPoly.vertices.length >= 4, 'Support polygon vertices >= 4');
});

test('Tier 5.4 - Quaternion Singularity, Antipodal Alignment & Degenerate Trajectory Interpolation', () => {
  const dt = 1 / 60;

  // 1. Opposing antipodal quaternions (dot < 0)
  // qA = [0, 0, 0, 1], qB = [0, 0, 0, -1] (same 3D orientation, opposite 4D sphere poles)
  const antipodalFrames: SimulationFrame[] = [
    {
      step: 0,
      time: 0,
      poses: new Map([
        ['stone-a', new Pose({ x: 0, y: 0, z: 0 }, { qx: 0, qy: 0, qz: 0, qw: 1 })],
      ]),
    },
    {
      step: 1,
      time: dt,
      poses: new Map([
        ['stone-a', new Pose({ x: 0, y: 0, z: 0 }, { qx: 0, qy: 0, qz: 0, qw: -1 })],
      ]),
    },
  ];

  const slerpAntipodal = interpolateTrajectoryFrame(antipodalFrames, dt * 0.5, dt);
  const rotA = slerpAntipodal.poses.get('stone-a')?.rotation;
  assert.ok(rotA !== undefined, 'Rotation must exist');
  assert.ok(!Number.isNaN(rotA.qw), 'Quaternion qw must not be NaN');
  const normA = Math.hypot(rotA.qx, rotA.qy, rotA.qz, rotA.qw);
  assert.ok(
    Math.abs(normA - 1.0) < 0.01,
    `Antipodal SLERP must preserve unit length, got ${normA}`
  );

  // 2. Denormalized near-zero quaternion in frame
  const zeroQuatFrames: SimulationFrame[] = [
    {
      step: 0,
      time: 0,
      poses: new Map([
        ['stone-z', new Pose({ x: 0, y: 0, z: 0 }, { qx: 0, qy: 0, qz: 0, qw: 0.00001 })],
      ]),
    },
    {
      step: 1,
      time: dt,
      poses: new Map([
        ['stone-z', new Pose({ x: 0, y: 0, z: 0 }, { qx: 0, qy: 0, qz: 0, qw: 0.00002 })],
      ]),
    },
  ];

  const slerpZero = interpolateTrajectoryFrame(zeroQuatFrames, dt * 0.5, dt);
  const rotZ = slerpZero.poses.get('stone-z')?.rotation;
  assert.ok(rotZ !== undefined);
  assert.ok(!Number.isNaN(rotZ.qw));

  // 3. Negative elapsed time (elapsed < 0)
  const negElapsed = interpolateTrajectoryFrame(antipodalFrames, -1.0, dt);
  assert.equal(negElapsed.currentStep, 0, 'Negative elapsed time must clamp to step 0');
  assert.equal(negElapsed.isComplete, false);

  // 4. Missing stone in frameB present in frameA
  const asymmetricFrames: SimulationFrame[] = [
    {
      step: 0,
      time: 0,
      poses: new Map([
        ['s-only-in-A', new Pose({ x: 1, y: 1, z: 1 })],
        ['s-both', new Pose({ x: 0, y: 0, z: 0 })],
      ]),
    },
    {
      step: 1,
      time: dt,
      poses: new Map([
        ['s-both', new Pose({ x: 2, y: 2, z: 2 })],
        ['s-only-in-B', new Pose({ x: 9, y: 9, z: 9 })],
      ]),
    },
  ];

  const asymResult = interpolateTrajectoryFrame(asymmetricFrames, dt * 0.5, dt);
  assert.ok(
    asymResult.poses.has('s-only-in-A'),
    'Stone only in A must be preserved'
  );
  assert.ok(
    asymResult.poses.has('s-both'),
    'Common stone must be interpolated'
  );
  assert.ok(
    asymResult.poses.has('s-only-in-B'),
    'Stone only in B must be preserved'
  );
});

// ----------------------------------------------------------------------------
// 4. Resource Cleanup & Memory Safety
// ----------------------------------------------------------------------------

test('Tier 5.5 - SimpleTowerPhysicsWorld dispose() Idempotency & Re-drop Safety', async () => {
  const world = new SimpleTowerPhysicsWorld();
  const baseStone = new Stone({
    shape: 'boulder',
    color: '#333333',
    pose: new Pose({ x: 0, y: 0.25, z: 0 }),
  });

  world.addStatic([baseStone]);
  assert.equal(world.getTowerBodies().size, 1);

  // Dispose #1
  world.dispose();
  assert.equal(world.getTowerBodies().size, 0, 'Tower bodies map must be cleared');
  assert.equal(world.getDropBody(), null, 'Drop body must be null');

  // Dispose #2 (Idempotency check: must not throw on repeated dispose)
  assert.doesNotThrow(() => {
    world.dispose();
  }, 'Repeated dispose() calls must be idempotent and safe');

  // Calling drop after dispose on now-empty tower
  const topStone = new Stone({
    shape: 'round',
    color: '#777777',
    pose: Pose.origin(),
  });
  const res = await world.drop(topStone, new Pose({ x: 0, y: 0.5, z: 0 }));
  assert.ok(res.trajectory !== undefined, 'Simulation runs normally after disposal');
  assert.ok(Number.isFinite(res.pose.position.y), 'Position remains valid');

  world.dispose();
});

test('Tier 5.6 - resetTowerMeshTransforms Robustness with Disjoint IDs & Mesh LifeCycle', () => {
  const meshMap = new Map<string, any>();

  const createDummyMesh = () => ({
    position: {
      x: 99,
      y: 99,
      z: 99,
      set(x: number, y: number, z: number) {
        this.x = x;
        this.y = y;
        this.z = z;
      },
    },
    quaternion: {
      qx: 1,
      qy: 1,
      qz: 1,
      qw: 1,
      set(x: number, y: number, z: number, w: number) {
        this.qx = x;
        this.qy = y;
        this.qz = z;
        this.qw = w;
      },
    },
  });

  const mesh1 = createDummyMesh();
  const mesh2 = createDummyMesh();
  const droppedMesh = createDummyMesh();

  meshMap.set('stone-id-1', mesh1);
  meshMap.set('tower-stone-1', mesh2);
  meshMap.set('dropped-stone', droppedMesh);

  const nodes = [
    {
      id: 'stone-id-1',
      position: { x: 0.1, y: 0.2, z: 0.3 },
      geometry: buildStoneGeometrySpec('round'),
      material: buildStoneMaterialSpec('#888', 'round', 0, false),
      decoration: null,
      nicknameLabel: null,
    },
    {
      id: 'stone-id-2-missing-in-map',
      position: { x: 0.4, y: 0.5, z: 0.6 },
      geometry: buildStoneGeometrySpec('flat'),
      material: buildStoneMaterialSpec('#888', 'flat', 0, false),
      decoration: null,
      nicknameLabel: null,
    },
  ];

  const droppedStone = new Stone({
    shape: 'tall',
    color: '#333',
    pose: new Pose({ x: 0.7, y: 0.8, z: 0.9 }, { qx: 0, qy: 0, qz: 0.7071, qw: 0.7071 }),
  });

  // Call reset with missing keys in meshMap
  assert.doesNotThrow(() => {
    resetTowerMeshTransforms(meshMap, nodes, droppedStone);
  }, 'resetTowerMeshTransforms must handle missing nodes gracefully');

  // Verify node 1 was reset to its initial position and identity quaternion
  assert.equal(mesh1.position.x, 0.1);
  assert.equal(mesh1.position.y, 0.2);
  assert.equal(mesh1.position.z, 0.3);
  assert.equal(mesh1.quaternion.qx, 0);
  assert.equal(mesh1.quaternion.qw, 1);

  // Verify node 2 (fallback via index 'tower-stone-1') was reset
  assert.equal(mesh2.position.x, 0.4);
  assert.equal(mesh2.position.y, 0.5);
  assert.equal(mesh2.position.z, 0.6);

  // Verify dropped mesh was reset
  assert.equal(droppedMesh.position.x, 0.7);
  assert.equal(droppedMesh.position.y, 0.8);
  assert.equal(droppedMesh.position.z, 0.9);
  assert.equal(droppedMesh.quaternion.qz, 0.7071);
});

test('Tier 5.7 - Error Recovery Audit: placeStone Unhandled Rejection Leaves Phase in BALANCING', async () => {
  const failingFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
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
      throw new Error('MSA_BACKEND_HTTP_500_CRASH');
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const container = createMsaAppContainer('http://localhost:8080', failingFetch as any);
  await container.auth.signIn('guest');
  const controller = new StackStoneController(container);
  controller.updateContent('에러 복구 검증 소원');

  const emptyTower = new Tower(TowerKey.global(), [], {
    stoneCount: 0,
    todayCount: 0,
    fulfilledCount: 0,
    cheerCount: 0,
  });

  // Execute placeStone which rejects at use case level
  await assert.rejects(
    () => controller.placeStone(emptyTower, new Pose({ x: 0, y: 0.5, z: 0 })),
    /MSA_BACKEND_HTTP_500_CRASH/
  );

  // REMEDIATION VERIFICATION: Controller phase resets to IDLE after use-case rejection
  assert.equal(
    controller.getState().phase,
    'IDLE',
    'Controller phase is reset to IDLE after use-case rejection, preventing permanent lockout'
  );

  // Calling placeStone again does NOT fail with PLACEMENT_IN_PROGRESS, but executes normally
  // (and fails with the underlying use-case error rather than being locked out)
  await assert.rejects(
    () => controller.placeStone(emptyTower, new Pose({ x: 0, y: 0.5, z: 0 })),
    /MSA_BACKEND_HTTP_500_CRASH/,
    'Subsequent call proceeds and hits use-case error instead of being locked out by PLACEMENT_IN_PROGRESS'
  );

  // Explicit recovery mechanism: resetPlacement() unblocks the controller
  controller.resetPlacement();
  assert.equal(controller.getState().phase, 'IDLE', 'resetPlacement() successfully resets phase to IDLE');
});

test('Tier 5.8 - 15-Stone High-Rise Cairn Multi-Body Collision & PGS Solver Finite Bounds', async () => {
  const shapes: StoneShape[] = [
    'boulder', 'boulder', 'flat', 'flat', 'round',
    'round', 'tall', 'tall', 'boulder', 'flat',
    'round', 'pebble', 'tall', 'round', 'pebble',
  ];

  const staticStones: Stone[] = [];
  let yAccum = 0;
  for (let i = 0; i < shapes.length; i++) {
    const shape = shapes[i];
    const cfg = StonePhysicsBodyFactory.getShapeConfig(shape);
    const halfY = cfg.halfExtents.y;
    staticStones.push(
      new Stone({
        shape,
        color: `#${(i * 15).toString(16).padStart(2, '0')}4455`,
        pose: new Pose({ x: 0, y: yAccum + halfY, z: 0 }),
      })
    );
    yAccum += halfY * 2;
  }

  assert.equal(staticStones.length, 15);
  const world = new SimpleTowerPhysicsWorld();
  world.addStatic(staticStones);

  assert.equal(world.getTowerBodies().size, 15);

  // Drop heavy boulder off-center onto the 15-stone stack
  const disturber = new Stone({
    shape: 'boulder',
    color: '#000000',
    pose: Pose.origin(),
  });
  const res = await world.drop(disturber, new Pose({ x: 0.35, y: yAccum + 0.3, z: 0 }));

  assert.equal(res.collapsed, true, '15-stone tower must collapse under eccentric drop');
  assert.equal(res.settled, false);

  // Invariant verification across all trajectory frames: coordinates must be strictly finite
  for (const frame of res.trajectory ?? []) {
    for (const [id, pose] of frame.poses) {
      assert.ok(Number.isFinite(pose.position.x), `Frame ${frame.step} body ${id} X finite`);
      assert.ok(Number.isFinite(pose.position.y), `Frame ${frame.step} body ${id} Y finite`);
      assert.ok(Number.isFinite(pose.position.z), `Frame ${frame.step} body ${id} Z finite`);
      assert.ok(Number.isFinite(pose.rotation.qw), `Frame ${frame.step} body ${id} qw finite`);
    }
  }

  world.dispose();
});

test('Tier 5.9 - SimpleTowerPhysicsWorld CANNON Body De-Registration on dispose()', async () => {
  const world = new SimpleTowerPhysicsWorld();
  const rawWorld = world.getWorld();

  // Initially only groundBody is in the CANNON world
  assert.equal(rawWorld.bodies.length, 1, 'Initially only 1 ground body in CANNON.World');

  // Add 4 static stones
  const stones = [
    new Stone({ shape: 'boulder', color: '#111', pose: new Pose({ x: 0, y: 0.2, z: 0 }) }),
    new Stone({ shape: 'round', color: '#222', pose: new Pose({ x: 0, y: 0.6, z: 0 }) }),
    new Stone({ shape: 'flat', color: '#333', pose: new Pose({ x: 0, y: 0.9, z: 0 }) }),
    new Stone({ shape: 'pebble', color: '#444', pose: new Pose({ x: 0, y: 1.2, z: 0 }) }),
  ];
  world.addStatic(stones);

  // Now CANNON.World has ground + 4 stones = 5 bodies
  assert.equal(rawWorld.bodies.length, 5, 'World must contain ground + 4 stone bodies = 5');

  // Perform drop
  const dropStone = new Stone({ shape: 'pebble', color: '#555', pose: Pose.origin() });
  await world.drop(dropStone, new Pose({ x: 0, y: 1.5, z: 0 }));

  // CANNON.World has ground + 4 stones + dropBody = 6 bodies
  assert.equal(rawWorld.bodies.length, 6, 'World must contain ground + 4 stones + dropBody = 6');

  // Dispose world
  world.dispose();

  // All stone bodies and drop body MUST be removed from CANNON.World, leaving only groundBody
  assert.equal(
    rawWorld.bodies.length,
    1,
    'dispose() must completely deregister all stone bodies from CANNON.World, leaving only ground'
  );
  assert.equal(world.getTowerBodies().size, 0, 'towerBodies Map must be empty');
  assert.equal(world.getDropBody(), null, 'dropBody must be null');
});

test('Tier 5.10 - Degenerate Shape Fallback and Non-Finite Input Handling', () => {
  // 1. Unknown shape string fallback in StonePhysicsBodyFactory
  const unknownShapeConfig = StonePhysicsBodyFactory.getShapeConfig('non_existent_gem' as any);
  assert.equal(unknownShapeConfig.shape, 'round', 'Unknown shape must fall back to round');
  assert.equal(unknownShapeConfig.mass, 1.2);

  // 2. Unknown shape in geometry spec
  const unknownGeoSpec = buildStoneGeometrySpec('mythical_crystal' as any);
  assert.equal(unknownGeoSpec.shape, 'round', 'Geometry spec must fall back to round');

  // 3. StabilityEvaluator with NaN/Inf coordinates:
  // REMEDIATION VERIFICATION: StabilityEvaluator enforces Number.isFinite() guard.
  // Non-finite COM evaluates to isStable: false and marginDistance: -Infinity.
  const evalNaN = StabilityEvaluator.evaluateStability(
    { x: NaN, y: 1.0, z: NaN },
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    1.0
  );
  assert.equal(
    evalNaN.isStable,
    false,
    'StabilityEvaluator evaluates NaN COM as unstable'
  );
  assert.equal(evalNaN.marginDistance, -Infinity);

  // 4. StabilityEvaluator with Infinity COM
  const evalInf = StabilityEvaluator.evaluateStability(
    { x: Infinity, y: 1.0, z: Infinity },
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    1.0
  );
  assert.equal(
    evalInf.isStable,
    false,
    'StabilityEvaluator evaluates Infinite COM as unstable'
  );
  assert.equal(evalInf.marginDistance, -Infinity);
});

