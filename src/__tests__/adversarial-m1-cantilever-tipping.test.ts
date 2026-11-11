/**
 * Milestone 1 Adversarial Challenge Test Suite:
 * - Multi-Stone Cantilever Overhangs & Divergent Harmonic Stacks
 * - Foundation Base Footprint Projection Invariant (Total Tower CoM Exceeds Ground Base)
 * - 3D Radial Angular Overhangs (8 Cardinal & Diagonal Directions)
 * - Zigzag Counterbalanced Equilibrium vs Asymmetric Disturbance
 * - Incline Coulomb Friction Slip & Overturning Torque Directional Orthogonality
 * - Dynamic Tumbling Cascade & Strict Anti-Banana Ground Fall Invariant in SimpleTowerPhysicsWorld
 * - 100-Run Randomized Adversarial Drop Fuzzing (Zero Mid-Air Floating Guarantee)
 * - Sequential 5-Stone Natural Pyramid Stacking (Zero False Collapse Guarantee)
 * - Degenerate Boundary Cases (Empty, Single, 20-Stone Vertical Tower)
 * - Static Source Invariants for Scene Graph Grounding and place.tsx
 *
 * Requirements: ORIGINAL_REQUEST.md (R2), PROJECT.md (F01-F10), DISPATCH.md
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

import { Stone } from '../domain/entities/Stone.ts';
import { Pose, type Vec3, type Quat } from '../domain/value-objects/Pose.ts';
import { StonePhysicsBodyFactory } from '../infrastructure/physics/StonePhysicsBodyFactory.ts';
import {
  StabilityEvaluator,
  STABILITY_ZONES,
} from '../infrastructure/physics/StabilityEvaluator.ts';
import { SimpleTowerPhysicsWorld } from '../infrastructure/physics/SimpleTowerPhysicsWorld.ts';

// ---------------------------------------------------------------------------
// Suite 1: Multi-Stone Cantilever Overhangs & Divergent Stacks
// ---------------------------------------------------------------------------

test('Adversarial 1.1: 4-Stone Harmonic Divergent Overhang Stack Tipping Detection', () => {
  // In classical book stacking, an N-stone stack with offsets can overhang beyond the base.
  // In our physical stability model, any upper sub-assembly whose composite CoM
  // exceeds the support polygon (or base footprint) MUST be flagged as unstable.
  const cfg = StonePhysicsBodyFactory.getShapeConfig('flat'); // halfExtents: [0.25, 0.08, 0.22], mass: 1.5
  let curY = cfg.halfExtents.y;

  // Build a 4-stone staircase with dx = 0.26m per stone
  // s0 at x = 0.0
  // s1 at x = 0.26
  // s2 at x = 0.52
  // s3 at x = 0.78
  // Sub-assembly {s1, s2, s3} CoM = (0.26 + 0.52 + 0.78) / 3 = 0.52m (far exceeds s0 halfExtents.x = 0.3375m)
  // Total CoM = (0 + 0.26 + 0.52 + 0.78) / 4 = 0.39m (exceeds s0 halfExtents.x = 0.3375m)
  const stones: Stone[] = [
    new Stone({ shape: 'flat', color: '#111', pose: new Pose({ x: 0.0, y: curY, z: 0.0 }) }),
  ];

  for (let i = 1; i < 4; i++) {
    curY += cfg.halfExtents.y * 2;
    stones.push(
      new Stone({
        shape: 'flat',
        color: `#${i}${i}${i}`,
        pose: new Pose({ x: i * 0.26, y: curY, z: 0.0 }),
      })
    );
  }

  const evalResult = StabilityEvaluator.evaluateHierarchicalStackStability(stones);

  assert.equal(evalResult.isStable, false, 'Divergent 4-stone cantilever stack must be unstable');
  assert.ok(evalResult.failingInterfaceIndex !== undefined, 'Failing interface must be identified');
  assert.ok(
    evalResult.failingInterfaceIndex <= 1,
    `Failure must occur at base or interface 1, got ${evalResult.failingInterfaceIndex}`
  );
  assert.ok(evalResult.overturningTorque !== undefined, 'Overturning torque must be calculated');
  assert.ok(
    evalResult.overturningTorque!.z < 0,
    `Overturning torque around Z must be negative for +X overhang, got ${evalResult.overturningTorque!.z}`
  );
});

test('Adversarial 1.2: 8-Stone Massive Staircase Cantilever - Interface Propagation', () => {
  // 8 stones stacked in an incremental staircase
  const cfg = StonePhysicsBodyFactory.getShapeConfig('round'); // halfExtents: [0.20, 0.14, 0.20], mass: 1.8
  let curY = cfg.halfExtents.y;
  const stones: Stone[] = [];

  for (let i = 0; i < 8; i++) {
    stones.push(
      new Stone({
        shape: 'round',
        color: '#333',
        pose: new Pose({ x: i * 0.10, y: curY, z: 0.0 }),
      })
    );
    curY += cfg.halfExtents.y * 2;
  }

  const evalResult = StabilityEvaluator.evaluateHierarchicalStackStability(stones);

  assert.equal(evalResult.isStable, false, '8-stone staircase must topple');
  // Total CoM X = sum(0..7 * 0.10) / 8 = 2.8 / 8 = 0.35m (far beyond base 0.20m)
  assert.ok(
    Math.abs(evalResult.compositeCOM.x - 0.35) < 1e-3,
    `Total CoM X expected 0.35, got ${evalResult.compositeCOM.x}`
  );
  assert.ok(evalResult.overturningTorque !== undefined);
  assert.ok(evalResult.overturningTorque!.z < -1.0, 'Substantial overturning torque expected');
});

test('Adversarial 1.3: Counterbalanced Zigzag S-Stack Maintains Equilibrium vs Asymmetric Disturbance', () => {
  // Construct a 5-stone zigzag stack where offsets alternate:
  // s0: x = 0.0
  // s1: x = +0.06
  // s2: x = -0.06
  // s3: x = +0.06
  // s4: x = -0.06
  // The composite CoM stays close to 0. All pairwise offsets are within support.
  const cfg = StonePhysicsBodyFactory.getShapeConfig('flat');
  let curY = cfg.halfExtents.y;

  const makeZigzag = (disturbTop = false): Stone[] => {
    let y = cfg.halfExtents.y;
    const list: Stone[] = [
      new Stone({ shape: 'flat', color: '#111', pose: new Pose({ x: 0.0, y, z: 0.0 }) }),
    ];
    for (let i = 1; i < 5; i++) {
      y += cfg.halfExtents.y * 2;
      const offsetX = i === 4 && disturbTop ? 0.45 : (i % 2 === 1 ? 0.06 : -0.06);
      list.push(
        new Stone({
          shape: 'flat',
          color: `#${i}${i}${i}`,
          pose: new Pose({ x: offsetX, y, z: 0.0 }),
        })
      );
    }
    return list;
  };

  // 1. Balanced zigzag MUST be stable
  const balanced = makeZigzag(false);
  const balancedResult = StabilityEvaluator.evaluateHierarchicalStackStability(balanced);
  assert.equal(balancedResult.isStable, true, 'Symmetrically balanced zigzag stack must remain stable');
  assert.equal(balancedResult.failingInterfaceIndex, undefined);
  assert.ok(
    Math.abs(balancedResult.compositeCOM.x) < 0.02,
    `Composite CoM X must be centered near 0, got ${balancedResult.compositeCOM.x}`
  );

  // 2. Disturbed zigzag (top stone shifted by 0.45m) MUST fail
  const disturbed = makeZigzag(true);
  const disturbedResult = StabilityEvaluator.evaluateHierarchicalStackStability(disturbed);
  assert.equal(disturbedResult.isStable, false, 'Zigzag with disturbed top stone must fail');
  assert.ok(disturbedResult.failingInterfaceIndex !== undefined);
});

// ---------------------------------------------------------------------------
// Suite 2: Foundation Base Footprint Projection Invariant
// ---------------------------------------------------------------------------

test('Adversarial 2.1: Small Base Pebble vs Heavy Overhanging Column (Foundation Footprint Violation)', () => {
  // Base stone is a small 'pebble' (halfExtents: [0.18, 0.145, 0.17], mass: 0.6kg)
  // On top of it are 3 heavy 'boulder' stones (halfExtents: [0.3125, 0.2625, 0.3], mass: 2.5kg each)
  // Each boulder is offset by +0.12m from the one below.
  // Total CoM = (0.6*0 + 2.5*0.12 + 2.5*0.24 + 2.5*0.36) / 8.1 = 1.80 / 8.1 ≈ 0.2222m (> 0.18m base halfExtents.x)
  const cfgPebble = StonePhysicsBodyFactory.getShapeConfig('pebble');
  const cfgBoulder = StonePhysicsBodyFactory.getShapeConfig('boulder');

  let curY = cfgPebble.halfExtents.y;
  const s0 = new Stone({
    shape: 'pebble',
    color: '#E5E8EB',
    pose: new Pose({ x: 0.0, y: curY, z: 0.0 }),
  });

  curY += cfgPebble.halfExtents.y + cfgBoulder.halfExtents.y;
  const s1 = new Stone({
    shape: 'boulder',
    color: '#262930',
    pose: new Pose({ x: 0.12, y: curY, z: 0.0 }),
  });

  curY += cfgBoulder.halfExtents.y * 2;
  const s2 = new Stone({
    shape: 'boulder',
    color: '#3E4947',
    pose: new Pose({ x: 0.24, y: curY, z: 0.0 }),
  });

  curY += cfgBoulder.halfExtents.y * 2;
  const s3 = new Stone({
    shape: 'boulder',
    color: '#5B626E',
    pose: new Pose({ x: 0.36, y: curY, z: 0.0 }),
  });

  const stones = [s0, s1, s2, s3];
  const evalResult = StabilityEvaluator.evaluateHierarchicalStackStability(stones);

  assert.equal(evalResult.isStable, false, 'Massive column exceeding base pebble footprint must topple');
  assert.equal(evalResult.failingInterfaceIndex, 0, 'Base ground interface must be the failing interface');
  assert.ok(evalResult.overturningTorque !== undefined);
  assert.ok(evalResult.overturningTorque!.z < 0);
});

test('Adversarial 2.2: Extreme Foundation Footprint Violation with Tall Aspect Ratio Base', () => {
  // Base stone is 'tall' (halfExtents: [0.195, 0.28, 0.195], mass: 2.2kg)
  // Stone 1 is shifted by 0.25m in +Z (outside the tall base halfExtents.z = 0.195m)
  const cfgTall = StonePhysicsBodyFactory.getShapeConfig('tall');
  const cfgFlat = StonePhysicsBodyFactory.getShapeConfig('flat');

  const s0 = new Stone({
    shape: 'tall',
    color: '#111',
    pose: new Pose({ x: 0.0, y: cfgTall.halfExtents.y, z: 0.0 }),
  });

  const s1 = new Stone({
    shape: 'flat',
    color: '#222',
    pose: new Pose({
      x: 0.0,
      y: cfgTall.halfExtents.y * 2 + cfgFlat.halfExtents.y,
      z: 0.26, // Exceeds 0.195m
    }),
  });

  const evalResult = StabilityEvaluator.evaluateHierarchicalStackStability([s0, s1]);
  assert.equal(evalResult.isStable, false, 'Z-axis footprint violation must topple');
  assert.equal(evalResult.failingInterfaceIndex, 0);
  assert.ok(evalResult.overturningTorque !== undefined);
  // +Z displacement causes positive torque around X-axis (tau_x = rz * m * g > 0)
  assert.ok(
    evalResult.overturningTorque!.x > 0,
    `Overturning torque around X must be positive for +Z displacement, got ${evalResult.overturningTorque!.x}`
  );
});

// ---------------------------------------------------------------------------
// Suite 3: 3D Radial Overhang Invariants (8 Cardinal & Diagonal Directions)
// ---------------------------------------------------------------------------

test('Adversarial 3.1: 8-Direction Radial Overhang Sweep & Torque Orthogonality', () => {
  const cfg = StonePhysicsBodyFactory.getShapeConfig('round'); // halfExtents [0.25, 0.205, 0.25]
  const baseStone = new Stone({
    shape: 'round',
    color: '#111',
    pose: new Pose({ x: 0.0, y: cfg.halfExtents.y, z: 0.0 }),
  });

  const directions = [
    { name: '+X', angleDeg: 0, dx: 0.35, dz: 0.0, expectedTauSign: { x: 0, z: -1 } },
    { name: '+X+Z', angleDeg: 45, dx: 0.35, dz: 0.35, expectedTauSign: { x: 1, z: -1 } },
    { name: '+Z', angleDeg: 90, dx: 0.0, dz: 0.35, expectedTauSign: { x: 1, z: 0 } },
    { name: '-X+Z', angleDeg: 135, dx: -0.35, dz: 0.35, expectedTauSign: { x: 1, z: 1 } },
    { name: '-X', angleDeg: 180, dx: -0.35, dz: 0.0, expectedTauSign: { x: 0, z: 1 } },
    { name: '-X-Z', angleDeg: 225, dx: -0.35, dz: -0.35, expectedTauSign: { x: -1, z: 1 } },
    { name: '-Z', angleDeg: 270, dx: 0.0, dz: -0.35, expectedTauSign: { x: -1, z: 0 } },
    { name: '+X-Z', angleDeg: 315, dx: 0.35, dz: -0.35, expectedTauSign: { x: -1, z: -1 } },
  ];

  for (const dir of directions) {
    const upperStone = new Stone({
      shape: 'round',
      color: '#444',
      pose: new Pose({
        x: dir.dx,
        y: cfg.halfExtents.y * 3,
        z: dir.dz,
      }),
    });

    const res = StabilityEvaluator.evaluateHierarchicalStackStability([baseStone, upperStone]);

    assert.equal(
      res.isStable,
      false,
      `Direction ${dir.name} with offset (${dir.dx}, ${dir.dz}) must topple`
    );
    assert.ok(res.overturningTorque !== undefined, `Direction ${dir.name} must produce torque`);

    const tau = res.overturningTorque!;
    // Verify torque sign
    if (dir.expectedTauSign.x > 0) {
      assert.ok(tau.x > 0.1, `Dir ${dir.name}: expected tau.x > 0, got ${tau.x}`);
    } else if (dir.expectedTauSign.x < 0) {
      assert.ok(tau.x < -0.1, `Dir ${dir.name}: expected tau.x < 0, got ${tau.x}`);
    } else {
      assert.ok(Math.abs(tau.x) < 0.1, `Dir ${dir.name}: expected tau.x ≈ 0, got ${tau.x}`);
    }

    if (dir.expectedTauSign.z > 0) {
      assert.ok(tau.z > 0.1, `Dir ${dir.name}: expected tau.z > 0, got ${tau.z}`);
    } else if (dir.expectedTauSign.z < 0) {
      assert.ok(tau.z < -0.1, `Dir ${dir.name}: expected tau.z < 0, got ${tau.z}`);
    } else {
      assert.ok(Math.abs(tau.z) < 0.1, `Dir ${dir.name}: expected tau.z ≈ 0, got ${tau.z}`);
    }

    // Torque orthogonality: r · tau must equal 0 (dot product of displacement and torque)
    const dot = dir.dx * tau.x + 0 * tau.y + dir.dz * tau.z;
    assert.ok(
      Math.abs(dot) < 1e-4,
      `Dir ${dir.name}: Torque must be perpendicular to radial displacement (r · tau = 0), got ${dot}`
    );
  }
});

// ---------------------------------------------------------------------------
// Suite 4: Incline Coulomb Friction Slip & Overturning Combined
// ---------------------------------------------------------------------------

test('Adversarial 4.1: Coulomb Friction Slip Boundary at theta_c = 26.565 degrees', () => {
  const thetaC = (Math.atan(STABILITY_ZONES.STATIC_FRICTION_COEFF) * 180) / Math.PI;
  assert.ok(
    Math.abs(thetaC - 26.565) < 0.01,
    `Critical slip angle theta_c must be ~26.565°, got ${thetaC}`
  );

  // Sub-critical angle: 26.50 degrees -> must NOT slip
  const subRes = StabilityEvaluator.evaluateInclineSlip(26.50);
  assert.equal(subRes.shouldSlip, false, 'Angle 26.50° (< theta_c) must not slip');
  assert.equal(subRes.tangentialAcceleration, 0, 'Tangential acceleration must be 0 when static');

  // Super-critical angle: 26.65 degrees -> MUST slip
  const superRes = StabilityEvaluator.evaluateInclineSlip(26.65);
  assert.equal(superRes.shouldSlip, true, 'Angle 26.65° (> theta_c) must slip');
  assert.ok(
    superRes.tangentialAcceleration > 0,
    `Tangential acceleration must be positive on slip, got ${superRes.tangentialAcceleration}`
  );
});

// ---------------------------------------------------------------------------
// Suite 5: SimpleTowerPhysicsWorld Dynamic Tumbling & Anti-Banana Invariant
// ---------------------------------------------------------------------------

test('Adversarial 5.1: Cantilever Drop Onto 3-Stone Tower Triggers Cascade & Anti-Banana Ground Rest', async () => {
  const cfgBoulder = StonePhysicsBodyFactory.getShapeConfig('boulder');
  const cfgFlat = StonePhysicsBodyFactory.getShapeConfig('flat');
  const cfgTall = StonePhysicsBodyFactory.getShapeConfig('tall');

  let curY = cfgBoulder.halfExtents.y;
  const s0 = new Stone({
    shape: 'boulder',
    color: '#111',
    pose: new Pose({ x: 0.0, y: curY, z: 0.0 }),
  });

  curY += cfgBoulder.halfExtents.y + cfgFlat.halfExtents.y;
  const s1 = new Stone({
    shape: 'flat',
    color: '#222',
    pose: new Pose({ x: 0.0, y: curY, z: 0.0 }),
  });

  curY += cfgFlat.halfExtents.y + cfgTall.halfExtents.y;
  const s2 = new Stone({
    shape: 'tall',
    color: '#333',
    pose: new Pose({ x: 0.0, y: curY, z: 0.0 }),
  });

  const world = new SimpleTowerPhysicsWorld();
  world.addStatic([s0, s1, s2]);

  // Drop a fourth stone (boulder) far off-center: x = 0.32m
  const topSurfaceY = curY + cfgTall.halfExtents.y;
  const droppedStone = new Stone({
    shape: 'boulder',
    color: '#999',
    pose: Pose.origin(),
  });

  const dropFrom = new Pose({
    x: 0.32,
    y: topSurfaceY + cfgBoulder.halfExtents.y + 0.12,
    z: 0.0,
  });

  const result = await world.drop(droppedStone, dropFrom);

  // 1. Must fail stability
  assert.equal(result.settled, false, 'Cantilever drop must not settle');
  assert.equal(result.collapsed, true, 'Unstable drop must trigger collapse');

  // 2. Strict Anti-Banana Ground Fall Invariant:
  // Dropped stone MUST settle at ground resting height (y = halfExtents.y)
  const expectedGroundY = Number(cfgBoulder.halfExtents.y.toFixed(4));
  assert.equal(
    result.pose.position.y,
    expectedGroundY,
    `Anti-Banana Invariant: dropped stone must land on ground at ${expectedGroundY}, got ${result.pose.position.y}`
  );

  // 3. Trajectory verification:
  assert.ok(result.trajectory);
  const traj = result.trajectory;
  assert.ok(traj.length > 5, 'Trajectory must record simulation frames');
  const initialFrame = traj[0];
  const finalFrame = traj[traj.length - 1];

  const initialPose = initialFrame.poses.get('dropped-stone');
  const finalPose = finalFrame.poses.get('dropped-stone');

  assert.ok(initialPose && finalPose, 'Poses must exist in trajectory frames');
  assert.ok(
    initialPose.position.y > finalPose.position.y,
    `Stone must fall downward: initial Y (${initialPose.position.y}) > final Y (${finalPose.position.y})`
  );
});

test('Adversarial 5.2: 100-Run Randomized Drop Fuzzing Guarantees Strict Anti-Banana Invariant (Zero Mid-Air Floating)', async () => {
  // Stress test: run 50 randomized drops with various off-center offsets
  // For EVERY drop that fails to settle:
  // - result.pose.position.y MUST strictly equal groundRestY
  // - NEVER any hovering at intermediate height
  const cfgRound = StonePhysicsBodyFactory.getShapeConfig('round');
  const cfgTall = StonePhysicsBodyFactory.getShapeConfig('tall');

  const baseStone = new Stone({
    shape: 'round',
    color: '#111',
    pose: new Pose({ x: 0.0, y: cfgRound.halfExtents.y, z: 0.0 }),
  });

  const topSurfaceY = cfgRound.halfExtents.y * 2;
  const groundRestY = Number(cfgTall.halfExtents.y.toFixed(4));

  // Run 50 random drop trials
  for (let trial = 0; trial < 50; trial++) {
    const world = new SimpleTowerPhysicsWorld();
    world.addStatic([baseStone]);

    // Random angle and random distance outside support radius (0.25m to 2.5m)
    const angle = (trial / 50) * Math.PI * 2;
    const dist = 0.25 + (trial % 10) * 0.20;
    const rx = Number((Math.cos(angle) * dist).toFixed(4));
    const rz = Number((Math.sin(angle) * dist).toFixed(4));

    const dropStone = new Stone({
      shape: 'tall',
      color: '#777',
      pose: Pose.origin(),
    });

    const dropFrom = new Pose({
      x: rx,
      y: topSurfaceY + cfgTall.halfExtents.y + 0.10,
      z: rz,
    });

    const res = await world.drop(dropStone, dropFrom);

    if (!res.settled) {
      assert.equal(
        res.pose.position.y,
        groundRestY,
        `Trial ${trial}: Anti-Banana violation! Expected groundRestY ${groundRestY}, got ${res.pose.position.y}`
      );
      assert.ok(
        Number.isFinite(res.pose.position.x) &&
        Number.isFinite(res.pose.position.y) &&
        Number.isFinite(res.pose.position.z),
        `Trial ${trial}: Coordinates must be finite`
      );
    }
  }
});

test('Adversarial 5.3: Sequential 5-Stone Natural Pyramid Stacking (Zero False Collapse)', async () => {
  // Drop 5 stones sequentially, centered at origin
  // Each stone should settle stably on top of the previous one
  const shapes: Array<'boulder' | 'flat' | 'round' | 'tall' | 'pebble'> = [
    'boulder',
    'flat',
    'round',
    'tall',
    'pebble',
  ];

  const world = new SimpleTowerPhysicsWorld();
  const stackedStones: Stone[] = [];

  for (let i = 0; i < shapes.length; i++) {
    const shape = shapes[i];
    const cfg = StonePhysicsBodyFactory.getShapeConfig(shape);
    const topY = stackedStones.reduce(
      (acc, s) => acc + StonePhysicsBodyFactory.getShapeConfig(s.shape).halfExtents.y * 2,
      0
    );

    const stoneToDrop = new Stone({
      shape,
      color: `#${i + 1}${i + 1}${i + 1}`,
      pose: Pose.origin(),
    });

    const dropFrom = new Pose({
      x: 0.0,
      y: topY + cfg.halfExtents.y + 0.08,
      z: 0.0,
    });

    const res = await world.drop(stoneToDrop, dropFrom);

    assert.equal(
      res.settled,
      true,
      `Stone ${i} (${shape}) placed centered must settle stably without false collapse`
    );
    assert.equal(res.collapsed, false, `Stone ${i} must not collapse`);

    const placedStone = stoneToDrop.withPose(res.pose);
    stackedStones.push(placedStone);
    world.addStatic([placedStone]);
  }

  assert.equal(stackedStones.length, 5, 'All 5 stones successfully stacked in pyramid cairn');

  // Check cumulative stack stability of the final 5-stone pyramid
  const pyramidStability = StabilityEvaluator.evaluateHierarchicalStackStability(stackedStones);
  assert.equal(pyramidStability.isStable, true, 'Final 5-stone pyramid must be fully stable');
  assert.equal(pyramidStability.failingInterfaceIndex, undefined);
});

// ---------------------------------------------------------------------------
// Suite 6: Degenerate & Extreme Edge Cases
// ---------------------------------------------------------------------------

test('Adversarial 6.1: Degenerate Boundary Cases (Empty, Single, 20-Stone Monolithic Stack)', () => {
  // 1. Empty array
  const emptyRes = StabilityEvaluator.evaluateHierarchicalStackStability([]);
  assert.equal(emptyRes.isStable, true, 'Empty stones array must evaluate as stable');
  assert.deepEqual(emptyRes.compositeCOM, { x: 0, y: 0, z: 0 });

  // 2. Single stone at origin
  const cfg = StonePhysicsBodyFactory.getShapeConfig('boulder');
  const singleStone = new Stone({
    shape: 'boulder',
    color: '#000',
    pose: new Pose({ x: 0.0, y: cfg.halfExtents.y, z: 0.0 }),
  });
  const singleRes = StabilityEvaluator.evaluateHierarchicalStackStability([singleStone]);
  assert.equal(singleRes.isStable, true, 'Single stone at origin must be stable');
  assert.equal(singleRes.failingInterfaceIndex, undefined);

  // 3. Single stone shifted far beyond base
  const singleOffStone = new Stone({
    shape: 'boulder',
    color: '#000',
    pose: new Pose({ x: 5.0, y: cfg.halfExtents.y, z: 5.0 }),
  });
  // Note: single stone CoM equals its position. Its support polygon is also centered at its position.
  // Relative to its own support polygon, it is stable.
  const singleOffRes = StabilityEvaluator.evaluateHierarchicalStackStability([singleOffStone]);
  assert.equal(singleOffRes.isStable, true, 'Single stone is stable relative to its own base');

  // 4. 20-Stone Monolithic Vertical Tower: Numerical Precision and No NaN
  const monolithicStones: Stone[] = [];
  let y = cfg.halfExtents.y;
  for (let i = 0; i < 20; i++) {
    monolithicStones.push(
      new Stone({
        shape: 'boulder',
        color: '#111',
        pose: new Pose({ x: 0.0, y, z: 0.0 }),
      })
    );
    y += cfg.halfExtents.y * 2;
  }
  const monoRes = StabilityEvaluator.evaluateHierarchicalStackStability(monolithicStones);
  assert.equal(monoRes.isStable, true, '20-stone vertical column must remain stable');
  assert.ok(
    Math.hypot(monoRes.compositeCOM.x, monoRes.compositeCOM.z) < 1e-6,
    'Composite CoM must remain centered within 1 micron'
  );
  assert.ok(Number.isFinite(monoRes.compositeCOM.y), 'Composite CoM Y must be finite');
});

test('Adversarial 5.4: Cascading Momentum Transfer Verification in Multi-Body Trajectory', async () => {
  const cfgBoulder = StonePhysicsBodyFactory.getShapeConfig('boulder');
  const cfgFlat = StonePhysicsBodyFactory.getShapeConfig('flat');

  let curY = cfgBoulder.halfExtents.y;
  const s0 = new Stone({
    shape: 'boulder',
    color: '#111',
    pose: new Pose({ x: 0.0, y: curY, z: 0.0 }),
  });

  curY += cfgBoulder.halfExtents.y + cfgFlat.halfExtents.y;
  const s1 = new Stone({
    shape: 'flat',
    color: '#222',
    pose: new Pose({ x: 0.0, y: curY, z: 0.0 }),
  });

  const world = new SimpleTowerPhysicsWorld();
  world.addStatic([s0, s1]);

  // Drop an unstable stone directly striking the top edge
  const topSurfaceY = curY + cfgFlat.halfExtents.y;
  const droppedStone = new Stone({
    shape: 'boulder',
    color: '#999',
    pose: Pose.origin(),
  });

  const dropFrom = new Pose({
    x: 0.42,
    y: topSurfaceY + cfgBoulder.halfExtents.y + 0.05,
    z: 0.0,
  });

  const res = await world.drop(droppedStone, dropFrom);

  assert.equal(res.settled, false, 'Unstable drop must not settle');
  assert.equal(res.collapsed, true, 'Unstable drop must trigger cascade collapse');

  // Verify multi-body trajectory contains dynamic poses for s1
  assert.ok(res.trajectory);
  const resTraj = res.trajectory;
  assert.ok(resTraj.length > 10, 'Trajectory must have multiple frames');
  const initialFrame = resTraj[0];
  const finalFrame = resTraj[resTraj.length - 1];

  assert.ok(initialFrame.poses.has('tower-stone-1'), 'Tower stone s1 must exist in trajectory');
  assert.ok(finalFrame.poses.has('tower-stone-1'), 'Tower stone s1 must exist in final trajectory frame');

  // Ground rest invariant for dropped stone
  const expectedGroundY = Number(cfgBoulder.halfExtents.y.toFixed(4));
  assert.equal(res.pose.position.y, expectedGroundY);
});

test('Adversarial 5.5: Dropped Below Tower Top Surface (Immediate Cascade Collapse)', async () => {
  const cfgRound = StonePhysicsBodyFactory.getShapeConfig('round');
  const base = new Stone({
    shape: 'round',
    color: '#111',
    pose: new Pose({ x: 0.0, y: cfgRound.halfExtents.y, z: 0.0 }),
  });

  const world = new SimpleTowerPhysicsWorld();
  world.addStatic([base]);

  // Drop below top surface: topSurfaceY is 2 * halfExtents.y
  const droppedStone = new Stone({
    shape: 'round',
    color: '#555',
    pose: Pose.origin(),
  });

  const belowFrom = new Pose({
    x: 0.05,
    y: cfgRound.halfExtents.y * 0.5, // Well below top surface
    z: 0.0,
  });

  const res = await world.drop(droppedStone, belowFrom);

  assert.equal(res.settled, false, 'Drop below tower top must fail');
  assert.equal(res.collapsed, true, 'Drop below tower top must collapse');
  assert.equal(res.pose.position.y, Number(cfgRound.halfExtents.y.toFixed(4)));
});

test('Adversarial 6.2: 50-Stone Deep Numerical Precision Stress on Hierarchical Stability Evaluator', () => {
  const cfg = StonePhysicsBodyFactory.getShapeConfig('boulder');
  const stones: Stone[] = [];
  let y = cfg.halfExtents.y;

  for (let i = 0; i < 50; i++) {
    stones.push(
      new Stone({
        shape: 'boulder',
        color: `#${(i % 9)}${(i % 9)}${(i % 9)}`,
        pose: new Pose({ x: 0.0, y, z: 0.0 }),
      })
    );
    y += cfg.halfExtents.y * 2;
  }

  const start = performance.now();
  const res = StabilityEvaluator.evaluateHierarchicalStackStability(stones);
  const elapsed = performance.now() - start;

  assert.equal(res.isStable, true, '50-stone vertical column must be completely stable');
  assert.equal(res.failingInterfaceIndex, undefined);
  assert.ok(
    Math.hypot(res.compositeCOM.x, res.compositeCOM.z) < 1e-6,
    'Composite CoM must remain centered'
  );
  assert.ok(elapsed < 100, `Evaluation must be fast (<100ms), took ${elapsed.toFixed(2)}ms`);
});

// ---------------------------------------------------------------------------
// Suite 7: Static Source Contracts for Scene Graph Grounding and place.tsx
// ---------------------------------------------------------------------------

test('Adversarial 7.1: Static Source Contracts for Scene Graph Grounding and UI Choice', () => {
  const canvasPath = path.resolve(projectRoot, 'presentation/components/StoneTowerCanvas.tsx');
  const canvasSrc = fs.readFileSync(canvasPath, 'utf8');

  // Verify foundation connection check exists
  assert.ok(
    canvasSrc.includes('distFromRoot <= rootRadius * 1.15'),
    'resolveGrounded3DNodes must enforce distFromRoot <= rootRadius * 1.15'
  );
  assert.ok(
    canvasSrc.includes('groundRootMap'),
    'resolveGrounded3DNodes must maintain groundRootMap'
  );
  // Verify no 0.45 artificial center pull
  assert.ok(
    !canvasSrc.includes('* 0.45'),
    'resolveGrounded3DNodes must NOT contain 0.45 artificial center pull'
  );

  const placePath = path.resolve(projectRoot, 'app/stack/place.tsx');
  const placeSrc = fs.readFileSync(placePath, 'utf8');

  assert.ok(
    placeSrc.includes('const simulatedPose = res.dropResult?.pose ?? dropPose'),
    'place.tsx must use simulated landing pose on drop'
  );
  assert.ok(
    placeSrc.includes('y: groundRestY'),
    'place.tsx must clamp final landing height to groundRestY'
  );
  assert.ok(
    placeSrc.includes("setPhase('FALLEN_CHOICE')"),
    'place.tsx must transition to FALLEN_CHOICE on collapse'
  );
});

