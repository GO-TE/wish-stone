import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { Stone, type StoneShape } from '../domain/entities/Stone.ts';
import { Tower, type TowerStoneItem } from '../domain/entities/Tower.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import { TowerKey } from '../domain/value-objects/TowerKey.ts';
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
  type DragWorldPositionResult,
} from '../presentation/components/stoneDragSpec.ts';

// =============================================================================
// MILESTONE 2: 3D WISH STONE DIRECT DRAG INTERACTION UNIT TEST SUITE (F07–F11)
// =============================================================================

test('F08-1: computeInitialSpawnPosition initializes unplaced stone safely in front of cairn', () => {
  const spawnDefault = computeInitialSpawnPosition();
  assert.equal(spawnDefault[0], 0, 'Spawn X must be centered on the origin axis (0.0)');
  assert.equal(spawnDefault[1], 0.18, 'Spawn Y must be placed at comfortable lower elevation 0.18m');
  assert.equal(spawnDefault[2], 1.15, 'Spawn Z must be forward at 1.15m in front of cairn base (Z=0)');

  // Custom target drop height should still preserve the safe front spawn location
  const spawnTower3m = computeInitialSpawnPosition(3.5);
  assert.equal(spawnTower3m[0], 0);
  assert.equal(spawnTower3m[1], 0.18);
  assert.equal(spawnTower3m[2], 1.15);

  // Verification against default constant
  assert.deepEqual(spawnDefault, DEFAULT_INITIAL_SPAWN_POSITION);
});

test('F08-2: 3D pointer drag mechanics maps 2D screen movement to 3D world coordinates', () => {
  const initialPos = computeInitialSpawnPosition();
  const topSurfaceY = 0.8;

  // 1. Idle state (0, 0 displacement)
  const idleResult = computeDragWorldPosition(0, 0, initialPos, topSurfaceY);
  assert.equal(idleResult.position[0], 0);
  assert.equal(idleResult.position[1], initialPos[1]);
  assert.equal(idleResult.position[2], initialPos[2]);
  assert.equal(idleResult.normalizedProgress, 0);
  assert.equal(idleResult.isOverDropZone, false);
  assert.equal(idleResult.balanceRating, 'stable');

  // 2. Dragging upward (negative deltaY on screen)
  const dragUpResult = computeDragWorldPosition(0, -120, initialPos, topSurfaceY);
  assert.ok(
    dragUpResult.position[1] > initialPos[1],
    `Upward drag must elevate Y: ${dragUpResult.position[1]} > ${initialPos[1]}`
  );
  assert.ok(dragUpResult.normalizedProgress > 0, 'Progress must advance positively');

  // 3. Lateral movement (deltaX)
  const dragRightResult = computeDragWorldPosition(50, -100, initialPos, topSurfaceY);
  assert.ok(dragRightResult.position[0] > 0, 'Positive deltaX must move stone right in 3D (+X)');

  const dragLeftResult = computeDragWorldPosition(-50, -100, initialPos, topSurfaceY);
  assert.ok(dragLeftResult.position[0] < 0, 'Negative deltaX must move stone left in 3D (-X)');
});

test('F08-3: Depth convergence invariant (Z: 1.15 -> 0.0) as stone ascends toward tower top surface', () => {
  const initialPos = computeInitialSpawnPosition();
  const topSurfaceY = 0.73;
  const targetDropY = topSurfaceY + 0.35;
  const verticalSpan = targetDropY - initialPos[1];

  // At 0% progress: Z = 1.15
  const atStart = computeDragWorldPosition(0, 0, initialPos, topSurfaceY);
  assert.equal(atStart.position[2], 1.15);
  assert.equal(atStart.normalizedProgress, 0);

  // At 50% progress: Z is halfway converged (~0.575)
  const halfDragPixels = -(verticalSpan * 0.5) / 0.0035;
  const atHalf = computeDragWorldPosition(0, halfDragPixels, initialPos, topSurfaceY);
  assert.ok(
    atHalf.position[2] < 1.15 && atHalf.position[2] > 0,
    `Halfway Z (${atHalf.position[2]}) must be between 0 and 1.15`
  );
  assert.ok(
    Math.abs(atHalf.normalizedProgress - 0.5) < 0.05,
    `Halfway progress (${atHalf.normalizedProgress}) should be ~0.5`
  );

  // At 100% progress: Z converges strictly to 0.0 (cairn central vertical axis)
  const fullDragPixels = -verticalSpan / 0.0035;
  const atApex = computeDragWorldPosition(0, fullDragPixels, initialPos, topSurfaceY);
  assert.equal(atApex.position[2], 0, 'Apex Z depth must converge identically to 0.0');
  assert.equal(atApex.normalizedProgress, 1, 'Progress must clamp to 1.0 at apex');

  // Dragging beyond apex: Z remains clamped to 0.0, not negative
  const beyondApex = computeDragWorldPosition(0, fullDragPixels - 300, initialPos, topSurfaceY);
  assert.equal(beyondApex.position[2], 0, 'Z depth must not become negative beyond apex');
  assert.equal(beyondApex.normalizedProgress, 1);
});

test('F08-4: Live balance evaluation rating categorizes stable, caution, and critical zones', () => {
  const initialPos = computeInitialSpawnPosition();
  const topSurfaceY = 1.0;

  // Stable: |X| <= 0.22 (Toss Blue aura)
  const stable1 = computeDragWorldPosition(10, -200, initialPos, topSurfaceY); // dx = 0.03m
  assert.equal(stable1.balanceRating, 'stable');

  const stableBoundary = computeDragWorldPosition(70, -200, initialPos, topSurfaceY); // dx = 0.21m
  assert.equal(stableBoundary.balanceRating, 'stable');

  const liveStable = evaluateLiveBalance(0.15);
  assert.equal(liveStable.rating, 'stable');
  assert.equal(liveStable.auraColor, '#3182F6');
  assert.equal(liveStable.isBalanced, true);

  // Caution: 0.22 < |X| <= 0.35 (Amber caution aura)
  const caution1 = computeDragWorldPosition(90, -200, initialPos, topSurfaceY); // dx = 0.27m
  assert.equal(caution1.balanceRating, 'caution');

  const liveCaution = evaluateLiveBalance(0.28);
  assert.equal(liveCaution.rating, 'caution');
  assert.equal(liveCaution.auraColor, '#FFB300');
  assert.equal(liveCaution.isBalanced, false);

  // Critical: |X| > 0.35 (Coral Red warning aura)
  const critical1 = computeDragWorldPosition(150, -200, initialPos, topSurfaceY); // dx = 0.45m
  assert.equal(critical1.balanceRating, 'critical');

  const liveCritical = evaluateLiveBalance(0.42);
  assert.equal(liveCritical.rating, 'critical');
  assert.equal(liveCritical.auraColor, '#FF6B6B');
  assert.equal(liveCritical.isBalanced, false);
});

test('F08-5: shouldTriggerDrop and drop zone detection boundary invariants', () => {
  const topSurfaceY = 0.8;
  const initialPos = computeInitialSpawnPosition();

  // Low elevation: should NOT trigger drop
  assert.equal(shouldTriggerDrop(0.25, topSurfaceY), false);
  const lowDrag = computeDragWorldPosition(0, -30, initialPos, topSurfaceY);
  assert.equal(lowDrag.isOverDropZone, false);

  // Near top surface (>= 75% of topSurfaceY): should trigger drop
  const dropHeight = topSurfaceY * 0.85; // 0.68m
  assert.equal(shouldTriggerDrop(dropHeight, topSurfaceY), true);

  // Dragging to target drop elevation: isOverDropZone becomes true
  const targetDeltaY = -((topSurfaceY + 0.35) - initialPos[1]) / 0.0035;
  const targetDrag = computeDragWorldPosition(0, targetDeltaY, initialPos, topSurfaceY);
  assert.equal(targetDrag.isOverDropZone, true);

  // If stone is too far laterally (X > 0.35m), isOverDropZone is false even at drop elevation
  const offCenterDrag = computeDragWorldPosition(160, targetDeltaY, initialPos, topSurfaceY); // X ~ 0.48m
  assert.equal(offCenterDrag.isOverDropZone, false);
});

test('F08-6: calculate3DDropPoseFromWorldPosition guarantees non-penetration clearance', () => {
  const worldPos: readonly [number, number, number] = [0.05, 1.25, 0.02];
  const topSurfaceY = 0.935;
  const stoneHalfHeight = 0.205; // round stone

  // Basic signature
  const basicPose = calculate3DDropPoseFromWorldPosition(worldPos);
  assert.ok(basicPose instanceof Pose);
  assert.equal(basicPose.position.x, 0.05);
  assert.equal(basicPose.position.y, 1.25);
  assert.equal(basicPose.position.z, 0.02);
  assert.equal(basicPose.rotation.qw, 1);

  // Invariant signature with topSurfaceY & stoneHalfHeight
  const safePose = calculate3DDropPoseFromWorldPosition(worldPos, topSurfaceY, stoneHalfHeight);
  const minRequiredY = Number((topSurfaceY + stoneHalfHeight + 0.08).toFixed(4));
  assert.ok(
    safePose.position.y >= minRequiredY,
    `safePose.y (${safePose.position.y}) must be >= minRequiredY (${minRequiredY})`
  );

  // If worldPos was dangerously low (e.g. y = 0.5), it must clamp up to minSafeY
  const lowWorldPos: readonly [number, number, number] = [0.0, 0.5, 0.0];
  const clampedPose = calculate3DDropPoseFromWorldPosition(lowWorldPos, topSurfaceY, stoneHalfHeight);
  assert.equal(
    clampedPose.position.y,
    minRequiredY,
    'Sub-threshold worldPos must be clamped to safe clearance elevation'
  );
});

test('F08-7: Numerical robustness against NaN and Infinity in drag calculations', () => {
  const initialPos = computeInitialSpawnPosition();

  // Test with NaN
  const nanResult = computeDragWorldPosition(NaN, NaN, initialPos, NaN);
  assert.ok(Number.isFinite(nanResult.position[0]), 'X must be finite on NaN');
  assert.ok(Number.isFinite(nanResult.position[1]), 'Y must be finite on NaN');
  assert.ok(Number.isFinite(nanResult.position[2]), 'Z must be finite on NaN');
  assert.ok(Number.isFinite(nanResult.normalizedProgress), 'Progress must be finite on NaN');

  // Test with Infinity
  const infResult = computeDragWorldPosition(Infinity, -Infinity, initialPos, 1.0);
  assert.ok(Number.isFinite(infResult.position[0]));
  assert.ok(Number.isFinite(infResult.position[1]));
  assert.ok(Number.isFinite(infResult.position[2]));
  assert.equal(infResult.normalizedProgress, 1, 'Progress on -Infinity deltaY must clamp to 1');

  // Test shouldTriggerDrop with NaN
  assert.equal(shouldTriggerDrop(NaN, 1.0), false);
  assert.equal(shouldTriggerDrop(1.0, NaN), true);
});

test('F07-1: place.tsx source verification - complete removal of 2D gray square button UI and PanResponder', () => {
  const placeFilePath = path.resolve(
    __dirname,
    '../app/stack/place.tsx'
  );
  assert.ok(fs.existsSync(placeFilePath), 'place.tsx must exist');
  const content = fs.readFileSync(placeFilePath, 'utf8');

  // 1. Must NOT contain styles.draggableStone
  assert.ok(
    !content.includes('draggableStone:'),
    'place.tsx must NOT contain styles.draggableStone'
  );
  assert.ok(
    !content.includes('styles.draggableStone'),
    'place.tsx JSX must NOT reference styles.draggableStone'
  );

  // 2. Must NOT contain styles.dragTrackArea
  assert.ok(
    !content.includes('dragTrackArea:'),
    'place.tsx must NOT contain styles.dragTrackArea'
  );
  assert.ok(
    !content.includes('styles.dragTrackArea'),
    'place.tsx JSX must NOT reference styles.dragTrackArea'
  );

  // 3. Must NOT import or use PanResponder
  assert.ok(
    !content.includes('PanResponder'),
    'place.tsx must NOT import or use PanResponder'
  );

  // 4. Must NOT contain 2D text button badge
  assert.ok(
    !content.includes('styles.stoneBadge'),
    'place.tsx must NOT contain 2D styles.stoneBadge'
  );
  assert.ok(
    !content.includes('styles.stoneActionText'),
    'place.tsx must NOT contain 2D styles.stoneActionText'
  );

  // 5. Must retain bottom accessibility quick action bar
  assert.ok(
    content.includes('🎯 즉시 안착하기'),
    'place.tsx must retain [🎯 즉시 안착하기] quick action button'
  );
  assert.ok(
    !content.includes('빗맞힘 테스트 (전복)'),
    'place.tsx must retain [빗맞힘 테스트 (전복)] quick action button'
  );
});

test('F09-1: StoneTowerCanvas exports InteractiveDraggableStone3D and supports 3D drag props contract', () => {
  const canvasFilePath = path.resolve(
    __dirname,
    '../presentation/components/StoneTowerCanvas.tsx'
  );
  assert.ok(fs.existsSync(canvasFilePath), 'StoneTowerCanvas.tsx must exist');
  const canvasContent = fs.readFileSync(canvasFilePath, 'utf8');

  // Verifies that InteractiveDraggableStone3D is exported
  assert.ok(
    canvasContent.includes('export function InteractiveDraggableStone3D'),
    'StoneTowerCanvas must export function InteractiveDraggableStone3D'
  );

  // Verifies that StoneTowerCanvasProps supports 3D interactive drag props
  assert.ok(
    canvasContent.includes('readonly activeStone?: TowerStoneItem | Stone | null'),
    'StoneTowerCanvasProps must declare activeStone prop'
  );
  assert.ok(
    canvasContent.includes('readonly onStoneDrop?: (dropPose: Pose) => void'),
    'StoneTowerCanvasProps must declare onStoneDrop prop'
  );

  // Verifies that OrbitControls is disabled during pointer drag
  assert.ok(
    canvasContent.includes('controlsRef.current.enabled = false'),
    'InteractiveDraggableStone3D must disable OrbitControls during drag'
  );
  assert.ok(
    canvasContent.includes('controlsRef.current.enabled = true'),
    'InteractiveDraggableStone3D must re-enable OrbitControls on drag release'
  );

  // Verifies touch-action: none is specified for web gesture integrity
  assert.ok(
    canvasContent.includes("touchAction: 'none'"),
    'StoneTowerCanvas must apply touchAction: none to prevent browser touch conflict'
  );
});

test('F10-1: 3D drag drop integration with StackStoneController and Tower entity', () => {
  // Simulate complete drop flow with 3D Pose
  const base1: TowerStoneItem = {
    id: 'base-1',
    stone: new Stone({
      shape: 'boulder',
      color: '#3E4947',
      pose: new Pose({ x: -0.34, y: 0.2625, z: 0 }),
    }),
    status: 'active',
    bloom: null,
    cheerLevel: 1,
    isMine: false,
    nickname: null,
  };
  const base2: TowerStoneItem = {
    id: 'base-2',
    stone: new Stone({
      shape: 'flat',
      color: '#262930',
      pose: new Pose({ x: 0.34, y: 0.105, z: 0 }),
    }),
    status: 'active',
    bloom: null,
    cheerLevel: 2,
    isMine: false,
    nickname: null,
  };
  const topStone: TowerStoneItem = {
    id: 'base-3',
    stone: new Stone({
      shape: 'round',
      color: '#6E675F',
      pose: new Pose({ x: 0, y: 0.730, z: 0 }),
    }),
    status: 'active',
    bloom: null,
    cheerLevel: 3,
    isMine: false,
    nickname: null,
  };

  const tower = new Tower(TowerKey.global(), [base1, base2, topStone], {
    stoneCount: 3,
    todayCount: 1,
    fulfilledCount: 0,
    cheerCount: 10,
  });

  const topSurfaceY = tower.topSurfaceY(); // max surface boundary
  assert.equal(topSurfaceY, 0.730 + 0.205); // 0.935m

  // Compute 3D drag to apex
  const initialPos = computeInitialSpawnPosition(topSurfaceY);
  const dragResult = computeDragWorldPosition(0, -350, initialPos, topSurfaceY);
  assert.equal(dragResult.balanceRating, 'stable');
  assert.equal(dragResult.isOverDropZone, true);

  // Compute physical drop pose
  const newStoneHalfY = StonePhysicsBodyFactory.getShapeConfig('pebble').halfExtents.y;
  const dropPose = calculate3DDropPoseFromWorldPosition(
    dragResult.position,
    topSurfaceY,
    newStoneHalfY
  );

  // Verify non-penetration clearance: bottom of dropped stone sits strictly above top surface
  const dropBottomY = dropPose.position.y - newStoneHalfY;
  assert.ok(
    dropBottomY >= topSurfaceY,
    `dropBottomY (${dropBottomY}) must be >= topSurfaceY (${topSurfaceY})`
  );
  assert.equal(dropPose.position.z, 0, 'Dropped stone must converge to central Z axis');
});
