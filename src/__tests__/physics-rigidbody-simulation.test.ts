import assert from 'node:assert/strict';
import test from 'node:test';
import * as CANNON from 'cannon-es';
import { Stone, type StoneShape } from '../domain/entities/Stone.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import { SimpleTowerPhysicsWorld } from '../infrastructure/physics/SimpleTowerPhysicsWorld.ts';
import { StabilityEvaluator } from '../infrastructure/physics/StabilityEvaluator.ts';
import { StonePhysicsBodyFactory } from '../infrastructure/physics/StonePhysicsBodyFactory.ts';

/**
 * ============================================================================
 * Tier 1: Physics Primitives & Rigid-Body Mechanics
 * Target Features: F01, F02, F11
 * ============================================================================
 */

test('Tier 1.1 - Fixed Timestep Stepping & Determinism', async () => {
  const world1 = new SimpleTowerPhysicsWorld();
  const world2 = new SimpleTowerPhysicsWorld();
  const dt = 1 / 60;

  // Step verification: manual stepping advances simulation monotonically
  for (let i = 0; i < 60; i++) {
    world1.step(dt);
    world2.step(dt);
  }

  // Deterministic drop verification
  const testStone = new Stone({
    shape: 'round',
    color: '#706050',
    pose: Pose.origin(),
  });
  const dropPose = new Pose({ x: 0.1, y: 1.0, z: -0.1 });

  const sim1 = await world1.drop(testStone, dropPose);
  const sim2 = await world2.drop(testStone, dropPose);

  assert.equal(
    sim1.settled,
    sim2.settled,
    'Settled flag must be strictly deterministic across identical runs'
  );
  assert.equal(
    sim1.pose.position.x,
    sim2.pose.position.x,
    'Position X must be strictly deterministic across identical runs'
  );
  assert.equal(
    sim1.pose.position.y,
    sim2.pose.position.y,
    'Position Y must be strictly deterministic across identical runs'
  );
  assert.equal(
    sim1.pose.position.z,
    sim2.pose.position.z,
    'Position Z must be strictly deterministic across identical runs'
  );
  assert.ok(
    sim1.pose.position.y < 1.0,
    `Body must accelerate downward under gravity, got y=${sim1.pose.position.y}`
  );
  assert.equal(
    sim1.trajectory?.length,
    sim2.trajectory?.length,
    'Trajectory frame count must be strictly deterministic'
  );
});

test('Tier 1.2 - Gravitational Acceleration & Free Fall Derivatives', () => {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  StonePhysicsBodyFactory.configureWorldMaterials(world);
  const stone = new Stone({
    shape: 'round',
    color: '#706050',
    pose: new Pose({ x: 0, y: 5.0, z: 0 }),
  });
  // Disable drag damping to isolate pure gravitational free fall
  const body = StonePhysicsBodyFactory.createStoneBody(stone, { linearDamping: 0 });
  world.addBody(body);

  const dt = 1 / 60;
  let previousVy = 0;

  for (let step = 1; step <= 30; step++) {
    world.step(dt);
    const expectedVy = -9.82 * (step * dt);

    // Assert analytical free fall velocity v_y = -g * t
    assert.ok(
      Math.abs(body.velocity.y - expectedVy) < 0.05,
      `Step ${step}: Expected vy ${expectedVy}, got ${body.velocity.y}`
    );

    // Assert second numerical derivative a_y = Delta v_y / Delta t == -9.82 +- 0.05
    const numericalAy = (body.velocity.y - previousVy) / dt;
    assert.ok(
      Math.abs(numericalAy - (-9.82)) < 0.05,
      `Step ${step}: Numerical acceleration (${numericalAy}) must match gravity (-9.82 +- 0.05)`
    );
    previousVy = body.velocity.y;

    // Zero lateral drift in unperturbed vertical free fall
    assert.equal(body.position.x, 0, 'No lateral drift in free fall along X');
    assert.equal(body.position.z, 0, 'No lateral drift in free fall along Z');
    assert.ok(
      body.angularVelocity.length() < 1e-6,
      'Angular velocity must remain zero in unperturbed free fall'
    );
  }
});

test('Tier 1.3 - Ground Plane Collision & Restitution Decay', () => {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  StonePhysicsBodyFactory.configureWorldMaterials(world);
  const ground = StonePhysicsBodyFactory.createGroundBody();
  world.addBody(ground);

  const flatConfig = StonePhysicsBodyFactory.getShapeConfig('flat');
  const halfH = flatConfig.halfExtents.y;
  const stone = new Stone({
    shape: 'flat',
    color: '#706050',
    pose: new Pose({ x: 0, y: 0.8, z: 0 }),
  });
  const body = StonePhysicsBodyFactory.createStoneBody(stone);
  world.addBody(body);

  for (let i = 0; i < 120; i++) {
    world.step(1 / 60);
  }

  // Settled resting position: center of mass height must match half-height
  assert.ok(
    Math.abs(body.position.y - halfH) < 0.02,
    `Resting y (${body.position.y.toFixed(4)}) should equal halfH (${halfH})`
  );
  assert.ok(
    Math.abs(body.velocity.y) < 0.02,
    `Vertical velocity (${body.velocity.y.toFixed(4)}) must be dampened to near zero`
  );
  assert.ok(
    body.angularVelocity.length() < 0.02,
    `Angular velocity (${body.angularVelocity.length().toFixed(4)}) must be dampened`
  );
});

test('Tier 1.4 - Normal Force Equilibrium & Sleep State', () => {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.allowSleep = true;
  StonePhysicsBodyFactory.configureWorldMaterials(world);
  const ground = StonePhysicsBodyFactory.createGroundBody();
  world.addBody(ground);

  const config = StonePhysicsBodyFactory.getShapeConfig('boulder');
  const stone = new Stone({
    shape: 'boulder',
    color: '#706050',
    pose: new Pose({ x: 0, y: config.halfExtents.y, z: 0 }),
  });
  const body = StonePhysicsBodyFactory.createStoneBody(stone);
  world.addBody(body);

  for (let i = 0; i < 60; i++) {
    world.step(1 / 60);
  }

  assert.ok(
    body.velocity.length() < 0.005,
    `Settled linear velocity must be < 0.005, got ${body.velocity.length()}`
  );
  assert.ok(
    body.angularVelocity.length() < 0.01,
    `Settled angular velocity must be < 0.01, got ${body.angularVelocity.length()}`
  );
  assert.equal(
    body.sleepState,
    CANNON.Body.SLEEPING,
    'Body must enter SLEEPING state once resting equilibrium is reached'
  );
});

test('Tier 1.5 - Friction Resistance & Kinetic Energy Arrest', () => {
  const runSlide = (friction: number) => {
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    const stoneMat = StonePhysicsBodyFactory.getStoneMaterial();
    const groundMat = StonePhysicsBodyFactory.getGroundMaterial();
    const contactMat = new CANNON.ContactMaterial(stoneMat, groundMat, {
      friction,
      restitution: 0.08,
    });
    world.addContactMaterial(contactMat);

    const ground = StonePhysicsBodyFactory.createGroundBody();
    world.addBody(ground);

    const cfg = StonePhysicsBodyFactory.getShapeConfig('round');
    const stone = new Stone({
      shape: 'round',
      color: '#706050',
      pose: new Pose({ x: 0, y: cfg.halfExtents.y, z: 0 }),
    });
    // Set linearDamping: 0 to isolate contact friction as sole dissipative force
    const body = StonePhysicsBodyFactory.createStoneBody(stone, { linearDamping: 0 });
    body.velocity.set(3.0, 0, 0);
    world.addBody(body);

    for (let i = 0; i < 60; i++) {
      world.step(1 / 60);
    }
    return { finalVx: body.velocity.x, finalX: body.position.x };
  };

  const frictionless = runSlide(0.0);
  const withFriction = runSlide(0.75);

  // Frictionless stone slides freely across the plane
  assert.ok(
    frictionless.finalX > 2.5,
    `Frictionless body must slide freely, got x=${frictionless.finalX}`
  );
  assert.ok(
    frictionless.finalVx > 2.5,
    `Frictionless velocity must remain near 3.0, got vx=${frictionless.finalVx}`
  );

  // Stone with realistic friction is rapidly arrested by contact shear impulses
  assert.ok(
    withFriction.finalX < 0.6,
    `Friction body must arrest almost immediately, got x=${withFriction.finalX}`
  );
  assert.ok(
    Math.abs(withFriction.finalVx) < 0.15,
    `Friction body velocity must damp to near zero, got vx=${withFriction.finalVx}`
  );
});

test('Tier 1.6 - Shape Mass & Principal Inertia Tensor Properties', () => {
  const shapes: StoneShape[] = ['boulder', 'flat', 'tall', 'round', 'pebble'];

  const bodies = shapes.map((shapeName) => {
    const domainStone = new Stone({
      shape: shapeName,
      color: '#706050',
      pose: Pose.origin(),
    });
    const body = StonePhysicsBodyFactory.createStoneBody(domainStone);
    const cfg = StonePhysicsBodyFactory.getShapeConfig(shapeName);
    return { shapeName, body, domainStone, cfg };
  });

  // Verify mass monotonic ordering: boulder > flat > tall > round > pebble
  const masses = bodies.map((b) => b.body.mass);
  for (let i = 0; i < masses.length - 1; i++) {
    assert.ok(
      masses[i] >= masses[i + 1],
      `Mass ordering violated: ${bodies[i].shapeName} (${masses[i]}) < ${bodies[i + 1].shapeName} (${masses[i + 1]})`
    );
  }

  const flatBody = bodies.find((b) => b.shapeName === 'flat')!.body;
  const tallBody = bodies.find((b) => b.shapeName === 'tall')!.body;

  // Flat stone has wide base and thin height => Iyy > Ixx
  assert.ok(
    flatBody.inertia.y > flatBody.inertia.x,
    `Flat stone must have greater yaw inertia Iyy (${flatBody.inertia.y.toFixed(4)}) than pitch inertia Ixx (${flatBody.inertia.x.toFixed(4)})`
  );

  // Tall stone has high height and narrow base => Ixx > Iyy
  assert.ok(
    tallBody.inertia.x > tallBody.inertia.y,
    `Tall stone must have greater pitch/roll inertia Ixx (${tallBody.inertia.x.toFixed(4)}) than yaw inertia Iyy (${tallBody.inertia.y.toFixed(4)})`
  );
});

/**
 * ============================================================================
 * Tier 2: Boundary Value Analysis & Extreme Corner Cases
 * Target Features: F03, F04, F12
 * ============================================================================
 */

test('Tier 2.1 - Sub-Critical Near-Edge Boundary Stability (Inside Support Polygon)', async () => {
  const baseConfig = StonePhysicsBodyFactory.getShapeConfig('boulder');
  const baseStone = new Stone({
    shape: 'boulder',
    color: '#404040',
    pose: new Pose({ x: 0, y: baseConfig.halfExtents.y, z: 0 }),
  });
  const supportPolygon = StabilityEvaluator.computeSupportPolygon(baseStone);

  // Sub-critical drop COM at x = 0.12m (inside base halfExtent.x = 0.3125m)
  const topPose = new Pose({ x: 0.12, y: baseConfig.halfExtents.y * 2 + 0.25, z: 0 });
  const topStone = new Stone({
    shape: 'round',
    color: '#707070',
    pose: Pose.origin(),
  });
  const topConfig = StonePhysicsBodyFactory.getShapeConfig('round');

  const analyticalEval = StabilityEvaluator.evaluateStability(
    topPose.position,
    supportPolygon,
    topConfig.mass
  );
  assert.equal(analyticalEval.isStable, true, 'Analytical evaluation must be stable inside polygon');
  assert.ok(analyticalEval.marginDistance > 0, `Signed margin distance must be positive, got ${analyticalEval.marginDistance}`);

  const world = new SimpleTowerPhysicsWorld();
  world.addStatic([baseStone]);
  const dropResult = await world.drop(topStone, topPose);

  assert.equal(dropResult.settled, true, 'Sub-critical drop must settle stably on top');
  assert.equal(dropResult.collapsed, false, 'Sub-critical drop must not collapse');
  assert.ok(
    dropResult.pose.position.y > baseConfig.halfExtents.y,
    `Settled height (${dropResult.pose.position.y}) must remain on top of base`
  );
  assert.ok(
    Math.abs(dropResult.pose.position.x - 0.12) < 0.05,
    `Lateral drift must be minimal, got x=${dropResult.pose.position.x}`
  );
});

test('Tier 2.2 - Super-Critical Near-Edge Boundary Tumble (Outside Support Polygon)', async () => {
  const baseConfig = StonePhysicsBodyFactory.getShapeConfig('boulder');
  const baseStone = new Stone({
    shape: 'boulder',
    color: '#404040',
    pose: new Pose({ x: 0, y: baseConfig.halfExtents.y, z: 0 }),
  });
  const supportPolygon = StabilityEvaluator.computeSupportPolygon(baseStone);

  // Super-critical offset at x = 0.55m (exceeds 0.3125m edge)
  const topPose = new Pose({ x: 0.55, y: baseConfig.halfExtents.y * 2 + 0.25, z: 0 });
  const topStone = new Stone({
    shape: 'round',
    color: '#707070',
    pose: Pose.origin(),
  });
  const topConfig = StonePhysicsBodyFactory.getShapeConfig('round');

  const analyticalEval = StabilityEvaluator.evaluateStability(
    topPose.position,
    supportPolygon,
    topConfig.mass
  );
  assert.equal(analyticalEval.isStable, false, 'Analytical evaluation must be unstable outside polygon');
  assert.ok(analyticalEval.marginDistance < 0, `Signed margin must be negative, got ${analyticalEval.marginDistance}`);
  assert.ok(analyticalEval.overturningTorque !== undefined, 'Overturning torque must be defined');

  // Physical torque direction: tau = r x F, F = (0, -mg, 0), r = (+rx, 0, 0) => tau_z = -rx * mg < 0
  assert.ok(
    analyticalEval.overturningTorque!.z < 0,
    `Overturning torque Z (${analyticalEval.overturningTorque!.z}) must be negative for +X offset`
  );

  // Symmetrical torque check for other directions
  const evalNegX = StabilityEvaluator.evaluateStability(
    { x: -0.55, y: topPose.position.y, z: 0 },
    supportPolygon,
    topConfig.mass
  );
  assert.ok(
    evalNegX.overturningTorque!.z > 0,
    `Overturning torque Z (${evalNegX.overturningTorque!.z}) must be positive for -X offset`
  );

  const evalPosZ = StabilityEvaluator.evaluateStability(
    { x: 0, y: topPose.position.y, z: 0.55 },
    supportPolygon,
    topConfig.mass
  );
  assert.ok(
    evalPosZ.overturningTorque!.x > 0,
    `Overturning torque X (${evalPosZ.overturningTorque!.x}) must be positive for +Z offset`
  );

  const evalNegZ = StabilityEvaluator.evaluateStability(
    { x: 0, y: topPose.position.y, z: -0.55 },
    supportPolygon,
    topConfig.mass
  );
  assert.ok(
    evalNegZ.overturningTorque!.x < 0,
    `Overturning torque X (${evalNegZ.overturningTorque!.x}) must be negative for -Z offset`
  );

  const world = new SimpleTowerPhysicsWorld();
  world.addStatic([baseStone]);
  const dropResult = await world.drop(topStone, topPose);

  assert.equal(dropResult.settled, false, 'Super-critical drop must fail to settle');
  assert.equal(dropResult.collapsed, true, 'Super-critical drop must collapse');
  assert.ok(
    dropResult.pose.position.y < baseConfig.halfExtents.y * 2,
    `Tumbled stone must fall off base, got y=${dropResult.pose.position.y}`
  );
  assert.ok(
    dropResult.pose.position.x > 0.45,
    `Tumbled stone must scatter outward, got x=${dropResult.pose.position.x}`
  );
});

test('Tier 2.3 - Extreme Mass Ratio Shock (Light Top vs Heavy Top Impact)', () => {
  const testMassShock = (
    topShape: StoneShape,
    baseShape: StoneShape,
    dropX: number
  ) => {
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    world.allowSleep = true;
    (world.solver as CANNON.GSSolver).iterations = 25;
    StonePhysicsBodyFactory.configureWorldMaterials(world);
    const ground = StonePhysicsBodyFactory.createGroundBody();
    world.addBody(ground);

    const baseCfg = StonePhysicsBodyFactory.getShapeConfig(baseShape);
    const baseStone = new Stone({
      shape: baseShape,
      color: '#333333',
      pose: new Pose({ x: 0, y: baseCfg.halfExtents.y, z: 0 }),
    });
    const baseBody = StonePhysicsBodyFactory.createStoneBody(baseStone);
    world.addBody(baseBody);

    const topCfg = StonePhysicsBodyFactory.getShapeConfig(topShape);
    const topStone = new Stone({
      shape: topShape,
      color: '#777777',
      pose: new Pose({ x: dropX, y: baseCfg.halfExtents.y * 2 + topCfg.halfExtents.y + 0.1, z: 0 }),
    });
    const topBody = StonePhysicsBodyFactory.createStoneBody(topStone);
    world.addBody(topBody);

    for (let i = 0; i < 120; i++) world.step(1 / 60);

    // Verify numerical solver stability: no NaN or Inf in coordinates or velocities
    assert.ok(Number.isFinite(baseBody.position.x), 'Base position X must be finite');
    assert.ok(Number.isFinite(baseBody.position.y), 'Base position Y must be finite');
    assert.ok(Number.isFinite(topBody.position.x), 'Top position X must be finite');
    assert.ok(Number.isFinite(topBody.position.y), 'Top position Y must be finite');
    assert.ok(Number.isFinite(baseBody.velocity.length()), 'Base velocity must be finite');
    assert.ok(Number.isFinite(topBody.velocity.length()), 'Top velocity must be finite');

    return {
      baseDisplacement: Math.abs(baseBody.position.x),
      topDisplacement: topBody.position.x,
    };
  };

  // Case A: Lightweight top (pebble 0.6kg) dropped on heavy base (boulder 2.5kg)
  const lightImpact = testMassShock('pebble', 'boulder', 0.15);
  assert.ok(
    lightImpact.baseDisplacement < 0.02,
    `Heavy base must withstand lightweight impact without shifting, got dx=${lightImpact.baseDisplacement}`
  );

  // Case B: Heavy top (boulder 2.5kg) dropped on lightweight base (pebble 0.6kg) with offset
  const heavyImpact = testMassShock('boulder', 'pebble', 0.20);
  assert.ok(
    heavyImpact.topDisplacement > 0.40,
    `Heavy top dropped off-balance must slide/tumble off light base, got topX=${heavyImpact.topDisplacement}`
  );
});

test('Tier 2.4 - High Elevation Impact Drop & Anti-Tunneling Verification', async () => {
  const world = new SimpleTowerPhysicsWorld();
  const stone = new Stone({
    shape: 'boulder',
    color: '#444444',
    pose: Pose.origin(),
  });
  const dropHeight = 2.0;
  const res = await world.drop(stone, new Pose({ x: 0, y: dropHeight, z: 0 }));

  const cfg = StonePhysicsBodyFactory.getShapeConfig('boulder');
  const expectedHalfY = cfg.halfExtents.y;

  let minY = dropHeight;
  for (const frame of res.trajectory ?? []) {
    const p = frame.poses.get('dropped-stone');
    if (p && p.position.y < minY) {
      minY = p.position.y;
    }
  }

  // Anti-tunneling assertion: body must never penetrate beneath the ground plane (y = 0)
  assert.ok(
    minY > 0.05,
    `High impact drop must not tunnel through ground plane (minY=${minY.toFixed(4)} > 0.05)`
  );

  // Restitution dampening assertion: body must settle at its resting half-height
  assert.equal(res.settled, true, 'Stone dropped from 2.0m on ground must settle');
  assert.ok(
    Math.abs(res.pose.position.y - expectedHalfY) < 0.04,
    `Settled height (${res.pose.position.y.toFixed(4)}) must match expected halfY (${expectedHalfY})`
  );
});

test('Tier 2.5 - Aspect Ratio Stability (Slender Tall vs Wide Flat)', () => {
  const testAspectStability = (shapeName: 'tall' | 'flat', tiltAngleDeg: number) => {
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    StonePhysicsBodyFactory.configureWorldMaterials(world);
    const ground = StonePhysicsBodyFactory.createGroundBody();
    world.addBody(ground);

    const cfg = StonePhysicsBodyFactory.getShapeConfig(shapeName);
    const stone = new Stone({
      shape: shapeName,
      color: '#555555',
      pose: new Pose({ x: 0, y: cfg.halfExtents.y + 0.05, z: 0 }),
    });
    const body = StonePhysicsBodyFactory.createStoneBody(stone);

    const angleRad = (tiltAngleDeg * Math.PI) / 180;
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), angleRad);
    world.addBody(body);

    for (let i = 0; i < 120; i++) world.step(1 / 60);

    // Compute angle deviation from upright vector (0, 1, 0)
    const worldUp = body.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
    const finalTiltDeg =
      (Math.acos(Math.max(-1, Math.min(1, worldUp.y))) * 180) / Math.PI;

    return { finalTiltDeg, finalY: body.position.y };
  };

  // Under a 30-degree initial tilt:
  // Flat stone has low COM and wide base -> restoring torque self-rights it upright
  const flatResult = testAspectStability('flat', 30);
  assert.ok(
    flatResult.finalTiltDeg < 5.0,
    `Flat stone must self-right to upright equilibrium, got tilt=${flatResult.finalTiltDeg.toFixed(1)}°`
  );

  // Tall stone has high COM -> overturning torque topples it onto its side (90 deg)
  const tallResult = testAspectStability('tall', 30);
  assert.ok(
    tallResult.finalTiltDeg > 75.0,
    `Tall stone must topple onto its side, got tilt=${tallResult.finalTiltDeg.toFixed(1)}°`
  );
});
