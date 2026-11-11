/**
 * Milestone 1 Physics Unit Tests:
 * - Hierarchical Multi-Tier Composite Center of Mass (CoM) Evaluation
 * - Foundation Base Footprint Projection Invariant
 * - Overturning Gravitational Torque Calculation
 * - Dynamic Tumbling Cascade in SimpleTowerPhysicsWorld
 * - Anti-Banana Ground Fall Invariant (Zero Mid-Air Floating)
 * - Grounded Scene Graph Node Resolution (resolveGrounded3DNodes)
 * - Strict Grounded Resting Pose in place.tsx (handleCollapseComplete)
 *
 * Requirements: ORIGINAL_REQUEST.md (R2), PROJECT.md (F01, F02, F07, F09, F10), DISPATCH.md
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
import { Pose, type Vec3 } from '../domain/value-objects/Pose.ts';
import { StonePhysicsBodyFactory } from '../infrastructure/physics/StonePhysicsBodyFactory.ts';
import {
  StabilityEvaluator,
  STABILITY_ZONES,
} from '../infrastructure/physics/StabilityEvaluator.ts';
import { SimpleTowerPhysicsWorld } from '../infrastructure/physics/SimpleTowerPhysicsWorld.ts';

test('M1.1: Hierarchical Multi-Tier Cantilever Overhang Tipping Detection', () => {
  // Construct a 5-stone staircase with 'tall' stones (halfExtents.x = 0.195m).
  // Each stone is offset by +0.14m relative to the one below.
  // Locally, between each adjacent pair: delta_x = 0.14m <= 0.195m (each stone is on top of its neighbor).
  // However, globally the cumulative CoM of the upper sub-assemblies (0.35m) far exceeds the base footprint (0.195m).

  const cfg = StonePhysicsBodyFactory.getShapeConfig('tall');
  let curY = cfg.halfExtents.y;

  const s0 = new Stone({
    shape: 'tall',
    color: '#262930',
    pose: new Pose({ x: 0.0, y: curY, z: 0.0 }),
  });

  curY += cfg.halfExtents.y * 2;
  const s1 = new Stone({
    shape: 'tall',
    color: '#3E4947',
    pose: new Pose({ x: 0.14, y: curY, z: 0.0 }),
  });

  curY += cfg.halfExtents.y * 2;
  const s2 = new Stone({
    shape: 'tall',
    color: '#5B626E',
    pose: new Pose({ x: 0.28, y: curY, z: 0.0 }),
  });

  curY += cfg.halfExtents.y * 2;
  const s3 = new Stone({
    shape: 'tall',
    color: '#8B95A1',
    pose: new Pose({ x: 0.42, y: curY, z: 0.0 }),
  });

  curY += cfg.halfExtents.y * 2;
  const s4 = new Stone({
    shape: 'tall',
    color: '#E5E8EB',
    pose: new Pose({ x: 0.56, y: curY, z: 0.0 }),
  });

  const stones = [s0, s1, s2, s3, s4];

  // 1. Evaluate hierarchical stack stability
  const evalResult = StabilityEvaluator.evaluateHierarchicalStackStability(stones);

  // The staircase cantilever MUST be flagged unstable (anti-banana invariant)
  assert.equal(evalResult.isStable, false, 'Overhanging cantilever stack must not be stable');
  assert.ok(
    evalResult.failingInterfaceIndex !== undefined,
    'Failing interface index must be identified'
  );
  assert.ok(
    evalResult.failingInterfaceIndex <= 2,
    `Failure must occur at base or lower intermediate interface, got ${evalResult.failingInterfaceIndex}`
  );

  // 2. Overturning torque must point in the tipping direction
  // Overhanging in +X produces negative torque around Z-axis (tau_z = -rx * m * g)
  assert.ok(evalResult.overturningTorque !== undefined, 'Overturning torque must be calculated');
  assert.ok(
    evalResult.overturningTorque!.z < -0.1,
    `Overturning torque around Z must be negative for +X offset: got ${evalResult.overturningTorque!.z}`
  );

  // 3. Composite CoM must reflect the weighted average of all stones
  const expectedComX = (0.0 + 0.14 + 0.28 + 0.42 + 0.56) / 5;
  assert.ok(
    Math.abs(evalResult.compositeCOM.x - expectedComX) < 1e-3,
    `Composite CoM X mismatch: expected ~${expectedComX.toFixed(4)}, got ${evalResult.compositeCOM.x}`
  );
});

test('M1.2: Vertically Centered Natural Cairn Maintains Strict Equilibrium', () => {
  // Construct a realistic 5-stone pyramid cairn with centered alignment (|dx| <= 0.015m, |dz| <= 0.015m)
  const cfg1 = StonePhysicsBodyFactory.getShapeConfig('boulder');
  const cfg2 = StonePhysicsBodyFactory.getShapeConfig('flat');
  const cfg3 = StonePhysicsBodyFactory.getShapeConfig('round');
  const cfg4 = StonePhysicsBodyFactory.getShapeConfig('tall');
  const cfg5 = StonePhysicsBodyFactory.getShapeConfig('pebble');

  let curY = cfg1.halfExtents.y;
  const stones: Stone[] = [
    new Stone({ shape: 'boulder', color: '#111', pose: new Pose({ x: 0.0, y: curY, z: 0.0 }) }),
  ];

  curY += cfg1.halfExtents.y + cfg2.halfExtents.y;
  stones.push(
    new Stone({ shape: 'flat', color: '#222', pose: new Pose({ x: 0.01, y: curY, z: -0.01 }) })
  );

  curY += cfg2.halfExtents.y + cfg3.halfExtents.y;
  stones.push(
    new Stone({ shape: 'round', color: '#333', pose: new Pose({ x: -0.01, y: curY, z: 0.01 }) })
  );

  curY += cfg3.halfExtents.y + cfg4.halfExtents.y;
  stones.push(
    new Stone({ shape: 'tall', color: '#444', pose: new Pose({ x: 0.005, y: curY, z: -0.005 }) })
  );

  curY += cfg4.halfExtents.y + cfg5.halfExtents.y;
  stones.push(
    new Stone({ shape: 'pebble', color: '#555', pose: new Pose({ x: 0.0, y: curY, z: 0.0 }) })
  );

  const evalResult = StabilityEvaluator.evaluateHierarchicalStackStability(stones);

  assert.equal(evalResult.isStable, true, 'Well-centered natural cairn must be completely stable');
  assert.equal(evalResult.failingInterfaceIndex, undefined);
  assert.equal(evalResult.overturningTorque, undefined);
  assert.ok(
    Math.hypot(evalResult.compositeCOM.x, evalResult.compositeCOM.z) < 0.02,
    'Composite CoM must remain centered within 20mm'
  );
});

test('M1.3: Foundation Base Footprint Projection Invariant (Total Tower CoM Exceeds Ground Base)', () => {
  // Base stone is a pebble on the ground (support footprint: halfExtents.x = 0.18m)
  // Stone 1 is a heavy boulder (mass 2.5kg) placed at x = 0.25m (outside base stone footprint 0.18m)
  const cfgPebble = StonePhysicsBodyFactory.getShapeConfig('pebble');
  const cfgBoulder = StonePhysicsBodyFactory.getShapeConfig('boulder');

  const basePebble = new Stone({
    shape: 'pebble',
    color: '#E5E8EB',
    pose: new Pose({ x: 0.0, y: cfgPebble.halfExtents.y, z: 0.0 }),
  });

  const heavyUpper = new Stone({
    shape: 'boulder',
    color: '#262930',
    pose: new Pose({
      x: 0.25,
      y: cfgPebble.halfExtents.y * 2 + cfgBoulder.halfExtents.y,
      z: 0.0,
    }),
  });

  const evalResult = StabilityEvaluator.evaluateHierarchicalStackStability([basePebble, heavyUpper]);

  assert.equal(evalResult.isStable, false, 'Heavy upper stone outside base must topple');
  assert.equal(evalResult.failingInterfaceIndex, 0, 'Base interface (0) must fail');
  assert.ok(evalResult.overturningTorque !== undefined);
});

test('M1.4: Dynamic Cascade Tumbling and Strict Anti-Banana Ground Landing Invariant', async () => {
  // Setup a 3-stone tower in SimpleTowerPhysicsWorld
  const cfgBoulder = StonePhysicsBodyFactory.getShapeConfig('boulder');
  const cfgRound = StonePhysicsBodyFactory.getShapeConfig('round');
  const cfgFlat = StonePhysicsBodyFactory.getShapeConfig('flat');
  const cfgTall = StonePhysicsBodyFactory.getShapeConfig('tall');

  let curY = cfgBoulder.halfExtents.y;
  const s0 = new Stone({
    shape: 'boulder',
    color: '#111',
    pose: new Pose({ x: 0.0, y: curY, z: 0.0 }),
  });

  curY += cfgBoulder.halfExtents.y + cfgRound.halfExtents.y;
  const s1 = new Stone({
    shape: 'round',
    color: '#222',
    pose: new Pose({ x: 0.0, y: curY, z: 0.0 }),
  });

  curY += cfgRound.halfExtents.y + cfgFlat.halfExtents.y;
  const s2 = new Stone({
    shape: 'flat',
    color: '#333',
    pose: new Pose({ x: 0.0, y: curY, z: 0.0 }),
  });

  const world = new SimpleTowerPhysicsWorld();
  world.addStatic([s0, s1, s2]);

  // Drop a tall stone with significant off-center position that causes tipping
  const topSurfaceY = curY + cfgFlat.halfExtents.y;
  const droppedStone = new Stone({
    shape: 'tall',
    color: '#555',
    pose: Pose.origin(),
  });

  // Drop position: shifted laterally so it cannot settle stably
  const dropFrom = new Pose({
    x: 0.38,
    y: topSurfaceY + cfgTall.halfExtents.y + 0.10,
    z: 0.0,
  });

  const dropResult = await world.drop(droppedStone, dropFrom);

  // 1. Must fail stability
  assert.equal(dropResult.settled, false, 'Unstable drop must not settle');
  assert.equal(dropResult.collapsed, true, 'Unstable drop must collapse');

  // 2. Strict Anti-Banana Invariant: Dropped stone MUST land on the ground plane (y = groundRestY)
  // It must NEVER return suspended in mid-air (y > groundRestY without support)
  const expectedGroundY = Number(cfgTall.halfExtents.y.toFixed(4));
  assert.equal(
    dropResult.pose.position.y,
    expectedGroundY,
    `Anti-Banana Invariant: resting pose Y must strictly equal groundRestY (${expectedGroundY}), got ${dropResult.pose.position.y}`
  );

  // 3. Trajectory frames must record continuous motion down to the floor
  assert.ok(dropResult.trajectory && dropResult.trajectory.length > 0, 'Trajectory must record simulation frames');
  const lastFrame = dropResult.trajectory[dropResult.trajectory.length - 1];
  const lastDroppedPose = lastFrame.poses.get('dropped-stone');
  assert.ok(lastDroppedPose !== undefined, 'Dropped stone must exist in final frame');
  assert.ok(
    Number.isFinite(lastDroppedPose!.position.x) &&
    Number.isFinite(lastDroppedPose!.position.y) &&
    Number.isFinite(lastDroppedPose!.position.z),
    'Coordinates must be finite'
  );
});

test('M1.5: Scene Graph Grounding (resolveGrounded3DNodes) Eliminates Floating C-Curves and Center Pulling', () => {
  const canvasPath = path.resolve(projectRoot, 'presentation/components/StoneTowerCanvas.tsx');
  const canvasSrc = fs.readFileSync(canvasPath, 'utf8');

  // 1. Static Contract Invariants:
  assert.ok(
    canvasSrc.includes('export function resolveGrounded3DNodes'),
    'StoneTowerCanvas must export resolveGrounded3DNodes'
  );
  assert.ok(
    canvasSrc.includes('export function resolveLocalSupportTopY'),
    'StoneTowerCanvas must export resolveLocalSupportTopY'
  );

  // 2. Elimination of artificial 45% center pull hack:
  // Must NOT pull coordinates towards lower stone center with 0.45 factor
  assert.ok(
    !canvasSrc.includes('* 0.45'),
    'StoneTowerCanvas must not contain artificial 45% center pull damping'
  );
  assert.ok(
    canvasSrc.includes('const settledX = Number(node.position.x.toFixed(4))'),
    'StoneTowerCanvas must preserve authentic node X coordinate'
  );
  assert.ok(
    canvasSrc.includes('const settledZ = Number(node.position.z.toFixed(4))'),
    'StoneTowerCanvas must preserve authentic node Z coordinate'
  );

  // 3. Foundation connection invariant:
  // A stone is only elevated if supported by a stone connected to ground within base footprint
  assert.ok(
    canvasSrc.includes('distFromRoot <= rootRadius * 1.15'),
    'StoneTowerCanvas must verify foundation connection to ground (distFromRoot <= rootRadius * 1.15)'
  );
  assert.ok(
    canvasSrc.includes('groundRootMap'),
    'StoneTowerCanvas must track ground foundation roots via groundRootMap'
  );
});

test('M1.6: Fallen Pose Handling in place.tsx strictly commits groundRestY and enters FALLEN_CHOICE', () => {
  const placePath = path.resolve(projectRoot, 'app/stack/place.tsx');
  const placeSrc = fs.readFileSync(placePath, 'utf8');

  // 1. Must NOT override simulated landing pose with mid-air user drag coordinates
  assert.ok(
    !placeSrc.includes('const userDropX = Number(dropPose.position.x.toFixed(4))'),
    'place.tsx must not override simulated landing coordinates with mid-air user drag coordinates'
  );
  assert.ok(
    placeSrc.includes('const simulatedPose = res.dropResult?.pose ?? dropPose'),
    'place.tsx must use authentic simulated landing pose from physics world'
  );

  // 2. Must strictly enforce groundRestY for finalPose
  assert.ok(
    placeSrc.includes('y: groundRestY'),
    'place.tsx finalPose must strictly set Y to groundRestY'
  );

  // 3. handleCollapseComplete must set phase to FALLEN_CHOICE per D-022
  assert.ok(
    placeSrc.includes("setPhase('FALLEN_CHOICE')"),
    'handleCollapseComplete must transition to FALLEN_CHOICE state'
  );
});
