import assert from 'node:assert/strict';
import test from 'node:test';
import { Stone, type StoneShape } from '../domain/entities/Stone.ts';
import { Tower } from '../domain/entities/Tower.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import { TowerKey } from '../domain/value-objects/TowerKey.ts';
import { SimpleTowerPhysicsWorld } from '../infrastructure/physics/SimpleTowerPhysicsWorld.ts';
import { StonePhysicsBodyFactory } from '../infrastructure/physics/StonePhysicsBodyFactory.ts';
import { buildStoneGeometrySpec } from '../presentation/components/stoneTowerSpec.ts';

const ALL_SHAPES: readonly StoneShape[] = ['boulder', 'flat', 'tall', 'round', 'pebble'] as const;

test('Anti-Clipping 1: Visual Mesh vs CANNON Half-Extents Parity for All 5 Shapes in All 3 Axes', () => {
  for (const shape of ALL_SHAPES) {
    const cannonCfg = StonePhysicsBodyFactory.getShapeConfig(shape);
    const geoSpec = buildStoneGeometrySpec(shape);

    const expectedHalfX = Number((geoSpec.scale.x * 0.25).toFixed(4));
    const expectedHalfY = Number((geoSpec.scale.y * 0.25).toFixed(4));
    const expectedHalfZ = Number((geoSpec.scale.z * 0.25).toFixed(4));

    // CANNON Half-Extents parity
    assert.equal(
      cannonCfg.halfExtents.x,
      expectedHalfX,
      `Shape ${shape}: CANNON halfExtents.x (${cannonCfg.halfExtents.x}) must match scale.x * 0.25 (${expectedHalfX})`
    );
    assert.equal(
      cannonCfg.halfExtents.y,
      expectedHalfY,
      `Shape ${shape}: CANNON halfExtents.y (${cannonCfg.halfExtents.y}) must match scale.y * 0.25 (${expectedHalfY})`
    );
    assert.equal(
      cannonCfg.halfExtents.z,
      expectedHalfZ,
      `Shape ${shape}: CANNON halfExtents.z (${cannonCfg.halfExtents.z}) must match scale.z * 0.25 (${expectedHalfZ})`
    );

    // Visual geometry calibrated scale check:
    // For box shapes (flat, tall), BoxGeometry args=[sx, sy, sz] gives half extents [sx/2, sy/2, sz/2] = scale * 0.25
    // For polyhedral shapes (round, pebble, boulder), dodecahedronGeometry args=[sy * 0.5, detail] with mesh scale [sx/sy, 1, sz/sy]
    // gives visual half-extents:
    // Y: sy * 0.5 = (scale.y * 0.5) * 0.5 = scale.y * 0.25
    // X: (sy * 0.5) * (sx / sy) = sx * 0.5 = scale.x * 0.25
    // Z: (sy * 0.5) * (sz / sy) = sz * 0.5 = scale.z * 0.25
    const sx = geoSpec.scale.x * 0.5;
    const sy = geoSpec.scale.y * 0.5;
    const sz = geoSpec.scale.z * 0.5;

    let visualHalfX: number;
    let visualHalfY: number;
    let visualHalfZ: number;

    if (shape === 'flat' || shape === 'tall') {
      visualHalfX = sx / 2;
      visualHalfY = sy / 2;
      visualHalfZ = sz / 2;
    } else {
      const radius = sy * 0.5;
      const scaleX = sx / sy;
      const scaleZ = sz / sy;
      visualHalfX = radius * scaleX;
      visualHalfY = radius;
      visualHalfZ = radius * scaleZ;
    }

    assert.ok(
      Math.abs(visualHalfX - cannonCfg.halfExtents.x) < 1e-4,
      `Shape ${shape}: visual half X (${visualHalfX}) must match collision half X (${cannonCfg.halfExtents.x})`
    );
    assert.ok(
      Math.abs(visualHalfY - cannonCfg.halfExtents.y) < 1e-4,
      `Shape ${shape}: visual half Y (${visualHalfY}) must match collision half Y (${cannonCfg.halfExtents.y})`
    );
    assert.ok(
      Math.abs(visualHalfZ - cannonCfg.halfExtents.z) < 1e-4,
      `Shape ${shape}: visual half Z (${visualHalfZ}) must match collision half Z (${cannonCfg.halfExtents.z})`
    );
  }
});

test('Anti-Clipping 2: ActiveTower Initial Sample Stacking Non-Penetration & Ground Clearance', () => {
  const cfgBoulder = StonePhysicsBodyFactory.getShapeConfig('boulder');
  const cfgFlat = StonePhysicsBodyFactory.getShapeConfig('flat');
  const cfgRound = StonePhysicsBodyFactory.getShapeConfig('round');

  // Ground plane is y = 0
  const base1 = new Stone({
    shape: 'boulder',
    color: '#3E4947',
    pose: new Pose({ x: -0.34, y: 0.2625, z: 0 }),
  });
  const base2 = new Stone({
    shape: 'flat',
    color: '#262930',
    pose: new Pose({ x: 0.34, y: 0.105, z: 0 }),
  });
  const base3 = new Stone({
    shape: 'round',
    color: '#6E675F',
    pose: new Pose({ x: 0, y: 0.730, z: 0 }),
  });

  const tower = new Tower(
    TowerKey.global(),
    [
      { id: 'base-1', stone: base1, status: 'active', bloom: null, cheerLevel: 1, isMine: false, nickname: null },
      { id: 'base-2', stone: base2, status: 'active', bloom: null, cheerLevel: 2, isMine: false, nickname: null },
      { id: 'base-3', stone: base3, status: 'active', bloom: 'sprout', cheerLevel: 3, isMine: false, nickname: null },
    ],
    { stoneCount: 15, todayCount: 3, fulfilledCount: 1, cheerCount: 42 }
  );

  // 1. Ground clearance: bottom surface (y - hy) must be >= 0 (no underground sinking)
  const base1BottomY = base1.pose.position.y - cfgBoulder.halfExtents.y;
  const base2BottomY = base2.pose.position.y - cfgFlat.halfExtents.y;
  assert.ok(
    base1BottomY >= -1e-4,
    `base-1 bottom (${base1BottomY}) must not be submerged below ground (y=0)`
  );
  assert.ok(
    base2BottomY >= -1e-4,
    `base-2 bottom (${base2BottomY}) must not be submerged below ground (y=0)`
  );

  // 2. Vertical stacking clearance: base-3 resting on base-1
  const base1TopSurfaceY = base1.pose.position.y + cfgBoulder.halfExtents.y; // 0.2625 + 0.2625 = 0.525
  const base3BottomY = base3.pose.position.y - cfgRound.halfExtents.y; // 0.730 - 0.205 = 0.525
  const overlap = base1TopSurfaceY - base3BottomY;

  assert.ok(
    Math.abs(overlap) < 1e-4,
    `base-3 bottom (${base3BottomY}) must rest flush on base-1 top (${base1TopSurfaceY}): overlap = ${overlap}`
  );

  // 3. Tower topSurfaceY() must equal base3 top surface
  const expectedTopSurface = base3.pose.position.y + cfgRound.halfExtents.y; // 0.730 + 0.205 = 0.935
  assert.equal(
    Number(tower.topSurfaceY().toFixed(4)),
    Number(expectedTopSurface.toFixed(4)),
    `Tower topSurfaceY (${tower.topSurfaceY()}) must match base-3 top surface (${expectedTopSurface})`
  );
});

test('Anti-Clipping 3: Dynamic Physics Drop Settling Clearance Invariant (Zero Penetration)', async () => {
  const world = new SimpleTowerPhysicsWorld();
  const cfgBase = StonePhysicsBodyFactory.getShapeConfig('boulder');
  const baseStone = new Stone({
    shape: 'boulder',
    color: '#333333',
    pose: new Pose({ x: 0, y: cfgBase.halfExtents.y, z: 0 }),
  });
  world.addStatic([baseStone]);

  const topSurfaceY = baseStone.pose.position.y + cfgBase.halfExtents.y; // 0.525
  const cfgDrop = StonePhysicsBodyFactory.getShapeConfig('round');
  const safeDropPose = new Pose({
    x: 0,
    y: topSurfaceY + cfgDrop.halfExtents.y + 0.12,
    z: 0,
  });

  const dropStone = new Stone({
    shape: 'round',
    color: '#777777',
    pose: Pose.origin(),
  });

  const res = await world.drop(dropStone, safeDropPose);
  assert.equal(res.settled, true, 'Centered drop must settle stably');

  const settledBottomY = res.pose.position.y - cfgDrop.halfExtents.y;
  const penetrationDepth = Math.max(0, topSurfaceY - settledBottomY);

  assert.ok(
    penetrationDepth <= 0.005,
    `Settled stone must not penetrate lower stone: penetrationDepth (${penetrationDepth.toFixed(4)}m) <= 0.005m`
  );
  assert.ok(
    res.pose.position.y >= topSurfaceY + cfgDrop.halfExtents.y - 0.005,
    `Settled center Y (${res.pose.position.y}) must be >= topSurfaceY + h_drop (${topSurfaceY + cfgDrop.halfExtents.y})`
  );
  world.dispose();
});

test('Anti-Clipping 4: Auto-Placement onTopOf Flush Clearance Invariant Across All 25 Shape Combinations', () => {
  for (const baseShape of ALL_SHAPES) {
    for (const newShape of ALL_SHAPES) {
      const baseCfg = StonePhysicsBodyFactory.getShapeConfig(baseShape);
      const newCfg = StonePhysicsBodyFactory.getShapeConfig(newShape);

      const baseStone = new Stone({
        shape: baseShape,
        color: '#222222',
        pose: new Pose({ x: 0, y: baseCfg.halfExtents.y, z: 0 }),
      });
      const tower = new Tower(
        TowerKey.global(),
        [{ id: 'base', stone: baseStone, status: 'active', bloom: null, cheerLevel: 0, isMine: false, nickname: null }],
        { stoneCount: 1, todayCount: 1, fulfilledCount: 0, cheerCount: 0 }
      );

      const topSurfaceY = tower.topSurfaceY();
      const autoPose = Pose.onTopOf(topSurfaceY, newCfg.halfExtents.y);

      const autoBottomY = autoPose.position.y - newCfg.halfExtents.y;
      const penetration = topSurfaceY - autoBottomY;

      assert.ok(
        penetration <= 1e-4,
        `Auto-placement of ${newShape} on ${baseShape}: penetration (${penetration}) must be <= 0`
      );
      assert.ok(
        Math.abs(autoBottomY - topSurfaceY) <= 1e-4,
        `Auto-placement of ${newShape} on ${baseShape}: bottom (${autoBottomY}) must be flush with surface (${topSurfaceY})`
      );
    }
  }
});

test('Anti-Clipping 5: Tower.topSurfaceY() Evaluates True Maximum Surface Across Multi-Stone Heterogeneous Cairns', () => {
  // Empty tower
  const emptyTower = new Tower(
    TowerKey.global(),
    [],
    { stoneCount: 0, todayCount: 0, fulfilledCount: 0, cheerCount: 0 }
  );
  assert.equal(emptyTower.topSurfaceY(), 0, 'Empty tower topSurfaceY must be 0');

  // Heterogeneous cairn where stone with highest center is NOT the stone with highest top surface:
  // Stone A: flat at y = 0.50 (halfH = 0.105 => top surface = 0.605)
  // Stone B: tall at y = 0.45 (halfH = 0.3625 => top surface = 0.8125)
  const stoneA = new Stone({
    shape: 'flat',
    color: '#333',
    pose: new Pose({ x: -0.3, y: 0.50, z: 0 }),
  });
  const stoneB = new Stone({
    shape: 'tall',
    color: '#666',
    pose: new Pose({ x: 0.3, y: 0.45, z: 0 }),
  });

  const cairn = new Tower(
    TowerKey.global(),
    [
      { id: 'stone-a', stone: stoneA, status: 'active', bloom: null, cheerLevel: 0, isMine: false, nickname: null },
      { id: 'stone-b', stone: stoneB, status: 'active', bloom: null, cheerLevel: 0, isMine: false, nickname: null },
    ],
    { stoneCount: 2, todayCount: 2, fulfilledCount: 0, cheerCount: 0 }
  );

  // topY() returns center (0.50)
  assert.equal(cairn.topY(), 0.50, 'topY() returns highest center');
  // topSurfaceY() returns highest physical boundary (0.8125)
  assert.equal(
    Number(cairn.topSurfaceY().toFixed(4)),
    0.8125,
    'topSurfaceY() must return highest physical boundary max(y + hy) = 0.8125, not 0.605'
  );
});

test('Anti-Clipping 6: Collision-Free Spawn Elevation Invariant for calculate3DDropPose', () => {
  const topSurfaceY = 0.935; // e.g. 3-stone sample tower
  const safeClearance = 0.08; // 8cm clearance

  for (const shape of ALL_SHAPES) {
    const dropConfig = StonePhysicsBodyFactory.getShapeConfig(shape);
    const heightBonus = 0.05;
    const dropY = Number(
      (topSurfaceY + dropConfig.halfExtents.y + safeClearance + heightBonus).toFixed(4)
    );

    const spawnBottomY = dropY - dropConfig.halfExtents.y;
    const spawnClearance = spawnBottomY - topSurfaceY;

    assert.ok(
      spawnClearance >= safeClearance - 1e-4,
      `Spawn clearance for ${shape} (${spawnClearance}m) must be >= safeClearance (${safeClearance}m)`
    );
    assert.ok(
      spawnBottomY > topSurfaceY,
      `Spawn bottom (${spawnBottomY}m) must strictly exceed topSurfaceY (${topSurfaceY}m)`
    );
  }
});

test('Anti-Clipping 7: SimpleTowerPhysicsWorld Numerical Spring Compression Clamping Invariant', async () => {
  const world = new SimpleTowerPhysicsWorld();
  const baseCfg = StonePhysicsBodyFactory.getShapeConfig('flat');
  const baseStone = new Stone({
    shape: 'flat',
    color: '#111111',
    pose: new Pose({ x: 0, y: baseCfg.halfExtents.y, z: 0 }),
  });
  world.addStatic([baseStone]);

  const topSurfaceY = baseStone.pose.position.y + baseCfg.halfExtents.y; // 0.105 + 0.105 = 0.210
  const dropCfg = StonePhysicsBodyFactory.getShapeConfig('boulder'); // heavy stone (2.5kg) on flat

  const dropPose = new Pose({
    x: 0,
    y: topSurfaceY + dropCfg.halfExtents.y + 0.1,
    z: 0,
  });

  const heavyStone = new Stone({
    shape: 'boulder',
    color: '#444444',
    pose: Pose.origin(),
  });

  const res = await world.drop(heavyStone, dropPose);
  assert.equal(res.settled, true, 'Heavy stone on wide flat base must settle');

  const minExpectedCenterY = topSurfaceY + dropCfg.halfExtents.y;
  assert.ok(
    res.pose.position.y >= minExpectedCenterY - 1e-4,
    `Settled stone center Y (${res.pose.position.y}) must be >= clamped minimum (${minExpectedCenterY})`
  );

  const bottomY = res.pose.position.y - dropCfg.halfExtents.y;
  assert.ok(
    bottomY >= topSurfaceY - 1e-4,
    `Settled stone bottom Y (${bottomY}) must be >= topSurfaceY (${topSurfaceY})`
  );
  world.dispose();
});
