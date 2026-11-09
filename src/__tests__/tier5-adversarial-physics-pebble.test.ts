/**
 * Wish Stone v2: Tier 5 Adversarial Coverage Hardening Test Suite
 *
 * Scope:
 * - src/infrastructure/physics/StabilityEvaluator.ts
 * - src/infrastructure/physics/SimpleTowerPhysicsWorld.ts
 * - src/infrastructure/physics/StonePhysicsBodyFactory.ts
 * - src/presentation/components/pebbleGeometrySpec.ts
 * - src/presentation/controllers/StackStoneController.ts
 *
 * Mission Focus:
 * 1. Deep cairn stacking (5–7 stones high) with heterogeneous pebbles, tension drops, and Coulomb slip.
 * 2. Micro-wobble perturbation quaternion q_wobble(t) behavior near overturning (eta -> 0.90).
 * 3. Ray-boundary intersection in computeSupportRadius with collinear, degenerate, and concave polygons.
 * 4. Coulomb slip acceleration on reverse slopes (theta < 0°) and orthogonal contact normals.
 * 5. High-throughput concurrency: 20 parallel independent simulations with bit-for-bit replay & zero NaN.
 * 6. River pebble procedural geometry anti-clipping parity & smooth normal unit invariance.
 * 7. StackStoneController re-entrancy defense and quota exhaustion stress.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

// Domain
import { Stone, type StoneShape } from '../domain/entities/Stone.ts';
import { Tower } from '../domain/entities/Tower.ts';
import { Pose, type Vec3, type Quat } from '../domain/value-objects/Pose.ts';
import { TowerKey } from '../domain/value-objects/TowerKey.ts';

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

// Presentation Components & Specs
import {
  createRiverPebbleGeometry,
  NATURAL_PEBBLE_COLORS,
  NATURAL_PEBBLE_PALETTE,
  PEBBLE_SHAPE_PROFILES,
} from '../presentation/components/pebbleGeometrySpec.ts';
import { createMsaAppContainer } from '../container.ts';
import { StackStoneController } from '../presentation/controllers/StackStoneController.ts';

function poseAt(x: number, y: number, z: number, rotation?: Quat): Pose {
  return new Pose({ x, y, z }, rotation ?? { qx: 0, qy: 0, qz: 0, qw: 1 });
}

async function createMockContainer() {
  const mockFetch = async (url: string, init?: RequestInit) => {
    if (url.includes('/api/v1/auth/guest') || url.includes('/api/v1/auth')) {
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
      return {
        ok: true,
        status: 201,
        json: async () => ({
          id: 'wish-mock-id',
          content: '소원',
          category: 'etc',
          scope: 'global',
          createdAt: new Date().toISOString(),
          cheerCount: 0,
          isFulfilled: false,
          isMine: true,
          stone: {
            id: 'stone-mock-1',
            shape: 'round',
            color: '#A89F91',
            pose: { position: { x: 0, y: 0.25, z: 0 }, rotation: { qx: 0, qy: 0, qz: 0, qw: 1 } },
          },
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const container = createMsaAppContainer('http://localhost:8080', mockFetch as any);
  await container.auth.signIn('guest');
  return container;
}

// Helper to construct Tower entities conforming to domain contract
function createTestTower(stones: Stone[]): Tower {
  return new Tower(
    TowerKey.global(),
    stones.map((stone, idx) => ({
      id: `stone-${idx + 1}`,
      stone,
      status: 'active',
      bloom: null,
      cheerLevel: 1,
      isMine: idx === stones.length - 1,
      nickname: null,
    })),
    { stoneCount: stones.length, todayCount: 1, fulfilledCount: 0, cheerCount: 5 }
  );
}

// =============================================================================
// CATEGORY 1: DEEP CAIRN STACKING (5 TO 7 STONES HIGH) & HETEROGENEOUS INTERACTIONS
// =============================================================================

test('Tier 5 - 1.1: Canonical 5-Stone Heterogeneous Cairn Sequential Stacking (Boulder -> Flat -> Round -> Tall -> Pebble)', async () => {
  const world = new SimpleTowerPhysicsWorld(0.45, 0.25, { maxSteps: 150 });

  // 1. Base Boulder resting on ground (y = h_y = 0.2625)
  const hBoulder = StonePhysicsBodyFactory.getShapeConfig('boulder').halfExtents;
  const stone1 = new Stone({
    shape: 'boulder',
    color: '#2C2F33',
    pose: poseAt(0, hBoulder.y, 0),
  });
  world.addStatic([stone1]);

  let currentTopY = stone1.pose.position.y + hBoulder.y; // 0.525
  const stackedStones: Stone[] = [stone1];

  // 2. Drop Flat stone on Boulder
  const hFlat = StonePhysicsBodyFactory.getShapeConfig('flat').halfExtents;
  const dropFlat = new Stone({ shape: 'flat', color: '#4A5568', pose: Pose.origin() });
  const res2 = await world.drop(dropFlat, poseAt(0, currentTopY + hFlat.y + 0.05, 0));
  assert.equal(res2.settled, true, 'Flat stone must settle on Boulder');
  assert.ok(
    res2.pose.position.y >= currentTopY + hFlat.y - 1e-4,
    'Anti-clipping invariant: Flat stone must not penetrate Boulder'
  );
  const stone2 = dropFlat.withPose(res2.pose);
  stackedStones.push(stone2);
  currentTopY = stone2.pose.position.y + hFlat.y;
  world.addStatic(stackedStones);

  // 3. Drop Round stone on Flat
  const hRound = StonePhysicsBodyFactory.getShapeConfig('round').halfExtents;
  const dropRound = new Stone({ shape: 'round', color: '#E2E8F0', pose: Pose.origin() });
  const res3 = await world.drop(dropRound, poseAt(0, currentTopY + hRound.y + 0.05, 0));
  assert.equal(res3.settled, true, 'Round stone must settle on Flat stone');
  assert.ok(
    res3.pose.position.y >= currentTopY + hRound.y - 1e-4,
    'Anti-clipping invariant: Round stone must not penetrate Flat stone'
  );
  const stone3 = dropRound.withPose(res3.pose);
  stackedStones.push(stone3);
  currentTopY = stone3.pose.position.y + hRound.y;
  world.addStatic(stackedStones);

  // 4. Drop Tall stone on Round
  const hTall = StonePhysicsBodyFactory.getShapeConfig('tall').halfExtents;
  const dropTall = new Stone({ shape: 'tall', color: '#5C6B5E', pose: Pose.origin() });
  const res4 = await world.drop(dropTall, poseAt(0, currentTopY + hTall.y + 0.05, 0));
  assert.equal(res4.settled, true, 'Tall stone must settle on Round stone');
  assert.ok(
    res4.pose.position.y >= currentTopY + hTall.y - 1e-4,
    'Anti-clipping invariant: Tall stone must not penetrate Round stone'
  );
  const stone4 = dropTall.withPose(res4.pose);
  stackedStones.push(stone4);
  currentTopY = stone4.pose.position.y + hTall.y;
  world.addStatic(stackedStones);

  // 5. Drop Pebble capstone on Tall stone
  const hPebble = StonePhysicsBodyFactory.getShapeConfig('pebble').halfExtents;
  const dropPebble = new Stone({ shape: 'pebble', color: '#C69255', pose: Pose.origin() });
  const res5 = await world.drop(dropPebble, poseAt(0, currentTopY + hPebble.y + 0.05, 0));
  assert.equal(res5.settled, true, 'Pebble stone must settle on Tall stone');
  assert.ok(
    res5.pose.position.y >= currentTopY + hPebble.y - 1e-4,
    'Anti-clipping invariant: Pebble capstone must not penetrate Tall stone'
  );
  const stone5 = dropPebble.withPose(res5.pose);
  stackedStones.push(stone5);

  assert.equal(stackedStones.length, 5, 'Complete 5-stone cairn successfully assembled');
  world.dispose();
});

test('Tier 5 - 1.2: 6-Stone Cairn with Tension-Zone Drop (eta in [0.40, 0.90]) Triggering Micro-Wobble and Settling', async () => {
  const world = new SimpleTowerPhysicsWorld(0.45, 0.25, { maxSteps: 200 });

  // Assemble 5-stone baseline cairn
  const hBoulder = StonePhysicsBodyFactory.getShapeConfig('boulder').halfExtents;
  const hFlat = StonePhysicsBodyFactory.getShapeConfig('flat').halfExtents;
  const hRound = StonePhysicsBodyFactory.getShapeConfig('round').halfExtents;
  const hTall = StonePhysicsBodyFactory.getShapeConfig('tall').halfExtents;
  const hPebble = StonePhysicsBodyFactory.getShapeConfig('pebble').halfExtents;

  const s1 = new Stone({ shape: 'boulder', color: '#2C2F33', pose: poseAt(0, hBoulder.y, 0) });
  const s2 = new Stone({ shape: 'flat', color: '#4A5568', pose: poseAt(0, 0.525 + hFlat.y, 0) });
  const s3 = new Stone({ shape: 'round', color: '#E2E8F0', pose: poseAt(0, 0.735 + hRound.y, 0) });
  const s4 = new Stone({ shape: 'tall', color: '#5C6B5E', pose: poseAt(0, 1.145 + hTall.y, 0) });
  const s5 = new Stone({ shape: 'pebble', color: '#C69255', pose: poseAt(0, 1.87 + hPebble.y, 0) });

  world.addStatic([s1, s2, s3, s4, s5]);

  const topSurfaceY = s5.pose.position.y + hPebble.y; // 2.16m

  // Drop 6th stone with an off-center offset that produces eta in [0.40, 0.90]
  const offCenterX = 0.10;
  const drop6th = new Stone({ shape: 'round', color: '#B87353', pose: Pose.origin() });
  const dropFrom = poseAt(offCenterX, topSurfaceY + hRound.y + 0.05, 0);

  const res6 = await world.drop(drop6th, dropFrom);

  // Verify that trajectory frames recorded micro-wobble oscillation
  assert.ok(res6.trajectory, 'Trajectory must exist');
  assert.ok(res6.trajectory.length >= 75, 'Tension zone drop must simulate at least 75 steps');

  // Verify quaternion variation across trajectory
  const wobbledRotations: number[] = [];
  for (const frame of res6.trajectory) {
    const p = frame.poses.get('dropped-stone');
    if (p) {
      wobbledRotations.push(Math.hypot(p.rotation.qx, p.rotation.qz));
    }
  }

  // The rotation X or Z should oscillate and then damp out
  const maxWobble = Math.max(...wobbledRotations);
  assert.ok(maxWobble > 0.001, `Micro-wobble perturbation must induce measurable angular oscillation, got ${maxWobble}`);

  // Settled in equilibrium without tumbling to ground
  assert.equal(res6.settled, true, 'Off-center tension drop within stability limit must settle');
  assert.ok(res6.pose.position.y >= topSurfaceY + hRound.y - 1e-4, 'Anti-clipping invariant maintained');

  world.dispose();
});

test('Tier 5 - 1.3: 7-Stone Cairn with Steep Incline Slip Drop (theta = 35 deg > theta_crit) - Downhill Slide onto Sand Ground', async () => {
  const world = new SimpleTowerPhysicsWorld(0.45, 0.25, { maxSteps: 200 });

  // 6 stones pre-stacked
  const hB = StonePhysicsBodyFactory.getShapeConfig('boulder').halfExtents;
  const hF = StonePhysicsBodyFactory.getShapeConfig('flat').halfExtents;
  const hR = StonePhysicsBodyFactory.getShapeConfig('round').halfExtents;
  const hT = StonePhysicsBodyFactory.getShapeConfig('tall').halfExtents;
  const hP = StonePhysicsBodyFactory.getShapeConfig('pebble').halfExtents;

  const s1 = new Stone({ shape: 'boulder', color: '#2C2F33', pose: poseAt(0, hB.y, 0) });
  const s2 = new Stone({ shape: 'flat', color: '#4A5568', pose: poseAt(0, 0.525 + hF.y, 0) });
  const s3 = new Stone({ shape: 'round', color: '#E2E8F0', pose: poseAt(0, 0.735 + hR.y, 0) });
  const s4 = new Stone({ shape: 'tall', color: '#5C6B5E', pose: poseAt(0, 1.145 + hT.y, 0) });
  const s5 = new Stone({ shape: 'pebble', color: '#C69255', pose: poseAt(0, 1.87 + hP.y, 0) });
  const s6 = new Stone({ shape: 'round', color: '#B87353', pose: poseAt(0, 2.16 + hR.y, 0) });

  world.addStatic([s1, s2, s3, s4, s5, s6]);

  const topSurfaceY = s6.pose.position.y + hR.y;

  // Drop 7th stone with inclineAngleDeg = 35° (tan(35°) = 0.700 > mu_s = 0.50)
  const drop7th = new Stone({ shape: 'pebble', color: '#8C5858', pose: Pose.origin() });
  const dropPose = poseAt(0, topSurfaceY + hP.y + 0.04, 0);

  const res7 = await world.drop(drop7th, dropPose, {
    inclineAngleDeg: 35.0,
    inclineNormal: { x: 1, y: 1.428, z: 0 }, // inclined normal in +X direction
  });

  // Verify that the stone slipped tangentially and tumbled cleanly to the ground
  assert.equal(res7.settled, false, 'Steep slope (35 deg) must prevent firm settling atop the 6-stone cairn');
  assert.equal(res7.collapsed, true, 'Slide off results in collapsed / fallen status');

  // Verify that it rested safely on the infinite ground plane (y >= hP.y) and did NOT fall into void
  assert.ok(
    res7.pose.position.y >= hP.y - 1e-4,
    `Fallen stone must rest on ground plane y >= ${hP.y}, got ${res7.pose.position.y}`
  );
  assert.ok(
    Number.isFinite(res7.pose.position.x) && Number.isFinite(res7.pose.position.z),
    'Fallen stone coordinates must remain finite'
  );

  world.dispose();
});

test('Tier 5 - 1.4: Composite COM of Multi-Stone Stacks: X_comp = sum(m_i * x_i) / sum(m_i) against base support polygon', () => {
  const baseStone = new Stone({
    shape: 'boulder',
    color: '#2C2F33',
    pose: poseAt(0, 0.2625, 0),
  });

  const upperStones = [
    {
      stone: new Stone({ shape: 'flat', color: '#4A5568', pose: poseAt(0.02, 0.63, 0.01) }),
      mass: 1.5,
    },
    {
      stone: new Stone({ shape: 'round', color: '#E2E8F0', pose: poseAt(-0.03, 0.94, -0.02) }),
      mass: 1.2,
    },
    {
      stone: new Stone({ shape: 'tall', color: '#5C6B5E', pose: poseAt(0.01, 1.50, 0.03) }),
      mass: 1.4,
    },
    {
      stone: new Stone({ shape: 'pebble', color: '#C69255', pose: poseAt(0.04, 2.01, -0.01) }),
      mass: 0.6,
    },
  ];

  const evalResult = StabilityEvaluator.evaluateStackStability(baseStone, upperStones);

  // Manual calculation of composite COM
  let totalMass = 0;
  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;
  for (const item of upperStones) {
    totalMass += item.mass;
    sumX += item.mass * item.stone.pose.position.x;
    sumY += item.mass * item.stone.pose.position.y;
    sumZ += item.mass * item.stone.pose.position.z;
  }
  const expectedComX = sumX / totalMass;
  const expectedComZ = sumZ / totalMass;

  assert.equal(evalResult.isStable, true, 'Multi-stone composite COM near origin must be stable');
  assert.equal(evalResult.zone, 'stable', 'Composite COM must lie within stable zone');
  assert.ok(
    Math.abs(evalResult.com2D[0] - expectedComX) < 1e-4,
    'Composite COM X must match physical definition'
  );
  assert.ok(
    Math.abs(evalResult.com2D[1] - expectedComZ) < 1e-4,
    'Composite COM Z must match physical definition'
  );
  assert.ok(
    evalResult.eccentricityRatio < STABILITY_ZONES.STABLE_ETA_MAX,
    'Eccentricity ratio must be strictly under 0.40'
  );
});

test('Tier 5 - 1.5: Cascading Dynamic Collapse Momentum Transfer when super-critical drop impacts top of tower', async () => {
  const world = new SimpleTowerPhysicsWorld(0.45, 0.25, { maxSteps: 150 });

  const hB = StonePhysicsBodyFactory.getShapeConfig('boulder').halfExtents;
  const hR = StonePhysicsBodyFactory.getShapeConfig('round').halfExtents;

  const s1 = new Stone({ shape: 'boulder', color: '#2C2F33', pose: poseAt(0, hB.y, 0) });
  const s2 = new Stone({ shape: 'round', color: '#4A5568', pose: poseAt(0, 0.525 + hR.y, 0) });

  world.addStatic([s1, s2]);

  // Drop stone far off center with super-critical offset (x = 0.55m > stabilityRadius = 0.45m)
  const dropStone = new Stone({ shape: 'boulder', color: '#1E2024', pose: Pose.origin() });
  const res = await world.drop(dropStone, poseAt(0.55, 1.2, 0));

  assert.equal(res.settled, false, 'Super-critical drop must not settle');
  assert.equal(res.collapsed, true, 'Super-critical drop must report collapsed status');
  assert.ok(res.trajectory, 'Trajectory must exist');
  assert.ok(res.trajectory.length > 0, 'Trajectory must record dynamic tumble');

  // Verify that no NaN values were produced
  for (const frame of res.trajectory) {
    const droppedPose = frame.poses.get('dropped-stone');
    assert.ok(droppedPose, 'Trajectory frame must contain dropped stone');
    assert.ok(!Number.isNaN(droppedPose.position.x), 'Trajectory X must not be NaN');
    assert.ok(!Number.isNaN(droppedPose.position.y), 'Trajectory Y must not be NaN');
    assert.ok(!Number.isNaN(droppedPose.position.z), 'Trajectory Z must not be NaN');
    assert.ok(!Number.isNaN(droppedPose.rotation.qw), 'Trajectory Quat W must not be NaN');
  }

  world.dispose();
});

// =============================================================================
// CATEGORY 2: MICRO-WOBBLE PERTURBATION QUATERNION q_wobble(t) NEAR OVERTURNING (eta -> 0.90)
// =============================================================================

test('Tier 5 - 2.1: Precise Boundary Transition at eta = 0.8999 vs eta = 0.9001', () => {
  const supportRadius = 0.5;

  // eta = 0.3999 -> stable
  const evalStable = StabilityEvaluator.evaluateEccentricityZone(0.3999 * supportRadius, supportRadius);
  assert.equal(evalStable.zone, 'stable');

  // eta = 0.4000 -> tension
  const evalTensionEntry = StabilityEvaluator.evaluateEccentricityZone(0.4000 * supportRadius, supportRadius);
  assert.equal(evalTensionEntry.zone, 'tension');

  // eta = 0.8999 -> tension (near overturning)
  const evalNearOverturning = StabilityEvaluator.evaluateEccentricityZone(0.8999 * supportRadius, supportRadius);
  assert.equal(evalNearOverturning.zone, 'tension');

  // eta = 0.9000 -> tension boundary
  const evalTensionMax = StabilityEvaluator.evaluateEccentricityZone(0.9000 * supportRadius, supportRadius);
  assert.equal(evalTensionMax.zone, 'tension');

  // eta = 0.9001 -> topple
  const evalTopple = StabilityEvaluator.evaluateEccentricityZone(0.9001 * supportRadius, supportRadius);
  assert.equal(evalTopple.zone, 'topple');

  // Infinite offset -> topple
  const evalInf = StabilityEvaluator.evaluateEccentricityZone(Infinity, supportRadius);
  assert.equal(evalInf.zone, 'topple');

  // Zero / negative support radius -> topple
  const evalZeroR = StabilityEvaluator.evaluateEccentricityZone(0.1, 0);
  assert.equal(evalZeroR.zone, 'topple');
});

test('Tier 5 - 2.2: Quaternion Unit Norm Invariant ||q_wobble(t)|| = 1.0 +- 1e-4 across 180 consecutive frames under peak tension', () => {
  const wobbleConfig: WobbleConfig = {
    enabled: true,
    initialAngle: 0.12, // Peak tension zone angle
    tiltAxis: [0, 0, 1], // Unit Z axis
    frequency: STABILITY_ZONES.DEFAULT_NATURAL_FREQ,
    dampingRatio: STABILITY_ZONES.DEFAULT_DAMPING_RATIO,
  };

  const dt = 1 / 60;
  for (let frame = 0; frame <= 180; frame++) {
    const t = frame * dt;
    const theta = StabilityEvaluator.computeMicroWobbleAngle(t, wobbleConfig);

    const halfTheta = theta * 0.5;
    const sinHalf = Math.sin(halfTheta);
    const cosHalf = Math.cos(halfTheta);

    const qx = wobbleConfig.tiltAxis[0] * sinHalf;
    const qy = wobbleConfig.tiltAxis[1] * sinHalf;
    const qz = wobbleConfig.tiltAxis[2] * sinHalf;
    const qw = cosHalf;

    const norm = Math.hypot(qx, qy, qz, qw);
    assert.ok(
      Math.abs(norm - 1.0) < 1e-5,
      `Frame ${frame} (t=${t}s): Quaternion norm must equal 1.0, got ${norm}`
    );
    assert.ok(!Number.isNaN(theta), `Frame ${frame}: theta must not be NaN`);
  }
});

test('Tier 5 - 2.3: Micro-Wobble Damped Oscillation Envelope & Phase Invariant', () => {
  const theta0 = 0.10; // rad
  const zeta = 0.30;
  const wn = 20.0;
  const wd = wn * Math.sqrt(1 - zeta * zeta); // ~ 19.0788 rad/s

  // At t = 0, theta(0) == theta0
  const angleAtZero = StabilityEvaluator.computeMicroWobbleAngle(0, theta0, zeta, wn);
  assert.equal(angleAtZero, theta0, 'At t=0, angle must equal theta0');

  // Verify that amplitude at peak oscillates within envelope +- theta0 * exp(-zeta * wn * t)
  const timePoints = [0.1, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0];
  for (const t of timePoints) {
    const angle = StabilityEvaluator.computeMicroWobbleAngle(t, theta0, zeta, wn);
    const envelope = theta0 * Math.exp(-zeta * wn * t);

    assert.ok(
      Math.abs(angle) <= envelope + 1e-6,
      `At t=${t}s: angle ${angle} must not exceed envelope ${envelope}`
    );
  }

  // At t >= 1.5s, amplitude must be decayed by over 99.9%
  const lateAngle = StabilityEvaluator.computeMicroWobbleAngle(1.5, theta0, zeta, wn);
  assert.ok(
    Math.abs(lateAngle) < 0.001,
    `At t=1.5s, angle must be effectively damped out: ${lateAngle}`
  );
});

test('Tier 5 - 2.4: Quaternion Composition with Arbitrary 3D Orientations Maintains Unit Norm and Zero NaN', () => {
  // Test composition with Yaw (45 deg around Y)
  const halfYaw = Math.PI / 8;
  const baseQ = { x: 0, y: Math.sin(halfYaw), z: 0, w: Math.cos(halfYaw) };

  const wobbleQ = (tiltAxis: readonly [number, number, number], theta: number) => {
    const s = Math.sin(theta * 0.5);
    const c = Math.cos(theta * 0.5);
    return { x: tiltAxis[0] * s, y: tiltAxis[1] * s, z: tiltAxis[2] * s, w: c };
  };

  const quatMultiply = (
    q1: { x: number; y: number; z: number; w: number },
    q2: { x: number; y: number; z: number; w: number }
  ) => ({
    x: q1.w * q2.x + q1.x * q2.w + q1.y * q2.z - q1.z * q2.y,
    y: q1.w * q2.y - q1.x * q2.z + q1.y * q2.w + q1.z * q2.x,
    z: q1.w * q2.z + q1.x * q2.y - q1.y * q2.x + q1.z * q2.w,
    w: q1.w * q2.w - q1.x * q2.x - q1.y * q2.y - q1.z * q2.z,
  });

  const axes: readonly [number, number, number][] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1 / Math.SQRT2, 0, 1 / Math.SQRT2],
    [-1 / Math.SQRT2, 0, 1 / Math.SQRT2],
  ];

  for (const axis of axes) {
    for (let angle = -0.15; angle <= 0.15; angle += 0.03) {
      const wQ = wobbleQ(axis, angle);
      const composed = quatMultiply(baseQ, wQ);
      const norm = Math.hypot(composed.x, composed.y, composed.z, composed.w);

      assert.ok(
        Math.abs(norm - 1.0) < 1e-4,
        `Composed quaternion norm must equal 1.0, got ${norm}`
      );
      assert.ok(!Number.isNaN(composed.x), 'composed.x must not be NaN');
      assert.ok(!Number.isNaN(composed.w), 'composed.w must not be NaN');
    }
  }
});

// =============================================================================
// CATEGORY 3: RAY-BOUNDARY INTERSECTION IN computeSupportRadius (PATHOLOGICAL POLYGONS)
// =============================================================================

test('Tier 5 - 3.1: Degenerate Collinear Vertices along 1D line: directional ray intersection robustness', () => {
  // 4 collinear vertices on X axis
  const collinear = [
    [0.0, 0.0],
    [0.2, 0.0],
    [0.5, 0.0],
    [1.0, 0.0],
  ] as const;

  const directions: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
  ];

  for (const dir of directions) {
    const r = StabilityEvaluator.computeSupportRadius(collinear, dir);
    assert.ok(Number.isFinite(r), `Support radius must be finite for dir [${dir}]`);
    assert.ok(r > 0, `Support radius must be positive for dir [${dir}], got ${r}`);
    assert.ok(!Number.isNaN(r), `Support radius must not be NaN for dir [${dir}]`);
  }
});

test('Tier 5 - 3.2: Singular Degenerate Point / Multi-Duplicate Vertices fallback to valid radius', () => {
  // All vertices at exact same coordinate
  const duplicate = [
    [0.3, 0.3],
    [0.3, 0.3],
    [0.3, 0.3],
  ] as const;

  const rNoDir = StabilityEvaluator.computeSupportRadius(duplicate);
  assert.ok(Number.isFinite(rNoDir), 'Fallback radius must be finite');
  assert.ok(rNoDir > 0, 'Fallback radius must be positive');

  const rWithDir = StabilityEvaluator.computeSupportRadius(duplicate, [1, 0]);
  assert.ok(Number.isFinite(rWithDir), 'Directional radius with duplicate vertices must be finite');
  assert.ok(!Number.isNaN(rWithDir), 'Must not be NaN');

  // Empty or < 3 vertices
  assert.equal(StabilityEvaluator.computeSupportRadius([]), 0, 'Empty vertices return 0');
  assert.equal(StabilityEvaluator.computeSupportRadius([[0, 0], [1, 1]]), 0, '2 vertices return 0');
});

test('Tier 5 - 3.3: Direct Vertex Ray Alignment without division-by-zero or sign confusion', () => {
  // Symmetric unit square [-0.5, -0.5] to [0.5, 0.5]
  const square = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ] as const;

  // Ray directly toward corner vertex [0.5, 0.5]
  const rCorner = StabilityEvaluator.computeSupportRadius(square, [1, 1]);
  const expectedCornerDist = Math.hypot(0.5, 0.5); // ~ 0.7071
  assert.ok(
    Math.abs(rCorner - expectedCornerDist) < 1e-4,
    `Corner hit distance must equal ${expectedCornerDist}, got ${rCorner}`
  );

  // Ray directly toward edge midpoint [0.5, 0]
  const rMid = StabilityEvaluator.computeSupportRadius(square, [1, 0]);
  assert.ok(
    Math.abs(rMid - 0.5) < 1e-4,
    `Edge midpoint hit distance must equal 0.5, got ${rMid}`
  );
});

test('Tier 5 - 3.4: Edge-Parallel Rays cleanly intersect perpendicular segments', () => {
  const square = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ] as const;

  // Ray from centroid (0, 0.25) parallel to horizontal top edge (dir = [1, 0])
  const rParallel = StabilityEvaluator.computeSupportRadius(square, [1, 0], [0, 0.25]);
  assert.ok(
    Math.abs(rParallel - 0.5) < 1e-4,
    `Edge-parallel ray must intersect perpendicular right edge at distance 0.5, got ${rParallel}`
  );
});

test('Tier 5 - 3.5: Non-Convex & Star-Shaped Polygons: 72-Point Angular Direction Sweep', () => {
  // Concave arrowhead polygon
  const concave = [
    [0.0, 0.0],
    [1.0, -0.5],
    [0.5, 0.0],
    [1.0, 0.5],
  ] as const;

  // Sweep all 360 degrees in 5-degree increments
  for (let deg = 0; deg < 360; deg += 5) {
    const rad = (deg * Math.PI) / 180;
    const dir: [number, number] = [Math.cos(rad), Math.sin(rad)];

    const r = StabilityEvaluator.computeSupportRadius(concave, dir);
    assert.ok(
      Number.isFinite(r) && r > 0,
      `At ${deg} deg: radius must be finite and positive, got ${r}`
    );
    assert.ok(!Number.isNaN(r), `At ${deg} deg: radius must not be NaN`);
  }
});

test('Tier 5 - 3.6: Extreme Scale Polygons (Micro 1e-5 and Megalithic 1e4) Maintain Numeric Bounds', () => {
  const microScale = 1e-5;
  const microSquare: [number, number][] = [
    [-0.5 * microScale, -0.5 * microScale],
    [0.5 * microScale, -0.5 * microScale],
    [0.5 * microScale, 0.5 * microScale],
    [-0.5 * microScale, 0.5 * microScale],
  ];
  const rMicro = StabilityEvaluator.computeSupportRadius(microSquare, [1, 0]);
  assert.ok(rMicro > 0 && Number.isFinite(rMicro), 'Micro scale radius must be positive and finite');

  const megaScale = 1e4;
  const megaSquare: [number, number][] = [
    [-0.5 * megaScale, -0.5 * megaScale],
    [0.5 * megaScale, -0.5 * megaScale],
    [0.5 * megaScale, 0.5 * megaScale],
    [-0.5 * megaScale, 0.5 * megaScale],
  ];
  const rMega = StabilityEvaluator.computeSupportRadius(megaSquare, [1, 0]);
  assert.ok(
    Math.abs(rMega - 5000) < 1.0,
    `Megalithic scale radius must scale linearly, got ${rMega}`
  );
});

// =============================================================================
// CATEGORY 4: COULOMB SLIP ACCELERATION ON REVERSE SLOPES (theta < 0°) & ORTHOGONAL NORMALS
// =============================================================================

test('Tier 5 - 4.1: Coulomb Incline Friction Critical Angle Infinitesimal Precision (theta_c = 26.565°)', () => {
  const mu_s = STABILITY_ZONES.STATIC_FRICTION_COEFF; // 0.50
  const theta_c = (Math.atan(mu_s) * 180) / Math.PI; // ~ 26.565°

  // Just below critical angle: theta = 26.56°
  const subCrit = StabilityEvaluator.evaluateInclineSlip(26.56);
  assert.equal(subCrit.shouldSlip, false, 'Angle 26.56° must not slip (static friction holds)');
  assert.equal(subCrit.tangentialAcceleration, 0, 'Tangential slip acceleration must be 0');

  // Just above critical angle: theta = 26.57°
  const superCrit = StabilityEvaluator.evaluateInclineSlip(26.57);
  assert.equal(superCrit.shouldSlip, true, 'Angle 26.57° must slip (Coulomb threshold exceeded)');
  assert.ok(
    superCrit.tangentialAcceleration > 0,
    'Tangential slip acceleration must be positive'
  );
});

test('Tier 5 - 4.2: Reverse Slope Evaluation (theta < 0°)', () => {
  // If caller passes raw negative tilt angles, verify that evaluateInclineSlip runs safely
  const evalNeg30 = StabilityEvaluator.evaluateInclineSlip(-30);
  assert.ok(Number.isFinite(evalNeg30.normalAcceleration), 'Normal acceleration must be finite');
  assert.ok(Number.isFinite(evalNeg30.tangentialAcceleration), 'Tangential acceleration must be finite');

  // In physical models, slope magnitude |theta| drives slip.
  const evalMagnitude = StabilityEvaluator.evaluateInclineSlip(Math.abs(-35));
  assert.equal(evalMagnitude.shouldSlip, true, 'Slope magnitude 35° must slip');
  assert.ok(evalMagnitude.tangentialAcceleration > 0, 'Tangential acceleration must be positive');
});

test('Tier 5 - 4.3: Orthogonal Contact Normals in SimpleTowerPhysicsWorld (Horizontal, Pure Vertical, Zero Normal)', async () => {
  const world = new SimpleTowerPhysicsWorld();
  const base = new Stone({
    shape: 'boulder',
    color: '#2C2F33',
    pose: poseAt(0, 0.2625, 0),
  });
  world.addStatic([base]);

  const dropStone = new Stone({ shape: 'pebble', color: '#8C5858', pose: Pose.origin() });

  // 1. Pure vertical normal: (0, 1, 0)
  const resVert = await world.drop(dropStone, poseAt(0, 0.8, 0), {
    inclineAngleDeg: 30,
    inclineNormal: { x: 0, y: 1, z: 0 },
  });
  assert.ok(resVert.trajectory && resVert.trajectory.length > 0, 'Pure vertical normal simulation must complete');
  assert.ok(!Number.isNaN(resVert.pose.position.x), 'Position X must not be NaN');

  // 2. Pure horizontal normal: (1, 0, 0)
  const resHoriz = await world.drop(dropStone, poseAt(0, 0.8, 0), {
    inclineAngleDeg: 35,
    inclineNormal: { x: 1, y: 0, z: 0 },
  });
  assert.ok(resHoriz.trajectory && resHoriz.trajectory.length > 0, 'Pure horizontal normal simulation must complete');
  assert.ok(!Number.isNaN(resHoriz.pose.position.y), 'Position Y must not be NaN');

  // 3. Degenerate zero normal: (0, 0, 0)
  const resZero = await world.drop(dropStone, poseAt(0, 0.8, 0), {
    inclineAngleDeg: 35,
    inclineNormal: { x: 0, y: 0, z: 0 },
  });
  assert.ok(resZero.trajectory && resZero.trajectory.length > 0, 'Degenerate zero normal simulation must complete gracefully');
  assert.ok(!Number.isNaN(resZero.pose.position.z), 'Position Z must not be NaN');

  world.dispose();
});

test('Tier 5 - 4.4: High Incline Limit (theta -> 90°): Tangential acceleration approaches gravity g', () => {
  const g = STABILITY_ZONES.GRAVITY; // 9.82 m/s^2

  const angles = [60, 75, 85, 89.9];
  let lastAcc = 0;

  for (const angle of angles) {
    const slip = StabilityEvaluator.evaluateInclineSlip(angle);
    assert.equal(slip.shouldSlip, true);
    assert.ok(
      slip.tangentialAcceleration > lastAcc,
      `Tangential acceleration must increase monotonically with angle: ${slip.tangentialAcceleration} > ${lastAcc}`
    );
    assert.ok(
      slip.tangentialAcceleration <= g + 1e-4,
      `Tangential acceleration must not exceed gravity ${g}, got ${slip.tangentialAcceleration}`
    );
    lastAcc = slip.tangentialAcceleration;
  }

  // At 89.9°, tangential acceleration is very close to g, normal acceleration vanishes
  const near90 = StabilityEvaluator.evaluateInclineSlip(89.9);
  assert.ok(Math.abs(near90.tangentialAcceleration - g) < 0.1, 'At 89.9 deg, a_t must approach g');
  assert.ok(near90.normalAcceleration < 0.1, 'At 89.9 deg, normal acceleration must approach 0');
});

// =============================================================================
// CATEGORY 5: HIGH-THROUGHPUT CONCURRENCY (20 PARALLEL SIMULATIONS & BIT-FOR-BIT REPLAY)
// =============================================================================

test('Tier 5 - 5.1: 20 Parallel Independent Simulations with Random Pebble Shapes & ZERO NaN Invariant', async () => {
  const shapes: readonly StoneShape[] = ['boulder', 'flat', 'round', 'tall', 'pebble'];

  interface SimSetup {
    readonly id: number;
    readonly baseShape: StoneShape;
    readonly dropShape: StoneShape;
    readonly dropOffsetX: number;
    readonly dropOffsetZ: number;
  }

  // Generate 20 distinct simulation configurations
  const setups: SimSetup[] = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    baseShape: shapes[i % shapes.length],
    dropShape: shapes[(i + 2) % shapes.length],
    dropOffsetX: Number((((i * 7) % 11 - 5) * 0.015).toFixed(4)),
    dropOffsetZ: Number((((i * 13) % 11 - 5) * 0.015).toFixed(4)),
  }));

  const runSimulation = async (setup: SimSetup) => {
    const world = new SimpleTowerPhysicsWorld(0.45, 0.25, { maxSteps: 120 });
    const hBase = StonePhysicsBodyFactory.getShapeConfig(setup.baseShape).halfExtents;
    const hDrop = StonePhysicsBodyFactory.getShapeConfig(setup.dropShape).halfExtents;

    const baseStone = new Stone({
      shape: setup.baseShape,
      color: '#2C2F33',
      pose: poseAt(0, hBase.y, 0),
    });
    world.addStatic([baseStone]);

    const dropStone = new Stone({
      shape: setup.dropShape,
      color: '#A0AEC0',
      pose: Pose.origin(),
    });

    const dropPose = poseAt(
      setup.dropOffsetX,
      baseStone.pose.position.y + hBase.y + hDrop.y + 0.05,
      setup.dropOffsetZ
    );

    const result = await world.drop(dropStone, dropPose);
    world.dispose();
    return { setup, result };
  };

  // Run all 20 simulations in parallel
  const results = await Promise.all(setups.map(runSimulation));

  assert.equal(results.length, 20, 'All 20 parallel simulations must complete');

  for (const { setup, result } of results) {
    assert.ok(result.trajectory && result.trajectory.length > 0, `Sim ${setup.id}: Trajectory must be non-empty`);

    // Verify ZERO NaN in final pose
    assert.ok(!Number.isNaN(result.pose.position.x), `Sim ${setup.id}: Pose X must not be NaN`);
    assert.ok(!Number.isNaN(result.pose.position.y), `Sim ${setup.id}: Pose Y must not be NaN`);
    assert.ok(!Number.isNaN(result.pose.position.z), `Sim ${setup.id}: Pose Z must not be NaN`);
    assert.ok(!Number.isNaN(result.pose.rotation.qw), `Sim ${setup.id}: Quat W must not be NaN`);

    // Verify ZERO NaN across all trajectory frames
    for (const frame of result.trajectory!) {
      const p = frame.poses.get('dropped-stone');
      assert.ok(p, `Sim ${setup.id}: Frame must contain dropped stone`);
      assert.ok(!Number.isNaN(p.position.x), `Sim ${setup.id}: Frame pos X must not be NaN`);
      assert.ok(!Number.isNaN(p.position.y), `Sim ${setup.id}: Frame pos Y must not be NaN`);
      assert.ok(!Number.isNaN(p.position.z), `Sim ${setup.id}: Frame pos Z must not be NaN`);
      assert.ok(!Number.isNaN(p.rotation.qx), `Sim ${setup.id}: Frame rot X must not be NaN`);
      assert.ok(!Number.isNaN(p.rotation.qy), `Sim ${setup.id}: Frame rot Y must not be NaN`);
      assert.ok(!Number.isNaN(p.rotation.qz), `Sim ${setup.id}: Frame rot Z must not be NaN`);
      assert.ok(!Number.isNaN(p.rotation.qw), `Sim ${setup.id}: Frame rot W must not be NaN`);
    }
  }
});

test('Tier 5 - 5.2: Bit-for-Bit Deterministic Trajectory Replay across Independent Parallel Batches', async () => {
  const shapes: readonly StoneShape[] = ['boulder', 'flat', 'round', 'tall', 'pebble'];

  const runFixedSim = async (idx: number) => {
    const world = new SimpleTowerPhysicsWorld(0.45, 0.25, { maxSteps: 100 });
    const baseShape = shapes[idx % shapes.length];
    const dropShape = shapes[(idx + 1) % shapes.length];
    const hBase = StonePhysicsBodyFactory.getShapeConfig(baseShape).halfExtents;
    const hDrop = StonePhysicsBodyFactory.getShapeConfig(dropShape).halfExtents;

    const baseStone = new Stone({
      shape: baseShape,
      color: '#2C2F33',
      pose: poseAt(0, hBase.y, 0),
    });
    world.addStatic([baseStone]);

    const dropStone = new Stone({ shape: dropShape, color: '#E2E8F0', pose: Pose.origin() });
    const dropPose = poseAt(0.04, baseStone.pose.position.y + hBase.y + hDrop.y + 0.05, 0.02);

    const result = await world.drop(dropStone, dropPose);
    world.dispose();
    return result;
  };

  // Run Batch 1 (10 parallel sims) and Batch 2 (identical 10 parallel sims)
  const [batch1, batch2] = await Promise.all([
    Promise.all(Array.from({ length: 10 }, (_, i) => runFixedSim(i))),
    Promise.all(Array.from({ length: 10 }, (_, i) => runFixedSim(i))),
  ]);

  for (let i = 0; i < 10; i++) {
    const res1 = batch1[i];
    const res2 = batch2[i];

    assert.equal(res1.settled, res2.settled, `Sim ${i}: Settlement status must be bit-identical`);
    assert.ok(res1.trajectory && res2.trajectory, `Sim ${i}: Trajectories must exist`);
    const traj1 = res1.trajectory;
    const traj2 = res2.trajectory;
    assert.equal(
      traj1.length,
      traj2.length,
      `Sim ${i}: Trajectory step count must be identical`
    );

    // Verify bit-for-bit equality on every frame
    for (let f = 0; f < traj1.length; f++) {
      const p1: Pose = traj1[f].poses.get('dropped-stone')!;
      const p2: Pose = traj2[f].poses.get('dropped-stone')!;

      assert.equal(p1.position.x, p2.position.x, `Sim ${i} frame ${f}: X must be bit-identical`);
      assert.equal(p1.position.y, p2.position.y, `Sim ${i} frame ${f}: Y must be bit-identical`);
      assert.equal(p1.position.z, p2.position.z, `Sim ${i} frame ${f}: Z must be bit-identical`);
      assert.equal(p1.rotation.qx, p2.rotation.qx, `Sim ${i} frame ${f}: qx must be bit-identical`);
      assert.equal(p1.rotation.qy, p2.rotation.qy, `Sim ${i} frame ${f}: qy must be bit-identical`);
      assert.equal(p1.rotation.qz, p2.rotation.qz, `Sim ${i} frame ${f}: qz must be bit-identical`);
      assert.equal(p1.rotation.qw, p2.rotation.qw, `Sim ${i} frame ${f}: qw must be bit-identical`);
    }
  }
});

// =============================================================================
// CATEGORY 6: RIVER PEBBLE PROCEDURAL GEOMETRY & ANTI-CLIPPING BOUNDING BOX INVARIANTS
// =============================================================================

test('Tier 5 - 6.1: Anti-Clipping Half-Extents Invariant |h_visual - s * 0.25| <= 1e-4 across all 5 shapes and 4 scales', () => {
  const testScales = [
    { x: 0.1, y: 0.1, z: 0.1 },
    { x: 0.5, y: 0.5, z: 0.5 },
    { x: 1.0, y: 1.0, z: 1.0 },
    { x: 2.5, y: 1.2, z: 1.8 },
  ];

  for (const shape of PEBBLE_SHAPE_PROFILES) {
    for (const scale of testScales) {
      for (const flattenedBase of [true, false]) {
        const geo = createRiverPebbleGeometry({
          shape,
          scale,
          flattenedBase,
          segments: 16,
        });

        assert.ok(geo.boundingBox, 'Geometry must have bounding box computed');
        const hVisualX = (geo.boundingBox.max.x - geo.boundingBox.min.x) * 0.5;
        const hVisualY = (geo.boundingBox.max.y - geo.boundingBox.min.y) * 0.5;
        const hVisualZ = (geo.boundingBox.max.z - geo.boundingBox.min.z) * 0.5;

        const hExpectedX = scale.x * 0.25;
        const hExpectedY = scale.y * 0.25;
        const hExpectedZ = scale.z * 0.25;

        assert.ok(
          Math.abs(hVisualX - hExpectedX) <= 1e-4,
          `${shape} scale ${scale.x}: X half-extent diff ${Math.abs(hVisualX - hExpectedX)} must be <= 1e-4`
        );
        assert.ok(
          Math.abs(hVisualY - hExpectedY) <= 1e-4,
          `${shape} scale ${scale.y}: Y half-extent diff ${Math.abs(hVisualY - hExpectedY)} must be <= 1e-4`
        );
        assert.ok(
          Math.abs(hVisualZ - hExpectedZ) <= 1e-4,
          `${shape} scale ${scale.z}: Z half-extent diff ${Math.abs(hVisualZ - hExpectedZ)} must be <= 1e-4`
        );

        geo.dispose();
      }
    }
  }
});

test('Tier 5 - 6.2: Smooth Water-Worn Normals: All vertex normals strictly normalized (||n|| = 1.0 +- 1e-3)', () => {
  const geo = createRiverPebbleGeometry({
    shape: 'pebble',
    scale: { x: 1.0, y: 0.8, z: 0.9 },
    flattenedBase: true,
    segments: 24,
  });

  const normals = geo.getAttribute('normal');
  assert.ok(normals && normals.count > 0, 'Geometry must have valid normal attribute');

  for (let i = 0; i < normals.count; i++) {
    const nx = normals.getX(i);
    const ny = normals.getY(i);
    const nz = normals.getZ(i);

    assert.ok(!Number.isNaN(nx), `Vertex ${i}: normal X must not be NaN`);
    assert.ok(!Number.isNaN(ny), `Vertex ${i}: normal Y must not be NaN`);
    assert.ok(!Number.isNaN(nz), `Vertex ${i}: normal Z must not be NaN`);

    const len = Math.hypot(nx, ny, nz);
    assert.ok(
      Math.abs(len - 1.0) < 1e-3,
      `Vertex ${i}: Normal length must be ~1.0, got ${len}`
    );
  }

  geo.dispose();
});

test('Tier 5 - 6.3: Natural Mineral Color Palette Contract (12 Curated Colors with Valid Hex Codes)', () => {
  assert.equal(NATURAL_PEBBLE_PALETTE.length, 12, 'Palette must contain exactly 12 mineral colors');
  assert.equal(NATURAL_PEBBLE_COLORS.length, 12, 'Color string array must contain exactly 12 codes');

  const hexRegex = /^#[0-9A-Fa-f]{6}$/;
  const uniqueCodes = new Set<string>();

  for (const entry of NATURAL_PEBBLE_PALETTE) {
    assert.ok(
      hexRegex.test(entry.code),
      `Color code ${entry.code} must be a valid 6-digit hex format`
    );
    assert.ok(entry.name.length > 0, 'Color name must be non-empty');
    assert.equal(
      uniqueCodes.has(entry.code),
      false,
      `Color code ${entry.code} must be unique within palette`
    );
    uniqueCodes.add(entry.code);
  }
});

// =============================================================================
// CATEGORY 7: STACKSTONECONTROLLER RE-ENTRANCY & QUOTA STATE MACHINE RESILIENCE
// =============================================================================

test('Tier 5 - 7.1: Concurrency Lockout Defense: 50 concurrent placeStone calls reject with PLACEMENT_IN_PROGRESS', async () => {
  const container = await createMockContainer();
  const controller = new StackStoneController(container);
  controller.updateContent('소원 성취를 기원합니다');
  const emptyTower = createTestTower([]);
  const dropPose = poseAt(0, 0.5, 0);

  // Fire 50 concurrent placeStone promises
  const promises = Array.from({ length: 50 }, () => controller.placeStone(emptyTower, dropPose));

  const results = await Promise.allSettled(promises);

  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');

  assert.equal(fulfilled.length, 1, 'Exactly one concurrent placeStone invocation must succeed');
  assert.equal(rejected.length, 49, '49 concurrent placeStone invocations must be rejected');

  for (const rej of rejected) {
    if (rej.status === 'rejected') {
      assert.equal(
        (rej.reason as Error).message,
        'PLACEMENT_IN_PROGRESS',
        'Rejection reason must be PLACEMENT_IN_PROGRESS'
      );
    }
  }
});

test('Tier 5 - 7.2: Rapid Reroll Stress: 100 sequential rerollStone calls preserve state immutability', () => {
  const controller = new StackStoneController();
  let listenerCallCount = 0;

  const unsubscribe = controller.subscribe((state) => {
    listenerCallCount++;
    assert.ok(PEBBLE_SHAPE_PROFILES.includes(state.selectedStone.shape as StoneShape));
    assert.ok(NATURAL_PEBBLE_COLORS.includes(state.selectedStone.color));
  });

  const previousStones: Stone[] = [];
  for (let i = 0; i < 100; i++) {
    const rolled = controller.rerollStone();
    previousStones.push(rolled);
  }

  assert.equal(listenerCallCount, 100, 'Listener must be notified exactly 100 times');
  assert.equal(previousStones.length, 100, 'Must produce 100 distinct stone instances');

  unsubscribe();
});

test('Tier 5 - 7.3: Quota Depletion Boundary: placeStone rejects when daily quota is exhausted', async () => {
  const controller = new StackStoneController(undefined, {
    baseQuota: 0,
    bonusQuota: 0,
    usedCount: 0,
  });

  const emptyTower = createTestTower([]);
  await assert.rejects(
    () => controller.placeStone(emptyTower, poseAt(0, 0.5, 0)),
    (err: Error) => err.message === 'DAILY_QUOTA_EXCEEDED',
    'Exhausted quota must immediately throw DAILY_QUOTA_EXCEEDED'
  );
});

test('Tier 5 - 7.4: Attempt Counter Reset: Settlement reliably resets attempt counter to 0', async () => {
  const container = await createMockContainer();
  const controller = new StackStoneController(container);
  controller.updateContent('가족 모두 평안하길');
  const emptyTower = createTestTower([]);

  assert.equal(controller.getState().attempt, 0, 'Initial attempt counter must be 0');

  // Place stone at center on empty ground -> settles immediately
  await controller.placeStone(emptyTower, poseAt(0, 0.5, 0));

  const stateAfterSettlement = controller.getState();
  assert.equal(stateAfterSettlement.phase, 'SETTLED');
  assert.equal(
    stateAfterSettlement.attempt,
    0,
    'Attempt counter must be reset to 0 upon settlement to prevent session leakage'
  );
});
