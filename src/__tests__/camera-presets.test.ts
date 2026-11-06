import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computePresetCameraView,
  type CameraPresetType,
  type CameraViewConfig,
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
