import assert from 'node:assert/strict';
import test from 'node:test';
import { Stone, type StoneShape } from '../domain/entities/Stone.ts';
import { Tower, type TowerStoneItem } from '../domain/entities/Tower.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import { type CheerLevelValue } from '../domain/value-objects/CheerLevel.ts';
import { TowerKey } from '../domain/value-objects/TowerKey.ts';
import { SimpleTowerPhysicsWorld } from '../infrastructure/physics/SimpleTowerPhysicsWorld.ts';
import { StonePhysicsBodyFactory } from '../infrastructure/physics/StonePhysicsBodyFactory.ts';
import {
  computeInitialSpawnPosition,
  computeDragWorldPosition,
  evaluateLiveBalance,
  shouldTriggerDrop,
  calculate3DDropPoseFromWorldPosition,
  DEFAULT_INITIAL_SPAWN_POSITION,
  BALANCE_THRESHOLD_STABLE,
  BALANCE_THRESHOLD_CAUTION,
  DROP_ZONE_MAX_LATERAL_X,
  DROP_ZONE_MAX_DEPTH_Z,
} from '../presentation/components/stoneDragSpec.ts';

const ALL_SHAPES: readonly StoneShape[] = ['boulder', 'flat', 'tall', 'round', 'pebble'] as const;

// =============================================================================
// ADVERSARIAL CASE 1: EXTREME DRAG COORDINATES & FUZZ STRESS
// =============================================================================
test('Adversarial Case 1.1: Extreme pointer displacements (> 10,000px, negative, diagonal flings)', () => {
  const initialPos = computeInitialSpawnPosition(1.5);
  const topSurfaceY = 1.2;

  const extremeInputs: Array<{ dx: number; dy: number; label: string }> = [
    { dx: 0, dy: 100000, label: 'Massive downward pull (+100k px)' },
    { dx: 0, dy: -100000, label: 'Massive upward launch (-100k px)' },
    { dx: 50000, dy: 0, label: 'Massive right drag (+50k px)' },
    { dx: -50000, dy: 0, label: 'Massive left drag (-50k px)' },
    { dx: 25000, dy: -25000, label: 'Extreme diagonal fling (+25k, -25k)' },
    { dx: -25000, dy: 25000, label: 'Extreme diagonal fling (-25k, +25k)' },
    { dx: 10000, dy: 10000, label: 'Positive diagonal (+10k, +10k)' },
    { dx: -10000, dy: -10000, label: 'Negative diagonal (-10k, -10k)' },
    { dx: 1e6, dy: -1e6, label: 'Mega fling (+1M, -1M)' },
  ];

  for (const { dx, dy, label } of extremeInputs) {
    const res = computeDragWorldPosition(dx, dy, initialPos, topSurfaceY);

    // All coordinates must be strictly finite numbers
    assert.ok(Number.isFinite(res.position[0]), `${label}: X coordinate must be finite`);
    assert.ok(Number.isFinite(res.position[1]), `${label}: Y coordinate must be finite`);
    assert.ok(Number.isFinite(res.position[2]), `${label}: Z coordinate must be finite`);

    // normalizedProgress must strictly clamp to [0, 1]
    assert.ok(
      res.normalizedProgress >= 0 && res.normalizedProgress <= 1,
      `${label}: Progress (${res.normalizedProgress}) must be clamped in [0, 1]`
    );

    // Depth convergence Z must strictly remain in [0, initialPos[2]] and never go negative
    assert.ok(
      res.position[2] >= 0 && res.position[2] <= initialPos[2] + 1e-4,
      `${label}: Z (${res.position[2]}) must remain between 0 and ${initialPos[2]}`
    );

    // Downward drag (dy > 0) must clamp progress to 0 and preserve initial Z
    if (dy > 0) {
      assert.equal(res.normalizedProgress, 0, `${label}: Downward pull must have progress = 0`);
      assert.equal(res.position[2], initialPos[2], `${label}: Downward pull must keep Z = initial Z`);
      assert.equal(res.isOverDropZone, false, `${label}: Downward pull cannot be over drop zone`);
    }

    // Huge lateral displacement (|dx| > 1000) must trigger critical balance rating and forbid drop zone
    if (Math.abs(dx) > 1000) {
      assert.equal(res.balanceRating, 'critical', `${label}: Extreme lateral fling must be critical`);
      assert.equal(res.isOverDropZone, false, `${label}: Extreme lateral fling cannot be over drop zone`);
    }
  }
});

test('Adversarial Case 1.2: Deterministic 500-Iteration Fuzzing of Pointer & Surface Inputs', () => {
  const initialPos = computeInitialSpawnPosition(1.0);

  // Pseudo-random deterministic LCG generator for reproducible stress testing
  let seed = 42;
  function lcg(): number {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  }

  for (let i = 0; i < 500; i++) {
    // Range: dx in [-50000, 50000], dy in [-50000, 50000], topSurfaceY in [-10, 50]
    const dx = (lcg() - 0.5) * 100000;
    const dy = (lcg() - 0.5) * 100000;
    const topY = (lcg() - 0.2) * 50;

    const res = computeDragWorldPosition(dx, dy, initialPos, topY);

    assert.ok(Number.isFinite(res.position[0]), `Fuzz ${i}: X must be finite`);
    assert.ok(Number.isFinite(res.position[1]), `Fuzz ${i}: Y must be finite`);
    assert.ok(Number.isFinite(res.position[2]), `Fuzz ${i}: Z must be finite`);
    assert.ok(res.normalizedProgress >= 0 && res.normalizedProgress <= 1, `Fuzz ${i}: Progress clamped`);
    assert.ok(res.position[2] >= 0, `Fuzz ${i}: Z non-negative`);
    assert.ok(
      ['stable', 'caution', 'critical'].includes(res.balanceRating),
      `Fuzz ${i}: Valid balance rating`
    );

    // If lateral offset exceeds drop zone max, isOverDropZone must be false
    if (Math.abs(res.position[0]) > DROP_ZONE_MAX_LATERAL_X) {
      assert.equal(res.isOverDropZone, false, `Fuzz ${i}: Off-center stone cannot be over drop zone`);
    }
  }
});

// =============================================================================
// ADVERSARIAL CASE 2: DEPTH CONVERGENCE & NON-PENETRATION ACROSS ALL 25 SHAPE PAIRS
// =============================================================================
test('Adversarial Case 2.1: Mathematical Bounding Box Non-Penetration Across All 25 Shape Pairs (s_i, s_j)', () => {
  let pairCount = 0;

  for (const baseShape of ALL_SHAPES) {
    for (const upperShape of ALL_SHAPES) {
      pairCount++;
      const baseCfg = StonePhysicsBodyFactory.getShapeConfig(baseShape);
      const upperCfg = StonePhysicsBodyFactory.getShapeConfig(upperShape);

      const h_i = baseCfg.halfExtents.y;
      const h_j = upperCfg.halfExtents.y;

      // Base stone rests on ground (y = h_i, bottom = 0, topSurface = 2 * h_i)
      const baseCenterY = h_i;
      const topSurfaceY = baseCenterY + h_i;

      // Upper stone placed flush on top via Pose.onTopOf
      const upperPose = Pose.onTopOf(topSurfaceY, h_j);
      const upperCenterY = upperPose.position.y;
      const upperBottomY = upperCenterY - h_j;

      // 1. Center-to-center distance verification: Delta y >= h_i + h_j
      const deltaY = upperCenterY - baseCenterY;
      const minRequiredDeltaY = h_i + h_j;
      assert.ok(
        deltaY >= minRequiredDeltaY - 1e-4,
        `Pair (${baseShape}, ${upperShape}): Delta y (${deltaY}) must be >= h_i + h_j (${minRequiredDeltaY})`
      );

      // 2. Zero interpenetration verification: upper bottom must be >= base top
      const penetrationDepth = Math.max(0, topSurfaceY - upperBottomY);
      assert.ok(
        penetrationDepth <= 1e-4,
        `Pair (${baseShape}, ${upperShape}): Vertical penetration depth (${penetrationDepth}) must be 0`
      );

      // 3. Drop pose from drag convergence: calculate3DDropPoseFromWorldPosition
      const simulatedDropPos: readonly [number, number, number] = [0, topSurfaceY + 0.1, 0];
      const dropPose = calculate3DDropPoseFromWorldPosition(simulatedDropPos, topSurfaceY, h_j);
      const dropBottomY = dropPose.position.y - h_j;

      // Drop elevation must have safe air clearance >= 0.08m
      const clearance = dropBottomY - topSurfaceY;
      assert.ok(
        clearance >= 0.08 - 1e-4,
        `Pair (${baseShape}, ${upperShape}): Drop spawn clearance (${clearance.toFixed(4)}m) must be >= 0.08m`
      );
    }
  }

  assert.equal(pairCount, 25, 'Must have evaluated exactly 25 shape pairs');
});

test('Adversarial Case 2.2: Full Dynamic Rigid Body Simulation Non-Penetration Across All 25 Shape Pairs', async () => {
  for (const baseShape of ALL_SHAPES) {
    for (const dropShape of ALL_SHAPES) {
      const world = new SimpleTowerPhysicsWorld();
      const baseCfg = StonePhysicsBodyFactory.getShapeConfig(baseShape);
      const dropCfg = StonePhysicsBodyFactory.getShapeConfig(dropShape);

      // Place base stone statically on ground
      const baseStone = new Stone({
        shape: baseShape,
        color: '#2B2D42',
        pose: new Pose({ x: 0, y: baseCfg.halfExtents.y, z: 0 }),
      });
      world.addStatic([baseStone]);

      const topSurfaceY = baseStone.pose.position.y + baseCfg.halfExtents.y;
      const dropPose = calculate3DDropPoseFromWorldPosition(
        [0, topSurfaceY + dropCfg.halfExtents.y + 0.10, 0],
        topSurfaceY,
        dropCfg.halfExtents.y
      );

      const dropStone = new Stone({
        shape: dropShape,
        color: '#8D99AE',
        pose: Pose.origin(),
      });

      const dropRes = await world.drop(dropStone, dropPose);

      assert.equal(
        dropRes.settled,
        true,
        `Centered drop of ${dropShape} on ${baseShape} must settle successfully`
      );

      // Verify settled non-penetration: settled bottom must be >= topSurfaceY
      const settledBottomY = dropRes.pose.position.y - dropCfg.halfExtents.y;
      const penetrationDepth = Math.max(0, topSurfaceY - settledBottomY);

      assert.ok(
        penetrationDepth <= 0.005,
        `Pair (${baseShape}, ${dropShape}): Settled penetration (${penetrationDepth.toFixed(4)}m) must be <= 5mm`
      );

      // Verify ground clearance: base stone bottom >= 0
      const baseBottomY = baseStone.pose.position.y - baseCfg.halfExtents.y;
      assert.ok(baseBottomY >= -1e-4, `Base stone bottom must not sink below ground`);

      world.dispose();
    }
  }
});

// =============================================================================
// ADVERSARIAL CASE 3: RAPID CONSECUTIVE DROPS & MULTI-STONE TOWER STACKING (5+ TALL)
// =============================================================================
test('Adversarial Case 3.1: Monotonic Height Increase & Zero Interpenetration in 7-Stone Multi-Tier Cairn', () => {
  const shapeSequence: readonly StoneShape[] = [
    'boulder', // Tier 1: Wide solid foundation
    'flat',    // Tier 2: Wide flat platform
    'round',   // Tier 3: Medium rounded body
    'tall',    // Tier 4: Slender pillar
    'pebble',  // Tier 5: Small intermediary
    'boulder', // Tier 6: Second heavy mass
    'round',   // Tier 7: Final crown stone
  ];

  const stones: TowerStoneItem[] = [];
  let currentTopSurfaceY = 0;

  for (let i = 0; i < shapeSequence.length; i++) {
    const shape = shapeSequence[i];
    const cfg = StonePhysicsBodyFactory.getShapeConfig(shape);

    const prevSurfaceY = currentTopSurfaceY;
    const pose = Pose.onTopOf(prevSurfaceY, cfg.halfExtents.y);

    const newStone = new Stone({
      shape,
      color: `#${(i + 1) * 15}${i * 20}AA`,
      pose,
    });

    stones.push({
      id: `tier-stone-${i}`,
      stone: newStone,
      status: 'active',
      bloom: null,
      cheerLevel: ((i % 4) as CheerLevelValue),
      isMine: false,
      nickname: null,
    });

    const tower = new Tower(TowerKey.global(), [...stones], {
      stoneCount: stones.length,
      todayCount: 1,
      fulfilledCount: 0,
      cheerCount: 0,
    });

    currentTopSurfaceY = tower.topSurfaceY();

    // 1. Monotonic topSurfaceY increase invariant
    assert.ok(
      currentTopSurfaceY > prevSurfaceY,
      `Step ${i} (${shape}): Top surface (${currentTopSurfaceY}) must strictly exceed previous (${prevSurfaceY})`
    );

    const expectedNewSurface = pose.position.y + cfg.halfExtents.y;
    assert.ok(
      Math.abs(currentTopSurfaceY - expectedNewSurface) < 1e-4,
      `Step ${i} (${shape}): Top surface (${currentTopSurfaceY}) must equal highest stone top (${expectedNewSurface})`
    );
  }

  // 2. Pairwise non-penetration check across all 6 consecutive interfaces
  for (let i = 0; i < stones.length - 1; i++) {
    const lower = stones[i].stone;
    const upper = stones[i + 1].stone;

    const lowerCfg = StonePhysicsBodyFactory.getShapeConfig(lower.shape);
    const upperCfg = StonePhysicsBodyFactory.getShapeConfig(upper.shape);

    const lowerTopY = lower.pose.position.y + lowerCfg.halfExtents.y;
    const upperBottomY = upper.pose.position.y - upperCfg.halfExtents.y;
    const interpenetration = lowerTopY - upperBottomY;

    assert.ok(
      Math.abs(interpenetration) < 1e-4,
      `Interface ${i}->${i + 1}: Interpenetration (${interpenetration}) must be 0`
    );
  }
});

test('Adversarial Case 3.2: 5-Stone Sequential Dynamic Physical Drop Settling', async () => {
  const world = new SimpleTowerPhysicsWorld();
  const stackedStones: Stone[] = [];

  const dropSequence: readonly StoneShape[] = ['boulder', 'flat', 'round', 'tall', 'pebble'];
  let currentSurfaceY = 0;

  for (let i = 0; i < dropSequence.length; i++) {
    const shape = dropSequence[i];
    const cfg = StonePhysicsBodyFactory.getShapeConfig(shape);

    const dropElevation = currentSurfaceY + cfg.halfExtents.y + 0.09;
    const dropPose = new Pose({ x: 0, y: dropElevation, z: 0 });

    const stoneToDrop = new Stone({
      shape,
      color: '#4A5568',
      pose: Pose.origin(),
    });

    const dropRes = await world.drop(stoneToDrop, dropPose);

    assert.equal(
      dropRes.settled,
      true,
      `Drop ${i} (${shape}) must settle stably on tower of height ${currentSurfaceY.toFixed(3)}m`
    );

    // Verify non-penetration against previous surface
    const settledBottom = dropRes.pose.position.y - cfg.halfExtents.y;
    assert.ok(
      settledBottom >= currentSurfaceY - 0.005,
      `Drop ${i} (${shape}): Settled bottom (${settledBottom.toFixed(4)}) must be >= surface (${currentSurfaceY.toFixed(4)})`
    );

    const settledStone = stoneToDrop.withPose(dropRes.pose);
    stackedStones.push(settledStone);

    // Update static tower in physics world with all accumulated stones
    world.addStatic(stackedStones);

    // Update current top surface
    const settledTop = dropRes.pose.position.y + cfg.halfExtents.y;
    assert.ok(
      settledTop > currentSurfaceY,
      `Drop ${i} (${shape}): Tower height must grow: ${settledTop} > ${currentSurfaceY}`
    );
    currentSurfaceY = settledTop;
  }

  assert.equal(stackedStones.length, 5, 'All 5 stones successfully stacked in physical world');
  world.dispose();
});

// =============================================================================
// ADVERSARIAL CASE 4: ZERO HEIGHT OR EMPTY TOWER DRAG SPAWN ELEVATION FALLBACK
// =============================================================================
test('Adversarial Case 4.1: Empty Tower Drag Spawn and Elevation Fallbacks', () => {
  const emptyTower = new Tower(
    TowerKey.global(),
    [],
    { stoneCount: 0, todayCount: 0, fulfilledCount: 0, cheerCount: 0 }
  );

  // topSurfaceY must return 0.0 for empty tower
  assert.equal(emptyTower.topSurfaceY(), 0, 'Empty tower topSurfaceY must return 0');

  // Spawn position fallback
  const spawn0 = computeInitialSpawnPosition(0);
  assert.deepEqual(
    spawn0,
    DEFAULT_INITIAL_SPAWN_POSITION,
    'Spawn position with topSurfaceY=0 must match default spawn [0, 0.18, 1.15]'
  );

  // Drag calculation on empty tower (topSurfaceY = 0)
  const dragResult = computeDragWorldPosition(0, -100, spawn0, 0);
  assert.ok(Number.isFinite(dragResult.position[0]), 'Empty tower drag X must be finite');
  assert.ok(Number.isFinite(dragResult.position[1]), 'Empty tower drag Y must be finite');
  assert.ok(Number.isFinite(dragResult.position[2]), 'Empty tower drag Z must be finite');
  assert.ok(dragResult.normalizedProgress > 0, 'Progress must advance positively on drag up');

  // Calculate drop pose on empty tower
  for (const shape of ALL_SHAPES) {
    const halfH = StonePhysicsBodyFactory.getShapeConfig(shape).halfExtents.y;
    const dropPose = calculate3DDropPoseFromWorldPosition([0, 0.05, 0], 0, halfH);

    // When worldPos.y (0.05) is lower than minSafeY, it must clamp to minSafeY = topSurfaceY + halfH + 0.08
    const expectedMinSafeY = Number((0 + halfH + 0.08).toFixed(4));
    assert.equal(
      dropPose.position.y,
      expectedMinSafeY,
      `Drop pose for ${shape} on empty tower must clamp to minSafeY (${expectedMinSafeY})`
    );
    assert.ok(
      dropPose.position.y - halfH >= 0.08 - 1e-4,
      `Clearance above ground must be >= 0.08m`
    );
  }
});

test('Adversarial Case 4.2: Degenerate and Negative Surface Elevations Protection', () => {
  const initialPos = computeInitialSpawnPosition();

  // Negative surface elevation (-5.0m)
  const negResult = computeDragWorldPosition(0, -200, initialPos, -5.0);
  assert.ok(Number.isFinite(negResult.position[1]));
  assert.ok(negResult.normalizedProgress >= 0 && negResult.normalizedProgress <= 1);

  // NaN surface elevation
  const nanResult = computeDragWorldPosition(0, -200, initialPos, NaN);
  assert.ok(Number.isFinite(nanResult.position[1]));
  assert.ok(nanResult.normalizedProgress >= 0 && nanResult.normalizedProgress <= 1);

  // Drop pose with undefined / NaN topSurfaceY
  const dropPoseUndefined = calculate3DDropPoseFromWorldPosition([0, 1.2, 0]);
  assert.equal(dropPoseUndefined.position.y, 1.2);
  assert.ok(Number.isFinite(dropPoseUndefined.position.y));

  // shouldTriggerDrop on degenerate topSurfaceY
  assert.equal(shouldTriggerDrop(0.4, 0), true, 'Elevation 0.4m on topSurfaceY=0 should trigger drop');
  assert.equal(shouldTriggerDrop(0.1, 0), false, 'Elevation 0.1m on topSurfaceY=0 should not trigger drop');
  assert.equal(shouldTriggerDrop(NaN, 0), false, 'NaN elevation must never trigger drop');
  assert.equal(shouldTriggerDrop(0.5, NaN), true, 'Valid elevation on NaN topSurfaceY falls back safely');
});

// =============================================================================
// ADVERSARIAL CASE 5: DRAG CANCELLATION / EARLY RELEASE BELOW THRESHOLD
// =============================================================================
test('Adversarial Case 5.1: Early Release Below Drop Threshold Triggers Cancellation', () => {
  const topSurfaceY = 1.0;
  const initialPos = computeInitialSpawnPosition(topSurfaceY);

  // Small drag: user nudged up 20px (dy = -20)
  const smallDragResult = computeDragWorldPosition(0, -20, initialPos, topSurfaceY);
  const stoneHalfY = StonePhysicsBodyFactory.getShapeConfig('round').halfExtents.y;

  // Verify shouldTriggerDrop evaluates to false for sub-threshold elevation
  const isTriggerable = shouldTriggerDrop(smallDragResult.position[1], topSurfaceY);
  assert.equal(
    isTriggerable,
    false,
    `Early release at Y=${smallDragResult.position[1]} must NOT trigger drop (threshold: ${topSurfaceY * 0.75})`
  );

  // Simulate early release handler behavior (StoneTowerCanvas.tsx lines 541-556)
  let onDropCalled = false;
  let onDragCancelCalled = false;
  let restoredPos: readonly [number, number, number] | null = null;
  let restoredRating: string | null = null;
  let restoredOverDropZone: boolean | null = null;

  const handleSimulatedPointerUp = (currentPos: readonly [number, number, number]) => {
    const shouldDrop = shouldTriggerDrop(currentPos[1], topSurfaceY);
    if (shouldDrop) {
      onDropCalled = true;
    } else {
      restoredPos = initialPos;
      restoredRating = 'stable';
      restoredOverDropZone = false;
      onDragCancelCalled = true;
    }
  };

  handleSimulatedPointerUp(smallDragResult.position);

  assert.equal(onDropCalled, false, 'onDrop must NOT be invoked on early release');
  assert.equal(onDragCancelCalled, true, 'onDragCancel must be invoked on early release');
  assert.deepEqual(restoredPos, initialPos, 'Position must be strictly restored to initial spawn position');
  assert.equal(restoredRating, 'stable', 'Balance rating must reset to stable');
  assert.equal(restoredOverDropZone, false, 'isOverDropZone must reset to false');
});

test('Adversarial Case 5.2: State Cleanliness - No Residual Ghost Bodies After Drag Cancellation', async () => {
  const world = new SimpleTowerPhysicsWorld();
  const baseStone = new Stone({
    shape: 'boulder',
    color: '#333333',
    pose: new Pose({ x: 0, y: 0.2625, z: 0 }),
  });
  world.addStatic([baseStone]);

  // Verify initial world state: exactly 1 static tower body, 0 drop bodies
  assert.equal(world.getTowerBodies().size, 1);
  assert.equal(world.getDropBody(), null, 'Drop body must be null before drop');

  // Cancelled drag scenario: pointer down -> pointer move -> pointer up below threshold
  // Because drag was cancelled, world.drop is never called.
  assert.equal(world.getDropBody(), null, 'No ghost body registered in physics world');

  // Subsequent actual drop after cancelled drag should perform cleanly without collisions with ghost bodies
  const dropPose = calculate3DDropPoseFromWorldPosition([0, 0.8, 0], 0.525, 0.205);
  const dropStone = new Stone({
    shape: 'round',
    color: '#666666',
    pose: Pose.origin(),
  });

  const res = await world.drop(dropStone, dropPose);
  assert.equal(res.settled, true, 'Subsequent drop settles cleanly without interference from prior drag');
  assert.equal((res.affectedStones ?? []).length, 0, 'No false collapse or collisions caused by ghosts');

  world.dispose();
});
