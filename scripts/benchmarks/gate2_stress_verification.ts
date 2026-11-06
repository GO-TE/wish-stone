import * as CANNON from 'cannon-es';
import { Stone } from '../src/domain/entities/Stone.ts';
import { Pose } from '../src/domain/value-objects/Pose.ts';
import { SimpleTowerPhysicsWorld } from '../src/infrastructure/physics/SimpleTowerPhysicsWorld.ts';
import { StabilityEvaluator } from '../src/infrastructure/physics/StabilityEvaluator.ts';
import { StonePhysicsBodyFactory } from '../src/infrastructure/physics/StonePhysicsBodyFactory.ts';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(name: string, passed: boolean, details: string) {
  results.push({ name, passed, details });
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}: ${details}`);
}

async function runGate2StressSuite() {
  console.log('================================================================');
  console.log('       GATE 2 EMPIRICAL STRESS & ANTI-CANNED VERIFICATION       ');
  console.log('================================================================\n');

  // ==========================================================================
  // STRESS TEST 1: 4-Direction Anti-Canned Perturbation
  // ==========================================================================
  console.log('--- TEST 1: 4-Direction Anti-Canned Perturbation ---');
  {
    const base = new Stone({
      shape: 'boulder',
      color: '#111111',
      pose: new Pose({ x: 0, y: 0.2625, z: 0 }),
    });

    const simulateDrop = async (offsetX: number, offsetZ: number) => {
      const world = new SimpleTowerPhysicsWorld();
      world.addStatic([base]);
      const dropStone = new Stone({
        shape: 'round',
        color: '#444444',
        pose: Pose.origin(),
      });
      const res = await world.drop(dropStone, new Pose({ x: offsetX, y: 0.85, z: offsetZ }));
      return {
        x: res.pose.position.x,
        y: res.pose.position.y,
        z: res.pose.position.z,
        collapsed: res.collapsed,
        trajectory: res.trajectory ?? [],
      };
    };

    const east = await simulateDrop(+0.45, 0);
    const west = await simulateDrop(-0.45, 0);
    const north = await simulateDrop(0, +0.45);
    const south = await simulateDrop(0, -0.45);

    console.log(`  East  (+0.45, 0):     Final = (${east.x.toFixed(4)}, ${east.y.toFixed(4)}, ${east.z.toFixed(4)})`);
    console.log(`  West  (-0.45, 0):     Final = (${west.x.toFixed(4)}, ${west.y.toFixed(4)}, ${west.z.toFixed(4)})`);
    console.log(`  North (0, +0.45):     Final = (${north.x.toFixed(4)}, ${north.y.toFixed(4)}, ${north.z.toFixed(4)})`);
    console.log(`  South (0, -0.45):     Final = (${south.x.toFixed(4)}, ${south.y.toFixed(4)}, ${south.z.toFixed(4)})`);

    // 1.1 Strict Directional Momentum Correlation
    const signEast = east.x > 0.45 && Math.sign(east.x) === 1;
    const signWest = west.x < -0.45 && Math.sign(west.x) === -1;
    const signNorth = north.z > 0.45 && Math.sign(north.z) === 1;
    const signSouth = south.z < -0.45 && Math.sign(south.z) === -1;
    const allSignsCorrect = signEast && signWest && signNorth && signSouth;

    record(
      '1.1 Directional Momentum Correlation (Sign)',
      allSignsCorrect,
      `East: ${east.x.toFixed(3)} > 0.45 (${signEast}), West: ${west.x.toFixed(3)} < -0.45 (${signWest}), North: ${north.z.toFixed(3)} > 0.45 (${signNorth}), South: ${south.z.toFixed(3)} < -0.45 (${signSouth})`
    );

    // 1.2 Pairwise Endpoint Non-Identity (> 0.80m)
    const outcomes = [
      { name: 'East', x: east.x, z: east.z },
      { name: 'West', x: west.x, z: west.z },
      { name: 'North', x: north.x, z: north.z },
      { name: 'South', x: south.x, z: south.z },
    ];

    let minPairwiseDist = Infinity;
    const pairDistances: string[] = [];
    for (let i = 0; i < outcomes.length; i++) {
      for (let j = i + 1; j < outcomes.length; j++) {
        const d = Math.hypot(outcomes[i].x - outcomes[j].x, outcomes[i].z - outcomes[j].z);
        if (d < minPairwiseDist) minPairwiseDist = d;
        pairDistances.push(`${outcomes[i].name}-${outcomes[j].name}: ${d.toFixed(3)}m`);
      }
    }

    record(
      '1.2 Pairwise Endpoint Non-Identity (> 0.80m)',
      minPairwiseDist > 0.80,
      `Min pairwise distance: ${minPairwiseDist.toFixed(3)}m (> 0.80m). All pairs: [${pairDistances.join(', ')}]`
    );

    // 1.3 Diagonal Anti-Canned Stress (NE, NW, SE, SW)
    console.log('\n  [Stress] Diagonal 4-way Perturbation:');
    const diagDist = 0.45 / Math.SQRT2; // ~0.3182m in each axis
    const ne = await simulateDrop(+diagDist, +diagDist);
    const nw = await simulateDrop(-diagDist, +diagDist);
    const se = await simulateDrop(+diagDist, -diagDist);
    const sw = await simulateDrop(-diagDist, -diagDist);

    const diagCorrect =
      ne.x > 0 && ne.z > 0 &&
      nw.x < 0 && nw.z > 0 &&
      se.x > 0 && se.z < 0 &&
      sw.x < 0 && sw.z < 0;

    record(
      '1.3 Diagonal Anti-Canned Quadrant Correlation',
      diagCorrect,
      `NE=(${ne.x.toFixed(2)}, ${ne.z.toFixed(2)}), NW=(${nw.x.toFixed(2)}, ${nw.z.toFixed(2)}), SE=(${se.x.toFixed(2)}, ${se.z.toFixed(2)}), SW=(${sw.x.toFixed(2)}, ${sw.z.toFixed(2)})`
    );
  }

  // ==========================================================================
  // STRESS TEST 2: Variable Settling Duration
  // ==========================================================================
  console.log('\n--- TEST 2: Dynamic Settling Duration Variance ---');
  {
    const countSteps = async (height: number) => {
      const world = new SimpleTowerPhysicsWorld();
      const stone = new Stone({
        shape: 'round',
        color: '#444444',
        pose: Pose.origin(),
      });
      const res = await world.drop(stone, new Pose({ x: 0, y: height, z: 0 }));
      return { steps: res.trajectory?.length ?? 0, finalY: res.pose.position.y };
    };

    const low = await countSteps(0.35);
    const high = await countSteps(2.50);
    const deltaSteps = high.steps - low.steps;

    console.log(`  Low Drop  (h = 0.35m): Steps = ${low.steps},  Final Y = ${low.finalY.toFixed(4)}m`);
    console.log(`  High Drop (h = 2.50m): Steps = ${high.steps}, Final Y = ${high.finalY.toFixed(4)}m`);
    console.log(`  Delta Steps: ${deltaSteps} (requirement: > 20 steps)`);

    record(
      '2.1 Variable Settling Duration (> 20 steps)',
      deltaSteps > 20,
      `Low drop: ${low.steps} steps, High drop: ${high.steps} steps, Delta: ${deltaSteps} steps (> 20)`
    );

    // Multi-height energy spectrum test
    console.log('\n  [Stress] Drop Height Spectrum (Step Variance):');
    const heights = [0.30, 0.60, 1.00, 1.50, 2.00, 2.50, 3.00];
    const spectrum: { h: number; steps: number }[] = [];
    for (const h of heights) {
      const run = await countSteps(h);
      spectrum.push({ h, steps: run.steps });
      console.log(`    Height ${h.toFixed(2)}m -> Steps: ${run.steps}`);
    }

    // Verify non-constant step count across the spectrum
    const uniqueStepCounts = new Set(spectrum.map((s) => s.steps));
    record(
      '2.2 Physics Energy-Dissipation Spectrum (Non-Constant Steps)',
      uniqueStepCounts.size >= 4,
      `Across 7 heights, observed ${uniqueStepCounts.size} distinct settling step counts: [${spectrum.map((s) => `${s.h}m:${s.steps}`).join(', ')}]`
    );
  }

  // ==========================================================================
  // STRESS TEST 3: High Stack Stability (5-Stone Stack)
  // ==========================================================================
  console.log('\n--- TEST 3: High Stack Stability (5-Stone Stack) ---');
  {
    // Part A: 5-Stone Vertical Cairn Stack directly inside SimpleTowerPhysicsWorld
    console.log('  [Test 3A] 5-Stone Vertical Tower Simulation inside SimpleTowerPhysicsWorld:');
    const worldInstance = new SimpleTowerPhysicsWorld();
    const cannonWorld = worldInstance.getWorld();

    const flatCfg = StonePhysicsBodyFactory.getShapeConfig('flat');
    const boulderCfg = StonePhysicsBodyFactory.getShapeConfig('boulder');
    const roundCfg = StonePhysicsBodyFactory.getShapeConfig('round');
    const tallCfg = StonePhysicsBodyFactory.getShapeConfig('tall');
    const pebbleCfg = StonePhysicsBodyFactory.getShapeConfig('pebble');

    // 5-stone vertical stack:
    // 1: boulder (base) at ground
    // 2: flat (wide stabilizer)
    // 3: round (mid)
    // 4: flat (upper tier)
    // 5: pebble (capstone)
    const y1 = boulderCfg.halfExtents.y;
    const y2 = y1 + boulderCfg.halfExtents.y + flatCfg.halfExtents.y;
    const y3 = y2 + flatCfg.halfExtents.y + roundCfg.halfExtents.y;
    const y4 = y3 + roundCfg.halfExtents.y + flatCfg.halfExtents.y;
    const y5 = y4 + flatCfg.halfExtents.y + pebbleCfg.halfExtents.y;

    const stone1 = StonePhysicsBodyFactory.createStoneBody(
      new Stone({ shape: 'boulder', color: '#111', pose: new Pose({ x: 0, y: y1, z: 0 }) }),
      { id: 'stone-1-boulder' }
    );
    const stone2 = StonePhysicsBodyFactory.createStoneBody(
      new Stone({ shape: 'flat', color: '#222', pose: new Pose({ x: 0, y: y2, z: 0 }) }),
      { id: 'stone-2-flat' }
    );
    const stone3 = StonePhysicsBodyFactory.createStoneBody(
      new Stone({ shape: 'round', color: '#333', pose: new Pose({ x: 0, y: y3, z: 0 }) }),
      { id: 'stone-3-round' }
    );
    const stone4 = StonePhysicsBodyFactory.createStoneBody(
      new Stone({ shape: 'flat', color: '#444', pose: new Pose({ x: 0, y: y4, z: 0 }) }),
      { id: 'stone-4-flat' }
    );
    const stone5 = StonePhysicsBodyFactory.createStoneBody(
      new Stone({ shape: 'pebble', color: '#555', pose: new Pose({ x: 0, y: y5, z: 0 }) }),
      { id: 'stone-5-pebble' }
    );

    const bodies = [stone1, stone2, stone3, stone4, stone5];
    const initialPoses = bodies.map((b) => ({
      y: b.position.y,
      x: b.position.x,
      z: b.position.z,
    }));

    for (const b of bodies) {
      cannonWorld.addBody(b);
    }

    // Step world directly through SimpleTowerPhysicsWorld.step(1/60) for 240 steps (4.0s)
    const numSteps = 240;
    for (let i = 0; i < numSteps; i++) {
      worldInstance.step(1 / 60);
    }

    console.log(`    Simulated ${numSteps} steps (4.0 seconds) via SimpleTowerPhysicsWorld.step()`);

    let maxVerticalDrift = 0;
    let maxLateralDrift = 0;
    let allSleepingOrResting = true;
    const bodyStatuses: string[] = [];

    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      const init = initialPoses[i];
      const dy = Math.abs(b.position.y - init.y);
      const dLateral = Math.hypot(b.position.x - init.x, b.position.z - init.z);
      const vel = b.velocity.length();
      const angVel = b.angularVelocity.length();
      const isSleeping = b.sleepState === CANNON.Body.SLEEPING;
      const isResting = vel < 0.02 && angVel < 0.02;

      if (dy > maxVerticalDrift) maxVerticalDrift = dy;
      if (dLateral > maxLateralDrift) maxLateralDrift = dLateral;
      if (!isSleeping && !isResting) allSleepingOrResting = false;

      const sleepLabel = isSleeping ? 'SLEEPING' : isResting ? 'RESTING' : 'MOVING';
      bodyStatuses.push(
        `Stone ${i + 1} (${b.shapes[0].id ?? i}): dy=${(dy * 1000).toFixed(2)}mm, dLat=${(dLateral * 1000).toFixed(2)}mm, vel=${vel.toFixed(4)}m/s, state=${sleepLabel}`
      );
      console.log(`    ${bodyStatuses[i]}`);
    }

    // Drift requirement: < 5mm (0.005m)
    const driftPassed = maxVerticalDrift < 0.005 && maxLateralDrift < 0.005;
    record(
      '3.1 5-Stone Vertical Stack Stability (< 5mm drift)',
      driftPassed,
      `Max vertical drift: ${(maxVerticalDrift * 1000).toFixed(2)}mm (< 5mm), Max lateral drift: ${(maxLateralDrift * 1000).toFixed(2)}mm (< 5mm)`
    );

    record(
      '3.2 5-Stone Vertical Stack Sleep / Resting State',
      allSleepingOrResting,
      `All 5 stones achieved sleep/resting state (v < 0.02 m/s, omega < 0.02 rad/s)`
    );

    // Part B: Canonical 5-Stone Pyramid Cairn (Multi-Contact Static Equilibrium)
    console.log('\n  [Test 3B] Canonical 5-Stone Pyramid Cairn through SimpleTowerPhysicsWorld:');
    const pyramidWorld = new SimpleTowerPhysicsWorld();
    const pyramidCannon = pyramidWorld.getWorld();

    const pb1 = StonePhysicsBodyFactory.createStoneBody(
      new Stone({ shape: 'flat', color: '#111', pose: new Pose({ x: -0.28, y: flatCfg.halfExtents.y, z: 0 }) }),
      { id: 'pyr-base-1' }
    );
    const pb2 = StonePhysicsBodyFactory.createStoneBody(
      new Stone({ shape: 'flat', color: '#111', pose: new Pose({ x: 0.28, y: flatCfg.halfExtents.y, z: 0 }) }),
      { id: 'pyr-base-2' }
    );
    const pm1 = StonePhysicsBodyFactory.createStoneBody(
      new Stone({ shape: 'round', color: '#222', pose: new Pose({ x: -0.25, y: flatCfg.halfExtents.y * 2 + roundCfg.halfExtents.y, z: 0 }) }),
      { id: 'pyr-mid-1' }
    );
    const pm2 = StonePhysicsBodyFactory.createStoneBody(
      new Stone({ shape: 'round', color: '#222', pose: new Pose({ x: 0.25, y: flatCfg.halfExtents.y * 2 + roundCfg.halfExtents.y, z: 0 }) }),
      { id: 'pyr-mid-2' }
    );
    const pcap = StonePhysicsBodyFactory.createStoneBody(
      new Stone({
        shape: 'pebble',
        color: '#333',
        pose: new Pose({
          x: 0,
          y: flatCfg.halfExtents.y * 2 + roundCfg.halfExtents.y * 2 + pebbleCfg.halfExtents.y,
          z: 0,
        }),
      }),
      { id: 'pyr-cap' }
    );

    const pyrBodies = [pb1, pb2, pm1, pm2, pcap];
    for (const b of pyrBodies) pyramidCannon.addBody(b);

    // Step 240 steps
    for (let i = 0; i < 240; i++) {
      pyramidWorld.step(1 / 60);
    }

    let maxPyrVel = 0;
    let pyrAllAsleepOrResting = true;
    for (let i = 0; i < pyrBodies.length; i++) {
      const b = pyrBodies[i];
      const vel = b.velocity.length();
      if (vel > maxPyrVel) maxPyrVel = vel;
      const isSleeping = b.sleepState === CANNON.Body.SLEEPING;
      const isResting = vel < 0.02;
      if (!isSleeping && !isResting) pyrAllAsleepOrResting = false;
      console.log(`    Pyramid Stone ${i + 1}: y=${b.position.y.toFixed(4)}m, vel=${vel.toFixed(5)}m/s, sleepState=${b.sleepState === CANNON.Body.SLEEPING ? 'SLEEPING' : 'RESTING'}`);
    }

    record(
      '3.3 5-Stone Pyramid Cairn Equilibrium & Sleep State',
      pyrAllAsleepOrResting && maxPyrVel < 0.02,
      `Max velocity in 5-stone pyramid: ${maxPyrVel.toFixed(5)}m/s (< 0.02m/s), all stones achieved resting/sleeping state`
    );

    // Part C: Sequential 5-Stone Stacking via SimpleTowerPhysicsWorld.drop()
    console.log('\n  [Test 3C] Sequential 5-Stone Drop & Stack via SimpleTowerPhysicsWorld:');
    const seqWorld = new SimpleTowerPhysicsWorld();
    const accumulatedStones: Stone[] = [];

    const dropSpecs: { shape: 'boulder' | 'flat' | 'round' | 'pebble'; name: string }[] = [
      { shape: 'boulder', name: 'Stone 1 (boulder)' },
      { shape: 'flat', name: 'Stone 2 (flat)' },
      { shape: 'round', name: 'Stone 3 (round)' },
      { shape: 'flat', name: 'Stone 4 (flat)' },
      { shape: 'pebble', name: 'Stone 5 (pebble)' },
    ];

    let currentStackY = 0;
    let allSequentialDropsSettled = true;

    for (let i = 0; i < dropSpecs.length; i++) {
      const spec = dropSpecs[i];
      const cfg = StonePhysicsBodyFactory.getShapeConfig(spec.shape);
      const dropHeight = currentStackY + cfg.halfExtents.y + 0.15;

      const dropStone = new Stone({
        id: `seq-stone-${i}`,
        shape: spec.shape,
        color: `#${(i + 1) * 222}`,
        pose: Pose.origin(),
      });

      const dropRes = await seqWorld.drop(dropStone, new Pose({ x: 0, y: dropHeight, z: 0 }));
      const settled = dropRes.settled;
      const finalY = dropRes.pose.position.y;
      console.log(`    Drop ${i + 1} (${spec.name}): dropY=${dropHeight.toFixed(3)}m -> settled=${settled}, finalY=${finalY.toFixed(4)}m`);

      if (!settled) {
        allSequentialDropsSettled = false;
        break;
      }

      const placedStone = dropStone.withPose(dropRes.pose);
      accumulatedStones.push(placedStone);
      seqWorld.addStatic(accumulatedStones);
      currentStackY = finalY + cfg.halfExtents.y;
    }

    record(
      '3.4 Sequential 5-Stone Drop Stacking in SimpleTowerPhysicsWorld',
      allSequentialDropsSettled && accumulatedStones.length === 5,
      `Successfully stacked ${accumulatedStones.length} / 5 stones sequentially, final tower height = ${currentStackY.toFixed(3)}m`
    );
  }

  // ==========================================================================
  // STRESS TEST 4: Extreme Stress, Overturning & Ground Penetration
  // ==========================================================================
  console.log('\n--- TEST 4: Adversarial Stress, Overturning & Anti-Tunneling ---');
  {
    // 4.1 Extreme Drop Height Anti-Tunneling (h = 10.0m)
    const worldExtreme = new SimpleTowerPhysicsWorld();
    const boulder = new Stone({ shape: 'boulder', color: '#111', pose: Pose.origin() });
    const extremeDropRes = await worldExtreme.drop(boulder, new Pose({ x: 0, y: 10.0, z: 0 }));
    const bCfg = StonePhysicsBodyFactory.getShapeConfig('boulder');

    // Anti-tunneling: minimum y across all trajectory frames must never penetrate deeply below ground (y > 0.05m)
    let minY = Infinity;
    for (const f of extremeDropRes.trajectory ?? []) {
      const p = f.poses.get('dropped-stone');
      if (p && p.position.y < minY) minY = p.position.y;
    }
    const antiTunneling = minY > 0.10 && Math.abs(extremeDropRes.pose.position.y - bCfg.halfExtents.y) < 0.05;

    record(
      '4.1 Extreme Drop (h=10m) Anti-Tunneling & Ground Equilibrium',
      antiTunneling,
      `Trajectory minY = ${minY.toFixed(4)}m (> 0.10m), finalY = ${extremeDropRes.pose.position.y.toFixed(4)}m (nominal ${bCfg.halfExtents.y.toFixed(4)}m)`
    );

    // 4.2 Adversarial Off-Balance Overturning Direction Consistency
    const baseStone = new Stone({
      shape: 'flat',
      color: '#222',
      pose: new Pose({ x: 0, y: 0.105, z: 0 }),
    });
    const worldOverturn = new SimpleTowerPhysicsWorld();
    worldOverturn.addStatic([baseStone]);

    // Drop boulder far to the right (+X = 0.50m)
    const offTop = new Stone({ shape: 'boulder', color: '#333', pose: Pose.origin() });
    const overturnRes = await worldOverturn.drop(offTop, new Pose({ x: 0.50, y: 0.80, z: 0 }));

    record(
      '4.2 Adversarial Edge Drop Natural Collapse',
      overturnRes.collapsed === true && overturnRes.pose.position.x > 0.50,
      `Collapsed: ${overturnRes.collapsed}, scattered x = ${overturnRes.pose.position.x.toFixed(4)}m (> 0.50m)`
    );
  }

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log('\n================================================================');
  console.log('                 GATE 2 VERIFICATION SUMMARY                    ');
  console.log('================================================================');
  const allPassed = results.every((r) => r.passed);
  const passCount = results.filter((r) => r.passed).length;
  console.log(`Total Checks: ${results.length} | Passed: ${passCount} | Failed: ${results.length - passCount}`);
  console.log(`Overall Status: ${allPassed ? 'ALL VERIFICATIONS PASSED (APPROVE)' : 'FAILURES DETECTED (REQUEST_CHANGES)'}`);
  console.log('================================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

runGate2StressSuite().catch((err) => {
  console.error('Unhandled error in stress suite:', err);
  process.exit(1);
});
