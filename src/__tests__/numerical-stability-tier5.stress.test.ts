import assert from 'node:assert/strict';
import test from 'node:test';
import * as CANNON from 'cannon-es';
import { Stone } from '../domain/entities/Stone.ts';
import { Tower } from '../domain/entities/Tower.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import { TowerKey } from '../domain/value-objects/TowerKey.ts';
import { SimpleTowerPhysicsWorld } from '../infrastructure/physics/SimpleTowerPhysicsWorld.ts';
import { StabilityEvaluator } from '../infrastructure/physics/StabilityEvaluator.ts';
import { StonePhysicsBodyFactory } from '../infrastructure/physics/StonePhysicsBodyFactory.ts';
import {
  interpolateTrajectoryFrame,
  resetTowerMeshTransforms,
} from '../presentation/components/stoneTowerSpec.ts';
import { StackStoneController } from '../presentation/controllers/StackStoneController.ts';
import { createMsaAppContainer } from '../container.ts';

/**
 * ============================================================================
 * Tier 5: Adversarial Numerical Stability & Robustness Stress Hardening
 * Milestone M4 Phase 2: Comprehensive Empirical Verification
 * ============================================================================
 */

test('Tier 5.1 - Long-Horizon Stepping & Drift Invariance (600+ frames / 10s under gravity)', () => {
  // Setup 3-stone natural cairn in a persistent CANNON world
  const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0),
  });
  const gsSolver = world.solver as CANNON.GSSolver;
  gsSolver.iterations = 25;
  gsSolver.tolerance = 1e-4;
  world.allowSleep = true;

  StonePhysicsBodyFactory.configureWorldMaterials(world);
  const groundBody = StonePhysicsBodyFactory.createGroundBody();
  world.addBody(groundBody);

  const cfgBoulder = StonePhysicsBodyFactory.getShapeConfig('boulder');
  const cfgRound = StonePhysicsBodyFactory.getShapeConfig('round');
  const cfgPebble = StonePhysicsBodyFactory.getShapeConfig('pebble');

  // Base stone (boulder) resting at ground
  const baseStone = new Stone({
    shape: 'boulder',
    color: '#3A3A3A',
    pose: new Pose({ x: 0, y: cfgBoulder.halfExtents.y, z: 0 }),
  });
  const bodyBase = StonePhysicsBodyFactory.createStoneBody(baseStone, { isStatic: false });
  world.addBody(bodyBase);

  // Mid stone (round)
  const yMid = cfgBoulder.halfExtents.y * 2 + cfgRound.halfExtents.y;
  const midStone = new Stone({
    shape: 'round',
    color: '#555555',
    pose: new Pose({ x: 0, y: yMid, z: 0 }),
  });
  const bodyMid = StonePhysicsBodyFactory.createStoneBody(midStone, { isStatic: false });
  world.addBody(bodyMid);

  // Capstone (pebble)
  const yCap = cfgBoulder.halfExtents.y * 2 + cfgRound.halfExtents.y * 2 + cfgPebble.halfExtents.y;
  const capStone = new Stone({
    shape: 'pebble',
    color: '#777777',
    pose: new Pose({ x: 0, y: yCap, z: 0 }),
  });
  const bodyCap = StonePhysicsBodyFactory.createStoneBody(capStone, { isStatic: false });
  world.addBody(bodyCap);

  const dt = 1 / 60;
  let settledAtStep = -1;

  // Let cairn settle for initial 60 steps (1.0 second)
  for (let step = 0; step < 60; step++) {
    world.step(dt);
  }

  const initialYBase = bodyBase.position.y;
  const initialYMid = bodyMid.position.y;
  const initialYCap = bodyCap.position.y;

  // Long-horizon simulation: step 600 more frames (10 seconds total)
  for (let step = 60; step < 660; step++) {
    world.step(dt);

    // Assert absolute non-penetration of ground plane across every single frame
    assert.ok(
      bodyBase.position.y >= cfgBoulder.halfExtents.y - 0.02,
      `Base stone must never penetrate ground plane at step ${step}: y=${bodyBase.position.y}`
    );
    assert.ok(
      bodyMid.position.y >= bodyBase.position.y + cfgBoulder.halfExtents.y + cfgRound.halfExtents.y - 0.05,
      `Mid stone must maintain stacking order at step ${step}: y=${bodyMid.position.y}`
    );
    assert.ok(
      bodyCap.position.y >= bodyMid.position.y + cfgRound.halfExtents.y + cfgPebble.halfExtents.y - 0.05,
      `Capstone must maintain stacking order at step ${step}: y=${bodyCap.position.y}`
    );

    // Assert no coordinate explosion (NaN or Infinity)
    assert.ok(Number.isFinite(bodyCap.position.x), 'Position X must remain finite');
    assert.ok(Number.isFinite(bodyCap.position.y), 'Position Y must remain finite');
    assert.ok(Number.isFinite(bodyCap.position.z), 'Position Z must remain finite');

    // Check if sleeping or settled
    const vBase = bodyBase.velocity.length();
    const vMid = bodyMid.velocity.length();
    const vCap = bodyCap.velocity.length();
    if (vBase < 0.01 && vMid < 0.01 && vCap < 0.01 && settledAtStep === -1) {
      settledAtStep = step;
    }
  }

  // Verify drift invariance after 600 frames
  const driftYBase = Math.abs(bodyBase.position.y - initialYBase);
  const driftYMid = Math.abs(bodyMid.position.y - initialYMid);
  const driftYCap = Math.abs(bodyCap.position.y - initialYCap);

  assert.ok(
    driftYBase < 0.005,
    `Base stone vertical drift over 600 frames must be < 5mm, got ${driftYBase}m`
  );
  assert.ok(
    driftYMid < 0.01,
    `Mid stone vertical drift over 600 frames must be < 10mm, got ${driftYMid}m`
  );
  assert.ok(
    driftYCap < 0.015,
    `Capstone vertical drift over 600 frames must be < 15mm, got ${driftYCap}m`
  );

  const lateralDriftCap = Math.hypot(bodyCap.position.x, bodyCap.position.z);
  assert.ok(
    lateralDriftCap < 0.02,
    `Capstone lateral drift over 600 frames must be < 20mm, got ${lateralDriftCap}m`
  );
});

test('Tier 5.2 - Massive Shock Impact & Ground Non-Penetration Invariant (y >= 0)', async () => {
  const world = new SimpleTowerPhysicsWorld();
  const cfgBoulder = StonePhysicsBodyFactory.getShapeConfig('boulder');

  // Base stone static on ground
  const base = new Stone({
    shape: 'boulder',
    color: '#222222',
    pose: new Pose({ x: 0, y: cfgBoulder.halfExtents.y, z: 0 }),
  });
  world.addStatic([base]);

  // Drop heavy boulder from extreme elevation (h = 8.0m) directly centered
  const heavyStone = new Stone({
    shape: 'boulder',
    color: '#888888',
    pose: Pose.origin(),
  });
  const extremeHighDropPose = new Pose({ x: 0, y: 8.0, z: 0 });

  const resultHigh = await world.drop(heavyStone, extremeHighDropPose);

  // Verify all trajectory frames for anti-tunneling & ground non-penetration
  assert.ok(
    resultHigh.trajectory && resultHigh.trajectory.length > 50,
    'Trajectory must record high impact frames'
  );

  let minYObserved = Infinity;
  for (const frame of resultHigh.trajectory) {
    const droppedPose = frame.poses.get('dropped-stone');
    if (droppedPose) {
      if (droppedPose.position.y < minYObserved) {
        minYObserved = droppedPose.position.y;
      }
      // Dropped stone center of mass must NEVER drop below halfExtent (it is on top of tower or ground)
      assert.ok(
        droppedPose.position.y >= cfgBoulder.halfExtents.y - 0.05,
        `Anti-tunneling invariant violated at step ${frame.step}: y=${droppedPose.position.y} < 0`
      );
      assert.ok(
        !Number.isNaN(droppedPose.position.y),
        `NaN coordinate detected at step ${frame.step}`
      );
    }
  }

  assert.ok(
    minYObserved > 0.2,
    `Minimum observed COM height must remain strictly positive, got ${minYObserved}m`
  );

  // Now test severe high velocity downward impact (v_y = -30 m/s) on bare ground
  const directWorld = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  StonePhysicsBodyFactory.configureWorldMaterials(directWorld);
  directWorld.addBody(StonePhysicsBodyFactory.createGroundBody());

  const shockBody = StonePhysicsBodyFactory.createStoneBody(heavyStone, { isStatic: false });
  shockBody.position.set(0, 2.0, 0);
  shockBody.velocity.set(0, -30.0, 0); // Extreme downward velocity: 108 km/h!
  directWorld.addBody(shockBody);

  let shockMinY = Infinity;
  for (let s = 0; s < 120; s++) {
    directWorld.step(1 / 60);
    if (shockBody.position.y < shockMinY) {
      shockMinY = shockBody.position.y;
    }
    // Ground plane is at y=0. Rigid body center of mass must strictly remain y >= 0
    assert.ok(
      shockBody.position.y >= 0,
      `Ground plane non-penetration violated under 30m/s shock impact: y=${shockBody.position.y} < 0`
    );
  }

  assert.ok(
    shockMinY >= 0,
    `Extreme impact shock must not tunnel below ground y=0 (y_min=${shockMinY})`
  );
});

test('Tier 5.3 - StabilityEvaluator Degenerate Edge Cases (Collinear, Zero-Area, Zero-Mass)', () => {
  // 1. Degenerate 2-point collinear polygon
  const collinear2Pts: [number, number][] = [
    [0, 0],
    [1, 1],
  ];
  const eval2 = StabilityEvaluator.evaluateStability(
    { x: 0.5, y: 0.5, z: 0.5 },
    collinear2Pts,
    1.5
  );
  assert.equal(eval2.isStable, false, 'Collinear 2-point contact must be strictly unstable');
  assert.equal(eval2.marginDistance, -Infinity, 'Margin distance for < 3 vertices must be -Infinity');
  assert.equal(eval2.nearestEdgeDistance, 0, 'Nearest edge distance for < 3 vertices must be 0');

  // 2. Degenerate 3-point collinear polygon
  const collinear3Pts: [number, number][] = [
    [0, 0],
    [1, 1],
    [2, 2],
  ];
  const eval3 = StabilityEvaluator.evaluateStability(
    { x: 1, y: 0.5, z: 1 },
    collinear3Pts,
    1.5
  );
  // Monotone chain or evaluateStability with 3 collinear points
  // If points are strictly collinear, cross products are all 0
  assert.ok(
    typeof eval3.isStable === 'boolean',
    'Collinear 3-point must return boolean stability without throwing'
  );
  assert.ok(
    Number.isFinite(eval3.marginDistance) || eval3.marginDistance === -Infinity,
    'Margin distance must not be NaN'
  );

  // 3. Single point contact
  const singlePt: [number, number][] = [[0.5, 0.5]];
  const eval1 = StabilityEvaluator.evaluateStability({ x: 0.5, y: 0, z: 0.5 }, singlePt, 1.0);
  assert.equal(eval1.isStable, false, 'Single point contact must be unstable');
  assert.equal(eval1.marginDistance, -Infinity, 'Single point contact margin must be -Infinity');

  // 4. Empty point array
  const evalEmpty = StabilityEvaluator.evaluateStability({ x: 0, y: 0, z: 0 }, [], 1.0);
  assert.equal(evalEmpty.isStable, false, 'Empty polygon must be unstable');
  assert.equal(evalEmpty.marginDistance, -Infinity, 'Empty polygon margin must be -Infinity');

  // 5. Zero-area / needle-thin stone
  // Test composite COM with zero total mass
  const zeroMassCOM = StabilityEvaluator.computeCompositeCOM([
    { mass: 0, position: { x: 1, y: 2, z: 3 } },
    { mass: 0, position: { x: 4, y: 5, z: 6 } },
  ]);
  assert.deepEqual(
    zeroMassCOM,
    { x: 0, y: 0, z: 0 },
    'Zero total mass must cleanly return origin {0,0,0} without NaN'
  );

  // 6. Overturning torque computation on unstable COM
  const unstableCOM = { x: 2.0, y: 0.5, z: 0.0 };
  const basePolygon: [number, number][] = [
    [-0.3, -0.3],
    [0.3, -0.3],
    [0.3, 0.3],
    [-0.3, 0.3],
  ];
  const evalUnstable = StabilityEvaluator.evaluateStability(unstableCOM, basePolygon, 2.0);
  assert.equal(evalUnstable.isStable, false, 'COM far outside polygon must be unstable');
  assert.ok(evalUnstable.overturningTorque !== undefined, 'Overturning torque must be generated');
  if (evalUnstable.overturningTorque) {
    assert.ok(Number.isFinite(evalUnstable.overturningTorque.x), 'Torque X must be finite');
    assert.ok(Number.isFinite(evalUnstable.overturningTorque.y), 'Torque Y must be finite');
    assert.ok(Number.isFinite(evalUnstable.overturningTorque.z), 'Torque Z must be finite');
    // +X offset produces overturning torque in -Z direction: tau_z = -rx * m * g
    assert.ok(
      evalUnstable.overturningTorque.z < 0,
      `+X offset must produce negative Z overturning torque, got ${evalUnstable.overturningTorque.z}`
    );
  }

  // 7. Center of mass exactly on the edge boundary
  const edgeCOM = { x: 0.3, y: 0.5, z: 0.0 };
  const evalEdge = StabilityEvaluator.evaluateStability(edgeCOM, basePolygon, 1.0);
  assert.ok(
    Math.abs(evalEdge.marginDistance) < 1e-4,
    `Edge COM must have margin near 0, got ${evalEdge.marginDistance}`
  );
});

test('Tier 5.4 - Quaternion SLERP Robustness (Zero Norm, Antipodal, Orthogonal, Boundaries)', () => {
  // 1. Zero-norm quaternion fallback test (degenerate quaternion)
  const zeroQuatTrajectory = [
    {
      step: 0,
      time: 0,
      poses: new Map([
        [
          'stone-0',
          new Pose(
            { x: 0, y: 1, z: 0 },
            { qx: 0, qy: 0, qz: 0, qw: 0 } // Corrupted zero-norm
          ),
        ],
      ]),
    },
    {
      step: 1,
      time: 1 / 60,
      poses: new Map([
        [
          'stone-0',
          new Pose(
            { x: 0, y: 1, z: 0 },
            { qx: 0, qy: 0, qz: 0, qw: 1 }
          ),
        ],
      ]),
    },
  ];

  const zeroQuatResult = interpolateTrajectoryFrame(zeroQuatTrajectory, 0.5 / 60);
  const interpolatedZero = zeroQuatResult.poses.get('stone-0');
  assert.ok(interpolatedZero !== undefined, 'Zero quat stone pose must be resolved');
  if (interpolatedZero) {
    assert.ok(!Number.isNaN(interpolatedZero.rotation.qx), 'QX must not be NaN');
    assert.ok(!Number.isNaN(interpolatedZero.rotation.qy), 'QY must not be NaN');
    assert.ok(!Number.isNaN(interpolatedZero.rotation.qz), 'QZ must not be NaN');
    assert.ok(!Number.isNaN(interpolatedZero.rotation.qw), 'QW must not be NaN');
  }

  // 2. Antipodal quaternions (q and -q represent identical 360-degree rotation)
  // qA = [0, 1, 0, 0] (180 deg around Y)
  // qB = [0, -1, 0, 0] (-180 deg around Y = identical orientation, dot = -1)
  const antipodalTrajectory = [
    {
      step: 0,
      time: 0,
      poses: new Map([
        ['stone-1', new Pose({ x: 0, y: 0, z: 0 }, { qx: 0, qy: 1, qz: 0, qw: 0 })],
      ]),
    },
    {
      step: 60,
      time: 1.0,
      poses: new Map([
        ['stone-1', new Pose({ x: 0, y: 0, z: 0 }, { qx: 0, qy: -1, qz: 0, qw: 0 })],
      ]),
    },
  ];

  const antipodalMid = interpolateTrajectoryFrame(antipodalTrajectory, 0.5);
  const poseMid = antipodalMid.poses.get('stone-1');
  assert.ok(poseMid !== undefined, 'Antipodal pose must be resolved');
  if (poseMid) {
    // Due to dot < 0 flip, shortest-path interpolation should keep qy ~ 1 or -1 without jerk
    const norm = Math.hypot(
      poseMid.rotation.qx,
      poseMid.rotation.qy,
      poseMid.rotation.qz,
      poseMid.rotation.qw
    );
    assert.ok(
      Math.abs(norm - 1.0) < 0.01,
      `Interpolated quaternion norm must be 1.0, got ${norm}`
    );
    assert.ok(
      Math.abs(Math.abs(poseMid.rotation.qy) - 1.0) < 0.05,
      `Antipodal rotation should maintain orientation: qy=${poseMid.rotation.qy}`
    );
  }

  // 3. Out-of-bounds timestamps
  const normalTrajectory = [
    {
      step: 0,
      time: 0,
      poses: new Map([
        ['stone-2', new Pose({ x: 0, y: 0, z: 0 }, { qx: 0, qy: 0, qz: 0, qw: 1 })],
      ]),
    },
    {
      step: 60,
      time: 1.0,
      poses: new Map([
        ['stone-2', new Pose({ x: 10, y: 10, z: 10 }, { qx: 0, qy: 0, qz: 0, qw: 1 })],
      ]),
    },
  ];

  // Negative timestamp (t = -5.0s) -> should clamp to frame 0
  const negResult = interpolateTrajectoryFrame(normalTrajectory, -5.0);
  assert.equal(negResult.poses.get('stone-2')?.position.x, 0, 'Negative time must clamp to frame 0');
  assert.equal(negResult.isComplete, false, 'Negative time is not complete');

  // Huge timestamp (t = 100.0s) -> should clamp to frame N-1 and mark isComplete
  const lateResult = interpolateTrajectoryFrame(normalTrajectory, 100.0);
  assert.equal(lateResult.poses.get('stone-2')?.position.x, 10, 'Huge time must clamp to last frame');
  assert.equal(lateResult.isComplete, true, 'Huge time must mark isComplete = true');

  // 4. Empty trajectory robustness
  const emptyResult = interpolateTrajectoryFrame([], 1.0);
  assert.equal(emptyResult.isComplete, true, 'Empty trajectory must return isComplete = true');
  assert.equal(emptyResult.poses.size, 0, 'Empty trajectory must return empty poses map');
});

test('Tier 5.5 - Concurrency Burst, Gesture Spam & Memory Bounding', async () => {
  const fetchFn = async () => ({
    ok: true,
    status: 201,
    json: async () => ({
      id: 'wish-concurrency-1',
      createdAt: new Date().toISOString(),
    }),
  });
  const container = createMsaAppContainer(
    'http://localhost:8080',
    fetchFn as unknown as typeof globalThis.fetch
  );
  const controller = new StackStoneController(container);
  controller.updateContent('소원을 빕니다');
  const testTower = new Tower(TowerKey.global(), [], {
    stoneCount: 0,
    todayCount: 0,
    fulfilledCount: 0,
    cheerCount: 0,
  });

  // 1. Concurrency Burst: 10 concurrent placeStone invocations
  // Exactly 1 must proceed and 9 must be rejected with PLACEMENT_IN_PROGRESS
  const concurrentCalls = Array.from({ length: 10 }, () =>
    controller.placeStone(testTower, new Pose({ x: 0, y: 1.0, z: 0 }))
  );

  const results = await Promise.allSettled(concurrentCalls);
  const fulfilledCount = results.filter((r) => r.status === 'fulfilled').length;
  const rejectedCount = results.filter((r) => r.status === 'rejected').length;

  assert.equal(
    fulfilledCount,
    1,
    `Exactly 1 concurrent placeStone must succeed, got ${fulfilledCount}`
  );
  assert.equal(
    rejectedCount,
    9,
    `Exactly 9 concurrent placeStone calls must be rejected, got ${rejectedCount}`
  );

  for (const r of results) {
    if (r.status === 'rejected') {
      assert.ok(
        r.reason.message === 'PLACEMENT_IN_PROGRESS',
        `Rejection reason must be PLACEMENT_IN_PROGRESS, got ${r.reason.message}`
      );
    }
  }

  // 2. Rapid Gesture Spam: 100 cycles of startPlacing -> resetPlacement
  for (let i = 0; i < 100; i++) {
    controller.startPlacing();
    assert.equal(controller.getState().phase, 'PLACING');
    controller.updateContent(`소원 ${i}`);
    controller.overrideCategory('health');
    controller.resetPlacement();
    assert.equal(controller.getState().phase, 'IDLE');
  }

  assert.equal(controller.getState().phase, 'IDLE', 'Final state after spam must be IDLE');

  // 3. Persistent World Memory Bounding (Zero Body Leaks across 30 drops)
  const world = new SimpleTowerPhysicsWorld();
  const baseStone = new Stone({
    shape: 'boulder',
    color: '#333333',
    pose: new Pose({ x: 0, y: 0.2625, z: 0 }),
  });
  world.addStatic([baseStone]);

  const dropStone = new Stone({
    shape: 'round',
    color: '#666666',
    pose: Pose.origin(),
  });

  const cannonWorld = world.getWorld();
  const initialBodyCount = cannonWorld.bodies.length; // Ground (1) + Base (1) = 2 bodies

  assert.equal(
    initialBodyCount,
    2,
    `Initial world must contain exactly 2 bodies (ground + static base), got ${initialBodyCount}`
  );

  // Perform 30 sequential drops
  for (let i = 0; i < 30; i++) {
    await world.drop(dropStone, new Pose({ x: 0, y: 1.0, z: 0 }));
    // Body count must NEVER exceed 3: ground (1) + base (1) + active/last dropBody (1)
    assert.ok(
      cannonWorld.bodies.length <= 3,
      `Memory leak detected: world bodies grew to ${cannonWorld.bodies.length} at drop ${i}`
    );
  }

  // Dispose verification
  world.dispose();
  assert.equal(
    cannonWorld.bodies.length,
    1,
    `After dispose(), only ground body should remain in world, got ${cannonWorld.bodies.length}`
  );
});

test('Tier 5.6 - Dynamic Cascading Collapse Energy Dissipation & Radial Scatter Bound', async () => {
  const world = new SimpleTowerPhysicsWorld();
  const cfgBoulder = StonePhysicsBodyFactory.getShapeConfig('boulder');
  const cfgRound = StonePhysicsBodyFactory.getShapeConfig('round');

  // Construct a 3-stone tower: boulder base + round mid + flat top
  const base = new Stone({
    shape: 'boulder',
    color: '#111111',
    pose: new Pose({ x: 0, y: 0.2625, z: 0 }),
  });
  const mid = new Stone({
    shape: 'round',
    color: '#222222',
    pose: new Pose({ x: 0, y: 0.55, z: 0 }),
  });
  const top = new Stone({
    shape: 'flat',
    color: '#333333',
    pose: new Pose({ x: 0, y: 0.85, z: 0 }),
  });

  world.addStatic([base, mid, top]);

  // Drop top boulder off-center (+0.40m in X) to trigger violent dynamic collapse
  const topDropStone = new Stone({
    shape: 'boulder',
    color: '#444444',
    pose: Pose.origin(),
  });
  const collapseDropPose = new Pose({
    x: 0.40,
    y: 1.30,
    z: 0,
  });

  const collapseResult = await world.drop(topDropStone, collapseDropPose);

  assert.equal(collapseResult.settled, false, 'Off-center heavy drop must tumble');
  assert.equal(collapseResult.collapsed, true, 'Tower must collapse');
  assert.ok(
    collapseResult.affectedStones && collapseResult.affectedStones.length >= 1,
    'At least 1 tower stone must be displaced dynamically in cascade'
  );

  // Radial scatter verification
  const finalX = collapseResult.pose.position.x;
  const finalZ = collapseResult.pose.position.z;
  const scatterDist = Math.hypot(finalX, finalZ);

  assert.ok(
    scatterDist >= 0.40,
    `Tumbling stone must exhibit radial scatter >= 0.40m, got ${scatterDist.toFixed(4)}m`
  );

  // Resting height verification on ground
  assert.ok(
    collapseResult.pose.position.y <= cfgBoulder.halfExtents.y * 2 + 0.1,
    `Tumbled stone must come to rest near ground plane, got y=${collapseResult.pose.position.y}`
  );
  assert.ok(
    collapseResult.pose.position.y >= cfgBoulder.halfExtents.y - 0.05,
    `Tumbled stone must not penetrate ground plane, got y=${collapseResult.pose.position.y}`
  );

  // Verify trajectory steps bounded by maxSteps (200)
  assert.ok(
    collapseResult.trajectory && collapseResult.trajectory.length <= 200,
    `Trajectory steps must be bounded by maxSteps (200), got ${collapseResult.trajectory?.length}`
  );
});

test('Tier 5.7 - Remediated: StabilityEvaluator Non-Finite / NaN COM Coordinate Sanitization', () => {
  const polygon: [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];

  // With Number.isFinite check, non-finite points (NaN, Infinity) are rejected upfront.
  const resNaN = StabilityEvaluator.evaluateStability(
    { x: NaN, y: 1.0, z: NaN },
    polygon,
    1.0
  );

  assert.equal(
    resNaN.isStable,
    false,
    'REMEDIATION VERIFIED: StabilityEvaluator evaluates NaN COM as unstable'
  );
  assert.equal(
    resNaN.marginDistance,
    -Infinity,
    'REMEDIATION VERIFIED: marginDistance is set to -Infinity for NaN COM'
  );

  const resInf = StabilityEvaluator.evaluateStability(
    { x: Infinity, y: 1.0, z: Infinity },
    polygon,
    1.0
  );
  assert.equal(
    resInf.isStable,
    false,
    'REMEDIATION VERIFIED: StabilityEvaluator evaluates Infinite COM as unstable'
  );
  assert.equal(
    resInf.marginDistance,
    -Infinity,
    'REMEDIATION VERIFIED: marginDistance is set to -Infinity for Infinite COM'
  );
});

test('Tier 5.8 - Remediated: interpolateTrajectoryFrame Safe Fallback on NaN Elapsed Seconds', () => {
  const trajectory = [
    {
      step: 0,
      time: 0,
      poses: new Map([
        ['stone-1', new Pose({ x: 0, y: 0, z: 0 }, { qx: 0, qy: 0, qz: 0, qw: 1 })],
      ]),
    },
    {
      step: 1,
      time: 1 / 60,
      poses: new Map([
        ['stone-1', new Pose({ x: 1, y: 1, z: 1 }, { qx: 0, qy: 0, qz: 0, qw: 1 })],
      ]),
    },
  ];

  // When elapsedSeconds is NaN (e.g. from invalid timestamp delta), interpolateTrajectoryFrame
  // must safely return frame 0 rather than throwing TypeError.
  const res = interpolateTrajectoryFrame(trajectory, NaN);
  assert.equal(res.isComplete, false, 'Multi-frame trajectory at step 0 is not complete');
  assert.equal(res.currentStep, 0, 'Current step falls back to step 0');
  assert.equal(res.poses.get('stone-1')?.position.x, 0, 'Pose corresponds to frame 0');
});

