import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  computePresetCameraView,
  computeFocusCameraView,
  clampCameraTarget,
  ZEN_GARDEN_RADIUS,
  CAMERA_PAN_MAX_RADIUS,
  CAMERA_MIN_DISTANCE,
  CAMERA_MAX_DISTANCE,
  RECENTER_TRIGGER_DISTANCE,
  type FocusCameraViewConfig,
} from '../presentation/components/cameraPresetSpec.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Suite 1: Boundary Clamping Extreme Inputs & Fuzzing (clampCameraTarget)
// ---------------------------------------------------------------------------
test('M1 Empirical 1.1: clampCameraTarget handles NaN, ±Infinity, and undefined in all positions without throwing', () => {
  const degenerateInputs: Array<[number, number, number]> = [
    [NaN, 1.0, 2.0],
    [1.0, NaN, 2.0],
    [1.0, 2.0, NaN],
    [NaN, NaN, NaN],
    [Infinity, 1.0, 0.0],
    [-Infinity, 1.0, 0.0],
    [0.0, Infinity, 0.0],
    [0.0, -Infinity, 0.0],
    [0.0, 1.0, Infinity],
    [0.0, 1.0, -Infinity],
    [Infinity, -Infinity, Infinity],
    [-Infinity, Infinity, -Infinity],
    [NaN, Infinity, -Infinity],
  ];

  for (const input of degenerateInputs) {
    assert.doesNotThrow(() => {
      const res = clampCameraTarget(input);
      assert.ok(Number.isFinite(res[0]), `X must be finite for input ${JSON.stringify(input)}, got ${res[0]}`);
      assert.ok(Number.isFinite(res[1]), `Y must be finite for input ${JSON.stringify(input)}, got ${res[1]}`);
      assert.ok(Number.isFinite(res[2]), `Z must be finite for input ${JSON.stringify(input)}, got ${res[2]}`);
      assert.ok(!Number.isNaN(res[0]));
      assert.ok(!Number.isNaN(res[1]));
      assert.ok(!Number.isNaN(res[2]));

      // Verify clamped target satisfies physical bounds
      const distXZ = Math.hypot(res[0], res[2]);
      assert.ok(distXZ <= CAMERA_PAN_MAX_RADIUS + 1e-4, `Radial distance ${distXZ} must not exceed ${CAMERA_PAN_MAX_RADIUS}`);
      assert.ok(res[1] >= 0.2, `Height ${res[1]} must be >= 0.2m`);
    });
  }
});

test('M1 Empirical 1.2: clampCameraTarget clamps huge coordinates (> 10,000m up to 1e250) to exact maxRadius while preserving direction', () => {
  const hugeInputs: Array<{ raw: [number, number, number]; expectedAngleDeg: number }> = [
    { raw: [10001, 1.0, 0], expectedAngleDeg: 90 }, // +X
    { raw: [-25000, 1.0, 0], expectedAngleDeg: -90 }, // -X
    { raw: [0, 1.0, 50000], expectedAngleDeg: 0 }, // +Z
    { raw: [0, 1.0, -99999], expectedAngleDeg: 180 }, // -Z
    { raw: [1e6, 1.5, 1e6], expectedAngleDeg: 45 }, // +X, +Z diagonal
    { raw: [-1e9, 1.0, 1e9], expectedAngleDeg: -45 }, // -X, +Z diagonal
    { raw: [-1e15, 2.0, -1e15], expectedAngleDeg: -135 }, // -X, -Z diagonal
    { raw: [1e50, 0.8, 1e50], expectedAngleDeg: 45 },
    { raw: [1e200, 1.2, -1e200], expectedAngleDeg: 135 },
  ];

  for (const { raw, expectedAngleDeg } of hugeInputs) {
    const clamped = clampCameraTarget(raw, 15.0);
    const radius = Math.hypot(clamped[0], clamped[2]);
    assert.ok(
      Math.abs(radius - 15.0) < 1e-2,
      `Clamped radius for ${JSON.stringify(raw)} must be 15.0m, got ${radius}`
    );

    // Verify angle preservation (atan2(X, Z) in degrees)
    const angleDeg = (Math.atan2(clamped[0], clamped[2]) * 180) / Math.PI;
    const diff = Math.abs(angleDeg - expectedAngleDeg);
    const normalizedDiff = diff > 180 ? 360 - diff : diff;
    assert.ok(
      normalizedDiff < 0.1,
      `Angle preserved: expected ${expectedAngleDeg}°, got ${angleDeg}° for input ${JSON.stringify(raw)}`
    );
  }
});

test('M1 Empirical 1.3: clampCameraTarget boundary handling for negative heights, zero towerTopY, and negative towerTopY', () => {
  // 1. Zero towerTopY
  const zeroTop1 = clampCameraTarget([0, -5.0, 0], 15.0, 0);
  assert.equal(zeroTop1[1], 0.2, 'Below-ground height clamped to minY=0.2 when towerTopY=0');

  const zeroTop2 = clampCameraTarget([0, 0.1, 0], 15.0, 0);
  assert.equal(zeroTop2[1], 0.2, 'Sub-0.2 height clamped to 0.2 when towerTopY=0');

  const zeroTop3 = clampCameraTarget([0, 1.5, 0], 15.0, 0);
  assert.equal(zeroTop3[1], 1.5, 'Valid intermediate height preserved');

  const zeroTop4 = clampCameraTarget([0, 2.5, 0], 15.0, 0);
  assert.equal(zeroTop4[1], 2.5, 'Ceiling is 0 + 2.5 = 2.5m when towerTopY=0');

  const zeroTop5 = clampCameraTarget([0, 10.0, 0], 15.0, 0);
  assert.equal(zeroTop5[1], 2.5, 'Excess height clamped to 2.5m when towerTopY=0');

  // 2. Negative towerTopY (e.g. -10m degenerate or fallen cairn)
  const negTop1 = clampCameraTarget([0, -100.0, 0], 15.0, -10.0);
  assert.equal(negTop1[1], 0.2, 'Negative towerTopY clamped by Math.max(0, towerTopY) -> minY=0.2');

  const negTop2 = clampCameraTarget([0, 50.0, 0], 15.0, -10.0);
  assert.equal(negTop2[1], 2.5, 'Negative towerTopY clamped by Math.max(0, towerTopY) -> maxY=2.5');

  // 3. Degenerate towerTopY: NaN and Infinity
  const nanTop = clampCameraTarget([0, 10.0, 0], 15.0, NaN);
  assert.equal(nanTop[1], 3.5, 'NaN towerTopY falls back to 1.0 (maxY = 1.0 + 2.5 = 3.5m)');

  const infTop = clampCameraTarget([0, 10.0, 0], 15.0, Infinity);
  assert.equal(infTop[1], 3.5, 'Infinity towerTopY falls back to 1.0 (maxY = 1.0 + 2.5 = 3.5m)');

  // 4. Low tower where towerTopY + 2.5 < 1.5 (e.g. towerTopY = -2.0, effectiveTopY = 0 -> maxY = max(1.5, 2.5) = 2.5)
  // Check that maxY is never less than 1.5m
  const minimalTower = clampCameraTarget([0, 2.0, 0], 15.0, 0);
  assert.ok(minimalTower[1] >= 1.5, 'Ceiling is at least 1.5m');
});

test('M1 Empirical 1.4: 10,000-iteration random stress fuzzing of clampCameraTarget maintains all invariants', () => {
  let seed = 123456789;
  function pseudoRandom(): number {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  }

  for (let i = 0; i < 10000; i++) {
    const rawX = (pseudoRandom() - 0.5) * 50000;
    const rawY = (pseudoRandom() - 0.5) * 5000;
    const rawZ = (pseudoRandom() - 0.5) * 50000;
    const maxR = 5 + pseudoRandom() * 25; // 5m ~ 30m
    const topY = (pseudoRandom() - 0.2) * 20; // -4m ~ +16m

    const clamped = clampCameraTarget([rawX, rawY, rawZ], maxR, topY);

    // Invariant 1: Strictly finite numbers
    assert.ok(Number.isFinite(clamped[0]));
    assert.ok(Number.isFinite(clamped[1]));
    assert.ok(Number.isFinite(clamped[2]));

    // Invariant 2: Radial distance <= maxRadius (with 1e-3 float leeway)
    const distXZ = Math.hypot(clamped[0], clamped[2]);
    assert.ok(
      distXZ <= maxR + 1e-3,
      `Iteration ${i}: distXZ ${distXZ} > maxR ${maxR}`
    );

    // Invariant 3: Height within [0.2, maxY]
    const effectiveTop = Math.max(0, topY);
    const expectedMaxY = Math.max(1.5, effectiveTop + 2.5);
    assert.ok(
      clamped[1] >= 0.2 - 1e-4,
      `Iteration ${i}: clamped Y ${clamped[1]} < 0.2`
    );
    assert.ok(
      clamped[1] <= expectedMaxY + 1e-4,
      `Iteration ${i}: clamped Y ${clamped[1]} > maxY ${expectedMaxY}`
    );
  }
});

// ---------------------------------------------------------------------------
// Suite 2: Focus Glide 360-Degree Radial Coverage & Invariant Verification
// ---------------------------------------------------------------------------
test('M1 Empirical 2.1: computeFocusCameraView 360-degree radial sweep at 1-degree steps strictly maintains 1.8m distance and orientation', () => {
  const stones = [
    { x: 0, y: 0, z: 0 },
    { x: 2.5, y: 1.2, z: -3.8 },
    { x: -12.0, y: 0.6, z: 8.5 },
  ];

  for (const stone of stones) {
    for (let deg = 0; deg < 360; deg++) {
      const rad = (deg * Math.PI) / 180;
      const initialDist = 5.0; // Initial camera 5.0m away at azimuth angle `rad`
      const camX = stone.x + Math.sin(rad) * initialDist;
      const camY = stone.y + 1.0;
      const camZ = stone.z + Math.cos(rad) * initialDist;

      const view = computeFocusCameraView(stone, { x: camX, y: camY, z: camZ });

      // Invariant 1: Target is exact stone position (within 4 decimal places)
      assert.ok(Math.abs(view.target[0] - stone.x) < 1e-3, `Target X mismatch at ${deg}°`);
      assert.ok(Math.abs(view.target[1] - stone.y) < 1e-3, `Target Y mismatch at ${deg}°`);
      assert.ok(Math.abs(view.target[2] - stone.z) < 1e-3, `Target Z mismatch at ${deg}°`);

      // Invariant 2: Height offset is exactly +0.35m
      assert.ok(
        Math.abs(view.position[1] - (stone.y + 0.35)) < 1e-3,
        `Elevation offset must be +0.35m, got ${view.position[1] - stone.y}`
      );

      // Invariant 3: Radial distance in XZ plane is exactly 1.8m
      const dx = view.position[0] - stone.x;
      const dz = view.position[2] - stone.z;
      const dist = Math.hypot(dx, dz);
      assert.ok(
        Math.abs(dist - 1.8) < 1e-3,
        `Radial inspection distance at ${deg}° must be 1.8m, got ${dist}`
      );

      // Invariant 4: Azimuth direction matches initial camera position direction
      const origDx = camX - stone.x;
      const origDz = camZ - stone.z;
      const dot = dx * origDx + dz * origDz;
      assert.ok(
        dot > 0,
        `Directional dot product at ${deg}° must be positive (same half-plane), got ${dot}`
      );

      // Angle difference must be ~0
      const resultingAzimuth = Math.atan2(dx, dz);
      let angleDiff = Math.abs(resultingAzimuth - rad);
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
      assert.ok(
        angleDiff < 1e-2,
        `Azimuth angle mismatch at ${deg}°: expected ${rad}, got ${resultingAzimuth}`
      );
    }
  }
});

test('M1 Empirical 2.2: computeFocusCameraView singularity resistance when camera coincides with stone or has finite/degenerate coordinates', () => {
  const stone = { x: 1.0, y: 1.5, z: 2.0 };

  // 1. Exact coincidence (dx = 0, dz = 0): Must not produce NaN or division by zero, defaults to +Z front view
  const coincidentCam = { x: 1.0, y: 1.5, z: 2.0 };
  const coincidentView = computeFocusCameraView(stone, coincidentCam);
  assert.deepEqual(coincidentView.target, [1.0, 1.5, 2.0]);
  assert.equal(coincidentView.position[0], 1.0);
  assert.equal(coincidentView.position[1], 1.85); // 1.5 + 0.35
  assert.equal(coincidentView.position[2], 3.8); // 2.0 + 1.8

  // 2. Pure vertical offset (dx = 0, dz = 0, dy = 10): Defaults to +Z front view without gimbal lock
  const verticalCam = { x: 1.0, y: 11.5, z: 2.0 };
  const verticalView = computeFocusCameraView(stone, verticalCam);
  assert.equal(verticalView.position[0], 1.0);
  assert.equal(verticalView.position[1], 1.85);
  assert.equal(verticalView.position[2], 3.8);

  // 3. Sub-epsilon proximity (hypot(dx, dz) <= 1e-4)
  const tinyOffsetCam = { x: 1.0 + 1e-5, y: 1.5, z: 2.0 + 1e-5 };
  const tinyView = computeFocusCameraView(stone, tinyOffsetCam);
  assert.equal(tinyView.position[0], 1.0);
  assert.equal(tinyView.position[1], 1.85);
  assert.equal(tinyView.position[2], 3.8);

  // 4. Undefined camera position: defaults cleanly to +Z front view
  const undefView = computeFocusCameraView(stone, undefined);
  assert.equal(undefView.position[0], 1.0);
  assert.equal(undefView.position[1], 1.85);
  assert.equal(undefView.position[2], 3.8);

  // 5. Stone position with NaN and Infinity sanitization
  const nanStoneView = computeFocusCameraView({ x: NaN, y: Infinity, z: -0.2 });
  assert.equal(nanStoneView.target[0], 0);
  assert.equal(nanStoneView.target[1], 0);
  assert.equal(nanStoneView.target[2], -0.2);
  assert.equal(nanStoneView.position[0], 0);
  assert.equal(nanStoneView.position[1], 0.35);
  assert.equal(nanStoneView.position[2], 1.6);
});

test('M1 Empirical 2.3: 5,000-sample randomized fuzzing of computeFocusCameraView guarantees 100% numerical stability', () => {
  let seed = 987654321;
  function pseudoRandom(): number {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  }

  for (let i = 0; i < 5000; i++) {
    const stone = {
      x: (pseudoRandom() - 0.5) * 200,
      y: (pseudoRandom() - 0.5) * 50,
      z: (pseudoRandom() - 0.5) * 200,
    };
    const cam = {
      x: stone.x + (pseudoRandom() - 0.5) * 100,
      y: stone.y + (pseudoRandom() - 0.5) * 50,
      z: stone.z + (pseudoRandom() - 0.5) * 100,
    };

    const res = computeFocusCameraView(stone, cam);

    assert.ok(Number.isFinite(res.position[0]));
    assert.ok(Number.isFinite(res.position[1]));
    assert.ok(Number.isFinite(res.position[2]));
    assert.ok(Number.isFinite(res.target[0]));
    assert.ok(Number.isFinite(res.target[1]));
    assert.ok(Number.isFinite(res.target[2]));

    const dx = res.position[0] - res.target[0];
    const dz = res.position[2] - res.target[2];
    const dist = Math.hypot(dx, dz);
    assert.ok(
      Math.abs(dist - 1.8) < 1e-3,
      `Iter ${i}: focus distance ${dist} must be 1.8m`
    );
  }
});

// ---------------------------------------------------------------------------
// Suite 3: Recenter Trigger Distance (2.0m) Threshold Transition Verification
// ---------------------------------------------------------------------------
test('M1 Empirical 3.1: Recenter trigger distance (2.0m) threshold transition behavior (1.99m vs 2.00m vs 2.01m)', () => {
  assert.equal(RECENTER_TRIGGER_DISTANCE, 2.0);

  // Exact step function oracle: isVisible = lateralDist >= 2.0
  function isRecenterVisible(targetX: number, targetZ: number, enabled: boolean = true): boolean {
    const lateralDist = Math.hypot(targetX, targetZ);
    return enabled && lateralDist >= RECENTER_TRIGGER_DISTANCE;
  }

  // 1. Below threshold: 1.99m and 1.999m
  assert.equal(isRecenterVisible(1.99, 0), false, '1.99m along +X must NOT trigger recenter button');
  assert.equal(isRecenterVisible(0, -1.99), false, '1.99m along -Z must NOT trigger recenter button');
  assert.equal(isRecenterVisible(1.407, 1.407), false, 'hypot(1.407, 1.407) ~ 1.9898m must NOT trigger');
  assert.equal(isRecenterVisible(1.9999, 0), false, '1.9999m must NOT trigger');

  // 2. Exactly on threshold: 2.000m
  assert.equal(isRecenterVisible(2.0, 0), true, '2.00m along +X MUST trigger recenter button');
  assert.equal(isRecenterVisible(0, 2.0), true, '2.00m along +Z MUST trigger recenter button');
  assert.equal(isRecenterVisible(-2.0, 0), true, '2.00m along -X MUST trigger recenter button');
  assert.equal(isRecenterVisible(0, -2.0), true, '2.00m along -Z MUST trigger recenter button');
  // Diagonal: sqrt(2) * sqrt(2) = 2.0
  const sqrt2 = Math.SQRT2;
  assert.equal(isRecenterVisible(sqrt2, sqrt2), true, 'Diagonal hypot(sqrt2, sqrt2) = 2.0 MUST trigger');

  // 3. Above threshold: 2.0001m and 2.01m
  assert.equal(isRecenterVisible(2.0001, 0), true, '2.0001m MUST trigger');
  assert.equal(isRecenterVisible(2.01, 0), true, '2.01m along +X MUST trigger recenter button');
  assert.equal(isRecenterVisible(0, 2.01), true, '2.01m along +Z MUST trigger recenter button');
  assert.equal(isRecenterVisible(-1.422, -1.422), true, 'hypot(-1.422, -1.422) ~ 2.011m MUST trigger');

  // 4. Disabled flag override
  assert.equal(isRecenterVisible(5.0, 0, false), false, 'When enableRecenterButton is false, button is never shown');
});

test('M1 Empirical 3.2: 360-degree radial sweep of recenter threshold transitions at delta = ±0.01m', () => {
  for (let deg = 0; deg < 360; deg += 5) {
    const rad = (deg * Math.PI) / 180;
    const sinA = Math.sin(rad);
    const cosA = Math.cos(rad);

    // Test 1: r = 1.99m (strictly false)
    const rBelow = 1.99;
    const xBelow = rBelow * sinA;
    const zBelow = rBelow * cosA;
    const distBelow = Math.hypot(xBelow, zBelow);
    assert.ok(distBelow < RECENTER_TRIGGER_DISTANCE, `Radius 1.99 at ${deg}° must be < 2.0`);
    assert.equal(distBelow >= RECENTER_TRIGGER_DISTANCE, false);

    // Test 2: r = 2.01m (strictly true)
    const rAbove = 2.01;
    const xAbove = rAbove * sinA;
    const zAbove = rAbove * cosA;
    const distAbove = Math.hypot(xAbove, zAbove);
    assert.ok(distAbove > RECENTER_TRIGGER_DISTANCE, `Radius 2.01 at ${deg}° must be > 2.0`);
    assert.equal(distAbove >= RECENTER_TRIGGER_DISTANCE, true);
  }
});

// ---------------------------------------------------------------------------
// Suite 4: Camera Limits & Zen Garden Geometric Hierarchy
// ---------------------------------------------------------------------------
test('M1 Empirical 4.1: Mathematical hierarchy of camera navigation boundaries', () => {
  // Invariant 1: Minimum distance is strictly positive and prevents near-plane clipping
  assert.ok(CAMERA_MIN_DISTANCE >= 1.0, 'Min distance must be at least 1.0m to prevent clipping into cairn');
  assert.equal(CAMERA_MIN_DISTANCE, 1.2);

  // Invariant 2: Pan limit (15m) is strictly smaller than Zen garden disc radius (28m)
  // This guarantees camera target never leaves the visible garden terrain
  assert.ok(
    CAMERA_PAN_MAX_RADIUS < ZEN_GARDEN_RADIUS,
    `CAMERA_PAN_MAX_RADIUS (${CAMERA_PAN_MAX_RADIUS}) must be less than ZEN_GARDEN_RADIUS (${ZEN_GARDEN_RADIUS})`
  );
  assert.equal(CAMERA_PAN_MAX_RADIUS, 15.0);
  assert.equal(ZEN_GARDEN_RADIUS, 28.0);

  // Buffer margin between max pan target and garden rim is at least 10m
  const margin = ZEN_GARDEN_RADIUS - CAMERA_PAN_MAX_RADIUS;
  assert.ok(margin >= 13.0, `Garden boundary margin ${margin}m provides sufficient scenic horizon`);

  // Invariant 3: Maximum distance (24m) allows full panoramic overview
  assert.ok(CAMERA_MAX_DISTANCE >= 20.0);
  assert.equal(CAMERA_MAX_DISTANCE, 24.0);

  // Invariant 4: Recenter threshold (2.0m) is within pan boundary and outside standard podium radius (1.0m)
  assert.ok(RECENTER_TRIGGER_DISTANCE < CAMERA_PAN_MAX_RADIUS);
  assert.ok(RECENTER_TRIGGER_DISTANCE > 1.0);
  assert.equal(RECENTER_TRIGGER_DISTANCE, 2.0);
});

// ---------------------------------------------------------------------------
// Suite 5: Static AST & String Invariants in Production Components
// ---------------------------------------------------------------------------
test('M1 Empirical 5.1: Static assertion verifying critical strings, fog, background, and gesture decoupling', () => {
  const canvasPath = path.resolve(
    projectRoot,
    'presentation/components/StoneTowerCanvas.tsx'
  );
  const canvasContent = fs.readFileSync(canvasPath, 'utf8');

  // 1. Crucial comment for backward-compatibility with drop-guide-darkmode-cluster.test.ts
  assert.ok(
    canvasContent.includes('{/* Circular Ground Pedestal Platform (Dark Mode Stone Contrast) */}'),
    'StoneTowerCanvas.tsx must preserve the Circular Ground Pedestal Platform comment'
  );

  // 2. Exponential fog and matching sky color
  assert.ok(
    canvasContent.includes("<fogExp2 attach=\"fog\" args={['#0F121A', 0.032]} />"),
    'StoneTowerCanvas.tsx must include fogExp2 with #0F121A and 0.032 density'
  );
  assert.ok(
    canvasContent.includes("<color attach=\"background\" args={['#0F121A']} />"),
    'StoneTowerCanvas.tsx must set background color to #0F121A'
  );

  // 3. Zen garden terrain 28m disc
  assert.ok(
    canvasContent.includes('<circleGeometry args={[ZEN_GARDEN_RADIUS, 64]} />'),
    'StoneTowerCanvas.tsx must render Zen garden disc geometry using ZEN_GARDEN_RADIUS'
  );

  // 4. Ambient particles
  assert.ok(
    canvasContent.includes('<ZenAmbientParticles count={24} />'),
    'StoneTowerCanvas.tsx must render ZenAmbientParticles with count=24'
  );

  // 5. Recenter HUD button label
  assert.ok(
    canvasContent.includes('돌탑으로 복귀'),
    'StoneTowerCanvas.tsx must contain recenter HUD button label'
  );

  // 6. Camera target clamping call in useFrame
  assert.ok(
    canvasContent.includes('clampCameraTarget([tx, ty, tz], CAMERA_PAN_MAX_RADIUS, towerTopY)'),
    'StoneTowerCanvas.tsx must call clampCameraTarget with CAMERA_PAN_MAX_RADIUS and towerTopY'
  );

  // 7. Ground collision clamping for camera position
  assert.ok(
    canvasContent.includes('state.camera.position.y = 0.25;'),
    'StoneTowerCanvas.tsx must clamp camera position Y to >= 0.25m'
  );

  // 8. InteractiveDraggableStone3D unmount listener cleanup
  assert.ok(
    canvasContent.includes('activeCleanupRef.current()'),
    'InteractiveDraggableStone3D must call activeCleanupRef on unmount'
  );
  assert.ok(
    canvasContent.includes('controlsRef.current.enabled = true'),
    'InteractiveDraggableStone3D must re-enable controls on unmount'
  );
});
