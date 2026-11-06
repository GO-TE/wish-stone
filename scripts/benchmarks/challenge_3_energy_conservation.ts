import * as CANNON from 'cannon-es';
import { Stone } from '../src/domain/entities/Stone.ts';
import { Pose } from '../src/domain/value-objects/Pose.ts';
import { SimpleTowerPhysicsWorld } from '../src/infrastructure/physics/SimpleTowerPhysicsWorld.ts';
import { StonePhysicsBodyFactory } from '../src/infrastructure/physics/StonePhysicsBodyFactory.ts';

console.log('=== CHALLENGE 3: ENERGY CONSERVATION & NUMERICAL STABILITY ===\n');

const g = 9.82;

function computeTotalEnergy(body: CANNON.Body): { ep: number; ekt: number; ekr: number; total: number } {
  const ep = body.mass * g * body.position.y;
  const ekt = 0.5 * body.mass * body.velocity.lengthSquared();
  const ekr = 0.5 * (
    body.inertia.x * body.angularVelocity.x * body.angularVelocity.x +
    body.inertia.y * body.angularVelocity.y * body.angularVelocity.y +
    body.inertia.z * body.angularVelocity.z * body.angularVelocity.z
  );
  return { ep, ekt, ekr, total: ep + ekt + ekr };
}

// ----------------------------------------------------------------------------
// TEST 3.1: High-Elevation Violent Drop & Inelastic Energy Dissipation
// ----------------------------------------------------------------------------
console.log('--- TEST 3.1: High-Elevation Drops (h = 5m, 10m, 20m) ---');
for (const dropHeight of [5.0, 10.0, 20.0]) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -g, 0) });
  world.solver.iterations = 25;
  world.solver.tolerance = 1e-4;
  StonePhysicsBodyFactory.configureWorldMaterials(world);
  world.addBody(StonePhysicsBodyFactory.createGroundBody());

  const boulder = StonePhysicsBodyFactory.createStoneBody(
    new Stone({ shape: 'boulder', color: '#333', pose: new Pose({ x: 0, y: dropHeight, z: 0 }) }),
    { isStatic: false, id: 'boulder-drop' }
  );
  world.addBody(boulder);

  const initialE = computeTotalEnergy(boulder);
  let maxObservedE = initialE.total;
  let hasNaN = false;
  let hasInf = false;
  let minY = dropHeight;
  let impactDetected = false;
  let settledSteps = 0;

  const dt = 1 / 60;
  for (let s = 0; s < 360; s++) {
    world.step(dt);
    const e = computeTotalEnergy(boulder);

    if (isNaN(e.total) || isNaN(boulder.position.y) || isNaN(boulder.velocity.y)) {
      hasNaN = true;
      break;
    }
    if (!isFinite(e.total) || !isFinite(boulder.position.y)) {
      hasInf = true;
      break;
    }

    if (e.total > maxObservedE) {
      maxObservedE = e.total;
    }
    if (boulder.position.y < minY) {
      minY = boulder.position.y;
    }

    if (boulder.position.y <= boulder.shapes[0].body!.position.y && boulder.velocity.y > 0) {
      impactDetected = true;
    }

    if (boulder.velocity.length() < 0.02 && boulder.angularVelocity.length() < 0.02) {
      settledSteps++;
      if (settledSteps > 30) break;
    } else {
      settledSteps = 0;
    }
  }

  const finalE = computeTotalEnergy(boulder);
  const halfH = 0.2625;

  console.log(`Drop h = ${dropHeight}m:`);
  console.log(`  Initial Energy: ${initialE.total.toFixed(2)} J (Ep=${initialE.ep.toFixed(2)} J, Ek=0 J)`);
  console.log(`  Max Energy:     ${maxObservedE.toFixed(2)} J (ratio to E0: ${(maxObservedE / initialE.total).toFixed(4)})`);
  console.log(`  Final Energy:   ${finalE.total.toFixed(2)} J (Ep=${finalE.ep.toFixed(2)} J, Ek=${(finalE.ekt + finalE.ekr).toFixed(4)} J)`);
  console.log(`  Energy Dissipated: ${(((initialE.total - finalE.total) / initialE.total) * 100).toFixed(1)}%`);
  console.log(`  Min Y: ${minY.toFixed(4)}m (Anti-tunneling check vs 0: ${minY >= halfH * 0.9 ? 'OK' : 'FAIL'})`);
  console.log(`  NaN/Inf Detected: ${hasNaN || hasInf ? 'FAIL' : 'NONE (PASS)'}\n`);
}

// ----------------------------------------------------------------------------
// TEST 3.2: Extreme Mass Ratio Shock Impact (Heavy 50kg Top on 0.6kg Base)
// ----------------------------------------------------------------------------
console.log('--- TEST 3.2: Extreme Mass Ratio Shock (50.0kg vs 0.6kg) ---');
{
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -g, 0) });
  world.solver.iterations = 35;
  world.solver.tolerance = 1e-4;
  StonePhysicsBodyFactory.configureWorldMaterials(world);
  world.addBody(StonePhysicsBodyFactory.createGroundBody());

  // Tiny pebble on ground
  const pebble = StonePhysicsBodyFactory.createStoneBody(
    new Stone({ shape: 'pebble', color: '#111', pose: new Pose({ x: 0, y: 0.145, z: 0 }) }),
    { isStatic: false, id: 'pebble-base' }
  );
  world.addBody(pebble);

  // Massive 50kg body dropping directly from h = 3.0m
  const hugeBox = new CANNON.Body({
    mass: 50.0,
    shape: new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)),
    position: new CANNON.Vec3(0.05, 3.0, 0),
    material: StonePhysicsBodyFactory.getStoneMaterial(),
  });
  world.addBody(hugeBox);

  let hasNaN = false;
  let hasInf = false;
  let maxTotalEnergy = 0;

  for (let s = 0; s < 180; s++) {
    world.step(1 / 60);
    const e1 = computeTotalEnergy(pebble);
    const e2 = computeTotalEnergy(hugeBox);
    const total = e1.total + e2.total;

    if (isNaN(total) || !isFinite(total)) {
      hasNaN = true;
      break;
    }
    if (total > maxTotalEnergy) maxTotalEnergy = total;
  }

  console.log(`  Initial System Energy: ${(50 * g * 3.0 + 0.6 * g * 0.145).toFixed(2)} J`);
  console.log(`  Max System Energy:     ${maxTotalEnergy.toFixed(2)} J`);
  console.log(`  Pebble Final Pos: (${pebble.position.x.toFixed(3)}, ${pebble.position.y.toFixed(3)}, ${pebble.position.z.toFixed(3)})`);
  console.log(`  Huge Box Final Pos: (${hugeBox.position.x.toFixed(3)}, ${hugeBox.position.y.toFixed(3)}, ${hugeBox.position.z.toFixed(3)})`);
  console.log(`  NaN/Inf Check: ${hasNaN ? 'FAIL' : 'NONE (PASS)'}\n`);
}

// ----------------------------------------------------------------------------
// TEST 3.3: High Initial Spin (Omega = 40 rad/s) & Centrifugal Dissipation
// ----------------------------------------------------------------------------
console.log('--- TEST 3.3: High Initial Spin (Omega = 40 rad/s) & Ground Interaction ---');
{
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -g, 0) });
  StonePhysicsBodyFactory.configureWorldMaterials(world);
  world.addBody(StonePhysicsBodyFactory.createGroundBody());

  const spinningStone = StonePhysicsBodyFactory.createStoneBody(
    new Stone({ shape: 'flat', color: '#555', pose: new Pose({ x: 0, y: 1.5, z: 0 }) }),
    { isStatic: false, id: 'spinning-flat' }
  );
  spinningStone.angularVelocity.set(20, 40, -15);
  world.addBody(spinningStone);

  let hasNaN = false;
  let peakAngVel = spinningStone.angularVelocity.length();
  let finalAngVel = 0;

  for (let s = 0; s < 180; s++) {
    world.step(1 / 60);
    const w = spinningStone.angularVelocity.length();
    if (isNaN(w) || !isFinite(w)) {
      hasNaN = true;
      break;
    }
    if (w > peakAngVel) peakAngVel = w;
    finalAngVel = w;
  }

  console.log(`  Initial Angular Speed: ${Math.hypot(20, 40, -15).toFixed(2)} rad/s`);
  console.log(`  Final Angular Speed:   ${finalAngVel.toFixed(4)} rad/s`);
  console.log(`  Final Resting Y:       ${spinningStone.position.y.toFixed(4)}m (Half-height: 0.105m)`);
  console.log(`  NaN/Inf Check:         ${hasNaN ? 'FAIL' : 'NONE (PASS)'}\n`);
}

// ----------------------------------------------------------------------------
// TEST 3.4: SimpleTowerPhysicsWorld Numerical Stability under Drop Stress
// ----------------------------------------------------------------------------
console.log('--- TEST 3.4: SimpleTowerPhysicsWorld Drop Numerical Stability ---');
{
  const world = new SimpleTowerPhysicsWorld();
  const baseStone = new Stone({ shape: 'boulder', color: '#111', pose: new Pose({ x: 0, y: 0.2625, z: 0 }) });
  world.addStatic([baseStone]);

  const dropStone = new Stone({ shape: 'tall', color: '#222', pose: Pose.origin() });

  // Stress drops: high altitude, extreme off-center, negative altitudes
  const testPoses = [
    new Pose({ x: 0, y: 15.0, z: 0 }),
    new Pose({ x: 10.0, y: 5.0, z: -10.0 }),
    new Pose({ x: 0, y: -2.0, z: 0 }),
    new Pose({ x: 0.001, y: 0.53, z: 0.001 }),
  ];

  let allSuccess = true;
  for (let i = 0; i < testPoses.length; i++) {
    const pose = testPoses[i];
    const res = await world.drop(dropStone, pose);
    const p = res.pose.position;
    const isClean = !isNaN(p.x) && !isNaN(p.y) && !isNaN(p.z) && isFinite(p.x) && isFinite(p.y) && isFinite(p.z);
    console.log(`  Drop #${i + 1} (${pose.position.x}, ${pose.position.y}, ${pose.position.z}) -> settled: ${res.settled}, final: (${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)}) [${isClean ? 'OK' : 'FAIL'}]`);
    if (!isClean) allSuccess = false;
  }
  console.log(`  All Stress Drops Numerically Clean: ${allSuccess ? 'PASS' : 'FAIL'}`);
}

console.log('\n=== CHALLENGE 3 EXECUTION COMPLETE ===');
