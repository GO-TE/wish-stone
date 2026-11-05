import assert from 'node:assert/strict';
import test from 'node:test';
import * as CANNON from 'cannon-es';
import { createMsaAppContainer } from '../container.ts';
import { Stone } from '../domain/entities/Stone.ts';
import { Tower } from '../domain/entities/Tower.ts';
import { type VisualEffectEvent } from '../domain/ports/EffectBus.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import { TowerKey } from '../domain/value-objects/TowerKey.ts';
import { SimpleTowerPhysicsWorld } from '../infrastructure/physics/SimpleTowerPhysicsWorld.ts';
import { StonePhysicsBodyFactory } from '../infrastructure/physics/StonePhysicsBodyFactory.ts';
import { StackStoneController } from '../presentation/controllers/StackStoneController.ts';

/**
 * ============================================================================
 * Tier 3: Cross-Feature Integration & Stacking Flows
 * Target Features: F04, F06, F07, F13
 * ============================================================================
 */

test('Tier 3.1 - Sequential Stacking Sequence & Tower Height Composite', async () => {
  const cfg1 = StonePhysicsBodyFactory.getShapeConfig('boulder');
  const cfg2 = StonePhysicsBodyFactory.getShapeConfig('round');
  const cfg3 = StonePhysicsBodyFactory.getShapeConfig('pebble');

  // Base stone resting on ground
  const s1 = new Stone({
    shape: 'boulder',
    color: '#303030',
    pose: new Pose({ x: 0, y: cfg1.halfExtents.y, z: 0 }),
  });

  // Mid stone stacked on base
  const s2 = new Stone({
    shape: 'round',
    color: '#505050',
    pose: new Pose({ x: 0, y: cfg1.halfExtents.y * 2 + cfg2.halfExtents.y, z: 0 }),
  });

  const world = new SimpleTowerPhysicsWorld();
  world.addStatic([s1, s2]);

  // Drop 3rd stone (pebble) gently from slightly above s2
  const dropPose = new Pose({
    x: 0,
    y: cfg1.halfExtents.y * 2 + cfg2.halfExtents.y * 2 + cfg3.halfExtents.y + 0.05,
    z: 0,
  });
  const s3 = new Stone({
    shape: 'pebble',
    color: '#707070',
    pose: Pose.origin(),
  });

  const res = await world.drop(s3, dropPose);

  assert.equal(res.settled, true, 'Pebble dropped centered must settle on tower');
  assert.equal(res.collapsed, false, 'Centered drop must not collapse');

  // Verify composite tower height matches sum of stone thicknesses
  const expectedTotalHeight =
    cfg1.halfExtents.y * 2 + cfg2.halfExtents.y * 2 + cfg3.halfExtents.y * 2;
  const actualTopSurfaceY = res.pose.position.y + cfg3.halfExtents.y;

  assert.ok(
    Math.abs(actualTopSurfaceY - expectedTotalHeight) < 0.05,
    `Composite tower top surface (${actualTopSurfaceY.toFixed(3)}) must match sum of thicknesses (${expectedTotalHeight.toFixed(3)})`
  );
});

test('Tier 3.2 - Cascading Momentum Transfer in Multi-Stone Collapse', async () => {
  const base = new Stone({
    shape: 'boulder',
    color: '#111111',
    pose: new Pose({ x: 0, y: 0.2625, z: 0 }),
  });
  const mid = new Stone({
    shape: 'round',
    color: '#222222',
    pose: new Pose({ x: 0, y: 0.55, z: 0 }),
  });
  const top = new Stone({
    shape: 'flat',
    color: '#333333',
    pose: new Pose({ x: 0, y: 0.85, z: 0 }),
  });

  const world = new SimpleTowerPhysicsWorld();
  world.addStatic([base, mid, top]);

  // Heavy boulder dropped with lateral offset to trigger cascading dynamic collapse
  const dropStone = new Stone({
    shape: 'boulder',
    color: '#444444',
    pose: Pose.origin(),
  });
  const dropPose = new Pose({ x: 0.40, y: 1.30, z: 0 });

  const res = await world.drop(dropStone, dropPose);

  assert.equal(res.collapsed, true, 'Off-balance drop must trigger collapse');
  assert.equal(res.settled, false, 'Off-balance drop must not settle');
  assert.ok(
    (res.affectedStones?.length ?? 0) >= 1,
    `Lower tower stones must participate in collapse without freezing, affected count: ${res.affectedStones?.length}`
  );
});

test('Tier 3.3 - 3-Attempt Controller Flow & State Machine Integration', async () => {
  const fetchFn = async () => ({
    ok: true,
    status: 201,
    json: async () => ({
      id: 'wish-auto-placed-1',
      authorId: 'test-user',
      content: '컨트롤러 연동 테스트 소원',
      category: 'health',
      bloomColor: '#309060',
      stone: {
        id: 'stone-auto-1',
        shape: 'round',
        color: '#556677',
        pose: {
          position: { x: 0, y: 0.5, z: 0 },
          rotation: { qx: 0, qy: 0, qz: 0, qw: 1 },
        },
      },
      cheerCount: 0,
      isFulfilled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  });

  const container = createMsaAppContainer(
    'http://localhost:8080',
    fetchFn as unknown as typeof globalThis.fetch
  );
  const controller = new StackStoneController(container);

  const initialTower = new Tower(
    TowerKey.global(),
    [
      {
        id: 'existing-stone-1',
        stone: new Stone({
          shape: 'round',
          color: '#808080',
          pose: new Pose({ x: 0, y: 0.25, z: 0 }),
        }),
        status: 'active',
        bloom: null,
        cheerLevel: 0,
        isMine: false,
        nickname: null,
      },
    ],
    { stoneCount: 1, todayCount: 1, fulfilledCount: 0, cheerCount: 0 }
  );

  controller.updateContent('컨트롤러 연동 테스트 소원');
  assert.equal(
    controller.getState().attempt,
    0,
    'Initial attempt count must be 0'
  );

  // Attempt 1: Failed drop outside stability radius
  const offCenterPose1 = new Pose({ x: 2.5, y: 1.0, z: 0 });
  const result1 = await controller.placeStone(initialTower, offCenterPose1);
  assert.equal(result1.status, 'retry', 'Attempt 1 must fail due to offset');
  assert.equal(
    controller.getState().attempt,
    1,
    'Attempt count must increment to 1'
  );
  assert.equal(controller.getState().phase, 'COLLAPSING', 'Phase must be COLLAPSING on failed drop');
  assert.ok(controller.getState().lastSimulationTrajectory !== undefined, 'Simulation trajectory must be saved');

  // Attempt 2: Failed drop outside stability radius
  const offCenterPose2 = new Pose({ x: -2.5, y: 1.0, z: 0 });
  const result2 = await controller.placeStone(initialTower, offCenterPose2);
  assert.equal(result2.status, 'retry', 'Attempt 2 must fail due to offset');
  assert.equal(
    controller.getState().attempt,
    2,
    'Attempt count must increment to 2'
  );
  assert.equal(controller.getState().phase, 'COLLAPSING', 'Phase must remain COLLAPSING on 2nd failed drop');

  // Attempt 3: 3rd attempt triggers automatic stable placement
  const offCenterPose3 = new Pose({ x: 2.5, y: 1.0, z: 0 });
  const result3 = await controller.placeStone(initialTower, offCenterPose3);
  assert.equal(
    result3.status,
    'saved',
    'Attempt 3 must auto-settle upon 3rd failure'
  );
  assert.equal(controller.getState().phase, 'SETTLED', 'Phase must transition to SETTLED upon auto-placement');
  if (result3.status === 'saved') {
    assert.equal(result3.autoPlaced, true, 'Result must be marked autoPlaced');
  }
});

test('Tier 3.4 - Visual Effect Bus Collapse Event Emission', async () => {
  const container = createMsaAppContainer();
  const capturedEvents: VisualEffectEvent[] = [];
  container.effects.subscribe((event) => capturedEvents.push(event));

  const controller = new StackStoneController(container);
  const sampleTower = new Tower(
    TowerKey.global(),
    [
      {
        id: 'stone-1',
        stone: new Stone({
          shape: 'round',
          color: '#707070',
          pose: new Pose({ x: 0, y: 0.25, z: 0 }),
        }),
        status: 'active',
        bloom: null,
        cheerLevel: 0,
        isMine: false,
        nickname: null,
      },
    ],
    { stoneCount: 1, todayCount: 1, fulfilledCount: 0, cheerCount: 0 }
  );

  controller.updateContent('무너짐 이펙트 발행 테스트');
  const offCenterDrop = new Pose({ x: 3.0, y: 1.0, z: 0 });
  await controller.placeStone(sampleTower, offCenterDrop);

  const collapseEvents = capturedEvents.filter(
    (e) => e.type === 'tower_collapsed'
  );
  assert.ok(
    collapseEvents.length >= 1,
    'At least one tower_collapsed event must be published on EffectBus'
  );
  const event = collapseEvents[0];
  if (event.type === 'tower_collapsed') {
    assert.equal(
      event.reason,
      'drop_failed',
      'Event reason must be drop_failed'
    );
    assert.ok(
      event.affectedStoneCount >= 1,
      `Affected stone count (${event.affectedStoneCount}) must be >= 1`
    );
    assert.ok(event.trajectory !== undefined, 'Event trajectory must be populated');
    assert.ok(event.trajectory!.length > 0, 'Event trajectory must have recorded frames');
  }
});

/**
 * ============================================================================
 * Tier 4: Real-World Scenarios & Anti-Canned Verification
 * Target Features: F04, F05, F14
 * ============================================================================
 */

test('Tier 4.1 - Canonical 3-Stone Natural Cairn (Boulder Base + Round Mid + Pebble Cap)', () => {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.allowSleep = true;
  (world.solver as CANNON.GSSolver).iterations = 25;
  StonePhysicsBodyFactory.configureWorldMaterials(world);
  const ground = StonePhysicsBodyFactory.createGroundBody();
  world.addBody(ground);

  const cfg1 = StonePhysicsBodyFactory.getShapeConfig('boulder');
  const cfg2 = StonePhysicsBodyFactory.getShapeConfig('round');
  const cfg3 = StonePhysicsBodyFactory.getShapeConfig('pebble');

  const base = StonePhysicsBodyFactory.createStoneBody(
    new Stone({
      shape: 'boulder',
      color: '#333',
      pose: new Pose({ x: 0, y: cfg1.halfExtents.y, z: 0 }),
    })
  );
  world.addBody(base);

  const mid = StonePhysicsBodyFactory.createStoneBody(
    new Stone({
      shape: 'round',
      color: '#555',
      pose: new Pose({ x: 0, y: cfg1.halfExtents.y * 2 + cfg2.halfExtents.y, z: 0 }),
    })
  );
  world.addBody(mid);

  const cap = StonePhysicsBodyFactory.createStoneBody(
    new Stone({
      shape: 'pebble',
      color: '#777',
      pose: new Pose({
        x: 0,
        y: cfg1.halfExtents.y * 2 + cfg2.halfExtents.y * 2 + cfg3.halfExtents.y,
        z: 0,
      }),
    })
  );
  world.addBody(cap);

  const initialBaseY = base.position.y;
  const initialMidY = mid.position.y;
  const initialCapY = cap.position.y;

  // Step 180 frames (3.0 seconds of simulation)
  for (let i = 0; i < 180; i++) {
    world.step(1 / 60);
  }

  // Static equilibrium check over 180 steps
  assert.ok(
    Math.abs(base.position.y - initialBaseY) < 0.005,
    `Base height drift (${Math.abs(base.position.y - initialBaseY)}) must be < 5mm`
  );
  assert.ok(
    Math.abs(mid.position.y - initialMidY) < 0.005,
    `Mid stone height drift (${Math.abs(mid.position.y - initialMidY)}) must be < 5mm`
  );
  assert.ok(
    Math.abs(cap.position.y - initialCapY) < 0.005,
    `Capstone height drift (${Math.abs(cap.position.y - initialCapY)}) must be < 5mm`
  );

  // Linear and angular velocities must remain near zero
  assert.ok(
    base.velocity.length() < 0.01,
    'Base stone velocity must remain < 0.01'
  );
  assert.ok(
    mid.velocity.length() < 0.01,
    'Mid stone velocity must remain < 0.01'
  );
  assert.ok(
    cap.velocity.length() < 0.01,
    'Capstone velocity must remain < 0.01'
  );
});

test('Tier 4.2 - Canonical 5-Stone Pyramid Cairn (Multi-Contact Static Equilibrium)', () => {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.allowSleep = true;
  (world.solver as CANNON.GSSolver).iterations = 25;
  StonePhysicsBodyFactory.configureWorldMaterials(world);
  const ground = StonePhysicsBodyFactory.createGroundBody();
  world.addBody(ground);

  const flatCfg = StonePhysicsBodyFactory.getShapeConfig('flat');
  const roundCfg = StonePhysicsBodyFactory.getShapeConfig('round');
  const pebbleCfg = StonePhysicsBodyFactory.getShapeConfig('pebble');

  // 2 Base flat stones placed side by side at x = -0.28, +0.28
  const b1 = StonePhysicsBodyFactory.createStoneBody(
    new Stone({
      shape: 'flat',
      color: '#333',
      pose: new Pose({ x: -0.28, y: flatCfg.halfExtents.y, z: 0 }),
    })
  );
  const b2 = StonePhysicsBodyFactory.createStoneBody(
    new Stone({
      shape: 'flat',
      color: '#333',
      pose: new Pose({ x: 0.28, y: flatCfg.halfExtents.y, z: 0 }),
    })
  );
  world.addBody(b1);
  world.addBody(b2);

  // 2 Middle round stones spanning across bases at x = -0.25, +0.25
  const m1 = StonePhysicsBodyFactory.createStoneBody(
    new Stone({
      shape: 'round',
      color: '#555',
      pose: new Pose({
        x: -0.25,
        y: flatCfg.halfExtents.y * 2 + roundCfg.halfExtents.y,
        z: 0,
      }),
    })
  );
  const m2 = StonePhysicsBodyFactory.createStoneBody(
    new Stone({
      shape: 'round',
      color: '#555',
      pose: new Pose({
        x: 0.25,
        y: flatCfg.halfExtents.y * 2 + roundCfg.halfExtents.y,
        z: 0,
      }),
    })
  );
  world.addBody(m1);
  world.addBody(m2);

  // 1 Pebble capstone centered at x = 0 spanning the two middle stones
  const cap = StonePhysicsBodyFactory.createStoneBody(
    new Stone({
      shape: 'pebble',
      color: '#777',
      pose: new Pose({
        x: 0,
        y: flatCfg.halfExtents.y * 2 + roundCfg.halfExtents.y * 2 + pebbleCfg.halfExtents.y,
        z: 0,
      }),
    })
  );
  world.addBody(cap);

  for (let i = 0; i < 180; i++) world.step(1 / 60);

  // Multi-contact equilibrium verification: all stones remain supported without collapsing
  assert.ok(
    Math.abs(b1.position.y - flatCfg.halfExtents.y) < 0.01,
    'Base 1 stone must remain supported'
  );
  assert.ok(
    Math.abs(b2.position.y - flatCfg.halfExtents.y) < 0.01,
    'Base 2 stone must remain supported'
  );
  assert.ok(
    m1.position.y > flatCfg.halfExtents.y,
    'Mid 1 stone must remain above base stones'
  );
  assert.ok(
    m2.position.y > flatCfg.halfExtents.y,
    'Mid 2 stone must remain above base stones'
  );
  assert.ok(
    cap.position.y > m1.position.y,
    'Capstone must remain supported at pyramid peak'
  );
  assert.ok(
    cap.velocity.length() < 0.02,
    'Capstone velocity must damp to resting equilibrium'
  );
});

test('Tier 4.3 - Intentional Dynamic Tumble Kinematics & Radial Ground Scatter', async () => {
  const world = new SimpleTowerPhysicsWorld();
  const base = new Stone({
    shape: 'boulder',
    color: '#111111',
    pose: new Pose({ x: 0, y: 0.2625, z: 0 }),
  });
  const mid = new Stone({
    shape: 'round',
    color: '#222222',
    pose: new Pose({ x: 0, y: 0.55, z: 0 }),
  });
  world.addStatic([base, mid]);

  const top = new Stone({
    shape: 'boulder',
    color: '#444444',
    pose: Pose.origin(),
  });
  const res = await world.drop(top, new Pose({ x: 0.45, y: 1.1, z: 0 }));

  // Extract peak angular rotation from trajectory frames
  let peakAngularSpeed = 0;
  const frames = res.trajectory ?? [];
  for (let i = 0; i < frames.length - 1; i++) {
    const p1 = frames[i].poses.get('dropped-stone');
    const p2 = frames[i + 1].poses.get('dropped-stone');
    if (p1 && p2) {
      const dot = Math.abs(
        p1.rotation.qx * p2.rotation.qx +
        p1.rotation.qy * p2.rotation.qy +
        p1.rotation.qz * p2.rotation.qz +
        p1.rotation.qw * p2.rotation.qw
      );
      const clampedDot = Math.min(1, Math.max(-1, dot));
      const angleRad = 2 * Math.acos(clampedDot);
      const dt = frames[i + 1].time - frames[i].time || (1 / 60);
      const omega = angleRad / dt;
      if (omega > peakAngularSpeed) {
        peakAngularSpeed = omega;
      }
    }
  }

  // Refutes canned 2D translation: tumbling stone must exhibit genuine high 3D angular rotation
  assert.ok(
    peakAngularSpeed > 1.5,
    `Peak angular speed (${peakAngularSpeed.toFixed(2)} rad/s) must exceed 1.5 rad/s during tumble`
  );

  // Radial scatter: stone must tumble off the base and scatter across ground plane
  const radialScatter = Math.hypot(res.pose.position.x, res.pose.position.z);
  assert.ok(
    radialScatter > 0.50,
    `Radial ground scatter distance (${radialScatter.toFixed(3)}m) must exceed 0.50m`
  );
  assert.ok(
    res.pose.position.y < 0.35,
    `Fallen stone must land on ground plane, got y=${res.pose.position.y.toFixed(3)}`
  );
});

test('Tier 4.4 - 4-Direction Anti-Canned Animation Perturbation Signature Test', async () => {
  const base = new Stone({
    shape: 'boulder',
    color: '#111111',
    pose: new Pose({ x: 0, y: 0.2625, z: 0 }),
  });

  const simulateDirectionalDrop = async (offsetX: number, offsetZ: number) => {
    const world = new SimpleTowerPhysicsWorld();
    world.addStatic([base]);
    const top = new Stone({
      shape: 'round',
      color: '#444444',
      pose: Pose.origin(),
    });
    const res = await world.drop(top, new Pose({ x: offsetX, y: 0.85, z: offsetZ }));
    return { x: res.pose.position.x, z: res.pose.position.z };
  };

  const resEast = await simulateDirectionalDrop(+0.45, 0);
  const resWest = await simulateDirectionalDrop(-0.45, 0);
  const resNorth = await simulateDirectionalDrop(0, +0.45);
  const resSouth = await simulateDirectionalDrop(0, -0.45);

  // 1. Directional momentum correlation: Drop direction strictly dictates scatter direction
  assert.ok(
    resEast.x > 0.45,
    `East drop (+X) must scatter in +X direction, got x=${resEast.x.toFixed(3)}`
  );
  assert.ok(
    resWest.x < -0.45,
    `West drop (-X) must scatter in -X direction, got x=${resWest.x.toFixed(3)}`
  );
  assert.ok(
    resNorth.z > 0.45,
    `North drop (+Z) must scatter in +Z direction, got z=${resNorth.z.toFixed(3)}`
  );
  assert.ok(
    resSouth.z < -0.45,
    `South drop (-Z) must scatter in -Z direction, got z=${resSouth.z.toFixed(3)}`
  );

  // 2. Trajectory non-identity: All 4 collapse endpoints must be mutually non-identical (> 0.8m apart)
  const outcomes = [
    { name: 'East', ...resEast },
    { name: 'West', ...resWest },
    { name: 'North', ...resNorth },
    { name: 'South', ...resSouth },
  ];
  for (let i = 0; i < outcomes.length; i++) {
    for (let j = i + 1; j < outcomes.length; j++) {
      const dist = Math.hypot(
        outcomes[i].x - outcomes[j].x,
        outcomes[i].z - outcomes[j].z
      );
      assert.ok(
        dist > 0.8,
        `Pairwise distance between ${outcomes[i].name} and ${outcomes[j].name} (${dist.toFixed(3)}m) must exceed 0.8m to refute canned animations`
      );
    }
  }
});

test('Tier 4.5 - Dynamic Settling Duration Variance Test', async () => {
  const countSettlingSteps = async (dropHeight: number) => {
    const world = new SimpleTowerPhysicsWorld();
    const stone = new Stone({
      shape: 'round',
      color: '#444444',
      pose: Pose.origin(),
    });
    const res = await world.drop(stone, new Pose({ x: 0, y: dropHeight, z: 0 }));
    return res.trajectory?.length ?? 0;
  };

  const stepsLow = await countSettlingSteps(0.35);
  const stepsHigh = await countSettlingSteps(2.5);
  const deltaSteps = stepsHigh - stepsLow;

  // Refutes static timer mocks (e.g. setTimeout(3000)):
  // Physical settling duration must strictly vary as a function of impact energy and bounce cycles
  assert.ok(
    deltaSteps > 20,
    `Settling duration difference (${deltaSteps} steps) must exceed 20 steps (low=${stepsLow}, high=${stepsHigh})`
  );
});
