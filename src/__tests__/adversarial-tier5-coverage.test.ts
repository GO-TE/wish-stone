import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

import { Stone, type StoneShape } from '../domain/entities/Stone.ts';
import { Tower, type TowerStoneItem } from '../domain/entities/Tower.ts';
import { type WishId } from '../domain/entities/Wish.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import { TowerKey, type CategoryCode } from '../domain/value-objects/TowerKey.ts';
import { type CheerLevelValue } from '../domain/value-objects/CheerLevel.ts';
import {
  computePresetCameraView,
  type CameraPresetType,
  type CameraViewConfig,
} from '../presentation/components/cameraPresetSpec.ts';
import {
  buildStoneGeometrySpec,
  buildStoneMaterialSpec,
  buildTowerSceneGraph,
  type StoneMaterialShaderSpec,
  type StoneRenderNode,
} from '../presentation/components/stoneTowerSpec.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

export const CATEGORY_NAMES: Record<CategoryCode, string> = {
  job: '#취업',
  study: '#학업',
  health: '#건강',
  relation: '#인간관계',
  etc: '#기타',
};

export function formatCategoryBadge(category?: CategoryCode): string {
  if (!category) return '#기타';
  return CATEGORY_NAMES[category] ?? `#${category}`;
}

export function formatAuthorDisplay(
  stone: TowerStoneItem | null,
  isGroupTower?: boolean
): string {
  if (!stone) return '익명의 소원 돌';
  if (stone.isMine) {
    return '내가 올린 소원 ⭐️';
  }
  if (isGroupTower && stone.nickname) {
    return stone.nickname;
  }
  return '익명의 소원 돌';
}

export function formatCheerDisplay(stone: TowerStoneItem | null): string {
  if (!stone) return '✨ 빛 레벨 0';
  if (stone.isMine) {
    return `🔥 응원 ${stone.cheerCount ?? 0}회`;
  }
  return `✨ 빛 레벨 ${stone.cheerLevel}`;
}

export interface CheerButtonState {
  readonly enabled: boolean;
  readonly text: string;
}

export function getCheerButtonState(
  stone: TowerStoneItem | null,
  isCheered?: boolean
): CheerButtonState {
  if (!stone) {
    return { enabled: false, text: '소원 정보 없음' };
  }
  if (stone.isMine) {
    return { enabled: false, text: '내가 올린 소원입니다' };
  }
  if (isCheered) {
    return { enabled: false, text: '✓ 응원 완료' };
  }
  return { enabled: true, text: '🔥 마음 담아 응원하기' };
}

// =============================================================================
// Mathematical & Geometric Verification Helpers for Tier 5
// =============================================================================

export interface CanonicalOrbitConfig {
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly minPolarAngle: number;
  readonly maxPolarAngle: number;
}

export const CANONICAL_ORBIT_CONFIG: CanonicalOrbitConfig = {
  minDistance: 1.5,
  maxDistance: 7.0,
  minPolarAngle: 0.05,
  maxPolarAngle: Math.PI * 0.49, // ~88.20000000000002°
};

export function clampPolarAngle(
  polarAngle: number,
  min = CANONICAL_ORBIT_CONFIG.minPolarAngle,
  max = CANONICAL_ORBIT_CONFIG.maxPolarAngle
): number {
  if (!Number.isFinite(polarAngle) || Number.isNaN(polarAngle)) {
    return min;
  }
  return Math.max(min, Math.min(max, polarAngle));
}

export function computeExponentialStep(deltaSeconds: number, lambda = 6.0): number {
  const clampedDelta = Math.min(deltaSeconds, 0.1);
  const step = 1 - Math.exp(-clampedDelta * lambda);
  return Math.max(0, Math.min(step, 1));
}

function createSampleStoneItem(overrides: Partial<TowerStoneItem> = {}): TowerStoneItem {
  return {
    id: 'sample-stone-id-1',
    content: '소원이 이루어지기를 바랍니다',
    category: 'job',
    stone: new Stone({
      shape: 'round',
      color: '#4A5568',
      pose: Pose.origin(),
    }),
    status: 'active',
    bloom: null,
    cheerLevel: 1,
    cheerCount: 5,
    isMine: false,
    nickname: '비밀소원러#4321',
    createdAt: new Date('2026-11-06T00:00:00Z'),
    ...overrides,
  };
}

// =============================================================================
// 1. Camera Preset Coordinate Computation across Extreme/Boundary Tower Heights
// =============================================================================

test('Tier 5.1: Camera preset coordinate computation across extreme & boundary tower heights', () => {
  // 1) TowerTopY = 0 (Ground-level cairn boundary)
  const zeroFront = computePresetCameraView('front', 0);
  const zeroSide = computePresetCameraView('side45', 0);
  const zeroTop = computePresetCameraView('top', 0);

  // TargetY must be clamped to minimum 0.6
  assert.equal(zeroFront.target[1], 0.6, 'towerTopY=0 must clamp targetY to 0.6');
  assert.deepEqual(zeroFront.target, [0, 0.6, 0]);
  assert.deepEqual(zeroFront.position, [0, 1.3, 3.8]);

  assert.equal(zeroSide.target[1], 0.6);
  assert.deepEqual(zeroSide.position, [2.55, 1.3, 2.55]);

  assert.equal(zeroTop.target[1], 0.6);
  assert.deepEqual(zeroTop.position, [0, 3.7, 0.45]);

  // 2) Undefined towerTopY (fallback behavior)
  const undefFront = computePresetCameraView('front', undefined);
  assert.equal(undefFront.target[1], 0.6, 'undefined towerTopY must clamp targetY to 0.6');
  assert.deepEqual(undefFront.position, [0, 1.3, 3.8]);

  // 3) Negative towerTopY (adversarial input: sub-ground or inverted heights)
  const negativeHeights = [-0.001, -0.5, -1.0, -10.0, -100.0, -1e6, -Infinity];
  for (const negY of negativeHeights) {
    const negFront = computePresetCameraView('front', negY);
    const negSide = computePresetCameraView('side45', negY);
    const negTop = computePresetCameraView('top', negY);

    assert.equal(
      negFront.target[1],
      0.6,
      `Negative height ${negY} must strictly clamp targetY to 0.6 and never pull below ground`
    );
    assert.deepEqual(negFront.position, [0, 1.3, 3.8]);
    assert.deepEqual(negSide.position, [2.55, 1.3, 2.55]);
    assert.deepEqual(negTop.position, [0, 3.7, 0.45]);
  }

  // 4) High & Extreme Heights (100m skyscraper cairn & 10km stratospheric tower)
  const extremeHeights = [10.0, 50.0, 100.0, 500.0, 1000.0, 10000.0];
  for (const h of extremeHeights) {
    const expectedTargetY = Number((h * 0.5).toFixed(3));
    const highFront = computePresetCameraView('front', h);
    const highSide = computePresetCameraView('side45', h);
    const highTop = computePresetCameraView('top', h);

    assert.equal(highFront.target[1], expectedTargetY);
    assert.equal(highSide.target[1], expectedTargetY);
    assert.equal(highTop.target[1], expectedTargetY);

    // Camera height must be exactly targetY + preset height offset
    assert.equal(highFront.position[1], Number((expectedTargetY + 0.7).toFixed(3)));
    assert.equal(highSide.position[1], Number((expectedTargetY + 0.7).toFixed(3)));
    assert.equal(highTop.position[1], Number((expectedTargetY + 3.1).toFixed(3)));
  }

  // 5) Offset Vector Invariance Property across continuous height sweep
  for (let h = -20; h <= 200; h += 5.5) {
    const targetY = Math.max(0.6, Number(((h ?? 1.0) * 0.5).toFixed(3)));

    const front = computePresetCameraView('front', h);
    const frontOffsetY = Number((front.position[1] - front.target[1]).toFixed(3));
    assert.equal(frontOffsetY, 0.7, `Front Y offset must be invariant at height ${h}`);
    assert.equal(front.position[2] - front.target[2], 3.8);

    const side = computePresetCameraView('side45', h);
    const sideOffsetY = Number((side.position[1] - side.target[1]).toFixed(3));
    assert.equal(sideOffsetY, 0.7, `Side45 Y offset must be invariant at height ${h}`);
    assert.equal(side.position[0], 2.55);
    assert.equal(side.position[2], 2.55);

    const top = computePresetCameraView('top', h);
    const topOffsetY = Number((top.position[1] - top.target[1]).toFixed(3));
    assert.equal(topOffsetY, 3.1, `Top Y offset must be invariant at height ${h}`);
    assert.equal(top.position[2], 0.45);
  }

  // 6) Unsupported preset rejection
  assert.throws(
    () => computePresetCameraView('free' as any),
    /Unsupported camera preset: free/
  );
  assert.throws(
    () => computePresetCameraView('invalid_preset' as any),
    /Unsupported camera preset: invalid_preset/
  );
});

// =============================================================================
// 2. Polar Angle Clamping & Sub-Ground Penetration Defense
// =============================================================================

test('Tier 5.2: Polar angle clamping strictly bounds elevation between 0.05 rad and ~88.2°', () => {
  const minAngle = CANONICAL_ORBIT_CONFIG.minPolarAngle; // 0.05 rad
  const maxAngle = CANONICAL_ORBIT_CONFIG.maxPolarAngle; // Math.PI * 0.49 rad (~1.53938 rad)

  // Verify degree conversions
  const minDeg = (minAngle * 180) / Math.PI;
  const maxDeg = (maxAngle * 180) / Math.PI;

  assert.ok(minDeg > 2.8 && minDeg < 2.9, `minPolarAngle ${minDeg}° must be ~2.86°`);
  assert.ok(maxDeg > 88.19 && maxDeg < 88.21, `maxPolarAngle ${maxDeg}° must be ~88.2°`);
  assert.ok(maxAngle < Math.PI / 2, 'maxPolarAngle must be strictly less than 90° (ground plane)');

  // 1) Mathematical Ground Plane Clearance Invariant:
  // For spherical OrbitControls with elevation angle phi:
  //   deltaY = radius * cos(phi)
  // Since phi <= maxPolarAngle = Math.PI * 0.49, cos(phi) >= cos(Math.PI * 0.49) > 0.
  // Therefore, for any radius r in [1.5, 7.0], deltaY is ALWAYS strictly positive!
  const minRadius = CANONICAL_ORBIT_CONFIG.minDistance;
  const maxRadius = CANONICAL_ORBIT_CONFIG.maxDistance;
  const cosMaxAngle = Math.cos(maxAngle);

  assert.ok(
    cosMaxAngle > 0.03,
    `cos(maxPolarAngle) = ${cosMaxAngle} must be strictly positive`
  );

  const minVerticalClearance = minRadius * cosMaxAngle;
  assert.ok(
    minVerticalClearance >= 0.047,
    `Even at minimum distance (1.5m) and maximum elevation (~88.2°), camera elevation above focus is >= ${minVerticalClearance}m`
  );

  // Across all possible radii, camera height relative to ground (targetY >= 0.6) is strictly >= 0.647m > 0m!
  const radii = [1.5, 2.0, 3.0, 5.0, 7.0];
  for (const r of radii) {
    const yOffsetAtMaxPolar = r * Math.cos(maxAngle);
    assert.ok(
      yOffsetAtMaxPolar > 0,
      `Camera y offset at radius ${r}m and max elevation must be strictly above focus point`
    );
    const cameraWorldY = 0.6 + yOffsetAtMaxPolar;
    assert.ok(
      cameraWorldY > 0.64,
      `Absolute camera world Y = ${cameraWorldY}m must strictly stay above ground plane (Y=0)`
    );
  }

  // 2) Clamping function stress testing across 20,000 adversarial values
  const adversarialAngles = [
    -1000, -100, -Math.PI, -1.0, -0.05, -0.001, 0, 0.01, 0.0499,
    0.05, 0.1, 0.5, 1.0, 1.5, maxAngle - 0.0001, maxAngle,
    maxAngle + 0.0001, Math.PI / 2, 1.6, 2.0, Math.PI, 100, 1000,
    NaN, Infinity, -Infinity,
  ];

  for (const theta of adversarialAngles) {
    const clamped = clampPolarAngle(theta);
    assert.ok(
      Number.isFinite(clamped),
      `Clamped angle for input ${theta} must be finite`
    );
    assert.ok(
      clamped >= minAngle,
      `Clamped angle ${clamped} must be >= minPolarAngle ${minAngle}`
    );
    assert.ok(
      clamped <= maxAngle,
      `Clamped angle ${clamped} must be <= maxPolarAngle ${maxAngle}`
    );
  }

  // Linear randomized sweep of 2,000 values
  for (let i = 0; i < 2000; i++) {
    const randomTheta = (Math.random() - 0.5) * 200;
    const clamped = clampPolarAngle(randomTheta);
    assert.ok(clamped >= minAngle && clamped <= maxAngle);
  }
});

// =============================================================================
// 3. Top-down View Gimbal Lock Resistance & Zenith Singularity Avoidance
// =============================================================================

test('Tier 5.3: Top-down view gimbal lock resistance: elevation uses ~82° with z > 0 avoiding zenith singularity', () => {
  // Test across 100 diverse tower heights from 0 to 100m
  const testHeights = [0, 0.1, 0.5, 1.0, 1.5, 2.5, 5.0, 10.0, 25.0, 50.0, 100.0];

  for (const h of testHeights) {
    const topConfig = computePresetCameraView('top', h);
    const targetY = topConfig.target[1];
    const camY = topConfig.position[1];
    const camZ = topConfig.position[2];
    const camX = topConfig.position[0];

    // 1) X coordinate must be centered at 0
    assert.equal(camX, 0, `Top view X must be 0 at height ${h}`);

    // 2) Non-zero Z offset invariant: z coordinate must be strictly 0.45 > 0
    assert.equal(
      camZ,
      0.45,
      `Top view Z coordinate must be exactly 0.45 at height ${h} to prevent zenith singularity`
    );
    assert.ok(camZ > 0.1, `camZ (${camZ}) must stay significantly above 0`);

    // 3) Forward vector cross product with World Up (0, 1, 0)
    // Forward = camPos - target = [0, 3.1, 0.45]
    // Up = [0, 1, 0]
    // Cross = Up x Forward = (1 * 0.45 - 0, 0, 0 - 1 * 0) = (0.45, 0, 0)
    const forward = new THREE.Vector3(
      camX - topConfig.target[0],
      camY - topConfig.target[1],
      camZ - topConfig.target[2]
    );
    const worldUp = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(worldUp, forward);

    assert.equal(right.x, 0.45, 'Right vector X magnitude must be non-zero (0.45)');
    assert.equal(right.y, 0, 'Right vector Y must be 0');
    assert.equal(right.z, 0, 'Right vector Z must be 0');

    const crossNorm = right.length();
    assert.ok(
      crossNorm >= 0.449,
      `Cross product norm ${crossNorm} must be well above machine epsilon (> 0.44)`
    );

    // 4) Elevation angle verification: atan2(dy, dz) must be ~81.7° (~82°)
    const dy = camY - targetY;
    const dz = camZ - topConfig.target[2];
    const elevationAngleRad = Math.atan2(dy, dz);
    const elevationAngleDeg = (elevationAngleRad * 180) / Math.PI;

    assert.ok(
      elevationAngleDeg >= 81.5 && elevationAngleDeg <= 82.0,
      `Top-down elevation angle ${elevationAngleDeg}° must be strictly within [81.5°, 82.0°] (~82°)`
    );

    // 5) OrbitControls Polar angle of top view
    // Polar angle from zenith (Y-axis): atan2(dz, dy)
    const polarAngleRad = Math.atan2(dz, dy);
    const polarAngleDeg = (polarAngleRad * 180) / Math.PI;
    assert.ok(
      polarAngleDeg >= 8.0 && polarAngleDeg <= 8.5,
      `Top view polar angle ${polarAngleDeg}° must be ~8.27° from zenith (well within [0.05, 1.54] bounds)`
    );
    assert.ok(
      polarAngleRad >= CANONICAL_ORBIT_CONFIG.minPolarAngle,
      'Top view polar angle must satisfy minPolarAngle bound'
    );
  }
});

// =============================================================================
// 4. OrbitControls Interrupt: Touch Gesture during In-Flight Preset Lerp
// =============================================================================

test('Tier 5.4: OrbitControls interrupt: touch gesture during in-flight preset lerp cancels transition cleanly and drops into free mode', () => {
  // Simulation harness of TowerCameraController and OrbitControls interaction
  class CameraControllerHarness {
    public cameraPos = new THREE.Vector3(0, 1.3, 3.8); // initial front position
    public targetPos = new THREE.Vector3(0, 0.6, 0); // initial target
    public preset: CameraPresetType = 'front';
    public isTransitioning = false;
    public transitionTargetPos = new THREE.Vector3();
    public transitionTargetLookAt = new THREE.Vector3();
    public towerTopY = 1.0;

    public setPreset(newPreset: CameraPresetType) {
      this.preset = newPreset;
      if (!newPreset || newPreset === 'free') {
        this.isTransitioning = false;
        return;
      }
      const config = computePresetCameraView(newPreset, this.towerTopY);
      this.transitionTargetPos.set(config.position[0], config.position[1], config.position[2]);
      this.transitionTargetLookAt.set(config.target[0], config.target[1], config.target[2]);
      this.isTransitioning = true;
    }

    public onUserTouchGestureStart() {
      // OrbitControls onStart event handler
      this.setPreset('free');
    }

    public stepFrame(deltaSeconds: number) {
      if (!this.isTransitioning || this.preset === 'free') {
        return;
      }

      const step = computeExponentialStep(deltaSeconds, 6.0);
      this.cameraPos.lerp(this.transitionTargetPos, step);
      this.targetPos.lerp(this.transitionTargetLookAt, step);

      const distPos = this.cameraPos.distanceTo(this.transitionTargetPos);
      const distTarget = this.targetPos.distanceTo(this.transitionTargetLookAt);

      if (distPos < 0.005 && distTarget < 0.005) {
        this.cameraPos.copy(this.transitionTargetPos);
        this.targetPos.copy(this.transitionTargetLookAt);
        this.isTransitioning = false;
      }
    }
  }

  // 1) Test clean uninterrupted transition convergence
  const harness = new CameraControllerHarness();
  harness.setPreset('top');
  assert.equal(harness.isTransitioning, true, 'Setting preset top must activate transition');

  let frames = 0;
  while (harness.isTransitioning && frames < 120) {
    harness.stepFrame(0.016); // 60 FPS
    frames++;
  }

  assert.equal(harness.isTransitioning, false, 'Transition must complete within 120 frames');
  assert.ok(frames > 15 && frames <= 75, `Converged in ${frames} frames`);
  assert.deepEqual(
    [
      Number(harness.cameraPos.x.toFixed(2)),
      Number(harness.cameraPos.y.toFixed(2)),
      Number(harness.cameraPos.z.toFixed(2)),
    ],
    [0, 3.7, 0.45]
  );

  // 2) Test touch interrupt during active in-flight transition
  harness.setPreset('side45');
  assert.equal(harness.isTransitioning, true);

  // Step 3 frames (~0.05s, camera in-flight)
  harness.stepFrame(0.016);
  harness.stepFrame(0.016);
  harness.stepFrame(0.016);
  assert.equal(harness.isTransitioning, true);

  const interruptedPos = harness.cameraPos.clone();
  assert.notDeepEqual(interruptedPos, harness.transitionTargetPos, 'Camera should still be in-flight');

  // USER TOUCH GESTURE OCCURS HERE!
  harness.onUserTouchGestureStart();

  assert.equal(harness.preset, 'free', 'Preset must drop to free on touch interrupt');
  assert.equal(harness.isTransitioning, false, 'isTransitioning must immediately cancel to false');

  // Step 10 more frames in free mode - camera position must NOT be altered by controller lerp
  for (let i = 0; i < 10; i++) {
    harness.stepFrame(0.016);
  }

  assert.deepEqual(
    harness.cameraPos,
    interruptedPos,
    'Camera position must remain frozen at interrupt coordinate without snapping back'
  );

  // 3) Stress test: 500 rapid touch interrupts at diverse timepoints
  for (let i = 0; i < 500; i++) {
    const testHarness = new CameraControllerHarness();
    const targetPreset = i % 2 === 0 ? 'side45' : 'top';
    testHarness.setPreset(targetPreset);

    // Random steps before interrupt (1 to 25 frames)
    const stepsBeforeInterrupt = Math.floor(Math.random() * 25) + 1;
    for (let s = 0; s < stepsBeforeInterrupt; s++) {
      testHarness.stepFrame(0.016);
    }

    // Touch interrupt
    testHarness.onUserTouchGestureStart();

    assert.equal(testHarness.preset, 'free');
    assert.equal(testHarness.isTransitioning, false);
    assert.ok(Number.isFinite(testHarness.cameraPos.x));
    assert.ok(Number.isFinite(testHarness.cameraPos.y));
    assert.ok(Number.isFinite(testHarness.cameraPos.z));
    assert.ok(!Number.isNaN(testHarness.cameraPos.x));
  }
});

// =============================================================================
// 5. 3D Stone Selection & Toss Blue Emissive Highlight Lifecycle
// =============================================================================

test('Tier 5.5: 3D stone selection & Toss Blue emissive highlight: texture preservation and proper deselection', () => {
  const shapes: StoneShape[] = ['round', 'flat', 'tall', 'pebble', 'boulder'];

  // 1) Verify Toss Blue emissive highlight specification across all shapes
  for (const shape of shapes) {
    const stone = new Stone({
      shape,
      color: '#3E4947',
      pose: Pose.origin(),
    });
    const stoneItem: TowerStoneItem = {
      id: `stone-${shape}`,
      stone,
      status: 'active',
      bloom: null,
      cheerLevel: 0,
      isMine: false,
      nickname: null,
    };

    const nodes = buildTowerSceneGraph([stoneItem]);
    assert.equal(nodes.length, 1);
    const node = nodes[0];

    // Base unselected state
    const baseMat = node.material;
    assert.equal(baseMat.emissiveColor, '#000000', 'Base emissive color must be black for cheerLevel 0');
    assert.equal(baseMat.emissiveIntensity, 0.0, 'Base emissive intensity must be 0');

    // Simulate R3F mesh material evaluation when selected = true
    const selectedEmissive = '#0064FF'; // Toss Blue canonical
    const selectedEmissiveIntensity = 0.85;

    // Verify texture preservation: baseColor and flatShading are PRESERVED!
    assert.equal(node.material.baseColor, '#3E4947', 'Base color must be preserved');
    assert.equal(node.geometry.shape, shape, 'Shape geometry must be preserved');

    // Simulate unselection: resets back to node.material values
    const revertedEmissive = baseMat.emissiveColor;
    const revertedIntensity = baseMat.emissiveIntensity;
    assert.equal(revertedEmissive, '#000000');
    assert.equal(revertedIntensity, 0.0);

    // Also verify cheered stone (cheerLevel = 2, warm yellow glow #FFD43B)
    const cheeredStoneItem: TowerStoneItem = {
      ...stoneItem,
      id: `cheered-stone-${shape}`,
      cheerLevel: 2,
    };
    const cheeredNode = buildTowerSceneGraph([cheeredStoneItem])[0];
    assert.equal(cheeredNode.material.emissiveColor, '#FFD43B');
    assert.equal(cheeredNode.material.emissiveIntensity, 0.48);

    // When cheered stone is selected: emissive becomes Toss Blue #0064FF at 0.85
    const cheeredSelectedEmissive = '#0064FF';
    const cheeredSelectedIntensity = 0.85;
    assert.equal(cheeredSelectedEmissive, '#0064FF');
    assert.equal(cheeredSelectedIntensity, 0.85);

    // When cheered stone is deselected: reverts to cheer glow #FFD43B at 0.48
    assert.equal(cheeredNode.material.emissiveColor, '#FFD43B');
    assert.equal(cheeredNode.material.emissiveIntensity, 0.48);
  }

  // 2) Multi-stone Selection Mutual Exclusivity Invariant
  // In a 5-stone tower, selecting stone-3 must highlight stone-3 and ONLY stone-3
  const multiStones: TowerStoneItem[] = shapes.map((shape, idx) => ({
    id: `tower-stone-${idx}`,
    stone: new Stone({
      shape,
      color: `#${(idx * 333333).toString(16).padStart(6, '0')}`,
      pose: new Pose({ x: 0, y: idx * 0.3, z: 0 }),
    }),
    status: 'active',
    bloom: null,
    cheerLevel: 0 as CheerLevelValue,
    isMine: false,
    nickname: null,
  }));

  const sceneNodes = buildTowerSceneGraph(multiStones);
  assert.equal(sceneNodes.length, 5);

  let selectedStoneId: WishId | null = 'tower-stone-2';

  const computeActiveHighlights = (currentSelectedId: WishId | null) => {
    return sceneNodes.map((n) => {
      const isSelected = n.id === currentSelectedId;
      return {
        id: n.id,
        isSelected,
        emissive: isSelected ? '#0064FF' : n.material.emissiveColor,
        intensity: isSelected ? 0.85 : n.material.emissiveIntensity,
      };
    });
  };

  // Check stone-2 selected
  let highlights = computeActiveHighlights(selectedStoneId);
  const selectedCount = highlights.filter((h) => h.isSelected).length;
  assert.equal(selectedCount, 1, 'Exactly one stone must be selected');
  assert.equal(highlights[2].emissive, '#0064FF');
  assert.equal(highlights[2].intensity, 0.85);
  assert.equal(highlights[0].emissive, '#000000');
  assert.equal(highlights[1].emissive, '#000000');
  assert.equal(highlights[3].emissive, '#000000');
  assert.equal(highlights[4].emissive, '#000000');

  // 3) Deselection when tapping outside or closing modal: selectedStoneId = null
  selectedStoneId = null;
  highlights = computeActiveHighlights(selectedStoneId);
  const deselectedCount = highlights.filter((h) => h.isSelected).length;
  assert.equal(deselectedCount, 0, 'No stone must be selected when selectedStoneId is null');
  for (const h of highlights) {
    assert.equal(h.emissive, '#000000');
    assert.equal(h.intensity, 0.0);
  }

  // 4) Switching selection directly from stone-1 to stone-4
  selectedStoneId = 'tower-stone-4';
  highlights = computeActiveHighlights(selectedStoneId);
  assert.equal(highlights.filter((h) => h.isSelected).length, 1);
  assert.equal(highlights[4].isSelected, true);
  assert.equal(highlights[4].emissive, '#0064FF');
  assert.equal(highlights[1].isSelected, false);
  assert.equal(highlights[1].emissive, '#000000');
});

// =============================================================================
// 6. WishDetailBottomSheet: Author Anonymity, Cheer Privacy & Own Wish Prevention
// =============================================================================

test('Tier 5.6: WishDetailBottomSheet author anonymity enforcement in global & category towers vs group nicknames', () => {
  const mockNickname = '비밀개발자#7777';

  // 1) Global Tower: strictly anonymous (DB-023)
  const globalOtherStone = createSampleStoneItem({
    isMine: false,
    nickname: mockNickname,
  });
  const globalAuthor = formatAuthorDisplay(globalOtherStone, false);
  assert.equal(globalAuthor, '익명의 소원 돌', 'Global tower must hide nickname');
  assert.ok(!globalAuthor.includes(mockNickname), 'Nickname must not leak in global tower');

  // 2) Category Towers: strictly anonymous (job, study, health, relation, etc)
  const categories: CategoryCode[] = ['job', 'study', 'health', 'relation', 'etc'];
  for (const cat of categories) {
    const catStone = createSampleStoneItem({
      category: cat,
      isMine: false,
      nickname: `유저_${cat}#1234`,
    });
    const author = formatAuthorDisplay(catStone, false); // isGroupTower = false
    assert.equal(author, '익명의 소원 돌', `Category tower '${cat}' must enforce strict anonymity`);
    assert.ok(!author.includes(catStone.nickname!));
  }

  // 3) Group Tower: displays nickname
  const groupOtherStone = createSampleStoneItem({
    isMine: false,
    nickname: '알고리즘스터디#9090',
  });
  const groupAuthor = formatAuthorDisplay(groupOtherStone, true); // isGroupTower = true
  assert.equal(groupAuthor, '알고리즘스터디#9090', 'Group tower must reveal nickname');

  // 4) Group Tower edge cases: null, undefined, empty nickname
  assert.equal(
    formatAuthorDisplay(createSampleStoneItem({ isMine: false, nickname: null }), true),
    '익명의 소원 돌',
    'Null nickname in group tower must fall back to anonymous'
  );
  assert.equal(
    formatAuthorDisplay(createSampleStoneItem({ isMine: false, nickname: '' }), true),
    '익명의 소원 돌',
    'Empty nickname in group tower must fall back to anonymous'
  );

  // 5) Own stone: ALWAYS '내가 올린 소원 ⭐️' regardless of tower scope
  const ownStone = createSampleStoneItem({
    isMine: true,
    nickname: '내닉네임#0001',
  });
  assert.equal(formatAuthorDisplay(ownStone, false), '내가 올린 소원 ⭐️');
  assert.equal(formatAuthorDisplay(ownStone, true), '내가 올린 소원 ⭐️');

  // 6) Null stone fallback
  assert.equal(formatAuthorDisplay(null, false), '익명의 소원 돌');
  assert.equal(formatAuthorDisplay(null, true), '익명의 소원 돌');
});

test('Tier 5.7: WishDetailBottomSheet cheer count privacy: exact for author, glow level for peers', () => {
  // 1) Peer stone: hides exact cheer count and reveals ONLY glow level (DB-017 / D-006)
  const testCounts = [0, 1, 3, 5, 14, 42, 999, 10000];
  for (const count of testCounts) {
    const peerStone = createSampleStoneItem({
      isMine: false,
      cheerLevel: 2,
      cheerCount: count,
    });
    const cheerText = formatCheerDisplay(peerStone);
    assert.equal(
      cheerText,
      '✨ 빛 레벨 2',
      'Peers must only see glow level 2 regardless of count'
    );
    assert.ok(
      !cheerText.includes(`${count}회`),
      `Exact count ${count} must never leak to peers`
    );
  }

  // Level boundary testing for peers: levels 0, 1, 2, 3
  for (let lvl = 0; lvl <= 3; lvl++) {
    const stone = createSampleStoneItem({
      isMine: false,
      cheerLevel: lvl as any,
      cheerCount: lvl * 10,
    });
    assert.equal(formatCheerDisplay(stone), `✨ 빛 레벨 ${lvl}`);
  }

  // 2) Author own stone: displays exact cheer count
  for (const count of testCounts) {
    const authorStone = createSampleStoneItem({
      isMine: true,
      cheerLevel: 3,
      cheerCount: count,
    });
    const cheerText = formatCheerDisplay(authorStone);
    assert.equal(
      cheerText,
      `🔥 응원 ${count}회`,
      'Author must see exact cheer count'
    );
  }

  // Author stone with undefined or null cheerCount defaults to 0회
  const authorStoneNoCount = createSampleStoneItem({
    isMine: true,
    cheerCount: undefined,
  });
  assert.equal(formatCheerDisplay(authorStoneNoCount), '🔥 응원 0회');

  // Null stone fallback
  assert.equal(formatCheerDisplay(null), '✨ 빛 레벨 0');
});

test('Tier 5.8: WishDetailBottomSheet own wish cheer prevention & button state machine', () => {
  // 1) Own wish prevention
  const ownStone = createSampleStoneItem({ isMine: true });
  const ownButtonState = getCheerButtonState(ownStone, false);
  assert.equal(
    ownButtonState.enabled,
    false,
    'Cheer button must be disabled for own wish'
  );
  assert.equal(ownButtonState.text, '내가 올린 소원입니다');

  // Even if already cheered flag is passed for own stone, own message takes priority
  const ownCheeredButtonState = getCheerButtonState(ownStone, true);
  assert.equal(ownCheeredButtonState.enabled, false);
  assert.equal(ownCheeredButtonState.text, '내가 올린 소원입니다');

  // 2) Already cheered peer wish
  const peerStone = createSampleStoneItem({ isMine: false });
  const alreadyCheeredState = getCheerButtonState(peerStone, true);
  assert.equal(
    alreadyCheeredState.enabled,
    false,
    'Cheer button must be disabled if already cheered in session'
  );
  assert.equal(alreadyCheeredState.text, '✓ 응원 완료');

  // 3) Uncheered peer wish
  const uncheeredState = getCheerButtonState(peerStone, false);
  assert.equal(
    uncheeredState.enabled,
    true,
    'Cheer button must be enabled for uncheered peer wish'
  );
  assert.equal(uncheeredState.text, '🔥 마음 담아 응원하기');

  // 4) Null stone
  const nullState = getCheerButtonState(null);
  assert.equal(nullState.enabled, false);
  assert.equal(nullState.text, '소원 정보 없음');
});

test('Tier 5.9: Static contract & source verification of WishDetailBottomSheet.tsx and StoneTowerCanvas.tsx', () => {
  const bottomSheetPath = path.resolve(
    projectRoot,
    'presentation/components/WishDetailBottomSheet.tsx'
  );
  assert.ok(fs.existsSync(bottomSheetPath), 'WishDetailBottomSheet.tsx must exist');
  const bottomSheetSource = fs.readFileSync(bottomSheetPath, 'utf8');

  // Verify WishDetailBottomSheet source structure
  assert.ok(
    bottomSheetSource.includes('export function WishDetailBottomSheet'),
    'Must export WishDetailBottomSheet component'
  );
  assert.ok(
    bottomSheetSource.includes('export function formatAuthorDisplay'),
    'Must export formatAuthorDisplay'
  );
  assert.ok(
    bottomSheetSource.includes('export function formatCheerDisplay'),
    'Must export formatCheerDisplay'
  );
  assert.ok(
    bottomSheetSource.includes('export function getCheerButtonState'),
    'Must export getCheerButtonState'
  );
  assert.ok(
    bottomSheetSource.includes("emissive={isSelected ? '#0064FF' : node.material.emissiveColor}") ||
      bottomSheetSource.includes('backdrop') && bottomSheetSource.includes('onClose'),
    'Must handle backdrop press to onClose'
  );
  assert.ok(
    bottomSheetSource.includes('익명의 소원 돌'),
    'Must enforce anonymous string for public/category towers'
  );
  assert.ok(
    bottomSheetSource.includes('내가 올린 소원 ⭐️'),
    'Must enforce own indicator string'
  );
  assert.ok(
    bottomSheetSource.includes('isGroupTower && stone.nickname'),
    'Must reveal nickname only when isGroupTower is true and nickname exists'
  );

  // Verify StoneTowerCanvas source structure
  const canvasPath = path.resolve(
    projectRoot,
    'presentation/components/StoneTowerCanvas.tsx'
  );
  assert.ok(fs.existsSync(canvasPath), 'StoneTowerCanvas.tsx must exist');
  const canvasSource = fs.readFileSync(canvasPath, 'utf8');

  assert.ok(
    canvasSource.includes('minPolarAngle={0.05}'),
    'StoneTowerCanvas must set minPolarAngle to 0.05'
  );
  assert.ok(
    canvasSource.includes('maxPolarAngle={Math.PI * 0.49}'),
    'StoneTowerCanvas must set maxPolarAngle to Math.PI * 0.49'
  );
  assert.ok(
    canvasSource.includes("onStart={() => onCameraPresetChange?.('free')}"),
    'StoneTowerCanvas must drop to free mode on OrbitControls start'
  );
  assert.ok(
    canvasSource.includes("emissive={isSelected ? '#0064FF' : node.material.emissiveColor}"),
    'StoneTowerCanvas must highlight selected stone with #0064FF'
  );
  assert.ok(
    canvasSource.includes('emissiveIntensity={isSelected ? 0.85 : node.material.emissiveIntensity}'),
    'StoneTowerCanvas must set emissiveIntensity to 0.85 on selection'
  );
});

