import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import { Stone, type StoneShape } from '../domain/entities/Stone.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import { SimpleTowerPhysicsWorld } from '../infrastructure/physics/SimpleTowerPhysicsWorld.ts';
import { StonePhysicsBodyFactory } from '../infrastructure/physics/StonePhysicsBodyFactory.ts';
import { StabilityEvaluator } from '../infrastructure/physics/StabilityEvaluator.ts';

// Helper to create physics world with standard materials
function createStandardWorld(): { world: CANNON.World; ground: CANNON.Body } {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  const gsSolver = world.solver as CANNON.GSSolver;
  if ('iterations' in gsSolver) {
    gsSolver.iterations = 25;
    gsSolver.tolerance = 1e-4;
  }
  world.allowSleep = true;
  StonePhysicsBodyFactory.configureWorldMaterials(world);

  const ground = StonePhysicsBodyFactory.createGroundBody();
  world.addBody(ground);
  return { world, ground };
}

console.log('================================================================');
console.log('STARTING EMPIRICAL STRESS & CHAOS VERIFICATION HARNESS (M1)');
console.log('================================================================\n');

const results: Record<string, any> = {};

// -----------------------------------------------------------------------------
// EXPERIMENT 1: High-Stack Stress (5, 8, 10 stones)
// -----------------------------------------------------------------------------
console.log('>>> [EXPERIMENT 1] High-Stack Stress (5, 8, 10 stones)');

function testDynamicStack(stackShapes: StoneShape[], testName: string, stepCount = 300) {
  const { world } = createStandardWorld();
  const bodies: CANNON.Body[] = [];
  let currentY = 0;

  for (let i = 0; i < stackShapes.length; i++) {
    const shape = stackShapes[i];
    const cfg = StonePhysicsBodyFactory.getShapeConfig(shape);
    const halfY = cfg.halfExtents.y;
    const posY = currentY + halfY;

    const stone = new Stone({
      shape,
      color: '#888888',
      pose: new Pose({ x: 0, y: posY, z: 0 }),
    });

    const body = StonePhysicsBodyFactory.createStoneBody(stone, {
      isStatic: false,
      id: `stone-${i}`,
    });
    // Set allowSleep to true with standard sleep parameters
    body.allowSleep = true;
    body.sleepSpeedLimit = 0.03;
    body.sleepTimeLimit = 0.15;

    world.addBody(body);
    bodies.push(body);

    currentY += halfY * 2;
  }

  const initialTotalHeight = currentY;

  // Track state across steps
  for (let step = 0; step < stepCount; step++) {
    world.step(1 / 60);
  }

  // Evaluate after stepCount
  const finalPositions = bodies.map((b, idx) => ({
    index: idx,
    shape: stackShapes[idx],
    y: b.position.y,
    x: b.position.x,
    z: b.position.z,
    v: b.velocity.length(),
    w: b.angularVelocity.length(),
    isSleeping: b.sleepState === CANNON.Body.SLEEPING,
  }));

  const maxHorizontalDrift = Math.max(
    ...bodies.map((b) => Math.hypot(b.position.x, b.position.z))
  );
  const topStone = bodies[bodies.length - 1];
  const finalTopY = topStone.position.y + StonePhysicsBodyFactory.getShapeConfig(stackShapes[stackShapes.length - 1]).halfExtents.y;
  const sleepingCount = bodies.filter((b) => b.sleepState === CANNON.Body.SLEEPING).length;
  const lowVelocityCount = bodies.filter((b) => b.velocity.length() < 0.05 && b.angularVelocity.length() < 0.05).length;

  console.log(`  [${testName}] Initial Height: ${initialTotalHeight.toFixed(3)}m, Final Top Y: ${finalTopY.toFixed(3)}m`);
  console.log(`  [${testName}] Max Horizontal Drift: ${maxHorizontalDrift.toFixed(4)}m`);
  console.log(`  [${testName}] Sleeping: ${sleepingCount}/${bodies.length}, Low-velocity (v<0.05): ${lowVelocityCount}/${bodies.length}`);

  return {
    testName,
    stoneCount: stackShapes.length,
    initialTotalHeight,
    finalTopY,
    maxHorizontalDrift,
    sleepingCount,
    lowVelocityCount,
    bodies: finalPositions,
    isStanding: finalTopY > initialTotalHeight * 0.85 && maxHorizontalDrift < 0.25,
  };
}

// 5-stone stack: boulder base, flat, round, flat, pebble
const stack5 = testDynamicStack(
  ['boulder', 'flat', 'round', 'flat', 'pebble'],
  '5-Stone Stack',
  300
);
assert.ok(stack5.isStanding, '5-stone stack must remain standing stably');
assert.ok(stack5.maxHorizontalDrift < 0.15, `5-stone stack horizontal drift (${stack5.maxHorizontalDrift.toFixed(4)}m) must be < 0.15m`);
assert.ok(stack5.lowVelocityCount >= 4, 'At least 4 of 5 stones must reach resting velocity');

// 8-stone stack: boulder, flat, round, flat, tall, flat, round, pebble
const stack8 = testDynamicStack(
  ['boulder', 'flat', 'round', 'flat', 'round', 'flat', 'pebble', 'pebble'],
  '8-Stone Stack',
  360
);
assert.ok(stack8.isStanding, '8-stone stack must remain standing stably');
assert.ok(stack8.maxHorizontalDrift < 0.25, `8-stone stack horizontal drift (${stack8.maxHorizontalDrift.toFixed(4)}m) must be < 0.25m`);
assert.ok(stack8.lowVelocityCount >= 6, 'At least 6 of 8 stones must reach resting velocity');

// 10-stone stack: alternating wide flat and stable stones
const stack10 = testDynamicStack(
  ['boulder', 'flat', 'flat', 'round', 'flat', 'round', 'flat', 'pebble', 'flat', 'pebble'],
  '10-Stone Stack',
  420
);
console.log(`  [10-Stone Stack] Standing: ${stack10.isStanding}, Drift: ${stack10.maxHorizontalDrift.toFixed(4)}m`);
assert.ok(stack10.isStanding, '10-stone stack must remain standing stably');
assert.ok(stack10.maxHorizontalDrift < 0.25, `10-stone stack horizontal drift (${stack10.maxHorizontalDrift.toFixed(4)}m) must be < 0.25m`);

// Also test SimpleTowerPhysicsWorld with 5-, 8-, and 10-stone static foundations
async function testSimpleTowerDrops() {
  const shapes: StoneShape[] = ['boulder', 'flat', 'round', 'flat', 'round', 'flat', 'round', 'flat', 'pebble'];
  let currentY = 0;
  const staticStones: Stone[] = [];

  for (let i = 0; i < shapes.length; i++) {
    const s = shapes[i];
    const cfg = StonePhysicsBodyFactory.getShapeConfig(s);
    const posY = currentY + cfg.halfExtents.y;
    staticStones.push(
      new Stone({
        shape: s,
        color: '#666666',
        pose: new Pose({ x: 0, y: posY, z: 0 }),
      })
    );
    currentY += cfg.halfExtents.y * 2;
  }

  // Test drop on 5-stone tower
  const world5 = new SimpleTowerPhysicsWorld();
  world5.addStatic(staticStones.slice(0, 5));
  const dropPebble = new Stone({ shape: 'pebble', color: '#111111', pose: Pose.origin() });
  const topY5 = staticStones[4].pose.position.y + StonePhysicsBodyFactory.getShapeConfig(staticStones[4].shape).halfExtents.y;
  const res5 = await world5.drop(dropPebble, new Pose({ x: 0.02, y: topY5 + 0.25, z: 0.02 }));
  assert.equal(res5.settled, true, 'Stable drop onto 5-stone tower must settle');
  assert.equal(res5.collapsed, false, 'Stable drop onto 5-stone tower must not collapse');

  // Test drop on 8-stone tower
  const world8 = new SimpleTowerPhysicsWorld();
  world8.addStatic(staticStones.slice(0, 8));
  const topY8 = staticStones[7].pose.position.y + StonePhysicsBodyFactory.getShapeConfig(staticStones[7].shape).halfExtents.y;
  const res8 = await world8.drop(dropPebble, new Pose({ x: 0.02, y: topY8 + 0.25, z: 0.02 }));
  assert.equal(res8.settled, true, 'Stable drop onto 8-stone tower must settle');

  console.log('  [SimpleTowerPhysicsWorld] Successfully placed capstones on 5-stone and 8-stone static towers.');
}

await testSimpleTowerDrops();

results['high_stack_stress'] = {
  stack5: { standing: stack5.isStanding, drift: stack5.maxHorizontalDrift, lowVelCount: stack5.lowVelocityCount },
  stack8: { standing: stack8.isStanding, drift: stack8.maxHorizontalDrift, lowVelCount: stack8.lowVelocityCount },
  stack10: { standing: stack10.isStanding, drift: stack10.maxHorizontalDrift, lowVelCount: stack10.lowVelocityCount },
};

// -----------------------------------------------------------------------------
// EXPERIMENT 2: Extreme Impulse Test (h=2.5m, m=3.0kg, off-center drop)
// -----------------------------------------------------------------------------
console.log('\n>>> [EXPERIMENT 2] Extreme Impulse Test (h=2.5m, m=3.0kg off-center onto stack)');

function testExtremeImpulse() {
  const { world } = createStandardWorld();

  // 3-stone dynamic tower: Base, Mid, Top
  const baseCfg = StonePhysicsBodyFactory.getShapeConfig('boulder');
  const base = new CANNON.Body({
    mass: baseCfg.mass,
    shape: new CANNON.Box(new CANNON.Vec3(baseCfg.halfExtents.x, baseCfg.halfExtents.y, baseCfg.halfExtents.z)),
    position: new CANNON.Vec3(0, baseCfg.halfExtents.y, 0),
    linearDamping: 0.2,
    angularDamping: 0.2,
  });
  world.addBody(base);

  const midCfg = StonePhysicsBodyFactory.getShapeConfig('round');
  const midY = baseCfg.halfExtents.y * 2 + midCfg.halfExtents.y;
  const mid = new CANNON.Body({
    mass: midCfg.mass,
    shape: new CANNON.Box(new CANNON.Vec3(midCfg.halfExtents.x, midCfg.halfExtents.y, midCfg.halfExtents.z)),
    position: new CANNON.Vec3(0, midY, 0),
    linearDamping: 0.2,
    angularDamping: 0.2,
  });
  world.addBody(mid);

  const topCfg = StonePhysicsBodyFactory.getShapeConfig('pebble');
  const topY = midY + midCfg.halfExtents.y + topCfg.halfExtents.y;
  const top = new CANNON.Body({
    mass: topCfg.mass,
    shape: new CANNON.Box(new CANNON.Vec3(topCfg.halfExtents.x, topCfg.halfExtents.y, topCfg.halfExtents.z)),
    position: new CANNON.Vec3(0, topY, 0),
    linearDamping: 0.2,
    angularDamping: 0.2,
  });
  world.addBody(top);

  // Settle stack for 30 steps
  for (let i = 0; i < 30; i++) world.step(1 / 60);

  // Heavy impulse projectile: mass = 3.0kg, dropped from h = 2.5m with off-center offset (x=0.18, z=0.08)
  const projectileMass = 3.0;
  const dropHeight = topY + 2.5; // 2.5m above tower
  const projectile = new CANNON.Body({
    mass: projectileMass,
    shape: new CANNON.Box(new CANNON.Vec3(0.28, 0.25, 0.28)),
    position: new CANNON.Vec3(0.18, dropHeight, 0.08),
    linearDamping: 0.1,
    angularDamping: 0.1,
  });
  world.addBody(projectile);

  const allBodies = [base, mid, top, projectile];
  let minObservedY = Infinity;
  let maxScatterRadius = 0;

  for (let step = 0; step < 240; step++) {
    world.step(1 / 60);

    for (let bIdx = 0; bIdx < allBodies.length; bIdx++) {
      const b = allBodies[bIdx];
      // Ground plane containment check: no body center should be below 0
      if (b.position.y < minObservedY) {
        minObservedY = b.position.y;
      }
      // Track scatter radius
      const r = Math.hypot(b.position.x, b.position.z);
      if (r > maxScatterRadius) {
        maxScatterRadius = r;
      }
    }
  }

  const finalBaseScatter = Math.hypot(base.position.x, base.position.z);
  const finalMidScatter = Math.hypot(mid.position.x, mid.position.z);
  const finalTopScatter = Math.hypot(top.position.x, top.position.z);
  const finalProjScatter = Math.hypot(projectile.position.x, projectile.position.z);

  console.log(`  [Extreme Impulse] Drop Height: ${dropHeight.toFixed(3)}m, Projectile Mass: ${projectileMass}kg`);
  console.log(`  [Extreme Impulse] Min Observed Center Y: ${minObservedY.toFixed(4)}m (Must be >= 0 for ground containment)`);
  console.log(`  [Extreme Impulse] Scatter Radii -> Base: ${finalBaseScatter.toFixed(3)}m, Mid: ${finalMidScatter.toFixed(3)}m, Top: ${finalTopScatter.toFixed(3)}m, Proj: ${finalProjScatter.toFixed(3)}m`);
  console.log(`  [Extreme Impulse] Max Scatter Radius: ${maxScatterRadius.toFixed(3)}m`);

  // Ground plane containment: center must never penetrate beneath ground level (y >= 0.05 accounting for half-heights)
  assert.ok(minObservedY >= 0.05, `Ground plane containment violated: min Y was ${minObservedY}`);

  // Cascading collapse verification: top and mid stones must be dislodged significantly
  assert.ok(finalTopScatter > 0.40, `Top stone must scatter outward, got ${finalTopScatter.toFixed(3)}m`);
  assert.ok(finalProjScatter > 0.30, `Projectile must scatter outward, got ${finalProjScatter.toFixed(3)}m`);

  return {
    dropHeight,
    projectileMass,
    minObservedY,
    maxScatterRadius,
    scatterRadii: {
      base: finalBaseScatter,
      mid: finalMidScatter,
      top: finalTopScatter,
      projectile: finalProjScatter,
    },
  };
}

const extremeImpulseRes = testExtremeImpulse();
results['extreme_impulse'] = extremeImpulseRes;

// -----------------------------------------------------------------------------
// EXPERIMENT 3: Directional Scattering Test (East, West, North, South)
// -----------------------------------------------------------------------------
console.log('\n>>> [EXPERIMENT 3] Directional Scattering Test (East, West, North, South)');

async function testDirectionalScattering() {
  const directions = [
    { name: 'East', offsetX: +0.4, offsetZ: 0, expectedSignX: 1, expectedSignZ: 0 },
    { name: 'West', offsetX: -0.4, offsetZ: 0, expectedSignX: -1, expectedSignZ: 0 },
    { name: 'North', offsetX: 0, offsetZ: +0.4, expectedSignX: 0, expectedSignZ: 1 },
    { name: 'South', offsetX: 0, offsetZ: -0.4, expectedSignX: 0, expectedSignZ: -1 },
  ];

  const simulationOutcomes: Array<{
    name: string;
    offsetX: number;
    offsetZ: number;
    finalX: number;
    finalY: number;
    finalZ: number;
    trajectoryLength: number;
  }> = [];

  for (const dir of directions) {
    const world = new SimpleTowerPhysicsWorld();
    const baseStone = new Stone({
      shape: 'flat',
      color: '#444444',
      pose: new Pose({ x: 0, y: 0.105, z: 0 }),
    });
    world.addStatic([baseStone]);

    const dropStone = new Stone({
      shape: 'pebble',
      color: '#999999',
      pose: Pose.origin(),
    });

    const dropPose = new Pose({ x: dir.offsetX, y: 0.55, z: dir.offsetZ });
    const dropRes = await world.drop(dropStone, dropPose);

    assert.equal(dropRes.settled, false, `${dir.name} drop must not settle on top`);
    assert.equal(dropRes.collapsed, true, `${dir.name} drop must trigger collapse`);

    const finalPose = dropRes.pose;
    console.log(`  [${dir.name}] Drop at (${dir.offsetX}, ${dir.offsetZ}) -> Settled Pose: (${finalPose.position.x.toFixed(3)}, ${finalPose.position.y.toFixed(3)}, ${finalPose.position.z.toFixed(3)})`);

    // Momentum correlation check
    if (dir.expectedSignX !== 0) {
      assert.equal(
        Math.sign(finalPose.position.x),
        dir.expectedSignX,
        `${dir.name} drop: sign(finalX) (${Math.sign(finalPose.position.x)}) must equal expectedSignX (${dir.expectedSignX})`
      );
      assert.ok(
        Math.abs(finalPose.position.x) > 0.45,
        `${dir.name} drop: finalX magnitude (${Math.abs(finalPose.position.x).toFixed(3)}) must scatter outward past base`
      );
    }

    if (dir.expectedSignZ !== 0) {
      assert.equal(
        Math.sign(finalPose.position.z),
        dir.expectedSignZ,
        `${dir.name} drop: sign(finalZ) (${Math.sign(finalPose.position.z)}) must equal expectedSignZ (${dir.expectedSignZ})`
      );
      assert.ok(
        Math.abs(finalPose.position.z) > 0.45,
        `${dir.name} drop: finalZ magnitude (${Math.abs(finalPose.position.z).toFixed(3)}) must scatter outward past base`
      );
    }

    simulationOutcomes.push({
      name: dir.name,
      offsetX: dir.offsetX,
      offsetZ: dir.offsetZ,
      finalX: finalPose.position.x,
      finalY: finalPose.position.y,
      finalZ: finalPose.position.z,
      trajectoryLength: dropRes.trajectory?.length ?? 0,
    });
  }

  // Trajectory non-identity: pairwise endpoint distances
  console.log('  Pairwise endpoint distances between directional collapse outcomes:');
  const pairwiseDistances: Record<string, number> = {};
  for (let i = 0; i < simulationOutcomes.length; i++) {
    for (let j = i + 1; j < simulationOutcomes.length; j++) {
      const a = simulationOutcomes[i];
      const b = simulationOutcomes[j];
      const dist = Math.hypot(a.finalX - b.finalX, a.finalZ - b.finalZ);
      const key = `${a.name}-${b.name}`;
      pairwiseDistances[key] = dist;
      console.log(`    ${key}: ${dist.toFixed(3)}m`);
      assert.ok(
        dist > 0.8,
        `Pairwise distance between ${key} (${dist.toFixed(3)}m) must exceed 0.8m to refute canned animations`
      );
    }
  }

  return { simulationOutcomes, pairwiseDistances };
}

const directionalRes = await testDirectionalScattering();
results['directional_scattering'] = directionalRes;

// -----------------------------------------------------------------------------
// EXPERIMENT 4: Variable Settling Duration Test (low vs high drop)
// -----------------------------------------------------------------------------
console.log('\n>>> [EXPERIMENT 4] Variable Settling Duration Test (Low Drop vs High Bounce Drop)');

function testSettlingDurationVariance() {
  const measureSettling = (dropHeight: number) => {
    const { world } = createStandardWorld();
    const stone = new CANNON.Body({
      mass: 1.5,
      shape: new CANNON.Box(new CANNON.Vec3(0.3, 0.15, 0.3)),
      position: new CANNON.Vec3(0, dropHeight, 0),
      linearDamping: 0.1,
      angularDamping: 0.1,
      allowSleep: true,
      sleepSpeedLimit: 0.02,
      sleepTimeLimit: 0.1,
    });
    world.addBody(stone);

    let steps = 0;
    let bounced = false;
    let maxBounceY = 0;

    for (let i = 0; i < 300; i++) {
      world.step(1 / 60);
      steps++;
      if (stone.velocity.y > 0.05 && i > 10) {
        bounced = true;
        if (stone.position.y > maxBounceY) {
          maxBounceY = stone.position.y;
        }
      }
      if (
        i > 15 &&
        stone.velocity.length() < 0.02 &&
        stone.angularVelocity.length() < 0.02
      ) {
        break;
      }
    }
    return { steps, bounced, maxBounceY, finalY: stone.position.y };
  };

  const lowDrop = measureSettling(0.25);
  const highDrop = measureSettling(2.50);
  const deltaSteps = highDrop.steps - lowDrop.steps;

  console.log(`  [Settling Variance] Low Drop (h=0.25m): Settled in ${lowDrop.steps} steps (${(lowDrop.steps / 60).toFixed(2)}s)`);
  console.log(`  [Settling Variance] High Drop (h=2.50m): Settled in ${highDrop.steps} steps (${(highDrop.steps / 60).toFixed(2)}s), Max Bounce Y: ${highDrop.maxBounceY.toFixed(3)}m`);
  console.log(`  [Settling Variance] Step Difference Delta: ${deltaSteps} steps (Required > 20 steps)`);

  assert.ok(
    deltaSteps > 20,
    `Settling duration difference (${deltaSteps} steps) must exceed 20 steps to refute static timer mocks`
  );

  return { lowDrop, highDrop, deltaSteps };
}

const settlingRes = testSettlingDurationVariance();
results['settling_variance'] = settlingRes;

console.log('\n================================================================');
console.log('ALL EMPIRICAL STRESS & CHAOS EXPERIMENTS COMPLETED SUCCESSFULLY!');
console.log('================================================================');
