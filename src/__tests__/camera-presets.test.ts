import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computePresetCameraView,
  computeFocusCameraView,
  clampCameraTarget,
  ZEN_GARDEN_RADIUS,
  CAMERA_PAN_MAX_RADIUS,
  CAMERA_MIN_DISTANCE,
  CAMERA_MAX_DISTANCE,
  RECENTER_TRIGGER_DISTANCE,
  type CameraPresetType,
  type CameraViewConfig,
  type FocusCameraViewConfig,
} from '../presentation/components/cameraPresetSpec.ts';

test('Camera Presets Spec: computePresetCameraView correctly calculates coordinates for front, side45, and top presets', () => {
  // Test case 1: Default / undefined towerTopY (defaults to 1.0)
  const defaultFront = computePresetCameraView('front');
  assert.deepEqual(defaultFront.target, [0, 0.6, 0]);
  assert.deepEqual(defaultFront.position, [0, 1.3, 3.8]);

  const defaultSide = computePresetCameraView('side45');
  assert.deepEqual(defaultSide.target, [0, 0.6, 0]);
  assert.deepEqual(defaultSide.position, [2.55, 1.3, 2.55]);

  const defaultTop = computePresetCameraView('top');
  assert.deepEqual(defaultTop.target, [0, 0.6, 0]);
  assert.deepEqual(defaultTop.position, [0, 3.7, 0.45]);

  // Test case 2: Low tower (towerTopY = 0.5) - clamps targetY to minimum 0.6
  const lowFront = computePresetCameraView('front', 0.5);
  assert.equal(lowFront.target[1], 0.6);
  assert.deepEqual(lowFront.position, [0, 1.3, 3.8]);

  const lowSide = computePresetCameraView('side45', 0.5);
  assert.equal(lowSide.target[1], 0.6);
  assert.deepEqual(lowSide.position, [2.55, 1.3, 2.55]);

  const lowTop = computePresetCameraView('top', 0.5);
  assert.equal(lowTop.target[1], 0.6);
  assert.deepEqual(lowTop.position, [0, 3.7, 0.45]);

  // Test case 3: High tower (towerTopY = 3.0) - dynamic targetY = 1.5
  const highFront = computePresetCameraView('front', 3.0);
  assert.deepEqual(highFront.target, [0, 1.5, 0]);
  assert.deepEqual(highFront.position, [0, 2.2, 3.8]);

  const highSide = computePresetCameraView('side45', 3.0);
  assert.deepEqual(highSide.target, [0, 1.5, 0]);
  assert.deepEqual(highSide.position, [2.55, 2.2, 2.55]);

  const highTop = computePresetCameraView('top', 3.0);
  assert.deepEqual(highTop.target, [0, 1.5, 0]);
  assert.deepEqual(highTop.position, [0, 4.6, 0.45]);
});

test('Camera Presets Spec: top preset strictly avoids z=0 singularity (gimbal-lock prevention)', () => {
  const heights = [0.1, 0.5, 1.0, 2.0, 5.0, 10.0];

  for (const h of heights) {
    const topView = computePresetCameraView('top', h);
    // z coordinate must not be 0 to prevent OrbitControls gimbal-lock at exact zenith (0, 1, 0)
    assert.ok(
      Math.abs(topView.position[2]) > 0.1,
      `Top preset z coordinate should not be close to 0 at height ${h}`
    );
    assert.equal(topView.position[2], 0.45);

    // Camera must be positioned higher than target
    assert.ok(
      topView.position[1] > topView.target[1],
      `Top camera height ${topView.position[1]} should be higher than target ${topView.target[1]}`
    );

    // Camera look-at angle is steep (~82°) but non-vertical
    const dy = topView.position[1] - topView.target[1];
    const dz = topView.position[2] - topView.target[2];
    const angleDeg = (Math.atan2(dy, dz) * 180) / Math.PI;
    assert.ok(
      angleDeg >= 80 && angleDeg < 85,
      `Top angle ${angleDeg}° should be steep (~82°) to give authentic top-down perspective without gimbal lock`
    );
  }
});

test('Camera Presets Spec: side45 maintains equal X and Z offsets for isometric 45-degree angle', () => {
  const sideView = computePresetCameraView('side45', 2.0);
  assert.equal(sideView.position[0], sideView.position[2]);
  assert.equal(sideView.position[0], 2.55);
  assert.equal(sideView.target[0], 0);
  assert.equal(sideView.target[2], 0);
});

test('Camera Presets Spec: Zen Garden exploration constants conform to specification', () => {
  assert.equal(ZEN_GARDEN_RADIUS, 28.0, 'ZEN_GARDEN_RADIUS must be 28.0 meters');
  assert.equal(CAMERA_PAN_MAX_RADIUS, 15.0, 'CAMERA_PAN_MAX_RADIUS must be 15.0 meters');
  assert.equal(CAMERA_MIN_DISTANCE, 1.2, 'CAMERA_MIN_DISTANCE must be 1.2 meters');
  assert.equal(CAMERA_MAX_DISTANCE, 24.0, 'CAMERA_MAX_DISTANCE must be 24.0 meters');
  assert.equal(RECENTER_TRIGGER_DISTANCE, 2.0, 'RECENTER_TRIGGER_DISTANCE must be 2.0 meters');
});

test('Camera Presets Spec: clampCameraTarget enforces horizontal radius and vertical height boundaries', () => {
  // 1. Inside boundaries: coordinates remain unaffected
  const inside = clampCameraTarget([5.0, 1.2, -4.0], 15.0, 1.5);
  assert.deepEqual(inside, [5.0, 1.2, -4.0]);

  // 2. Center target
  const center = clampCameraTarget([0, 0.8, 0]);
  assert.deepEqual(center, [0, 0.8, 0]);

  // 3. Horizontal boundary clamping: (20, 0) clamped to (15, 0)
  const outX = clampCameraTarget([20.0, 1.0, 0], 15.0);
  assert.equal(outX[0], 15.0);
  assert.equal(outX[2], 0);

  // 4. Diagonal horizontal boundary clamping: (12, 16) has hypot 20 -> scaled to 15 (9, 12)
  const diagonal = clampCameraTarget([12.0, 1.0, 16.0], 15.0);
  const diagHypot = Math.hypot(diagonal[0], diagonal[2]);
  assert.ok(Math.abs(diagHypot - 15.0) < 1e-3, `Clamped radial distance ${diagHypot} must be 15.0`);
  assert.equal(diagonal[0], 9.0);
  assert.equal(diagonal[2], 12.0);

  // 5. Negative coordinates radial clamping
  const negDiag = clampCameraTarget([-12.0, 1.0, -16.0], 15.0);
  assert.equal(negDiag[0], -9.0);
  assert.equal(negDiag[2], -12.0);

  // 6. Vertical clamping - lower bound (min 0.2m)
  const subGround = clampCameraTarget([0, -1.5, 0]);
  assert.equal(subGround[1], 0.2);

  const exactZeroY = clampCameraTarget([2.0, 0.05, 1.0]);
  assert.equal(exactZeroY[1], 0.2);

  // 7. Vertical clamping - upper bound (towerTopY + 2.5m, min 1.5m)
  const highY = clampCameraTarget([0, 10.0, 0], 15.0, 2.0); // max is 2.0 + 2.5 = 4.5
  assert.equal(highY[1], 4.5);

  const lowTowerUpper = clampCameraTarget([0, 5.0, 0], 15.0, 0.2); // effectiveTopY = 0.2, max is 0.2 + 2.5 = 2.7
  assert.equal(lowTowerUpper[1], 2.7);

  // 8. Custom maxRadius support
  const customRadius = clampCameraTarget([10.0, 1.0, 0], 5.0);
  assert.equal(customRadius[0], 5.0);

  // 9. Robustness against non-finite inputs
  const nanTarget = clampCameraTarget([NaN, Infinity, -Infinity]);
  assert.equal(nanTarget[0], 0);
  assert.equal(nanTarget[1], 0.2);
  assert.equal(nanTarget[2], 0);
});

test('Camera Presets Spec: computeFocusCameraView calculates focused inspection coordinates', () => {
  const stonePos = { x: 0.15, y: 1.2, z: -0.1 };

  // 1. Without currentCameraPosition: defaults to +Z front inspection
  const defaultFocus = computeFocusCameraView(stonePos);
  assert.deepEqual(defaultFocus.target, [0.15, 1.2, -0.1]);
  // Distance in XZ is 1.8m in +Z direction: posX = 0.15, posY = 1.2 + 0.35 = 1.55, posZ = -0.1 + 1.8 = 1.7
  assert.equal(defaultFocus.position[0], 0.15);
  assert.equal(defaultFocus.position[1], 1.55);
  assert.equal(defaultFocus.position[2], 1.7);

  // 2. With currentCameraPosition: preserves relative azimuth
  // Camera is directly to the east (+X) of stone
  const eastCam = { x: 5.0, y: 2.0, z: -0.1 };
  const eastFocus = computeFocusCameraView(stonePos, eastCam);
  assert.deepEqual(eastFocus.target, [0.15, 1.2, -0.1]);
  assert.equal(eastFocus.position[1], 1.55);
  // dx = 4.85, dz = 0 -> azimuth is Math.PI / 2 (+X)
  // Camera should be positioned at stonePos.x + 1.8 = 1.95, stonePos.z = -0.1
  assert.equal(eastFocus.position[0], 1.95);
  assert.equal(eastFocus.position[2], -0.1);

  // 3. Diagonal angle preservation: stone at origin, camera at (3, 2, 4) (hypot = 5)
  const originStone = { x: 0, y: 0.5, z: 0 };
  const diagCam = { x: 3, y: 2, z: 4 };
  const diagFocus = computeFocusCameraView(originStone, diagCam);
  assert.deepEqual(diagFocus.target, [0, 0.5, 0]);
  assert.equal(diagFocus.position[1], 0.85);

  const radialDist = Math.hypot(diagFocus.position[0], diagFocus.position[2]);
  assert.ok(Math.abs(radialDist - 1.8) < 1e-3, `Inspection distance ${radialDist} must be 1.8m`);
  // sin(theta) = 3/5 = 0.6 -> posX = 1.8 * 0.6 = 1.08
  // cos(theta) = 4/5 = 0.8 -> posZ = 1.8 * 0.8 = 1.44
  assert.equal(diagFocus.position[0], 1.08);
  assert.equal(diagFocus.position[2], 1.44);

  // 4. Robustness against zero or non-finite inputs
  const nanFocus = computeFocusCameraView({ x: NaN, y: Infinity, z: -0.2 });
  assert.equal(nanFocus.target[0], 0);
  assert.equal(nanFocus.target[1], 0);
  assert.equal(nanFocus.target[2], -0.2);
});

test('Camera Presets Spec: computeFocusCameraView 360-degree directional sweep maintains exact 1.8m distance invariant', () => {
  const stone = { x: 1.0, y: 2.0, z: -1.0 };
  const directions = [
    { name: 'North (+Z)', cam: { x: 1.0, y: 2.0, z: 10.0 } },
    { name: 'North-East (+X, +Z)', cam: { x: 10.0, y: 2.0, z: 10.0 } },
    { name: 'East (+X)', cam: { x: 10.0, y: 2.0, z: -1.0 } },
    { name: 'South-East (+X, -Z)', cam: { x: 10.0, y: 2.0, z: -10.0 } },
    { name: 'South (-Z)', cam: { x: 1.0, y: 2.0, z: -10.0 } },
    { name: 'South-West (-X, -Z)', cam: { x: -10.0, y: 2.0, z: -10.0 } },
    { name: 'West (-X)', cam: { x: -10.0, y: 2.0, z: -1.0 } },
    { name: 'North-West (-X, +Z)', cam: { x: -10.0, y: 2.0, z: 10.0 } },
  ];

  for (const { name, cam } of directions) {
    const view = computeFocusCameraView(stone, cam);
    // Target invariant
    assert.deepEqual(view.target, [1.0, 2.0, -1.0]);

    // Elevation invariant
    assert.equal(view.position[1], 2.35);

    // Distance in XZ plane must be exactly 1.8m
    const dx = view.position[0] - stone.x;
    const dz = view.position[2] - stone.z;
    const distXZ = Math.hypot(dx, dz);
    assert.ok(
      Math.abs(distXZ - 1.8) < 1e-3,
      `Direction ${name}: distance ${distXZ} must be 1.8m`
    );

    // Camera must lie in the same directional half-plane as current camera
    const origDx = cam.x - stone.x;
    const origDz = cam.z - stone.z;
    const dot = dx * origDx + dz * origDz;
    assert.ok(
      dot > 0,
      `Direction ${name}: focus viewpoint should be oriented towards the camera viewpoint`
    );
  }
});

test('Camera Presets Spec: Recenter distance threshold and boundary invariants', () => {
  // Recenter trigger distance is 2.0m
  assert.equal(RECENTER_TRIGGER_DISTANCE, 2.0);

  // Targets at offset < 2.0m should not trigger recenter
  const nearOffsets = [
    { x: 0, z: 0 },
    { x: 1.0, z: 1.0 }, // hypot ~1.414 < 2.0
    { x: 0, z: 1.99 },  // 1.99 < 2.0
    { x: -1.3, z: 1.3 }, // hypot ~1.838 < 2.0
  ];
  for (const offset of nearOffsets) {
    const dist = Math.hypot(offset.x, offset.z);
    assert.ok(
      dist < RECENTER_TRIGGER_DISTANCE,
      `Offset (${offset.x}, ${offset.z}) distance ${dist} must be below threshold 2.0`
    );
  }

  // Targets at offset >= 2.0m trigger recenter button
  const farOffsets = [
    { x: 2.0, z: 0 },
    { x: 0, z: -2.05 },
    { x: 2.5, z: 3.0 },
    { x: 15.0, z: 0 },
  ];
  for (const offset of farOffsets) {
    const dist = Math.hypot(offset.x, offset.z);
    assert.ok(
      dist >= RECENTER_TRIGGER_DISTANCE,
      `Offset (${offset.x}, ${offset.z}) distance ${dist} must be at or above threshold 2.0`
    );
  }
});


