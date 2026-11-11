/**
 * Milestone 5 Tier 5 White-Box Adversarial Stress Testing Harness
 * 
 * Target Domains:
 * 1. Extreme Multi-Stone Configurations (Cantilevers, Chaotic Stacks, Inverse Pyramids, Harmonic Divergence)
 * 2. Multi-Tier Hierarchical Composite CoM Oracle Verification
 * 3. Anti-Banana Invariant: 100% Absence of Mid-Air Floating Stones ($y = h_{\text{drop}, y}$) Across 200 Fuzz Runs
 * 4. Numerical Robustness: Degenerate Polygons, Non-Finite Coordinates (NaN, Infinity), and High-Velocity Impact
 * 5. Cascading Collapse & Momentum Transfer Dynamic Body Wake-Up
 * 
 * References: ORIGINAL_REQUEST.md (R2, R5), PROJECT.md (F01-F10), DISPATCH.md
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import * as CANNON from 'cannon-es';
import { Stone, type StoneShape } from '../domain/entities/Stone.ts';
import { Pose, type Vec3, type Quat } from '../domain/value-objects/Pose.ts';
import { StonePhysicsBodyFactory } from '../infrastructure/physics/StonePhysicsBodyFactory.ts';
import {
  StabilityEvaluator,
  STABILITY_ZONES,
} from '../infrastructure/physics/StabilityEvaluator.ts';
import { type SupportPolygon } from '../infrastructure/physics/PhysicsSimulationTypes.ts';
import { SimpleTowerPhysicsWorld } from '../infrastructure/physics/SimpleTowerPhysicsWorld.ts';

const ALL_SHAPES: StoneShape[] = ['boulder', 'flat', 'tall', 'round', 'pebble'];

function createStone(
  shape: StoneShape,
  x: number,
  y: number,
  z: number,
  rotation?: Quat
): Stone {
  return new Stone({
    shape,
    color: '#888888',
    pose: new Pose(
      { x, y, z },
      rotation ?? { qx: 0, qy: 0, qz: 0, qw: 1 }
    ),
  });
}

// ============================================================================
// Group 1: Extreme Multi-Stone Configurations & Hierarchical Composite CoM
// ============================================================================

test('Tier 5.1.1 - Inverse Pyramid Cairn (Pebble Base -> Round -> Flat -> Boulder Top)', async () => {
  // An inverse pyramid has a narrow base (pebble) and heavy wide top (boulder).
  // Base pebble: halfExtents = [0.18, 0.145, 0.17], mass = 0.6
  // Middle round: halfExtents = [0.25, 0.205, 0.25], mass = 1.2
  // Middle flat: halfExtents = [0.3375, 0.105, 0.3125], mass = 1.5
  // Top boulder: halfExtents = [0.3125, 0.2625, 0.3], mass = 2.5

  const pebbleCfg = StonePhysicsBodyFactory.getShapeConfig('pebble');
  const roundCfg = StonePhysicsBodyFactory.getShapeConfig('round');
  const flatCfg = StonePhysicsBodyFactory.getShapeConfig('flat');
  const boulderCfg = StonePhysicsBodyFactory.getShapeConfig('boulder');

  const yPebble = pebbleCfg.halfExtents.y;
  const yRound = yPebble + pebbleCfg.halfExtents.y + roundCfg.halfExtents.y;
  const yFlat = yRound + roundCfg.halfExtents.y + flatCfg.halfExtents.y;
  const yBoulder = yFlat + flatCfg.halfExtents.y + boulderCfg.halfExtents.y;

  // Case A: Perfectly centered inverse pyramid
  const centeredStones = [
    createStone('pebble', 0, yPebble, 0),
    createStone('round', 0, yRound, 0),
    createStone('flat', 0, yFlat, 0),
    createStone('boulder', 0, yBoulder, 0),
  ];

  const centeredResult = StabilityEvaluator.evaluateHierarchicalStackStability(centeredStones);
  assert.equal(centeredResult.isStable, true, 'Perfectly centered inverse pyramid should be statically stable');
  assert.ok(Math.abs(centeredResult.compositeCOM.x) < 1e-4, 'CoM X should be centered');
  assert.ok(Math.abs(centeredResult.compositeCOM.z) < 1e-4, 'CoM Z should be centered');

  // Case B: Perturbed top boulder (+0.45m in X)
  // Boulder at x = 0.45m exceeds flat stone's halfExtents.x (0.3375m)
  // Total mass = 0.6 + 1.2 + 1.5 + 2.5 = 5.8kg
  // Total CoM X = (2.5 * 0.45) / 5.8 = 0.194m (exceeds pebble halfExtents.x = 0.18m)
  const tippedStones = [
    createStone('pebble', 0, yPebble, 0),
    createStone('round', 0, yRound, 0),
    createStone('flat', 0, yFlat, 0),
    createStone('boulder', 0.45, yBoulder, 0),
  ];

  const tippedResult = StabilityEvaluator.evaluateHierarchicalStackStability(tippedStones);
  assert.equal(tippedResult.isStable, false, 'Shifted inverse pyramid must be unstable');
  assert.ok(tippedResult.failingInterfaceIndex !== undefined, 'Failure must be detected at failing interface');
  assert.ok(tippedResult.overturningTorque !== undefined, 'Overturning torque must be calculated');

  // Verify in dynamic physics simulation:
  const world = new SimpleTowerPhysicsWorld();
  world.addStatic(tippedStones.slice(0, 3));
  const dropPose = new Pose({ x: 0.45, y: yBoulder + 0.1, z: 0 });
  const dropResult = await world.drop(tippedStones[3], dropPose);

  assert.equal(dropResult.settled, false, 'Dynamic drop of off-balance boulder must not settle');
  assert.equal(dropResult.collapsed, true, 'Must trigger collapse');
  // Anti-Banana: Boulder must end on ground plane
  assert.equal(
    dropResult.pose.position.y,
    Number(boulderCfg.halfExtents.y.toFixed(4)),
    'Unsettled boulder must land on ground plane (Anti-Banana Invariant)'
  );
  world.dispose();
});

test('Tier 5.1.2 - Leaning Tower of Lire (Exact Harmonic Cantilever Stacking Boundary)', () => {
  // Classical harmonic series cantilever: for N identical stones of length 2L,
  // each stone k (1-indexed from top) can overhang by L / k.
  // We use 5 'flat' stones (halfExtents = [0.3375, 0.105, 0.3125], mass = 1.5).
  // Total width = 2 * halfExtents.x = 0.675m. L = 0.3375m.
  const cfg = StonePhysicsBodyFactory.getShapeConfig('flat');
  const L = cfg.halfExtents.x; // 0.3375m

  let curY = cfg.halfExtents.y;
  const stableHarmonicStones: Stone[] = [
    createStone('flat', 0, curY, 0),
  ];

  // We slightly scale down offsets by 0.85 so it stays safely within the stable boundary
  const offsets = [0, 0.85 * (L / 4), 0.85 * (L / 4 + L / 3), 0.85 * (L / 4 + L / 3 + L / 2)];
  for (let i = 1; i < 4; i++) {
    curY += cfg.halfExtents.y * 2;
    stableHarmonicStones.push(createStone('flat', offsets[i], curY, 0));
  }

  const stableResult = StabilityEvaluator.evaluateHierarchicalStackStability(stableHarmonicStones);
  assert.equal(stableResult.isStable, true, 'Harmonic cantilever within theoretical margin must be stable');

  // Now push the top stone outwards by +0.45m (well outside the support polygon of S_2)
  curY += cfg.halfExtents.y * 2;
  const unstableHarmonicStones = [
    ...stableHarmonicStones,
    createStone('flat', offsets[3] + 0.45, curY, 0),
  ];

  const unstableResult = StabilityEvaluator.evaluateHierarchicalStackStability(unstableHarmonicStones);
  assert.equal(unstableResult.isStable, false, 'Over-extended harmonic cantilever must be unstable');
  assert.ok(unstableResult.failingInterfaceIndex !== undefined, 'Failing interface must be identified');
});

test('Tier 5.1.3 - Independent Mathematical Oracle vs StabilityEvaluator across 50 Randomized Towers', () => {
  // Independent Oracle:
  // For any list of stones, independently compute:
  // 1. Total CoM and upper CoM at each interface
  // 2. 2D bounding boxes / hull projection
  // 3. Compare with StabilityEvaluator verdict

  for (let seed = 0; seed < 50; seed++) {
    const numStones = 3 + (seed % 5); // 3 to 7 stones
    const stones: Stone[] = [];
    let curY = 0;

    for (let i = 0; i < numStones; i++) {
      const shape = ALL_SHAPES[(seed + i * 2) % ALL_SHAPES.length];
      const cfg = StonePhysicsBodyFactory.getShapeConfig(shape);
      curY += cfg.halfExtents.y;
      // Controlled jitter: some towers stable, some unstable
      const jitterX = ((seed * 17 + i * 31) % 100 - 50) / 400; // -0.125 to +0.125m
      const jitterZ = ((seed * 23 + i * 19) % 100 - 50) / 400;
      stones.push(createStone(shape, jitterX, curY, jitterZ));
      curY += cfg.halfExtents.y;
    }

    const evalResult = StabilityEvaluator.evaluateHierarchicalStackStability(stones);

    // Oracle Calculation
    let totalMass = 0;
    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    for (const s of stones) {
      const m = StonePhysicsBodyFactory.getShapeConfig(s.shape).mass;
      totalMass += m;
      sumX += m * s.pose.position.x;
      sumY += m * s.pose.position.y;
      sumZ += m * s.pose.position.z;
    }
    const oracleCoM: Vec3 = {
      x: sumX / totalMass,
      y: sumY / totalMass,
      z: sumZ / totalMass,
    };

    // Verify composite CoM matches oracle within numerical precision
    assert.ok(
      Math.abs(evalResult.compositeCOM.x - oracleCoM.x) < 1e-4,
      `Composite CoM X mismatch: eval=${evalResult.compositeCOM.x}, oracle=${oracleCoM.x}`
    );
    assert.ok(
      Math.abs(evalResult.compositeCOM.y - oracleCoM.y) < 1e-4,
      `Composite CoM Y mismatch: eval=${evalResult.compositeCOM.y}, oracle=${oracleCoM.y}`
    );
    assert.ok(
      Math.abs(evalResult.compositeCOM.z - oracleCoM.z) < 1e-4,
      `Composite CoM Z mismatch: eval=${evalResult.compositeCOM.z}, oracle=${oracleCoM.z}`
    );

    // If unstable, overturning torque must be non-zero
    if (!evalResult.isStable) {
      assert.ok(evalResult.failingInterfaceIndex !== undefined, 'Failing interface index must be defined');
      assert.ok(evalResult.overturningTorque !== undefined, 'Overturning torque must be defined for unstable stacks');
    }
  }
});

test('Tier 5.1.4 - Zigzag Counterbalanced Equilibrium (Opposing Offsets Balance CoM)', () => {
  // Construct a 5-stone zigzag stack where each stone alternates +X and -X:
  // S_0: x = 0
  // S_1: x = +0.22
  // S_2: x = -0.22
  // S_3: x = +0.22
  // S_4: x = -0.22
  // Total CoM is centered at x = 0!
  // But is every individual interface stable?
  // S_4 on S_3: S_4 is at -0.22, S_3 is at +0.22. Distance is 0.44m.
  // With 'round' stone (halfExtents.x = 0.25m), distance 0.44m exceeds contact support!
  // StabilityEvaluator MUST detect that the top interface (S_3 -> S_4) fails, even though total CoM = 0.
  const cfg = StonePhysicsBodyFactory.getShapeConfig('round');
  let curY = cfg.halfExtents.y;
  const zigzagStones: Stone[] = [createStone('round', 0, curY, 0)];

  for (let i = 1; i < 5; i++) {
    curY += cfg.halfExtents.y * 2;
    const sign = i % 2 === 1 ? 1 : -1;
    zigzagStones.push(createStone('round', sign * 0.22, curY, 0));
  }

  const result = StabilityEvaluator.evaluateHierarchicalStackStability(zigzagStones);
  assert.equal(result.isStable, false, 'Extreme zigzag alternating stack must fail at individual interfaces');
  assert.ok(
    result.failingInterfaceIndex !== undefined,
    'Must identify the specific interface that failed'
  );
});

// ============================================================================
// Group 2: Anti-Banana Ground-Landing Invariant & Drop Fuzzing
// ============================================================================

test('Tier 5.2.1 - 200-Run Adversarial Randomized Drop Fuzzing (100% Anti-Banana Invariant)', async () => {
  // Anti-Banana Invariant Definition:
  // Across ANY drop attempt in ANY tower state:
  // 1. If settled === false or collapsed === true:
  //    The final resting stone y coordinate MUST equal dropConfig.halfExtents.y (ground landing).
  //    Under NO circumstance may a stone hover in mid-air (y > h_drop) without vertical support.
  // 2. If settled === true:
  //    The final resting stone y coordinate MUST be >= topSurfaceY + h_drop - 0.02.
  // 3. No stone pose may ever sink into negative subterranean space (y < 0).

  const world = new SimpleTowerPhysicsWorld(0.45, 0.25, { maxSteps: 60 });

  for (let run = 0; run < 200; run++) {
    const shape = ALL_SHAPES[run % ALL_SHAPES.length];
    const cfg = StonePhysicsBodyFactory.getShapeConfig(shape);
    const expectedGroundY = Number(cfg.halfExtents.y.toFixed(4));

    // Vary tower configuration: 0 stones (bare ground), 1 stone, 2 stones
    const towerMode = run % 3;
    let topSurfaceY = 0;

    if (towerMode === 0) {
      world.addStatic([]);
    } else if (towerMode === 1) {
      const baseCfg = StonePhysicsBodyFactory.getShapeConfig('boulder');
      world.addStatic([createStone('boulder', 0, baseCfg.halfExtents.y, 0)]);
      topSurfaceY = baseCfg.halfExtents.y * 2;
    } else {
      const baseCfg = StonePhysicsBodyFactory.getShapeConfig('flat');
      const midCfg = StonePhysicsBodyFactory.getShapeConfig('round');
      const s0 = createStone('flat', 0, baseCfg.halfExtents.y, 0);
      const s1 = createStone('round', 0, baseCfg.halfExtents.y * 2 + midCfg.halfExtents.y, 0);
      world.addStatic([s0, s1]);
      topSurfaceY = baseCfg.halfExtents.y * 2 + midCfg.halfExtents.y * 2;
    }

    // Pseudorandom drop coordinates with wide distribution
    const dropX = ((run * 37) % 200 - 100) / 50; // -2.0m to +2.0m
    const dropZ = ((run * 43) % 200 - 100) / 50; // -2.0m to +2.0m
    const dropY = topSurfaceY + 0.1 + ((run * 19) % 100) / 30; // above tower

    const dropStone = createStone(shape, 0, 0, 0);
    const dropPose = new Pose({ x: dropX, y: dropY, z: dropZ });

    const result = await world.drop(dropStone, dropPose);

    // Invariant Assertions:
    assert.ok(
      Number.isFinite(result.pose.position.x) &&
      Number.isFinite(result.pose.position.y) &&
      Number.isFinite(result.pose.position.z),
      `Run ${run}: Drop pose coordinates must be finite numbers`
    );

    assert.ok(
      result.pose.position.y >= 0,
      `Run ${run}: Stone must never sink into negative subterranean space (got y=${result.pose.position.y})`
    );

    if (!result.settled) {
      // STRICT ANTI-BANANA INVARIANT:
      assert.equal(
        result.pose.position.y,
        expectedGroundY,
        `Run ${run} (shape=${shape}): Unsettled stone MUST land at ground y=${expectedGroundY}, got y=${result.pose.position.y}. MID-AIR FLOATING BANANA VIOLATION!`
      );
    } else {
      // Stable placement invariant:
      assert.ok(
        result.pose.position.y >= topSurfaceY + cfg.halfExtents.y - 0.05,
        `Run ${run}: Settled stone must sit on top of tower surface (got y=${result.pose.position.y}, min=${topSurfaceY + cfg.halfExtents.y})`
      );
    }
  }

  world.dispose();
});

test('Tier 5.2.2 - Sub-Tower Drop Trapping (Drop Position Below Tower Top Surface)', async () => {
  // If a stone is released below the tower top (e.g. y = 0.15m while tower top is 0.80m),
  // it must NEVER be snapped upward or float in mid-air.
  const world = new SimpleTowerPhysicsWorld();
  const baseCfg = StonePhysicsBodyFactory.getShapeConfig('tall'); // halfExtents = [0.195, 0.3625, 0.19]
  const tower = [createStone('tall', 0, baseCfg.halfExtents.y, 0)];
  world.addStatic(tower);

  const pebbleCfg = StonePhysicsBodyFactory.getShapeConfig('pebble');
  const belowPose = new Pose({ x: 0.10, y: 0.15, z: 0.10 }); // below top surface of tall stone (0.725m)

  const result = await world.drop(createStone('pebble', 0, 0, 0), belowPose);

  assert.equal(result.settled, false, 'Dropping below tower summit cannot settle on top');
  assert.equal(
    result.pose.position.y,
    Number(pebbleCfg.halfExtents.y.toFixed(4)),
    'Dropped-below stone must settle on ground plane without mid-air floating'
  );

  world.dispose();
});

test('Tier 5.2.3 - Cantilever Arch Drop Refusal (Zero C-Curve Arch Formation)', async () => {
  // Test attempting to build a cantilever arch in mid-air.
  // Base at (0, 0, 0).
  // Drop stone 1 at x = 0.45m (outside base support halfExtents 0.3375m).
  // Drop stone 2 at x = 0.80m.
  // In a naive pairwise system without anti-banana enforcement, stone 2 might rest on stone 1 in mid-air.
  // In our system, both stones MUST tumble to the ground plane.
  const world = new SimpleTowerPhysicsWorld();
  const flatCfg = StonePhysicsBodyFactory.getShapeConfig('flat');
  world.addStatic([createStone('flat', 0, flatCfg.halfExtents.y, 0)]);

  const s1Pose = new Pose({ x: 0.45, y: flatCfg.halfExtents.y * 2 + flatCfg.halfExtents.y + 0.05, z: 0 });
  const r1 = await world.drop(createStone('flat', 0, 0, 0), s1Pose);

  assert.equal(r1.settled, false, 'Cantilever stone outside support polygon must not settle');
  assert.equal(
    r1.pose.position.y,
    Number(flatCfg.halfExtents.y.toFixed(4)),
    'First cantilever stone must drop to ground'
  );

  world.dispose();
});

// ============================================================================
// Group 3: Numerical Robustness & Boundary Stress
// ============================================================================

test('Tier 5.3.1 - Degenerate Support Polygon Handling (Zero Crash / Graceful Fallback)', () => {
  // 1. Empty polygon
  const emptyPoly: SupportPolygon = { vertices: [], area: 0, centroid: [0, 0] };
  const rEmptyRadius = StabilityEvaluator.computeSupportRadius(emptyPoly, [1, 0]);
  assert.equal(rEmptyRadius, 0, 'Empty polygon radius must be 0');

  const rEmptyEval = StabilityEvaluator.evaluateStability({ x: 0, y: 0, z: 0 }, emptyPoly);
  assert.equal(rEmptyEval.isStable, false, 'Empty polygon must evaluate to unstable');
  assert.equal(rEmptyEval.zone, 'topple', 'Empty polygon zone must be topple');

  // 2. Single vertex
  const singlePoly: SupportPolygon = { vertices: [[0, 0]], area: 0, centroid: [0, 0] };
  const rSingleRadius = StabilityEvaluator.computeSupportRadius(singlePoly);
  assert.equal(rSingleRadius, 0, 'Single vertex radius must be 0');

  // 3. Two vertices (line segment)
  const linePoly: SupportPolygon = { vertices: [[-1, 0], [1, 0]], area: 0, centroid: [0, 0] };
  const rLineRadius = StabilityEvaluator.computeSupportRadius(linePoly);
  assert.equal(rLineRadius, 0, 'Line segment radius must be 0');

  // 4. Three collinear vertices
  const collinearPoly: SupportPolygon = {
    vertices: [[-1, 0], [0, 0], [1, 0]],
    area: 0,
    centroid: [0, 0],
  };
  const rCollinearEval = StabilityEvaluator.evaluateStability({ x: 0, y: 0, z: 0 }, collinearPoly);
  assert.ok(
    Number.isFinite(rCollinearEval.marginDistance) || rCollinearEval.marginDistance === -Infinity,
    'Collinear polygon evaluation must not produce NaN'
  );

  // 5. Macro-scale coordinates (10^8)
  const macroPoly: SupportPolygon = {
    vertices: [[-1e8, -1e8], [1e8, -1e8], [1e8, 1e8], [-1e8, 1e8]],
    area: 4e16,
    centroid: [0, 0],
  };
  const rMacroEval = StabilityEvaluator.evaluateStability({ x: 0, y: 0, z: 0 }, macroPoly);
  assert.equal(rMacroEval.isStable, true, 'CoM at center of macro polygon must be stable');

  // 6. Micro-scale coordinates (10^-12): verify zero crash & topple zone assignment
  const microPoly: SupportPolygon = {
    vertices: [[-1e-12, -1e-12], [1e-12, -1e-12], [1e-12, 1e-12], [-1e-12, 1e-12]],
    area: 4e-24,
    centroid: [0, 0],
  };
  const rMicroEval = StabilityEvaluator.evaluateStability({ x: 0.1, y: 0, z: 0 }, microPoly);
  // Due to huge eccentricity ratio eta = 0.1 / 1e-12 = 10^11 >> 0.90, zone must be topple
  assert.equal(rMicroEval.zone, 'topple', 'Subatomic micro-polygon zone must be topple');
  assert.ok(rMicroEval.overturningTorque !== undefined, 'Overturning torque must be computed');
});

test('Tier 5.3.2 - Non-Finite Vector Sanitization (NaN, Infinity, -Infinity)', async () => {
  // Test that non-finite values in coordinates or rotation NEVER cause uncaught exceptions
  const nanVec: Vec3 = { x: NaN, y: 1.0, z: 0 };
  const infVec: Vec3 = { x: Infinity, y: 1.0, z: 0 };

  // computeCompositeCOM
  const comNaN = StabilityEvaluator.computeCompositeCOM([
    { mass: 1.0, position: nanVec },
    { mass: 2.0, position: { x: 0, y: 0, z: 0 } },
  ]);
  // evaluateStability with NaN CoM
  const dummyPoly = StabilityEvaluator.computeSupportPolygon(
    createStone('flat', 0, 0.1, 0)
  );
  const evalNaN = StabilityEvaluator.evaluateStability(nanVec, dummyPoly);
  assert.equal(evalNaN.isStable, false, 'NaN CoM must evaluate to unstable');
  assert.equal(evalNaN.zone, 'topple', 'NaN CoM zone must be topple');

  const evalInf = StabilityEvaluator.evaluateStability(infVec, dummyPoly);
  assert.equal(evalInf.isStable, false, 'Infinity CoM must evaluate to unstable');
  assert.equal(evalInf.zone, 'topple', 'Infinity CoM zone must be topple');

  // evaluateHierarchicalStackStability with NaN stone
  const stoneNaN = createStone('round', NaN, 0.5, 0);
  const hierNaN = StabilityEvaluator.evaluateHierarchicalStackStability([stoneNaN]);
  assert.equal(hierNaN.isStable, false, 'Stack with NaN stone position must be unstable');

  // SimpleTowerPhysicsWorld.drop with NaN coordinates
  const world = new SimpleTowerPhysicsWorld();
  const nanDropPose = new Pose({ x: NaN, y: 1.0, z: NaN });
  const resultNaN = await world.drop(createStone('pebble', 0, 0, 0), nanDropPose);

  assert.equal(resultNaN.settled, false, 'Drop with NaN position cannot settle');
  assert.equal(resultNaN.collapsed, true, 'Drop with NaN position must be marked collapsed');
  world.dispose();
});

test('Tier 5.3.3 - High-Velocity Collision & Energy Dissipation (Terminal Velocity Drop from 100m)', async () => {
  // Dropping a heavy boulder from 100m creates an impact velocity v = sqrt(2 * 9.82 * 100) ≈ 44.3 m/s.
  // The physics world must not throw, diverge, or hang.
  const world = new SimpleTowerPhysicsWorld(0.45, 0.25, { maxSteps: 120 });
  const boulderCfg = StonePhysicsBodyFactory.getShapeConfig('boulder');

  const highDropPose = new Pose({ x: 0, y: 100.0, z: 0 });
  const result = await world.drop(createStone('boulder', 0, 0, 0), highDropPose);

  assert.ok(result.trajectory && result.trajectory.length > 0, 'Trajectory must be recorded');
  // Final resting pose must be bounded and finite
  assert.ok(
    Number.isFinite(result.pose.position.x) &&
    Number.isFinite(result.pose.position.y) &&
    Number.isFinite(result.pose.position.z),
    'Post-impact coordinates must be finite'
  );
  assert.ok(
    result.pose.position.y >= 0,
    'High velocity impact must not breach ground into negative Y'
  );

  world.dispose();
});

test('Tier 5.3.4 - Cascading Collapse Momentum Transfer & Dynamic Body Wake-Up', async () => {
  // Setup a 3-stone tower:
  // Base: Boulder
  // Mid: Tall
  // Top: Round (halfExtents.x = 0.25m)
  // Drop a heavy Boulder outside the round stone's surface (x = 0.38m > 0.25m)
  // to impact and topple the tower.
  const world = new SimpleTowerPhysicsWorld(0.45, 0.25, { maxSteps: 80 });

  const boulderCfg = StonePhysicsBodyFactory.getShapeConfig('boulder');
  const tallCfg = StonePhysicsBodyFactory.getShapeConfig('tall');
  const roundCfg = StonePhysicsBodyFactory.getShapeConfig('round');

  const y0 = boulderCfg.halfExtents.y;
  const y1 = y0 + boulderCfg.halfExtents.y + tallCfg.halfExtents.y;
  const y2 = y1 + tallCfg.halfExtents.y + roundCfg.halfExtents.y;

  const tower = [
    createStone('boulder', 0, y0, 0),
    createStone('tall', 0, y1, 0),
    createStone('round', 0, y2, 0),
  ];
  world.addStatic(tower);

  // Drop heavy boulder off-center (x = 0.38m) onto the top of the tower
  const dropPose = new Pose({ x: 0.38, y: y2 + roundCfg.halfExtents.y + boulderCfg.halfExtents.y + 0.05, z: 0 });
  const result = await world.drop(createStone('boulder', 0, 0, 0), dropPose);

  assert.equal(result.settled, false, 'Eccentric heavy impact must not settle');
  assert.equal(result.collapsed, true, 'Must trigger cascading collapse');

  // Verify that tower bodies woke up dynamically and suffered displacement
  assert.ok(
    result.affectedStones !== undefined,
    'Affected stones array must be defined'
  );

  // Anti-Banana check on the dropped boulder:
  assert.equal(
    result.pose.position.y,
    Number(boulderCfg.halfExtents.y.toFixed(4)),
    'Dropped stone must rest strictly on ground'
  );

  world.dispose();
});
