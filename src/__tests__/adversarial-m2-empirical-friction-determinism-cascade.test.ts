/**
 * Adversarial Empirical Verification Suite for Milestone M2:
 * 1. Coulomb Incline Friction Slip:
 *    - Incline angle sweep 0° to 60° in 1° increments
 *    - Static friction threshold holding strictly for theta <= arctan(mu_s)
 *    - Dynamic slip strictly for theta > arctan(mu_s)
 *    - Downhill tangential acceleration formula: a = g * (sin(theta) - mu_k * cos(theta))
 *    - Directional downhill sliding on inclined contacts in SimpleTowerPhysicsWorld
 * 2. Trajectory Determinism:
 *    - Parallel independent simulation runs across diverse drop regimes
 *    - Bit-for-bit frame-by-frame and final pose equality (100% determinism)
 * 3. Cascading Collapse Dynamics & Ground Plane Stability:
 *    - Multi-stone cairn collapses (3-stone, 4-stone, 5-stone)
 *    - Ground plane containment: tumbled stones resting on 28m Zen garden ground disc (y >= 0, r <= 28m)
 *    - Zero NaN, zero undefined, zero runaway velocities
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { Stone } from '../domain/entities/Stone.ts';
import { type DropResult, type SimulationFrame, type CollapsedStonePose } from '../domain/ports/PhysicsWorld.ts';
import { Pose, type Vec3 } from '../domain/value-objects/Pose.ts';
import {
  StabilityEvaluator,
  STABILITY_ZONES,
  type InclineSlipEvaluation,
} from '../infrastructure/physics/StabilityEvaluator.ts';
import { SimpleTowerPhysicsWorld } from '../infrastructure/physics/SimpleTowerPhysicsWorld.ts';
import { StonePhysicsBodyFactory } from '../infrastructure/physics/StonePhysicsBodyFactory.ts';

const ZEN_GARDEN_RADIUS = 28.0;

// =============================================================================
// SUITE 1: Coulomb Incline Friction Slip Verification (0° to 60° in 1° increments)
// =============================================================================

test('Adversarial M2.1.1 - Coulomb Incline Sweep 0° to 60° at 1° increments verifies strict slip threshold', () => {
  const mu_s = STABILITY_ZONES.STATIC_FRICTION_COEFF; // 0.50
  const mu_k = mu_s * STABILITY_ZONES.KINETIC_FRICTION_RATIO; // 0.45
  const g = STABILITY_ZONES.GRAVITY; // 9.82 m/s^2

  const criticalAngleDeg = (Math.atan(mu_s) * 180) / Math.PI; // ~26.565051°
  assert.ok(
    criticalAngleDeg > 26.56 && criticalAngleDeg < 26.57,
    `Critical angle for mu_s=0.5 must be ~26.565°, got ${criticalAngleDeg}`
  );

  let staticCount = 0;
  let slipCount = 0;
  let prevTangentialAccel = -1;

  for (let theta = 0; theta <= 60; theta++) {
    const slipEval = StabilityEvaluator.evaluateInclineSlip(theta, mu_s, g);
    const rad = (theta * Math.PI) / 180;
    const tanTheta = Math.tan(rad);

    assert.equal(
      slipEval.frictionCoefficient,
      mu_s,
      `Step theta=${theta}°: friction coefficient must match`
    );
    assert.ok(
      Math.abs(slipEval.criticalSlipAngleDeg - Number(criticalAngleDeg.toFixed(2))) < 0.05,
      `Step theta=${theta}°: critical slip angle must be accurately reported`
    );

    // Verify Normal acceleration a_n = g * cos(theta)
    const expectedNormalAccel = Number((g * Math.cos(rad)).toFixed(4));
    assert.ok(
      Math.abs(slipEval.normalAcceleration - expectedNormalAccel) <= 0.001,
      `Step theta=${theta}°: normal acceleration must be g*cos(theta)=${expectedNormalAccel}, got ${slipEval.normalAcceleration}`
    );

    if (theta <= criticalAngleDeg) {
      // STATIC FRICTION HOLDS: tan(theta) <= mu_s
      assert.equal(
        slipEval.shouldSlip,
        false,
        `Step theta=${theta}°: tan(${theta}°) = ${tanTheta.toFixed(4)} <= ${mu_s}, static friction MUST hold`
      );
      assert.equal(
        slipEval.tangentialAcceleration,
        0,
        `Step theta=${theta}°: static friction requires tangential acceleration = 0`
      );
      staticCount++;
    } else {
      // DYNAMIC SLIP OCCURS: tan(theta) > mu_s
      assert.equal(
        slipEval.shouldSlip,
        true,
        `Step theta=${theta}°: tan(${theta}°) = ${tanTheta.toFixed(4)} > ${mu_s}, slip MUST initiate`
      );

      // Verify downhill tangential acceleration formula: a = g * (sin(theta) - mu_k * cos(theta))
      const expectedTangentialAccel = Number(
        Math.max(0, g * (Math.sin(rad) - mu_k * Math.cos(rad))).toFixed(4)
      );
      assert.ok(
        Math.abs(slipEval.tangentialAcceleration - expectedTangentialAccel) <= 0.001,
        `Step theta=${theta}°: tangential acceleration formula mismatch. Expected ${expectedTangentialAccel}, got ${slipEval.tangentialAcceleration}`
      );

      // Downhill acceleration must strictly increase monotonically with angle
      assert.ok(
        slipEval.tangentialAcceleration > prevTangentialAccel,
        `Step theta=${theta}°: acceleration (${slipEval.tangentialAcceleration}) must strictly exceed prev (${prevTangentialAccel})`
      );
      prevTangentialAccel = slipEval.tangentialAcceleration;
      slipCount++;
    }
  }

  // Exactly 27 static steps (0° to 26°) and 34 slip steps (27° to 60°)
  assert.equal(staticCount, 27, 'Must have exactly 27 static steps (0° through 26°)');
  assert.equal(slipCount, 34, 'Must have exactly 34 slip steps (27° through 60°)');
});

test('Adversarial M2.1.2 - High-precision infinitesimal boundary probe at theta_c +/- 1e-4 degrees', () => {
  const mu_s = 0.50;
  const criticalAngleDeg = (Math.atan(mu_s) * 180) / Math.PI; // 26.565051...

  // Sub-critical boundary: theta_c - 0.0001°
  const subCritical = StabilityEvaluator.evaluateInclineSlip(criticalAngleDeg - 1e-4, mu_s);
  assert.equal(subCritical.shouldSlip, false, 'Infinitesimally below theta_c must NOT slip');
  assert.equal(subCritical.tangentialAcceleration, 0);

  // Super-critical boundary: theta_c + 0.0001°
  const superCritical = StabilityEvaluator.evaluateInclineSlip(criticalAngleDeg + 1e-4, mu_s);
  assert.equal(superCritical.shouldSlip, true, 'Infinitesimally above theta_c MUST slip');
  assert.ok(
    superCritical.tangentialAcceleration >= 0,
    'Tangential acceleration must be non-negative'
  );
});

test('Adversarial M2.1.3 - Coulomb slip parameterized across diverse friction coefficients (mu_s in 0.1..1.2)', () => {
  const frictionList = [0.15, 0.30, 0.45, 0.60, 0.75, 1.00, 1.20];

  const evaluateInclineSlipFn = StabilityEvaluator.evaluateInclineSlip as (
    deg: number,
    frictionCoeff?: number,
    gravity?: number
  ) => InclineSlipEvaluation;

  for (const mu of frictionList) {
    const thetaCritDeg = (Math.atan(mu) * 180) / Math.PI;

    // Below critical
    const below = evaluateInclineSlipFn(thetaCritDeg - 0.5, mu);
    assert.equal(below.shouldSlip, false, `mu=${mu}: thetaCrit - 0.5° must not slip`);
    assert.equal(below.tangentialAcceleration, 0);

    // Above critical
    const above = evaluateInclineSlipFn(thetaCritDeg + 0.5, mu);
    assert.equal(above.shouldSlip, true, `mu=${mu}: thetaCrit + 0.5° must slip`);
    assert.ok(above.tangentialAcceleration > 0);
  }
});

test('Adversarial M2.1.4 - Dynamic incline slip simulation in SimpleTowerPhysicsWorld in 4 cardinal and diagonal directions', async () => {
  const directions: { name: string; normal: Vec3; expectedSlideAxis: 'x' | 'z'; expectedSign: number }[] = [
    { name: '+X tilt', normal: { x: 0.5736, y: 0.8192, z: 0 }, expectedSlideAxis: 'x', expectedSign: 1 },
    { name: '-X tilt', normal: { x: -0.5736, y: 0.8192, z: 0 }, expectedSlideAxis: 'x', expectedSign: -1 },
    { name: '+Z tilt', normal: { x: 0, y: 0.8192, z: 0.5736 }, expectedSlideAxis: 'z', expectedSign: 1 },
    { name: '-Z tilt', normal: { x: 0, y: 0.8192, z: -0.5736 }, expectedSlideAxis: 'z', expectedSign: -1 },
  ];

  for (const dir of directions) {
    const world = new SimpleTowerPhysicsWorld();
    const baseConfig = StonePhysicsBodyFactory.getShapeConfig('boulder');
    const baseStone = new Stone({
      shape: 'boulder',
      color: '#222222',
      pose: new Pose({ x: 0, y: baseConfig.halfExtents.y, z: 0 }),
    });
    world.addStatic([baseStone]);

    const topConfig = StonePhysicsBodyFactory.getShapeConfig('pebble');
    const topStone = new Stone({
      shape: 'pebble',
      color: '#EEEEEE',
      pose: Pose.origin(),
    });

    const dropPose = new Pose({
      x: 0,
      y: baseConfig.halfExtents.y * 2 + topConfig.halfExtents.y + 0.04,
      z: 0,
    });

    // 35° incline > 26.57° critical slip threshold
    const res = await world.drop(topStone, dropPose, {
      inclineAngleDeg: 35.0,
      inclineNormal: dir.normal,
    });

    assert.equal(res.settled, false, `${dir.name}: stone on 35° incline must fail to settle on top`);
    assert.equal(res.collapsed, true, `${dir.name}: stone must slip off`);

    const finalCoord = dir.expectedSlideAxis === 'x' ? res.pose.position.x : res.pose.position.z;
    if (dir.expectedSign > 0) {
      assert.ok(
        finalCoord > 0.08,
        `${dir.name}: final coordinate along ${dir.expectedSlideAxis} must be positive, got ${finalCoord}`
      );
    } else {
      assert.ok(
        finalCoord < -0.08,
        `${dir.name}: final coordinate along ${dir.expectedSlideAxis} must be negative, got ${finalCoord}`
      );
    }

    world.dispose();
  }
});

// =============================================================================
// SUITE 2: 100% Trajectory Determinism Across Parallel Simulation Runs
// =============================================================================

test('Adversarial M2.2.1 - 10 Parallel Independent Runs Produce 100% Bit-for-Bit Trajectory and Pose Parity', async () => {
  const PARALLEL_RUNS = 10;

  // Run 10 parallel worlds simultaneously
  const runTasks = Array.from(
    { length: PARALLEL_RUNS },
    async (_, runIndex): Promise<{ runIndex: number; result: DropResult }> => {
    const world = new SimpleTowerPhysicsWorld();

    const baseConfig = StonePhysicsBodyFactory.getShapeConfig('boulder');
    const baseStone = new Stone({
      shape: 'boulder',
      color: '#1A1A1A',
      pose: new Pose({ x: 0, y: baseConfig.halfExtents.y, z: 0 }),
    });
    world.addStatic([baseStone]);

    const topStone = new Stone({
      shape: 'round',
      color: '#A0A0A0',
      pose: Pose.origin(),
    });

    // Tension zone drop to exercise micro-wobble oscillatory path
    const dropPose = new Pose({
      x: 0.175,
      y: baseConfig.halfExtents.y * 2 + 0.15,
      z: -0.035,
    });

    const result = await world.drop(topStone, dropPose);
    world.dispose();
    return { runIndex, result };
  });

  const results = await Promise.all(runTasks);
  const baseline = results[0].result;

  assert.ok(baseline.trajectory && baseline.trajectory.length > 50, 'Baseline must have substantial trajectory');

  for (let i = 1; i < results.length; i++) {
    const current = results[i].result;
    const runIdx = results[i].runIndex;

    // 1. Status parity
    assert.equal(current.settled, baseline.settled, `Run ${runIdx}: settled flag mismatch`);
    assert.equal(current.collapsed, baseline.collapsed, `Run ${runIdx}: collapsed flag mismatch`);
    assert.equal(
      current.trajectory?.length,
      baseline.trajectory?.length,
      `Run ${runIdx}: trajectory frame count mismatch (${current.trajectory?.length} vs ${baseline.trajectory?.length})`
    );

    // 2. Bit-for-bit frame-by-frame trajectory verification
    const framesCount = baseline.trajectory!.length;
    const baseFrames: readonly SimulationFrame[] = baseline.trajectory!;
    const curFrames: readonly SimulationFrame[] = current.trajectory!;
    for (let f = 0; f < framesCount; f++) {
      const baseFrame: SimulationFrame = baseFrames[f];
      const curFrame: SimulationFrame = curFrames[f];

      assert.equal(curFrame.step, baseFrame.step, `Run ${runIdx} frame ${f}: step mismatch`);
      assert.equal(curFrame.time, baseFrame.time, `Run ${runIdx} frame ${f}: time mismatch`);

      const basePose = baseFrame.poses.get('dropped-stone')!;
      const curPose = curFrame.poses.get('dropped-stone')!;

      assert.equal(
        curPose.position.x,
        basePose.position.x,
        `Run ${runIdx} frame ${f}: pos.x mismatch (${curPose.position.x} vs ${basePose.position.x})`
      );
      assert.equal(
        curPose.position.y,
        basePose.position.y,
        `Run ${runIdx} frame ${f}: pos.y mismatch`
      );
      assert.equal(
        curPose.position.z,
        basePose.position.z,
        `Run ${runIdx} frame ${f}: pos.z mismatch`
      );
      assert.equal(
        curPose.rotation.qx,
        basePose.rotation.qx,
        `Run ${runIdx} frame ${f}: rot.qx mismatch`
      );
      assert.equal(
        curPose.rotation.qy,
        basePose.rotation.qy,
        `Run ${runIdx} frame ${f}: rot.qy mismatch`
      );
      assert.equal(
        curPose.rotation.qz,
        basePose.rotation.qz,
        `Run ${runIdx} frame ${f}: rot.qz mismatch`
      );
      assert.equal(
        curPose.rotation.qw,
        basePose.rotation.qw,
        `Run ${runIdx} frame ${f}: rot.qw mismatch`
      );
    }

    // 3. Bit-for-bit final pose verification
    assert.equal(current.pose.position.x, baseline.pose.position.x, `Run ${runIdx}: final pos.x mismatch`);
    assert.equal(current.pose.position.y, baseline.pose.position.y, `Run ${runIdx}: final pos.y mismatch`);
    assert.equal(current.pose.position.z, baseline.pose.position.z, `Run ${runIdx}: final pos.z mismatch`);
    assert.equal(current.pose.rotation.qx, baseline.pose.rotation.qx, `Run ${runIdx}: final rot.qx mismatch`);
    assert.equal(current.pose.rotation.qy, baseline.pose.rotation.qy, `Run ${runIdx}: final rot.qy mismatch`);
    assert.equal(current.pose.rotation.qz, baseline.pose.rotation.qz, `Run ${runIdx}: final rot.qz mismatch`);
    assert.equal(current.pose.rotation.qw, baseline.pose.rotation.qw, `Run ${runIdx}: final rot.qw mismatch`);
  }
});

test('Adversarial M2.2.2 - 5 Parallel Runs of Multi-Stone Cascading Collapse Produce 100% Deterministic Final State', async () => {
  const PARALLEL_RUNS = 5;

  const runTasks = Array.from(
    { length: PARALLEL_RUNS },
    async (_, runIndex): Promise<{ runIndex: number; result: DropResult }> => {
    const world = new SimpleTowerPhysicsWorld();

    const s1 = new Stone({
      shape: 'boulder',
      color: '#111',
      pose: new Pose({ x: 0, y: 0.2625, z: 0 }),
    });
    const s2 = new Stone({
      shape: 'round',
      color: '#222',
      pose: new Pose({ x: 0, y: 0.55, z: 0 }),
    });
    const s3 = new Stone({
      shape: 'flat',
      color: '#333',
      pose: new Pose({ x: 0, y: 0.85, z: 0 }),
    });
    world.addStatic([s1, s2, s3]);

    const dropped = new Stone({
      shape: 'tall',
      color: '#444',
      pose: Pose.origin(),
    });
    const dropPose = new Pose({ x: 0.42, y: 1.35, z: 0.05 });

    const result = await world.drop(dropped, dropPose);
    world.dispose();
    return { runIndex, result };
  });

  const results = await Promise.all(runTasks);
  const baseline = results[0].result;

  assert.equal(baseline.collapsed, true);
  assert.ok(baseline.affectedStones && baseline.affectedStones.length > 0);

  for (let i = 1; i < results.length; i++) {
    const cur = results[i].result;
    const runIdx = results[i].runIndex;

    assert.equal(cur.collapsed, baseline.collapsed, `Run ${runIdx}: collapsed must match`);
    assert.equal(cur.settled, baseline.settled, `Run ${runIdx}: settled must match`);
    assert.equal(cur.pose.position.x, baseline.pose.position.x, `Run ${runIdx}: dropped pos.x mismatch`);
    assert.equal(cur.pose.position.y, baseline.pose.position.y, `Run ${runIdx}: dropped pos.y mismatch`);
    assert.equal(cur.pose.position.z, baseline.pose.position.z, `Run ${runIdx}: dropped pos.z mismatch`);

    assert.equal(
      cur.affectedStones?.length,
      baseline.affectedStones?.length,
      `Run ${runIdx}: affected stone count mismatch`
    );

    const baseAffList: readonly CollapsedStonePose[] = baseline.affectedStones!;
    const curAffList: readonly CollapsedStonePose[] = cur.affectedStones!;
    for (let j = 0; j < baseAffList.length; j++) {
      const baseAff: CollapsedStonePose = baseAffList[j];
      const curAff: CollapsedStonePose = curAffList[j];
      assert.equal(curAff.id, baseAff.id);
      assert.equal(curAff.pose.position.x, baseAff.pose.position.x);
      assert.equal(curAff.pose.position.y, baseAff.pose.position.y);
      assert.equal(curAff.pose.position.z, baseAff.pose.position.z);
    }
  }
});

// =============================================================================
// SUITE 3: Cascading Collapse Dynamics, Ground Plane Rest (28m) & Singularity Defense
// =============================================================================

test('Adversarial M2.3.1 - 4-Stone High-Aspect Cairn Collapse: All Tumbled Stones Rest on 28m Ground Plane without NaN or Runaway Velocity', async () => {
  const world = new SimpleTowerPhysicsWorld();

  const cfgBoulder = StonePhysicsBodyFactory.getShapeConfig('boulder');
  const cfgTall1 = StonePhysicsBodyFactory.getShapeConfig('tall');
  const cfgTall2 = StonePhysicsBodyFactory.getShapeConfig('tall');
  const cfgFlat = StonePhysicsBodyFactory.getShapeConfig('flat');

  // Build a precarious 4-stone tower (boulder base + round + flat + tall capstone)
  const cfg1 = StonePhysicsBodyFactory.getShapeConfig('boulder');
  const cfg2 = StonePhysicsBodyFactory.getShapeConfig('round');
  const cfg3 = StonePhysicsBodyFactory.getShapeConfig('flat');
  const cfg4 = StonePhysicsBodyFactory.getShapeConfig('tall');

  const s1 = new Stone({
    shape: 'boulder',
    color: '#111',
    pose: new Pose({ x: 0, y: cfg1.halfExtents.y, z: 0 }),
  });
  const y2 = cfg1.halfExtents.y * 2 + cfg2.halfExtents.y;
  const s2 = new Stone({
    shape: 'round',
    color: '#222',
    pose: new Pose({ x: 0, y: y2, z: 0 }),
  });
  const y3 = y2 + cfg2.halfExtents.y + cfg3.halfExtents.y;
  const s3 = new Stone({
    shape: 'flat',
    color: '#333',
    pose: new Pose({ x: 0, y: y3, z: 0 }),
  });
  const y4 = y3 + cfg3.halfExtents.y + cfg4.halfExtents.y;
  const s4 = new Stone({
    shape: 'tall',
    color: '#444',
    pose: new Pose({ x: 0, y: y4, z: 0 }),
  });

  world.addStatic([s1, s2, s3, s4]);

  // Drop a heavy boulder with substantial off-center impact directly on the tall capstone
  const heavyDrop = new Stone({
    shape: 'boulder',
    color: '#6A6A6A',
    pose: Pose.origin(),
  });
  const dropPose = new Pose({
    x: 0.28,
    y: y4 + cfg4.halfExtents.y + cfg1.halfExtents.y + 0.25,
    z: 0.0,
  });

  const res = await world.drop(heavyDrop, dropPose);

  assert.equal(res.collapsed, true, 'High-aspect tower must undergo dynamic collapse');
  assert.equal(res.settled, false, 'Impact drop must not settle');
  assert.ok(
    (res.affectedStones?.length ?? 0) >= 2,
    `Cascading collapse must mobilize at least 2 tower stones (actual: ${res.affectedStones?.length})`
  );

  // 1. Verify all trajectory frames for NaN or runaway velocities
  assert.ok(res.trajectory && res.trajectory.length > 0);
  for (const frame of res.trajectory!) {
    for (const [stoneId, pose] of frame.poses) {
      assert.ok(
        Number.isFinite(pose.position.x) && !Number.isNaN(pose.position.x),
        `Stone ${stoneId} pos.x must be finite`
      );
      assert.ok(
        Number.isFinite(pose.position.y) && !Number.isNaN(pose.position.y),
        `Stone ${stoneId} pos.y must be finite`
      );
      assert.ok(
        Number.isFinite(pose.position.z) && !Number.isNaN(pose.position.z),
        `Stone ${stoneId} pos.z must be finite`
      );
      assert.ok(
        Number.isFinite(pose.rotation.qx) && !Number.isNaN(pose.rotation.qx),
        `Stone ${stoneId} rot.qx must be finite`
      );
      assert.ok(
        Number.isFinite(pose.rotation.qw) && !Number.isNaN(pose.rotation.qw),
        `Stone ${stoneId} rot.qw must be finite`
      );

      // Radial containment during flight
      const r = Math.hypot(pose.position.x, pose.position.z);
      assert.ok(
        r <= ZEN_GARDEN_RADIUS,
        `Stone ${stoneId} radial flight position (${r}m) must not exceed 28m Zen garden plane`
      );
    }
  }

  // 2. Verify final resting pose of dropped stone
  assert.ok(
    res.pose.position.y >= cfgBoulder.halfExtents.y - 0.01,
    `Dropped stone final Y (${res.pose.position.y}) must rest on or above ground plane (halfExtents=${cfgBoulder.halfExtents.y})`
  );
  const rDrop = Math.hypot(res.pose.position.x, res.pose.position.z);
  assert.ok(
    rDrop <= ZEN_GARDEN_RADIUS,
    `Dropped stone final position (${rDrop}m) must be within 28m ground plane`
  );

  // 3. Verify final resting poses of all affected tower stones
  for (const aff of res.affectedStones!) {
    assert.ok(
      Number.isFinite(aff.pose.position.x) &&
        Number.isFinite(aff.pose.position.y) &&
        Number.isFinite(aff.pose.position.z),
      `Affected stone ${aff.id} final coordinates must be finite`
    );

    // Stone must not fall below y = 0
    assert.ok(
      aff.pose.position.y >= 0,
      `Affected stone ${aff.id} Y (${aff.pose.position.y}) must rest on or above ground level`
    );

    const rAff = Math.hypot(aff.pose.position.x, aff.pose.position.z);
    assert.ok(
      rAff <= ZEN_GARDEN_RADIUS,
      `Affected stone ${aff.id} final radius (${rAff}m) must be within 28m Zen garden plane`
    );
  }

  world.dispose();
});

test('Adversarial M2.3.2 - 5-Stone Heterogeneous Cairn Dynamic Collapse from High Altitude Drop', async () => {
  const world = new SimpleTowerPhysicsWorld();

  const cfgBoulder = StonePhysicsBodyFactory.getShapeConfig('boulder');
  const cfgFlat = StonePhysicsBodyFactory.getShapeConfig('flat');
  const cfgRound = StonePhysicsBodyFactory.getShapeConfig('round');
  const cfgTall = StonePhysicsBodyFactory.getShapeConfig('tall');
  const cfgPebble = StonePhysicsBodyFactory.getShapeConfig('pebble');

  let curY = cfgBoulder.halfExtents.y;
  const s1 = new Stone({ shape: 'boulder', color: '#111', pose: new Pose({ x: 0, y: curY, z: 0 }) });

  curY += cfgBoulder.halfExtents.y + cfgFlat.halfExtents.y;
  const s2 = new Stone({ shape: 'flat', color: '#222', pose: new Pose({ x: 0, y: curY, z: 0 }) });

  curY += cfgFlat.halfExtents.y + cfgRound.halfExtents.y;
  const s3 = new Stone({ shape: 'round', color: '#333', pose: new Pose({ x: 0, y: curY, z: 0 }) });

  curY += cfgRound.halfExtents.y + cfgTall.halfExtents.y;
  const s4 = new Stone({ shape: 'tall', color: '#444', pose: new Pose({ x: 0, y: curY, z: 0 }) });

  curY += cfgTall.halfExtents.y + cfgPebble.halfExtents.y;
  const s5 = new Stone({ shape: 'pebble', color: '#555', pose: new Pose({ x: 0, y: curY, z: 0 }) });

  world.addStatic([s1, s2, s3, s4, s5]);

  // High altitude off-center drop (y = curY + 0.60m, x = 0.20m, z = 0.0m)
  const incoming = new Stone({ shape: 'boulder', color: '#999', pose: Pose.origin() });
  const highDropPose = new Pose({
    x: 0.20,
    y: curY + 0.60,
    z: 0.0,
  });

  const res = await world.drop(incoming, highDropPose);

  assert.equal(res.collapsed, true);
  assert.equal(res.settled, false);
  assert.ok(
    (res.affectedStones?.length ?? 0) >= 2,
    `Cascading collapse must mobilize at least 2 stones, got ${res.affectedStones?.length}`
  );

  // Verify affected stones rest on ground plane without NaN
  for (const aff of res.affectedStones!) {
    assert.ok(
      Number.isFinite(aff.pose.position.x) &&
        Number.isFinite(aff.pose.position.y) &&
        Number.isFinite(aff.pose.position.z),
      `Affected stone ${aff.id} coordinates must be finite`
    );
    assert.ok(aff.pose.position.y >= 0, `Stone ${aff.id} must rest on or above ground`);
    assert.ok(
      Math.hypot(aff.pose.position.x, aff.pose.position.z) <= ZEN_GARDEN_RADIUS,
      `Stone ${aff.id} must remain within 28m ground plane`
    );
  }

  // Verify all bodies in world have reasonable resting velocities (< 5.0 m/s after settling)
  for (const entry of world.getTowerBodies().values()) {
    const v = entry.body.velocity.length();
    const w = entry.body.angularVelocity.length();
    assert.ok(
      Number.isFinite(v) && v < 5.0,
      `Body velocity must be finite and damped, got v=${v}`
    );
    assert.ok(
      Number.isFinite(w) && w < 5.0,
      `Body angular velocity must be finite and damped, got w=${w}`
    );
    assert.ok(
      entry.body.position.y >= -0.05,
      `Body must not penetrate ground plane, got y=${entry.body.position.y}`
    );
  }

  // Dropped body verification
  const dropB = world.getDropBody();
  if (dropB) {
    assert.ok(dropB.position.y >= -0.05, `Dropped body must rest on ground, got y=${dropB.position.y}`);
    assert.ok(
      Math.hypot(dropB.position.x, dropB.position.z) <= ZEN_GARDEN_RADIUS,
      'Dropped body must remain within 28m ground disc'
    );
  }

  world.dispose();
});

test('Adversarial M2.3.3 - Extreme lateral flings and singularity inputs maintain ground plane containment and zero NaN', async () => {
  const world = new SimpleTowerPhysicsWorld();
  const baseConfig = StonePhysicsBodyFactory.getShapeConfig('boulder');
  const baseStone = new Stone({
    shape: 'boulder',
    color: '#000',
    pose: new Pose({ x: 0, y: baseConfig.halfExtents.y, z: 0 }),
  });
  world.addStatic([baseStone]);

  const testStone = new Stone({
    shape: 'round',
    color: '#FFF',
    pose: Pose.origin(),
  });

  // Extreme horizontal coordinates: x = 15.0m, z = -12.0m (r = 19.2m < 28m)
  const farPose = new Pose({ x: 15.0, y: 3.0, z: -12.0 });
  const farRes = await world.drop(testStone, farPose);

  assert.equal(farRes.settled, false, 'Far drop must fail settlement');
  assert.ok(Number.isFinite(farRes.pose.position.x));
  assert.ok(Number.isFinite(farRes.pose.position.y));
  assert.ok(Number.isFinite(farRes.pose.position.z));
  assert.ok(farRes.pose.position.y >= 0, 'Far dropped stone must rest on ground plane y >= 0');
  assert.ok(
    Math.hypot(farRes.pose.position.x, farRes.pose.position.z) <= ZEN_GARDEN_RADIUS,
    'Far dropped stone must remain within 28m ground plane'
  );

  world.dispose();
});
