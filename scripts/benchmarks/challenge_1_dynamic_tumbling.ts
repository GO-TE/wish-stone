import * as CANNON from 'cannon-es';
import { Stone } from '../src/domain/entities/Stone.ts';
import { Pose } from '../src/domain/value-objects/Pose.ts';
import { SimpleTowerPhysicsWorld } from '../src/infrastructure/physics/SimpleTowerPhysicsWorld.ts';
import { StabilityEvaluator } from '../src/infrastructure/physics/StabilityEvaluator.ts';
import { StonePhysicsBodyFactory } from '../src/infrastructure/physics/StonePhysicsBodyFactory.ts';

console.log('=== CHALLENGE 1: DYNAMIC TUMBLING & CASCADING COLLAPSE ===\n');

// Part A: Testing SimpleTowerPhysicsWorld.drop with multi-stone stack
console.log('--- PART A: SimpleTowerPhysicsWorld.drop Simulation ---');
const baseStone = new Stone({
  id: 'boulder-base',
  shape: 'boulder',
  color: '#555555',
  pose: new Pose({ x: 0, y: 0.2625, z: 0 }),
});

const midStone = new Stone({
  id: 'flat-mid',
  shape: 'flat',
  color: '#777777',
  pose: new Pose({ x: 0, y: 0.525 + 0.105, z: 0 }), // y = 0.630
});

const world = new SimpleTowerPhysicsWorld();
world.addStatic([baseStone, midStone]);

// Drop 1: Well-centered pebble (should settle stably)
console.log('[Test 1.1] Centered Pebble Drop on 2-Stone Stack (x=0.02, z=0.02, y=0.85)...');
const dropPebbleStable = new Stone({
  id: 'pebble-stable',
  shape: 'pebble',
  color: '#999999',
  pose: Pose.origin(),
});

const resStable = await world.drop(
  dropPebbleStable,
  new Pose({ x: 0.02, y: 0.85, z: 0.02 })
);

console.log(`  -> Settled: ${resStable.settled}, Collapsed: ${resStable.collapsed}`);
console.log(`  -> Final Pos: (${resStable.pose.position.x.toFixed(4)}, ${resStable.pose.position.y.toFixed(4)}, ${resStable.pose.position.z.toFixed(4)})`);
console.log(`  -> Trajectory Frames: ${resStable.trajectory?.length ?? 0}`);

// Drop 2: Off-balance pebble placed near edge (super-critical)
console.log('\n[Test 1.2] Off-Balance Pebble Drop (x=0.38, z=0.0, y=0.85)...');
const world2 = new SimpleTowerPhysicsWorld();
world2.addStatic([baseStone, midStone]);

const dropPebbleOff = new Stone({
  id: 'pebble-tumble',
  shape: 'pebble',
  color: '#aa3333',
  pose: Pose.origin(),
});

const resTumble = await world2.drop(
  dropPebbleOff,
  new Pose({ x: 0.38, y: 0.85, z: 0.0 })
);

console.log(`  -> Settled: ${resTumble.settled}, Collapsed: ${resTumble.collapsed}`);
console.log(`  -> Final Pos: (${resTumble.pose.position.x.toFixed(4)}, ${resTumble.pose.position.y.toFixed(4)}, ${resTumble.pose.position.z.toFixed(4)})`);
console.log(`  -> Affected Tower Stones: ${resTumble.affectedStones?.length ?? 0}`);
if (resTumble.affectedStones && resTumble.affectedStones.length > 0) {
  for (const aff of resTumble.affectedStones) {
    console.log(`     * Affected [${aff.id}] at y=${aff.pose.position.y.toFixed(4)}, x=${aff.pose.position.x.toFixed(4)}`);
  }
}

// Analyze Trajectory Kinematics (Angular velocity, linear velocity, scatter)
const traj = resTumble.trajectory ?? [];
console.log(`  -> Analyzing Trajectory of ${traj.length} frames (dt=1/60s)...`);

let peakLinearSpeed = 0;
let peakAngularSpeed = 0;
let minScatter = Infinity;
let maxScatter = 0;
const angularSpeedSamples: number[] = [];

for (let i = 1; i < traj.length; i++) {
  const prevFrame = traj[i - 1];
  const currFrame = traj[i];
  const dt = currFrame.time - prevFrame.time || 1 / 60;

  const prevPose = prevFrame.poses.get('dropped-stone')!;
  const currPose = currFrame.poses.get('dropped-stone')!;

  // Linear velocity
  const dx = (currPose.position.x - prevPose.position.x) / dt;
  const dy = (currPose.position.y - prevPose.position.y) / dt;
  const dz = (currPose.position.z - prevPose.position.z) / dt;
  const linSpeed = Math.hypot(dx, dy, dz);
  if (linSpeed > peakLinearSpeed) peakLinearSpeed = linSpeed;

  // Angular displacement via quaternion dot product: theta = 2 * acos(|q1 . q2|)
  const dot = Math.min(1.0, Math.abs(
    prevPose.rotation.qx * currPose.rotation.qx +
    prevPose.rotation.qy * currPose.rotation.qy +
    prevPose.rotation.qz * currPose.rotation.qz +
    prevPose.rotation.qw * currPose.rotation.qw
  ));
  const deltaTheta = 2 * Math.acos(dot);
  const angSpeed = deltaTheta / dt;
  if (angSpeed > peakAngularSpeed) peakAngularSpeed = angSpeed;
  angularSpeedSamples.push(angSpeed);

  const radialDist = Math.hypot(currPose.position.x, currPose.position.z);
  if (radialDist < minScatter) minScatter = radialDist;
  if (radialDist > maxScatter) maxScatter = radialDist;
}

const finalRadialScatter = Math.hypot(
  resTumble.pose.position.x,
  resTumble.pose.position.z
);

console.log(`  -> Peak Linear Velocity: ${peakLinearSpeed.toFixed(3)} m/s`);
console.log(`  -> Peak Angular Velocity: ${peakAngularSpeed.toFixed(3)} rad/s`);
console.log(`  -> Final Radial Ground Scatter: ${finalRadialScatter.toFixed(3)} m`);
console.log(`  -> Final Ground Y: ${resTumble.pose.position.y.toFixed(3)} m (Stone half-height: 0.145m)`);

// Part B: Pure Multi-Body Newton-Euler Full Cascade Test in CANNON.World with Factory Bodies
console.log('\n--- PART B: Full Multi-Body Dynamic Cascade using Factory Bodies ---');
const cWorld = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
StonePhysicsBodyFactory.configureWorldMaterials(cWorld);
cWorld.addBody(StonePhysicsBodyFactory.createGroundBody());

// Stack of 3 dynamic stones: Boulder base, Flat mid, Pebble capstone
const b1 = StonePhysicsBodyFactory.createStoneBody(
  new Stone({ shape: 'boulder', color: '#111', pose: new Pose({ x: 0, y: 0.2625, z: 0 }) }),
  { isStatic: false, id: 'boulder-dyn' }
);
const b2 = StonePhysicsBodyFactory.createStoneBody(
  new Stone({ shape: 'flat', color: '#222', pose: new Pose({ x: 0, y: 0.525 + 0.105, z: 0 }) }),
  { isStatic: false, id: 'flat-dyn' }
);
const b3 = StonePhysicsBodyFactory.createStoneBody(
  new Stone({ shape: 'tall', color: '#333', pose: new Pose({ x: 0.22, y: 0.525 + 0.21 + 0.3625, z: 0 }) }), // Placed off-center at x=0.22 on mid stone
  { isStatic: false, id: 'tall-dyn' }
);

cWorld.addBody(b1);
cWorld.addBody(b2);
cWorld.addBody(b3);

let b1MaxSpeed = 0;
let b2MaxSpeed = 0;
let b3MaxSpeed = 0;
let b3PeakAngSpeed = 0;

for (let s = 0; s < 180; s++) {
  cWorld.step(1 / 60);
  const v1 = b1.velocity.length();
  const v2 = b2.velocity.length();
  const v3 = b3.velocity.length();
  const w3 = b3.angularVelocity.length();

  if (v1 > b1MaxSpeed) b1MaxSpeed = v1;
  if (v2 > b2MaxSpeed) b2MaxSpeed = v2;
  if (v3 > b3MaxSpeed) b3MaxSpeed = v3;
  if (w3 > b3PeakAngSpeed) b3PeakAngSpeed = w3;
}

console.log(`  -> Dynamic Stack Cascade:`);
console.log(`     * Boulder peak speed: ${b1MaxSpeed.toFixed(3)} m/s, final y: ${b1.position.y.toFixed(3)} m`);
console.log(`     * Flat mid peak speed: ${b2MaxSpeed.toFixed(3)} m/s, final y: ${b2.position.y.toFixed(3)} m`);
console.log(`     * Tall top peak speed: ${b3MaxSpeed.toFixed(3)} m/s, final y: ${b3.position.y.toFixed(3)} m, peak ang speed: ${b3PeakAngSpeed.toFixed(3)} rad/s`);
console.log(`     * Tall final scatter: (${b3.position.x.toFixed(3)}, ${b3.position.z.toFixed(3)}) dist=${Math.hypot(b3.position.x, b3.position.z).toFixed(3)}m`);

console.log('\n=== CHALLENGE 1 EXECUTION COMPLETE ===');
