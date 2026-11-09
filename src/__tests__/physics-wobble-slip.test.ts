/**
 * Wish Stone v2: Physics Engine Overhaul Automated Unit Test Suite
 *
 * Exclusively verifies Milestone M2:
 * - F11: Center of Gravity (CoG) & Support Polygon Eccentricity Ratio (eta = d_ecc / R_support)
 * - F12: Multi-Zone Stability Model & Critical Torque (Stable < 0.40, Tension [0.40, 0.90], Topple > 0.90)
 * - F13: Micro-Wobble Damped Harmonic Oscillation (theta(t) = theta0 * exp(-zeta*wn*t) * cos(wd*t))
 * - F14: Coulomb Incline Friction Slip (tan(theta) > mu_s => a = g*(sin(theta) - mu_k*cos(theta)))
 * - F15: 100% Determinism & Sub-critical/Super-critical Settlement Invariants
 * - F16: Boundary Value Analysis & Singularity Robustness
 *
 * Mandatory Integrity: Genuine logic, zero hardcoded values, strict physics invariants.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

// Domain
import { Stone } from '../domain/entities/Stone.ts';
import { Pose, type Vec3 } from '../domain/value-objects/Pose.ts';

// Physics Infrastructure
import {
  StabilityEvaluator,
  STABILITY_ZONES,
  type WobbleConfig,
  type AdvancedStabilityEvaluation,
  type InclineSlipEvaluation,
} from '../infrastructure/physics/StabilityEvaluator.ts';
import { SimpleTowerPhysicsWorld } from '../infrastructure/physics/SimpleTowerPhysicsWorld.ts';
import { StonePhysicsBodyFactory } from '../infrastructure/physics/StonePhysicsBodyFactory.ts';

// =============================================================================
// 1. F11: Center of Gravity (CoG) & Support Polygon Eccentricity Ratio (eta)
// =============================================================================

test('F11 - 1.1: CoG eccentricity ratio at polygon centroid is exactly zero (eta = 0.0)', () => {
  const baseStone = new Stone({
    shape: 'boulder',
    color: '#2C3038',
    pose: Pose.origin(),
  });
  const polygon = StabilityEvaluator.computeSupportPolygon(baseStone);
  assert.ok(polygon.vertices.length >= 4, 'Support polygon must have at least 4 vertices');

  // Exact center COM
  const comCenter: Vec3 = { x: polygon.centroid[0], y: 0.5, z: polygon.centroid[1] };
  const evalResult = StabilityEvaluator.evaluateStability(comCenter, polygon, 2.5);

  assert.equal(evalResult.isStable, true, 'Central COM must be stable');
  assert.equal(evalResult.eccentricityRatio, 0.0, 'Eccentricity ratio at centroid must be exactly 0.0');
  assert.equal(evalResult.zone, 'stable', 'Centroid must evaluate to stable zone');
  assert.equal(evalResult.wobbleConfig?.enabled, false, 'Micro-wobble must be disabled at centroid');
});

test('F11 - 1.2: Directional support radius (R_support) evaluation on symmetric & asymmetric directions', () => {
  // Unit square polygon [-0.5, -0.5] to [0.5, 0.5]
  const squarePoly = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ] as const;

  // Cardinal +X direction: ray from (0, 0) in +X direction hits boundary x = 0.5 at distance 0.5
  const rx = StabilityEvaluator.computeSupportRadius(squarePoly, [1, 0], [0, 0]);
  assert.ok(Math.abs(rx - 0.5) < 1e-4, `Support radius +X must be 0.5, got ${rx}`);

  // Cardinal +Z direction: ray from (0, 0) in +Z direction hits boundary z = 0.5 at distance 0.5
  const rz = StabilityEvaluator.computeSupportRadius(squarePoly, [0, 1], [0, 0]);
  assert.ok(Math.abs(rz - 0.5) < 1e-4, `Support radius +Z must be 0.5, got ${rz}`);

  // Diagonal direction (+X, +Z): ray hits corner (0.5, 0.5) at distance sqrt(0.5^2 + 0.5^2) = 0.5*sqrt(2) ~ 0.7071
  const rDiag = StabilityEvaluator.computeSupportRadius(squarePoly, [1, 1], [0, 0]);
  const expectedDiag = 0.5 * Math.SQRT2;
  assert.ok(Math.abs(rDiag - expectedDiag) < 1e-4, `Support radius diagonal must be ~0.7071, got ${rDiag}`);

  // Zero displacement direction: returns minimum edge distance (inscribed radius)
  const rZero = StabilityEvaluator.computeSupportRadius(squarePoly, [0, 0], [0, 0]);
  assert.ok(Math.abs(rZero - 0.5) < 1e-4, `Zero direction must return minimum edge distance 0.5, got ${rZero}`);
});

test('F11 - 1.3: Robustness against degenerate polygons and non-finite inputs', () => {
  // Empty polygon
  const emptyRes = StabilityEvaluator.computeSupportRadius([], [1, 0]);
  assert.equal(emptyRes, 0, 'Empty polygon must return radius 0');

  // Point or line (fewer than 3 vertices)
  const linePoly = [[0, 0], [1, 1]] as const;
  assert.equal(StabilityEvaluator.computeSupportRadius(linePoly, [1, 0]), 0);

  // Non-finite COM
  const nanEval = StabilityEvaluator.evaluateStability(
    { x: NaN, y: 1.0, z: 0 },
    [[-1, -1], [1, -1], [1, 1], [-1, 1]]
  );
  assert.equal(nanEval.isStable, false);
  assert.equal(nanEval.zone, 'topple');
  assert.equal(nanEval.eccentricityRatio, Infinity);
});

// =============================================================================
// 2. F12: Multi-Zone Stability Model & Critical Torque Thresholds
// =============================================================================

test('F12 - 2.1: Multi-zone classification thresholds (Stable < 0.40, Tension [0.40, 0.90], Topple > 0.90)', () => {
  const supportR = 1.0;

  // 1. Stable Zone
  const z0 = StabilityEvaluator.evaluateEccentricityZone(0.0, supportR);
  assert.equal(z0.zone, 'stable');
  const z1 = StabilityEvaluator.evaluateEccentricityZone(0.20, supportR);
  assert.equal(z1.zone, 'stable');
  const z2 = StabilityEvaluator.evaluateEccentricityZone(0.399, supportR);
  assert.equal(z2.zone, 'stable');

  // 2. Tension Zone (Micro-Wobble)
  const z3 = StabilityEvaluator.evaluateEccentricityZone(0.400, supportR);
  assert.equal(z3.zone, 'tension');
  const z4 = StabilityEvaluator.evaluateEccentricityZone(0.650, supportR);
  assert.equal(z4.zone, 'tension');
  const z5 = StabilityEvaluator.evaluateEccentricityZone(0.900, supportR);
  assert.equal(z5.zone, 'tension');

  // 3. Topple Zone (Overturning)
  const z6 = StabilityEvaluator.evaluateEccentricityZone(0.901, supportR);
  assert.equal(z6.zone, 'topple');
  const z7 = StabilityEvaluator.evaluateEccentricityZone(1.200, supportR);
  assert.equal(z7.zone, 'topple');
});

test('F12 - 2.2: Tension Zone micro-wobble configuration parameter verification', () => {
  const squarePoly = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ] as const;

  // Offset in +X by 0.30m on R=0.5m -> eta = 0.30 / 0.50 = 0.60 (Tension Zone)
  const evalTension = StabilityEvaluator.evaluateStability(
    { x: 0.30, y: 1.0, z: 0.0 },
    squarePoly,
    1.5
  );

  assert.equal(evalTension.zone, 'tension');
  assert.ok(evalTension.eccentricityRatio >= 0.40 && evalTension.eccentricityRatio <= 0.90);
  assert.ok(evalTension.wobbleConfig !== undefined);
  assert.equal(evalTension.wobbleConfig!.enabled, true, 'Wobble must be enabled in tension zone');
  assert.equal(evalTension.wobbleConfig!.frequency, STABILITY_ZONES.DEFAULT_NATURAL_FREQ);
  assert.equal(evalTension.wobbleConfig!.dampingRatio, STABILITY_ZONES.DEFAULT_DAMPING_RATIO);

  // Initial angle must be within [0.03, 0.12] rad
  assert.ok(
    evalTension.wobbleConfig!.initialAngle >= 0.03 && evalTension.wobbleConfig!.initialAngle <= 0.12,
    `Initial angle (${evalTension.wobbleConfig!.initialAngle}) must be in [0.03, 0.12] rad`
  );

  // Tilt axis check: for +X offset (dx=0.3, dz=0), tilt axis must be perpendicular in XZ plane (0, 0, 1)
  const tiltAxis = evalTension.wobbleConfig!.tiltAxis;
  assert.ok(Math.abs(tiltAxis[0]) < 1e-4, 'Tilt axis X must be ~0 for pure X offset');
  assert.ok(Math.abs(tiltAxis[1]) < 1e-4, 'Tilt axis Y must be 0');
  assert.ok(Math.abs(Math.abs(tiltAxis[2]) - 1.0) < 1e-4, 'Tilt axis Z must be unit magnitude (+-1.0)');
});

test('F12 - 2.3: Critical torque calculation and directional right-hand rule sign verification', () => {
  const squarePoly = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ] as const;

  const mass = 2.0;
  const g = STABILITY_ZONES.GRAVITY;

  // 1. Super-critical +X offset at x = 0.8m (nearest edge is at x = 0.5, r_x = 0.8 - 0.5 = 0.3)
  const evalPosX = StabilityEvaluator.evaluateStability({ x: 0.8, y: 1.0, z: 0.0 }, squarePoly, mass);
  assert.equal(evalPosX.zone, 'topple');
  assert.ok(evalPosX.overturningTorque !== undefined, 'Overturning torque must be generated');
  // tau = r x F, F = (0, -mg, 0), r = (+rx, 0, 0) => tau_z = -rx * mg < 0
  assert.ok(evalPosX.overturningTorque!.z < 0, `+X offset must produce negative Z torque, got ${evalPosX.overturningTorque!.z}`);
  const expectedTauZ = -0.3 * mass * g;
  assert.ok(
    Math.abs(evalPosX.overturningTorque!.z - expectedTauZ) < 1e-3,
    `Torque magnitude mismatch: expected ${expectedTauZ}, got ${evalPosX.overturningTorque!.z}`
  );

  // 2. Super-critical -X offset at x = -0.8m -> tau_z > 0
  const evalNegX = StabilityEvaluator.evaluateStability({ x: -0.8, y: 1.0, z: 0.0 }, squarePoly, mass);
  assert.ok(evalNegX.overturningTorque!.z > 0, `-X offset must produce positive Z torque, got ${evalNegX.overturningTorque!.z}`);

  // 3. Super-critical +Z offset at z = 0.8m -> tau_x > 0 (tau_x = rz * mg)
  const evalPosZ = StabilityEvaluator.evaluateStability({ x: 0.0, y: 1.0, z: 0.8 }, squarePoly, mass);
  assert.ok(evalPosZ.overturningTorque!.x > 0, `+Z offset must produce positive X torque, got ${evalPosZ.overturningTorque!.x}`);

  // 4. Super-critical -Z offset at z = -0.8m -> tau_x < 0
  const evalNegZ = StabilityEvaluator.evaluateStability({ x: 0.0, y: 1.0, z: -0.8 }, squarePoly, mass);
  assert.ok(evalNegZ.overturningTorque!.x < 0, `-Z offset must produce negative X torque, got ${evalNegZ.overturningTorque!.x}`);

  // 5. Critical torque threshold verification
  assert.ok(evalPosX.criticalTorqueThreshold !== undefined && evalPosX.criticalTorqueThreshold > 0);
});

// =============================================================================
// 3. F13: Micro-Wobble Damped Harmonic Oscillation Dynamics
// =============================================================================

test('F13 - 3.1: Damped harmonic oscillation curve theta(t) adheres to analytical envelope', () => {
  const theta0 = 0.08; // ~4.58 degrees
  const zeta = 0.30;
  const wn = 20.0;
  const wd = wn * Math.sqrt(1 - zeta * zeta); // ~19.0788 rad/s

  // At t = 0: theta(0) == theta0
  const t0 = StabilityEvaluator.computeMicroWobbleAngle(0.0, theta0, zeta, wn);
  assert.equal(t0, theta0, 'At t=0, angle must equal theta0');

  // Verify damping envelope at various time points: |theta(t)| <= theta0 * exp(-zeta * wn * t)
  const timePoints = [0.05, 0.10, 0.20, 0.35, 0.50, 0.75, 1.0, 1.25];
  for (const t of timePoints) {
    const angle = StabilityEvaluator.computeMicroWobbleAngle(t, theta0, zeta, wn);
    const envelope = theta0 * Math.exp(-zeta * wn * t);
    assert.ok(
      Math.abs(angle) <= envelope + 1e-6,
      `Angle at t=${t} (${angle}) must be bounded by envelope (${envelope})`
    );
  }

  // After 1.2s, oscillation amplitude must have decayed by > 99.9%
  const tFinal = StabilityEvaluator.computeMicroWobbleAngle(1.2, theta0, zeta, wn);
  assert.ok(
    Math.abs(tFinal) < theta0 * 0.001,
    `At t=1.2s, oscillation must settle to < 0.1% of initial (actual: ${tFinal})`
  );
});

test('F13 - 3.2: Zero-crossings occur periodically at expected damped frequency intervals', () => {
  const theta0 = 0.10;
  const zeta = 0.30;
  const wn = 20.0;
  const wd = wn * Math.sqrt(1 - zeta * zeta); // ~19.08 rad/s
  // Half-period T_half = pi / wd ~ 0.1646s
  const halfPeriod = Math.PI / wd;

  // At t = 0: positive
  const a0 = StabilityEvaluator.computeMicroWobbleAngle(0, theta0, zeta, wn);
  assert.ok(a0 > 0);

  // At t = halfPeriod: negative (first trough)
  const a1 = StabilityEvaluator.computeMicroWobbleAngle(halfPeriod, theta0, zeta, wn);
  assert.ok(a1 < 0, `At half-period (${halfPeriod.toFixed(4)}s), angle must be negative (trough)`);

  // At t = 2 * halfPeriod: positive (second crest)
  const a2 = StabilityEvaluator.computeMicroWobbleAngle(2 * halfPeriod, theta0, zeta, wn);
  assert.ok(a2 > 0, `At full period (${(2 * halfPeriod).toFixed(4)}s), angle must be positive (crest)`);
  assert.ok(Math.abs(a2) < Math.abs(a0), 'Second crest must have lower amplitude than first');
});

// =============================================================================
// 4. F14: Coulomb Incline Friction Slip on Sloped Contact Planes
// =============================================================================

test('F14 - 4.1: Coulomb friction slip angle threshold (tan(theta) > mu_s => slip initiates)', () => {
  // Static friction coefficient for stone-stone contact: mu_s = 0.50
  // Critical slip angle: theta_c = arctan(0.50) ~ 26.565 degrees (in range 25° ~ 30°)
  const mu_s = 0.50;

  // 1. Sub-critical angles (<= 25 degrees) -> NO slip
  const eval10 = StabilityEvaluator.evaluateInclineSlip(10.0, mu_s);
  assert.equal(eval10.shouldSlip, false, '10-degree slope must not slip');
  assert.equal(eval10.tangentialAcceleration, 0);

  const eval20 = StabilityEvaluator.evaluateInclineSlip(20.0, mu_s);
  assert.equal(eval20.shouldSlip, false, '20-degree slope must not slip');

  const eval25 = StabilityEvaluator.evaluateInclineSlip(25.0, mu_s);
  assert.equal(eval25.shouldSlip, false, '25.0-degree slope must not slip (tan(25°) = 0.466 < 0.50)');

  // 2. Exact boundary tests (24.9° vs 26.8°)
  const eval24_9 = StabilityEvaluator.evaluateInclineSlip(24.9, mu_s);
  assert.equal(eval24_9.shouldSlip, false);

  const eval26_8 = StabilityEvaluator.evaluateInclineSlip(26.8, mu_s);
  assert.equal(eval26_8.shouldSlip, true, '26.8-degree slope must trigger dynamic slip');
  assert.ok(eval26_8.tangentialAcceleration > 0);

  // 3. Super-critical steep slopes (30°, 35°, 45°) -> Dynamic slip
  const eval30 = StabilityEvaluator.evaluateInclineSlip(30.0, mu_s);
  assert.equal(eval30.shouldSlip, true, '30-degree slope must slip');

  const eval35 = StabilityEvaluator.evaluateInclineSlip(35.0, mu_s);
  assert.equal(eval35.shouldSlip, true, '35-degree slope must slip');
  assert.ok(eval35.tangentialAcceleration > eval30.tangentialAcceleration, 'Acceleration must increase with slope angle');
});

test('F14 - 4.2: Downhill tangential acceleration formula verification: a = g*(sin(theta) - mu_k*cos(theta))', () => {
  const thetaDeg = 35.0;
  const mu_s = 0.50;
  const mu_k = mu_s * STABILITY_ZONES.KINETIC_FRICTION_RATIO; // 0.45
  const g = STABILITY_ZONES.GRAVITY;

  const rad = (thetaDeg * Math.PI) / 180;
  const expectedA = g * (Math.sin(rad) - mu_k * Math.cos(rad)); // 9.82 * (0.5736 - 0.45 * 0.8192) ~ 1.996 m/s^2

  const slipEval = StabilityEvaluator.evaluateInclineSlip(thetaDeg, mu_s, g);
  assert.ok(
    Math.abs(slipEval.tangentialAcceleration - expectedA) < 1e-3,
    `Tangential acceleration (${slipEval.tangentialAcceleration}) must match formula (${expectedA.toFixed(4)})`
  );
  assert.ok(
    Math.abs(slipEval.normalAcceleration - g * Math.cos(rad)) < 1e-3,
    'Normal acceleration must equal g * cos(theta)'
  );
});

// =============================================================================
// 5. F15: SimpleTowerPhysicsWorld Integration, 100% Determinism & Settlement
// =============================================================================

test('F15 - 5.1: Tension Zone drop executes micro-wobble oscillation trajectory and settles stably', async () => {
  const world = new SimpleTowerPhysicsWorld();

  const baseConfig = StonePhysicsBodyFactory.getShapeConfig('boulder');
  const baseStone = new Stone({
    shape: 'boulder',
    color: '#2C3038',
    pose: new Pose({ x: 0, y: baseConfig.halfExtents.y, z: 0 }),
  });
  world.addStatic([baseStone]);

  const topConfig = StonePhysicsBodyFactory.getShapeConfig('flat');
  const topStone = new Stone({
    shape: 'flat',
    color: '#4E5868',
    pose: Pose.origin(),
  });

  const topSurfaceY = baseStone.pose.position.y + baseConfig.halfExtents.y;

  // Drop at x = 0.18m (eccentricity eta = 0.18 / 0.3125 = 0.576 -> Tension Zone [0.40, 0.90])
  const dropPose = new Pose({
    x: 0.18,
    y: topSurfaceY + topConfig.halfExtents.y + 0.12,
    z: 0.0,
  });

  const result = await world.drop(topStone, dropPose);

  assert.equal(result.settled, true, 'Tension zone drop must settle stably after damping');
  assert.equal(result.collapsed, false, 'Tension zone drop must not collapse');
  assert.ok(result.trajectory && result.trajectory.length >= 75, 'Tension zone must record at least 75 trajectory frames for wobble');

  // Verify that trajectory frames capture angular oscillation
  const zQuats = result.trajectory!.map((frame) => {
    const p = frame.poses.get('dropped-stone');
    return p?.rotation.qz ?? 0;
  });

  // Verify non-zero rotation was present during oscillation
  const maxQuatZ = Math.max(...zQuats.map(Math.abs));
  assert.ok(maxQuatZ > 0.005, `Trajectory must show micro-wobble rocking (max |qz|=${maxQuatZ})`);

  // Verify final frame settled close to zero angular perturbation
  const finalQuatZ = Math.abs(zQuats[zQuats.length - 1]);
  assert.ok(finalQuatZ < 0.01, `Final frame must settle to equilibrium (|qz|=${finalQuatZ})`);

  world.dispose();
});

test('F15 - 5.2: 100% Determinism - Parallel independent runs produce bit-for-bit identical results', async () => {
  const world1 = new SimpleTowerPhysicsWorld();
  const world2 = new SimpleTowerPhysicsWorld();

  const baseConfig = StonePhysicsBodyFactory.getShapeConfig('boulder');
  const baseStone = new Stone({
    shape: 'boulder',
    color: '#2C3038',
    pose: new Pose({ x: 0, y: baseConfig.halfExtents.y, z: 0 }),
  });
  world1.addStatic([baseStone]);
  world2.addStatic([baseStone]);

  const topStone = new Stone({
    shape: 'round',
    color: '#8D99AE',
    pose: Pose.origin(),
  });

  const dropPose = new Pose({
    x: 0.16,
    y: baseConfig.halfExtents.y * 2 + 0.20,
    z: -0.05,
  });

  const res1 = await world1.drop(topStone, dropPose);
  const res2 = await world2.drop(topStone, dropPose);

  assert.equal(res1.settled, res2.settled);
  assert.equal(res1.collapsed, res2.collapsed);
  assert.equal(res1.trajectory?.length, res2.trajectory?.length, 'Frame counts must be identical');

  // Bit-for-bit final pose check
  assert.equal(res1.pose.position.x, res2.pose.position.x);
  assert.equal(res1.pose.position.y, res2.pose.position.y);
  assert.equal(res1.pose.position.z, res2.pose.position.z);
  assert.equal(res1.pose.rotation.qx, res2.pose.rotation.qx);
  assert.equal(res1.pose.rotation.qy, res2.pose.rotation.qy);
  assert.equal(res1.pose.rotation.qz, res2.pose.rotation.qz);
  assert.equal(res1.pose.rotation.qw, res2.pose.rotation.qw);

  world1.dispose();
  world2.dispose();
});

test('F15 - 5.3: Non-regression - Sub-critical drop (x = 0.12m) settles without premature wobble cutoff', async () => {
  const world = new SimpleTowerPhysicsWorld();
  const baseConfig = StonePhysicsBodyFactory.getShapeConfig('boulder');
  const baseStone = new Stone({
    shape: 'boulder',
    color: '#333333',
    pose: new Pose({ x: 0, y: baseConfig.halfExtents.y, z: 0 }),
  });
  world.addStatic([baseStone]);

  const topConfig = StonePhysicsBodyFactory.getShapeConfig('round');
  const topStone = new Stone({
    shape: 'round',
    color: '#777777',
    pose: Pose.origin(),
  });

  const topPose = new Pose({
    x: 0.12,
    y: baseConfig.halfExtents.y * 2 + topConfig.halfExtents.y + 0.05,
    z: 0.0,
  });

  const dropResult = await world.drop(topStone, topPose);
  assert.equal(dropResult.settled, true, 'Sub-critical drop at x=0.12m must settle');
  assert.equal(dropResult.collapsed, false, 'Must not collapse');
  assert.ok(
    Math.abs(dropResult.pose.position.x - 0.12) < 0.05,
    `Lateral drift must remain within 0.05m (actual: ${dropResult.pose.position.x})`
  );

  world.dispose();
});

test('F15 - 5.4: Non-regression - Super-critical drop (x = 0.55m) tumbles off and collapses', async () => {
  const world = new SimpleTowerPhysicsWorld();
  const baseConfig = StonePhysicsBodyFactory.getShapeConfig('boulder');
  const baseStone = new Stone({
    shape: 'boulder',
    color: '#333333',
    pose: new Pose({ x: 0, y: baseConfig.halfExtents.y, z: 0 }),
  });
  world.addStatic([baseStone]);

  const topConfig = StonePhysicsBodyFactory.getShapeConfig('round');
  const topStone = new Stone({
    shape: 'round',
    color: '#777777',
    pose: Pose.origin(),
  });

  const topPose = new Pose({
    x: 0.55,
    y: baseConfig.halfExtents.y * 2 + topConfig.halfExtents.y + 0.15,
    z: 0.0,
  });

  const dropResult = await world.drop(topStone, topPose);
  assert.equal(dropResult.settled, false, 'Super-critical drop at x=0.55m must fail to settle');
  assert.equal(dropResult.collapsed, true, 'Super-critical drop must collapse');
  assert.ok(
    dropResult.pose.position.x > 0.45,
    `Tumbled stone must scatter outward (actual: ${dropResult.pose.position.x})`
  );

  world.dispose();
});

test('F15 - 5.5: Coulomb Incline Slip Integration - Stone on steep incline (35 deg) slides downhill', async () => {
  const world = new SimpleTowerPhysicsWorld();
  const baseConfig = StonePhysicsBodyFactory.getShapeConfig('boulder');
  const baseStone = new Stone({
    shape: 'boulder',
    color: '#2C3038',
    pose: new Pose({ x: 0, y: baseConfig.halfExtents.y, z: 0 }),
  });
  world.addStatic([baseStone]);

  const dropConfig = StonePhysicsBodyFactory.getShapeConfig('pebble');
  const topStone = new Stone({
    shape: 'pebble',
    color: '#D4CCC2',
    pose: Pose.origin(),
  });

  const topSurfaceY = baseStone.pose.position.y + baseConfig.halfExtents.y;

  // Drop on a steep 35-degree incline sloping in +X direction
  const dropPose = new Pose({
    x: 0.05,
    y: topSurfaceY + dropConfig.halfExtents.y + 0.05,
    z: 0.0,
  });

  const result = await world.drop(topStone, dropPose, {
    inclineAngleDeg: 35.0,
    inclineNormal: { x: 0.5736, y: 0.8192, z: 0 },
  });

  // Since 35 degrees > 26.57 degrees, stone slides downhill off the top stone
  assert.equal(result.settled, false, 'Stone on 35-degree incline must slip and fail to settle on top');
  assert.equal(result.collapsed, true, 'Stone must slip off and tumble to ground');
  assert.ok(
    result.pose.position.x > 0.15,
    `Sliding displacement must carry stone in downhill +X direction, got x=${result.pose.position.x}`
  );

  world.dispose();
});
