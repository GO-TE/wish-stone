import { Stone, type StoneShape } from '../src/domain/entities/Stone.ts';
import { Pose } from '../src/domain/value-objects/Pose.ts';
import { SimpleTowerPhysicsWorld } from '../src/infrastructure/physics/SimpleTowerPhysicsWorld.ts';
import { StabilityEvaluator } from '../src/infrastructure/physics/StabilityEvaluator.ts';
import { StonePhysicsBodyFactory } from '../src/infrastructure/physics/StonePhysicsBodyFactory.ts';

console.log('=== CHALLENGE 2: SUPPORT POLYGON EDGE SENSITIVITY (r_support ± 0.01m) ===\n');

// Shapes to test as base
const testShapes: StoneShape[] = ['flat', 'boulder', 'round'];

for (const shape of testShapes) {
  const config = StonePhysicsBodyFactory.getShapeConfig(shape);
  const rSupportX = config.halfExtents.x;
  const rSupportZ = config.halfExtents.z;
  const baseTopY = config.halfExtents.y * 2;

  console.log(`--- Testing Base Stone Shape: [${shape.toUpperCase()}] ---`);
  console.log(`  Support Half-Width: X = ${rSupportX.toFixed(4)}m, Z = ${rSupportZ.toFixed(4)}m, Height = ${baseTopY.toFixed(4)}m`);

  const baseStone = new Stone({
    id: `base-${shape}`,
    shape,
    color: '#444444',
    pose: new Pose({ x: 0, y: config.halfExtents.y, z: 0 }),
  });

  const poly = StabilityEvaluator.computeSupportPolygon(baseStone);

  // Test across 4 directions: +X, -X, +Z, -Z
  const directions: { name: string; getPos: (r: number) => { x: number; y: number; z: number }; rBase: number }[] = [
    { name: '+X', rBase: rSupportX, getPos: (r) => ({ x: r, y: baseTopY + 0.15, z: 0 }) },
    { name: '-X', rBase: rSupportX, getPos: (r) => ({ x: -r, y: baseTopY + 0.15, z: 0 }) },
    { name: '+Z', rBase: rSupportZ, getPos: (r) => ({ x: 0, y: baseTopY + 0.15, z: r }) },
    { name: '-Z', rBase: rSupportZ, getPos: (r) => ({ x: 0, y: baseTopY + 0.15, z: -r }) },
  ];

  for (const dir of directions) {
    const rInside = dir.rBase - 0.01;
    const rOutside = dir.rBase + 0.01;

    // 1. Analytical Evaluation via StabilityEvaluator
    const posInside = dir.getPos(rInside);
    const posOutside = dir.getPos(rOutside);

    const evalInside = StabilityEvaluator.evaluateStability(posInside, poly, 0.6);
    const evalOutside = StabilityEvaluator.evaluateStability(posOutside, poly, 0.6);

    console.log(`  [Direction ${dir.name}] Knife-Edge Boundary Test:`);
    console.log(`    Inside  (r=${rInside.toFixed(4)}m): isStable=${evalInside.isStable}, margin=${evalInside.marginDistance.toFixed(4)}m`);
    console.log(`    Outside (r=${rOutside.toFixed(4)}m): isStable=${evalOutside.isStable}, margin=${evalOutside.marginDistance.toFixed(4)}m, tau=${evalOutside.overturningTorque ? Math.hypot(evalOutside.overturningTorque.x, evalOutside.overturningTorque.z).toFixed(4) : 0}Nm`);

    // 2. Physical Drop Simulation via SimpleTowerPhysicsWorld
    const worldInside = new SimpleTowerPhysicsWorld();
    worldInside.addStatic([baseStone]);
    const dropPebbleInside = new Stone({ id: 'drop-in', shape: 'pebble', color: '#fff', pose: Pose.origin() });
    const resInside = await worldInside.drop(dropPebbleInside, new Pose(posInside));

    const worldOutside = new SimpleTowerPhysicsWorld();
    worldOutside.addStatic([baseStone]);
    const dropPebbleOutside = new Stone({ id: 'drop-out', shape: 'pebble', color: '#fff', pose: Pose.origin() });
    const resOutside = await worldOutside.drop(dropPebbleOutside, new Pose(posOutside));

    console.log(`    Simulation Inside  -> settled: ${resInside.settled}, collapsed: ${resInside.collapsed}, finalY: ${resInside.pose.position.y.toFixed(4)}m`);
    console.log(`    Simulation Outside -> settled: ${resOutside.settled}, collapsed: ${resOutside.collapsed}, finalY: ${resOutside.pose.position.y.toFixed(4)}m, scatter: ${Math.hypot(resOutside.pose.position.x, resOutside.pose.position.z).toFixed(4)}m`);

    // Verify Knife-Edge Decision
    const insideValid = resInside.settled === true && resInside.collapsed === false;
    const outsideValid = resOutside.settled === false && resOutside.collapsed === true;
    console.log(`    Verdict for ${dir.name}: Inside Succeeded=${insideValid}, Outside Succeeded=${outsideValid} -> ${insideValid && outsideValid ? 'PASS' : 'FAIL'}\n`);
  }
}

console.log('=== CHALLENGE 2 EXECUTION COMPLETE ===');
