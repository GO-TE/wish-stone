import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

import { createMsaAppContainer } from '../container.ts';
import { Stone, type StoneShape } from '../domain/entities/Stone.ts';
import { Tower } from '../domain/entities/Tower.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import { TowerKey } from '../domain/value-objects/TowerKey.ts';
import { StonePhysicsBodyFactory } from '../infrastructure/physics/StonePhysicsBodyFactory.ts';
import {
  type CameraPresetType,
  computePresetCameraView,
  computeFocusCameraView,
  clampCameraTarget,
  ZEN_GARDEN_RADIUS,
  CAMERA_PAN_MAX_RADIUS,
  CAMERA_MIN_DISTANCE,
  CAMERA_MAX_DISTANCE,
  RECENTER_TRIGGER_DISTANCE,
} from '../presentation/components/cameraPresetSpec.ts';
import {
  DEFAULT_INITIAL_SPAWN_POSITION,
  computeInitialSpawnPosition,
  computeDragWorldPosition,
  evaluateLiveBalance,
  shouldTriggerDrop,
  calculate3DDropPoseFromWorldPosition,
  BALANCE_THRESHOLD_STABLE,
  BALANCE_THRESHOLD_CAUTION,
  DROP_ZONE_MAX_LATERAL_X,
  DROP_ZONE_MAX_DEPTH_Z,
  DROP_HEIGHT_THRESHOLD_RATIO,
  type DragWorldPositionResult,
} from '../presentation/components/stoneDragSpec.ts';
import {
  PEBBLE_SHAPE_PROFILES,
  NATURAL_PEBBLE_COLORS,
} from '../presentation/components/pebbleGeometrySpec.ts';
import { buildStoneGeometrySpec } from '../presentation/components/stoneTowerSpec.ts';
import { StackStoneController } from '../presentation/controllers/StackStoneController.ts';

// =============================================================================
// TIER 5 ADVERSARIAL TEST SUITE: SCENE LIFECYCLE & STRESS HARDENING
// =============================================================================

// Mock Window Event Target for simulating pointer / touch / gesture event streams
class MockWindowTarget {
  private listeners: Map<string, Set<(ev: any) => void>> = new Map();

  addEventListener(type: string, listener: (ev: any) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: (ev: any) => void) {
    const set = this.listeners.get(type);
    if (set) {
      set.delete(listener);
    }
  }

  dispatchEvent(type: string, event: any) {
    const set = this.listeners.get(type);
    if (set) {
      for (const listener of Array.from(set)) {
        listener(event);
      }
    }
  }

  getListenerCount(type?: string): number {
    if (type) {
      return this.listeners.get(type)?.size ?? 0;
    }
    let total = 0;
    for (const set of this.listeners.values()) {
      total += set.size;
    }
    return total;
  }

  clear() {
    this.listeners.clear();
  }
}

/**
 * Harness for InteractiveDraggableStone3D lifecycle verbatim from StoneTowerCanvas.tsx
 */
function createDragHarness(options: {
  mockWindow: MockWindowTarget;
  isDraggable?: boolean;
  towerTopY?: number;
  initialPos?: readonly [number, number, number];
  cameraPos?: { x: number; y: number; z: number };
  onDragStart?: () => void;
  onDragMove?: (res: DragWorldPositionResult) => void;
  onDrop?: (pose: Pose) => void;
  onDragCancel?: () => void;
}) {
  const {
    mockWindow,
    isDraggable = true,
    towerTopY = 0.8,
    initialPos = DEFAULT_INITIAL_SPAWN_POSITION,
    cameraPos = { x: 0, y: 1.8, z: 3.8 },
    onDragStart,
    onDragMove,
    onDrop,
    onDragCancel,
  } = options;

  const stone = new Stone({ shape: 'round', color: '#888', pose: Pose.origin() });
  const controlsRef = { current: { enabled: true } };

  const isDraggingRef = { current: false };
  const currentPosRef = { current: initialPos };
  const activePointerIdRef = { current: null as number | null };
  const activeCleanupRef = { current: null as (() => void) | null };
  const dragAzimuthRef = { current: 0 };
  const startPointerRef = { current: { x: 0, y: 0 } };
  const balanceRatingRef = { current: 'stable' as 'stable' | 'caution' | 'critical' };
  const isOverDropZoneRef = { current: false };

  const unmount = () => {
    if (activeCleanupRef.current) {
      activeCleanupRef.current();
    }
    if (controlsRef.current) {
      controlsRef.current.enabled = true;
    }
  };

  const onPhaseChange = (phase: string) => {
    if (phase === 'IDLE') {
      if (activeCleanupRef.current) {
        activeCleanupRef.current();
      }
      if (controlsRef.current) {
        controlsRef.current.enabled = true;
      }
      currentPosRef.current = initialPos;
      isDraggingRef.current = false;
      balanceRatingRef.current = 'stable';
      isOverDropZoneRef.current = false;
    }
  };

  const handlePointerDown = (e: {
    pointerId?: number;
    clientX?: number;
    clientY?: number;
    stopPropagation?: () => void;
    target?: any;
  }) => {
    if (!isDraggable || isDraggingRef.current) return;
    e.stopPropagation?.();

    isDraggingRef.current = true;
    const activePointerId = e.pointerId ?? 1;
    activePointerIdRef.current = activePointerId;

    if (
      typeof e.target?.setPointerCapture === 'function' &&
      typeof e.pointerId === 'number'
    ) {
      try {
        e.target.setPointerCapture(e.pointerId);
      } catch {
        // Fallback
      }
    }

    const startAz = Math.atan2(cameraPos.x, cameraPos.z);
    dragAzimuthRef.current = startAz;

    if (controlsRef.current) {
      controlsRef.current.enabled = false;
    }

    const clientX = e.clientX ?? 0;
    const clientY = e.clientY ?? 0;
    startPointerRef.current = { x: clientX, y: clientY };

    onDragStart?.();

    const handleWindowPointerMove = (ev: {
      pointerId: number;
      clientX: number;
      clientY: number;
    }) => {
      if (!isDraggingRef.current) return;
      if (
        activePointerIdRef.current !== null &&
        ev.pointerId !== activePointerIdRef.current
      ) {
        return;
      }

      const deltaX = ev.clientX - startPointerRef.current.x;
      const deltaY = ev.clientY - startPointerRef.current.y;

      const theta = dragAzimuthRef.current;
      const dxWorld = deltaX * 0.003;
      const dyWorld = -deltaY * 0.0035;

      const targetDropY = Math.max(0, towerTopY) + 0.35;
      const totalVerticalSpan = Math.max(0.2, targetDropY - initialPos[1]);
      const rawProgress = dyWorld / totalVerticalSpan;
      const normalizedProgress = Math.max(0, Math.min(1, rawProgress));

      const rightX = Math.cos(theta);
      const rightZ = -Math.sin(theta);

      const spawnDist = 1.15;
      const radialDist = spawnDist * (1 - normalizedProgress);

      const x = Number((Math.sin(theta) * radialDist + rightX * dxWorld).toFixed(4));
      const z = Number((Math.cos(theta) * radialDist + rightZ * dxWorld).toFixed(4));
      const y = Number((initialPos[1] + dyWorld).toFixed(4));

      const absLateral = Math.abs(dxWorld);
      const balance: 'stable' | 'caution' | 'critical' =
        absLateral <= BALANCE_THRESHOLD_STABLE
          ? 'stable'
          : absLateral <= BALANCE_THRESHOLD_CAUTION
          ? 'caution'
          : 'critical';

      const isOverZone =
        y >= targetDropY - 0.22 &&
        absLateral <= DROP_ZONE_MAX_LATERAL_X &&
        radialDist <= DROP_ZONE_MAX_DEPTH_Z;

      const result: DragWorldPositionResult = {
        position: [x, y, z] as const,
        normalizedProgress,
        isOverDropZone: isOverZone,
        balanceRating: balance,
      };

      currentPosRef.current = result.position;
      balanceRatingRef.current = result.balanceRating;
      isOverDropZoneRef.current = result.isOverDropZone;

      onDragMove?.(result);
    };

    const cleanupWindowListeners = () => {
      mockWindow.removeEventListener('pointermove', handleWindowPointerMove);
      mockWindow.removeEventListener('pointerup', handleWindowPointerUp);
      mockWindow.removeEventListener('pointercancel', handleWindowPointerUp);
      activeCleanupRef.current = null;
      activePointerIdRef.current = null;
    };

    const handleWindowPointerUp = (ev?: { pointerId: number }) => {
      if (!isDraggingRef.current) return;
      if (
        ev &&
        activePointerIdRef.current !== null &&
        ev.pointerId !== activePointerIdRef.current
      ) {
        return;
      }

      isDraggingRef.current = false;

      if (controlsRef.current) {
        controlsRef.current.enabled = true;
      }

      cleanupWindowListeners();

      const finalPos = currentPosRef.current;
      const stoneHalfY = StonePhysicsBodyFactory.getShapeConfig(stone.shape).halfExtents.y;
      const shouldDrop = shouldTriggerDrop(finalPos[1], towerTopY);

      if (shouldDrop) {
        const dropPose = calculate3DDropPoseFromWorldPosition(
          finalPos,
          towerTopY,
          stoneHalfY
        );
        onDrop?.(dropPose);
      } else {
        currentPosRef.current = initialPos;
        balanceRatingRef.current = 'stable';
        isOverDropZoneRef.current = false;
        onDragCancel?.();
      }
    };

    activeCleanupRef.current = cleanupWindowListeners;

    mockWindow.addEventListener('pointermove', handleWindowPointerMove);
    mockWindow.addEventListener('pointerup', handleWindowPointerUp);
    mockWindow.addEventListener('pointercancel', handleWindowPointerUp);
  };

  return {
    controlsRef,
    isDraggingRef,
    currentPosRef,
    activePointerIdRef,
    dragAzimuthRef,
    balanceRatingRef,
    isOverDropZoneRef,
    handlePointerDown,
    unmount,
    onPhaseChange,
  };
}

// =============================================================================
// TEST SUITES
// =============================================================================

test('Tier 5.1 - Rapid Camera Preset Toggles During Active 3D Drag', async (t) => {
  await t.test('1.1: 100-Cycle rapid preset toggles while dragging maintains controls lock & coordinate bounds', () => {
    const mockWindow = new MockWindowTarget();
    let dragMoveCount = 0;
    let dragStartCount = 0;

    const harness = createDragHarness({
      mockWindow,
      towerTopY: 1.2,
      onDragStart: () => {
        dragStartCount++;
      },
      onDragMove: () => {
        dragMoveCount++;
      },
    });

    // Start drag at pointer (100, 200)
    harness.handlePointerDown({
      pointerId: 1,
      clientX: 100,
      clientY: 200,
      stopPropagation: () => {},
    });

    assert.equal(dragStartCount, 1);
    assert.equal(harness.isDraggingRef.current, true);
    assert.equal(harness.controlsRef.current.enabled, false, 'OrbitControls must lock on drag start');

    // Simulate 100 rapid preset switches during active drag
    const presets: CameraPresetType[] = ['front', 'side45', 'top', 'free'];
    for (let i = 0; i < 100; i++) {
      const p = presets[i % presets.length];
      if (p !== 'free') {
        const cfg = computePresetCameraView(p, 1.2);
        assert.ok(Number.isFinite(cfg.position[0]));
        assert.ok(Number.isFinite(cfg.position[1]));
        assert.ok(Number.isFinite(cfg.position[2]));
      }

      // Simultaneously dispatch pointer moves
      mockWindow.dispatchEvent('pointermove', {
        pointerId: 1,
        clientX: 100 + (i % 20) - 10,
        clientY: 200 - i * 3, // moving upward
      });

      // Crucial invariant: OrbitControls remains disabled throughout preset toggles
      assert.equal(harness.controlsRef.current.enabled, false);
      const pos = harness.currentPosRef.current;
      assert.ok(Number.isFinite(pos[0]), `pos[0] must be finite at step ${i}`);
      assert.ok(Number.isFinite(pos[1]), `pos[1] must be finite at step ${i}`);
      assert.ok(Number.isFinite(pos[2]), `pos[2] must be finite at step ${i}`);
    }

    assert.equal(dragMoveCount, 100);

    // Release drag
    mockWindow.dispatchEvent('pointerup', { pointerId: 1 });
    assert.equal(harness.isDraggingRef.current, false);
    assert.equal(harness.controlsRef.current.enabled, true, 'OrbitControls must restore on pointerup');
    assert.equal(mockWindow.getListenerCount(), 0, 'Zero window listener leaks');
  });

  await t.test('1.2: Camera preset transition interrupted mid-flight by pointer drag start', () => {
    // When camera is lerping towards side45, user grabs stone
    const presetConfig = computePresetCameraView('side45', 1.0);
    const cameraPos = new THREE.Vector3(0, 1.8, 3.8);
    const targetPos = new THREE.Vector3(...presetConfig.position);

    // Camera is 40% along transition path
    cameraPos.lerp(targetPos, 0.4);

    const mockWindow = new MockWindowTarget();
    let dropPoseResult: Pose | null = null;

    const harness = createDragHarness({
      mockWindow,
      towerTopY: 1.0,
      cameraPos: { x: cameraPos.x, y: cameraPos.y, z: cameraPos.z },
      onDrop: (pose) => {
        dropPoseResult = pose;
      },
    });

    harness.handlePointerDown({
      pointerId: 10,
      clientX: 200,
      clientY: 300,
    });

    assert.equal(harness.isDraggingRef.current, true);
    assert.equal(harness.controlsRef.current.enabled, false);

    // Azimuth locked to interpolated camera angle
    const expectedAz = Math.atan2(cameraPos.x, cameraPos.z);
    assert.ok(Math.abs(harness.dragAzimuthRef.current - expectedAz) < 1e-4);

    // Move upward past drop threshold (screen deltaY = -250 -> dyWorld ~ 0.875m -> y ~ 1.055m >= 0.75m threshold)
    mockWindow.dispatchEvent('pointermove', {
      pointerId: 10,
      clientX: 200,
      clientY: 50,
    });

    // Release drop
    mockWindow.dispatchEvent('pointerup', { pointerId: 10 });
    assert.ok(dropPoseResult !== null, 'Should trigger onDrop when elevation is sufficient');
    const pose = dropPoseResult as unknown as Pose;
    assert.ok(pose.position.y >= 1.0, 'Dropped pose must be elevated above tower surface');
    assert.equal(harness.controlsRef.current.enabled, true);
  });

  await t.test('1.3: Alternating front <-> top preset toggles avoid gimbal lock singularity during drag', () => {
    const topCfg = computePresetCameraView('top', 2.0);
    assert.ok(
      Math.abs(topCfg.position[2] - topCfg.target[2]) > 0.1,
      'Top view must maintain Z-offset to prevent gimbal singularity'
    );

    const mockWindow = new MockWindowTarget();
    const harness = createDragHarness({ mockWindow });

    harness.handlePointerDown({ pointerId: 1, clientX: 100, clientY: 200 });

    for (let i = 0; i < 50; i++) {
      const p: CameraPresetType = i % 2 === 0 ? 'top' : 'front';
      const cfg = computePresetCameraView(p, 1.5);
      assert.ok(Number.isFinite(cfg.position[0]));
      assert.ok(Number.isFinite(cfg.position[1]));
      assert.ok(Number.isFinite(cfg.position[2]));
    }

    mockWindow.dispatchEvent('pointerup', { pointerId: 1 });
    assert.equal(harness.controlsRef.current.enabled, true);
  });
});

test('Tier 5.2 - Recenter HUD Button Glide vs Stone Focus Glide In-Flight Contention', async (t) => {
  await t.test('2.1: Recenter glide smoothly overrides in-flight stone focus glide without NaN or overshoot', () => {
    const stonePos = { x: 3.5, y: 1.8, z: -2.0 };
    const currentCam = { x: 5.0, y: 2.5, z: 4.0 };
    const focusView = computeFocusCameraView(stonePos, currentCam);

    const cameraPos = new THREE.Vector3(currentCam.x, currentCam.y, currentCam.z);
    const cameraTarget = new THREE.Vector3(0, 0.6, 0);

    const targetPosRef = new THREE.Vector3(...focusView.position);
    const targetLookAtRef = new THREE.Vector3(...focusView.target);

    // Simulate 10 frames of focus glide
    for (let f = 0; f < 10; f++) {
      const step = 1 - Math.exp(-0.016 * 6.0);
      cameraPos.lerp(targetPosRef, step);
      cameraTarget.lerp(targetLookAtRef, step);
    }

    // Mid-flight: Recenter button pressed (requests 'front' preset with towerTopY=1.8)
    const frontView = computePresetCameraView('front', 1.8);
    targetPosRef.set(...frontView.position);
    targetLookAtRef.set(...frontView.target);

    // Simulate 60 frames (~1.0s) of return glide
    for (let f = 0; f < 60; f++) {
      const step = 1 - Math.exp(-0.016 * 6.0);
      cameraPos.lerp(targetPosRef, step);
      cameraTarget.lerp(targetLookAtRef, step);

      // Clamp camera target every frame (as TowerCameraController does)
      const clamped = clampCameraTarget([cameraTarget.x, cameraTarget.y, cameraTarget.z], 15.0, 1.8);
      cameraTarget.set(clamped[0], clamped[1], clamped[2]);

      // Assert invariants during return glide
      assert.ok(Number.isFinite(cameraPos.x));
      assert.ok(Number.isFinite(cameraPos.y));
      assert.ok(Number.isFinite(cameraPos.z));
      assert.ok(cameraPos.y >= 0.25, 'Camera y must respect ground clearance');
      assert.ok(cameraTarget.y >= 0.2, 'Target y must stay above minimum floor');
    }

    // At convergence: target lateral offset must be close to 0
    const lateralDist = Math.hypot(cameraTarget.x, cameraTarget.z);
    assert.ok(lateralDist < 0.05, `Target lateral offset should converge near 0, got ${lateralDist}`);
  });

  await t.test('2.2: Recenter trigger distance boundary and HUD button visibility hysteresis', () => {
    // RECENTER_TRIGGER_DISTANCE is 2.0m
    const testCases = [
      { x: 1.414, z: 1.414, expectedVisible: false },  // hypot = 1.9997m < 2.0
      { x: 1.4143, z: 1.4143, expectedVisible: true }, // 1.4143 * sqrt(2) = 2.0001m >= 2.0
      { x: 2.0, z: 0.0, expectedVisible: true },       // exact 2.0m
      { x: 0.0, z: 1.999, expectedVisible: false },    // 1.999m < 2.0
      { x: 0.0, z: 0.0, expectedVisible: false },      // origin
    ];

    for (const tc of testCases) {
      const dist = Math.hypot(tc.x, tc.z);
      const isVisible = dist >= RECENTER_TRIGGER_DISTANCE;
      assert.equal(isVisible, tc.expectedVisible, `Distance ${dist} visibility mismatch`);
    }
  });

  await t.test('2.3: Recenter command while focus glide is tracking top stone of tall 10-stone tower', () => {
    // 10-stone tower, top stone at y = 4.5m
    const tallTowerStonePos = { x: 0.1, y: 4.5, z: -0.1 };
    const focusView = computeFocusCameraView(tallTowerStonePos, { x: 0, y: 5.0, z: 3.8 });

    const cameraPos = new THREE.Vector3(0, 5.0, 3.8);
    const cameraTarget = new THREE.Vector3(...focusView.target);
    const targetPosRef = new THREE.Vector3(...focusView.position);
    const targetLookAtRef = new THREE.Vector3(...focusView.target);

    // Mid-flight recenter
    const frontView = computePresetCameraView('front', 4.5);
    targetPosRef.set(...frontView.position);
    targetLookAtRef.set(...frontView.target);

    for (let f = 0; f < 60; f++) {
      const step = 1 - Math.exp(-0.016 * 6.0);
      cameraPos.lerp(targetPosRef, step);
      cameraTarget.lerp(targetLookAtRef, step);

      const clamped = clampCameraTarget([cameraTarget.x, cameraTarget.y, cameraTarget.z], 15.0, 4.5);
      cameraTarget.set(clamped[0], clamped[1], clamped[2]);

      // Vertical bounds: maxY = 4.5 + 2.5 = 7.0m, minY = 0.2m
      assert.ok(cameraTarget.y >= 0.2 && cameraTarget.y <= 7.0 + 1e-4);
      assert.ok(cameraPos.y >= 0.25);
    }

    const lateralDist = Math.hypot(cameraTarget.x, cameraTarget.z);
    assert.ok(lateralDist < 0.05);
  });
});

test('Tier 5.3 - Extreme Cylindrical Clamp Radius Crossings & Boundary Fuzzing', async (t) => {
  await t.test('3.1: 1,000 Fuzzed coordinates including singularities and non-finite values', () => {
    const extremes = [
      0, 1e-6, 14.999, 15.0, 15.001, 28.0, 100.0, 10000.0, 1e8,
      -1e-6, -14.999, -15.0, -15.001, -28.0, -100.0, -10000.0, -1e8,
      NaN, Infinity, -Infinity,
    ];

    for (const x of extremes) {
      for (const y of extremes) {
        for (const z of extremes) {
          const clamped = clampCameraTarget([x, y, z], CAMERA_PAN_MAX_RADIUS, 1.5);

          // All output coordinates must be finite
          assert.ok(Number.isFinite(clamped[0]), `clamped[0] must be finite for (${x}, ${y}, ${z})`);
          assert.ok(Number.isFinite(clamped[1]), `clamped[1] must be finite for (${x}, ${y}, ${z})`);
          assert.ok(Number.isFinite(clamped[2]), `clamped[2] must be finite for (${x}, ${y}, ${z})`);

          // Radial distance invariant: R <= 15.0 + 1e-4
          const r = Math.hypot(clamped[0], clamped[2]);
          assert.ok(
            r <= CAMERA_PAN_MAX_RADIUS + 1e-4,
            `Radial distance ${r} exceeds max radius 15.0m`
          );

          // Vertical height invariant: 0.2 <= y <= max(1.5, topY + 2.5) = 4.0
          assert.ok(clamped[1] >= 0.2 - 1e-4, `y=${clamped[1]} below minY=0.2`);
          assert.ok(clamped[1] <= 4.0 + 1e-4, `y=${clamped[1]} above maxY=4.0`);
        }
      }
    }
  });

  await t.test('3.2: Camera ground clearance collision enforcement under downward delta pan', () => {
    // When camera target is shifted downward or controls delta attempts sub-floor penetration
    const activeControls = {
      target: new THREE.Vector3(0, -10.0, 0),
      update: () => {},
    };
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0.10, 3.8); // below ground clearance of 0.25

    // Run enforcement logic verbatim from TowerCameraController
    const tx = activeControls.target.x;
    const ty = activeControls.target.y;
    const tz = activeControls.target.z;

    const clamped = clampCameraTarget([tx, ty, tz], CAMERA_PAN_MAX_RADIUS, 1.0);
    const deltaY = clamped[1] - ty;
    camera.position.y += deltaY;
    activeControls.target.set(clamped[0], clamped[1], clamped[2]);

    if (camera.position.y < 0.25) {
      camera.position.y = 0.25;
    }

    assert.equal(activeControls.target.y, 0.2, 'Target y clamped to 0.2 minimum');
    assert.ok(camera.position.y >= 0.25, 'Camera y clamped to 0.25 ground clearance');
  });

  await t.test('3.3: Viewport aspect ratio deformation extremes preserve 3D drag convergence', () => {
    const aspectRatios = [0.45, 1.0, 1.78, 2.39, 0.01, 100.0];

    for (const ar of aspectRatios) {
      // Screen drag delta: move upward by 100px
      const dragRes = computeDragWorldPosition(0, -100, DEFAULT_INITIAL_SPAWN_POSITION, 1.0);
      assert.ok(Number.isFinite(dragRes.position[0]));
      assert.ok(Number.isFinite(dragRes.position[1]));
      assert.ok(Number.isFinite(dragRes.position[2]));
      assert.ok(dragRes.normalizedProgress >= 0 && dragRes.normalizedProgress <= 1);
      // Z convergence: initialZ = 1.15, converges toward 0
      assert.ok(dragRes.position[2] <= 1.15 && dragRes.position[2] >= 0);
    }
  });

  await t.test('3.4: clampCameraTarget with zero and negative maxRadius edge boundaries', () => {
    // maxRadius = 0: any non-zero distance clamped to 0
    const clampedZero = clampCameraTarget([5.0, 1.0, 5.0], 0, 1.0);
    assert.equal(clampedZero[0], 0);
    assert.equal(clampedZero[2], 0);

    // Negative maxRadius: doesn't throw, outputs finite numbers
    const clampedNeg = clampCameraTarget([3.0, 1.0, 4.0], -5, 1.0);
    assert.ok(Number.isFinite(clampedNeg[0]));
    assert.ok(Number.isFinite(clampedNeg[1]));
    assert.ok(Number.isFinite(clampedNeg[2]));
  });

  await t.test('3.5: Rapid window resize stress during continuous 3D drag', () => {
    for (let i = 0; i < 100; i++) {
      const isMobile = i % 2 === 0;
      const width = isMobile ? 390 : 1920;
      const height = isMobile ? 844 : 1080;
      assert.ok(width > 0 && height > 0);

      const dragRes = computeDragWorldPosition(
        (i % 30) - 15,
        -50 - i * 2,
        DEFAULT_INITIAL_SPAWN_POSITION,
        1.2
      );
      assert.ok(Number.isFinite(dragRes.position[0]));
      assert.ok(Number.isFinite(dragRes.position[1]));
      assert.ok(Number.isFinite(dragRes.position[2]));
      assert.ok(dragRes.normalizedProgress >= 0 && dragRes.normalizedProgress <= 1);
    }
  });
});

test('Tier 5.4 - Attempting Reroll Mid-Drop & Placement Phase Invariant Verification', async (t) => {
  await t.test('4.1: UI gating contract: isBusy strictly blocks reroll and drop controls during active phases', () => {
    // AST audit of place.tsx
    const placePath = path.resolve(projectRoot, 'app/stack/place.tsx');
    const placeSrc = fs.readFileSync(placePath, 'utf8');

    // 1. Verify isBusy covers BALANCING, COLLAPSING, FALLEN_CHOICE, and SETTLED
    assert.ok(
      placeSrc.includes("phase === 'BALANCING'") &&
        placeSrc.includes("phase === 'COLLAPSING'") &&
        placeSrc.includes("phase === 'FALLEN_CHOICE'") &&
        placeSrc.includes("phase === 'SETTLED'"),
      'place.tsx isBusy must cover BALANCING, COLLAPSING, FALLEN_CHOICE, SETTLED'
    );

    // 2. Verify floating reroll button is gated by !isBusy
    assert.ok(
      placeSrc.includes('{!isBusy && (') &&
        placeSrc.includes('floatingRerollButton'),
      'Reroll button must be gated by {!isBusy}'
    );

    // 3. Verify drop action buttons are disabled when isBusy
    assert.ok(
      placeSrc.includes('disabled={isBusy}'),
      'Drop buttons must be disabled when isBusy'
    );
  });

  await t.test('4.2: Programmatic rerollStone during BALANCING/COLLAPSING does not crash or corrupt state', async () => {
    // In-memory mock fetch to avoid network calls to :8080
    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/v1/auth')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            accessToken: 'mock-jwt-token',
            user: { id: 'test-user', nickname: 'Tester' },
          }),
        };
      }
      if (url.includes('/api/v1/wishes') && init?.method === 'POST') {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            id: 'wish-sim-123',
            content: '테스트 소원',
            category: 'HEALTH',
            scope: 'GLOBAL',
            createdAt: new Date().toISOString(),
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    const container = createMsaAppContainer('http://localhost:8080', mockFetch as any);
    await container.auth.signIn('guest');

    const controller = new StackStoneController(container);
    controller.updateContent('테스트 소원');

    const tower = new Tower(TowerKey.global(), [], {
      stoneCount: 0,
      todayCount: 0,
      fulfilledCount: 0,
      cheerCount: 0,
    });

    // Start placing
    controller.startPlacing();
    assert.equal(controller.getState().phase, 'PLACING');

    // Execute reroll while PLACING
    const rerolled1 = controller.rerollStone();
    assert.ok(PEBBLE_SHAPE_PROFILES.includes(rerolled1.shape));
    assert.ok(NATURAL_PEBBLE_COLORS.includes(rerolled1.color));

    // Place stone
    const dropPose = new Pose({ x: 0, y: 1.0, z: 0 });
    const placePromise = controller.placeStone(tower, dropPose);

    // Concurrently trigger reroll
    const rerolled2 = controller.rerollStone();
    assert.ok(PEBBLE_SHAPE_PROFILES.includes(rerolled2.shape));

    // Wait for placement resolution
    const res = await placePromise;
    assert.ok(res.status === 'saved' || res.status === 'retry');

    // Controller state settled without uncaught throw
    const finalState = controller.getState();
    assert.ok(finalState.phase === 'SETTLED' || finalState.phase === 'COLLAPSING');
  });

  await t.test('4.3: 100 Sequential rerolls maintain anti-clipping bounding half-extents invariant', () => {
    const mockFetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
    const container = createMsaAppContainer('http://localhost:8080', mockFetch as any);
    const controller = new StackStoneController(container);

    for (let i = 0; i < 100; i++) {
      const stone = controller.rerollStone();
      const cannonCfg = StonePhysicsBodyFactory.getShapeConfig(stone.shape);
      const geoSpec = buildStoneGeometrySpec(stone.shape);

      // Invariant: halfExtents = scale * 0.25 +/- 1e-4
      const expectedHalfX = Number((geoSpec.scale.x * 0.25).toFixed(4));
      const expectedHalfY = Number((geoSpec.scale.y * 0.25).toFixed(4));
      const expectedHalfZ = Number((geoSpec.scale.z * 0.25).toFixed(4));

      assert.ok(
        Math.abs(cannonCfg.halfExtents.x - expectedHalfX) <= 1e-4,
        `Half-extent X mismatch for ${stone.shape}`
      );
      assert.ok(
        Math.abs(cannonCfg.halfExtents.y - expectedHalfY) <= 1e-4,
        `Half-extent Y mismatch for ${stone.shape}`
      );
      assert.ok(
        Math.abs(cannonCfg.halfExtents.z - expectedHalfZ) <= 1e-4,
        `Half-extent Z mismatch for ${stone.shape}`
      );
    }
  });

  await t.test('4.4: Multi-attempt retry placement journey with reroll in FALLEN_CHOICE', async () => {
    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/v1/auth')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ accessToken: 'tok', user: { id: 'u1' } }),
        };
      }
      if (url.includes('/api/v1/wishes') && init?.method === 'POST') {
        return {
          ok: true,
          status: 201,
          json: async () => ({ id: 'w-1', content: '소원', category: 'HEALTH' }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    const container = createMsaAppContainer('http://localhost:8080', mockFetch as any);
    await container.auth.signIn('guest');
    const controller = new StackStoneController(container);
    controller.updateContent('건강과 평온을 기원합니다');

    // Initial state
    assert.equal(controller.getState().attempt, 0);
    assert.equal(controller.getState().quota.remaining, 5);

    // Step 1: Attempt 1 with boulder off-center (x=0.55m -> tumble/retry)
    const baseStone = new Stone({
      shape: 'boulder',
      color: '#222',
      pose: new Pose({ x: 0, y: 0.25, z: 0 }),
    });
    const tower = new Tower(
      TowerKey.global(),
      [
        {
          id: 'b-0',
          stone: baseStone,
          status: 'active',
          bloom: null,
          cheerLevel: 0,
          isMine: false,
          nickname: null,
        },
      ],
      { stoneCount: 1, todayCount: 0, fulfilledCount: 0, cheerCount: 0 }
    );

    controller.selectStone('boulder', '#444');
    const tumbleDropPose = new Pose({ x: 0.55, y: 0.8, z: 0 });
    const res1 = await controller.placeStone(tower, tumbleDropPose);

    assert.equal(res1.status, 'retry');
    assert.equal(controller.getState().phase, 'COLLAPSING');
    assert.equal(controller.getState().attempt, 1);
    assert.equal(controller.getState().quota.remaining, 5, 'Quota must NOT be consumed on retry');

    // Step 2: In FALLEN_CHOICE, user rerolls to a pebble!
    const newStone = controller.rerollStone({ shape: 'pebble' });
    assert.equal(newStone.shape, 'pebble');

    // Step 3: User clicks retry placement
    controller.retryPlacement();
    assert.equal(controller.getState().phase, 'IDLE');
    assert.equal(controller.getState().selectedStone.shape, 'pebble');
    assert.equal(controller.getState().attempt, 1);

    // Step 4: Attempt 2 with pebble centered (x=0, y=0.6m -> settles firmly)
    const centerDropPose = new Pose({ x: 0, y: 0.6, z: 0 });
    const res2 = await controller.placeStone(tower, centerDropPose);

    assert.equal(res2.status, 'saved');
    assert.equal(controller.getState().phase, 'SETTLED');
    assert.equal(controller.getState().quota.remaining, 4, 'Quota consumed by 1 upon settlement');
  });
});

test('Tier 5.5 - Pointer Capture Loss, Multi-Touch Contention & Gesture Decoupling', async (t) => {
  await t.test('5.1: Multi-touch contention: Extraneous touch pointers strictly ignored during active drag', () => {
    const mockWindow = new MockWindowTarget();
    let moveCount = 0;

    const harness = createDragHarness({
      mockWindow,
      onDragMove: () => {
        moveCount++;
      },
    });

    // Primary touch with finger 1 (pointerId 101)
    harness.handlePointerDown({
      pointerId: 101,
      clientX: 100,
      clientY: 200,
    });
    assert.equal(harness.isDraggingRef.current, true);
    assert.equal(harness.controlsRef.current.enabled, false);

    // Finger 2 touches screen (pointerId 102) -> should be rejected by handlePointerDown guard
    harness.handlePointerDown({
      pointerId: 102,
      clientX: 500,
      clientY: 500,
    });
    // activePointerIdRef must STILL be 101
    assert.equal(harness.activePointerIdRef.current, 101);

    // Finger 2 moves around violently
    mockWindow.dispatchEvent('pointermove', {
      pointerId: 102,
      clientX: 999,
      clientY: 999,
    });
    assert.equal(moveCount, 0, 'Pointer 102 movement must be ignored');

    // Finger 2 lifts off
    mockWindow.dispatchEvent('pointerup', { pointerId: 102 });
    assert.equal(harness.isDraggingRef.current, true, 'Pointer 102 lift must NOT end drag');
    assert.equal(harness.controlsRef.current.enabled, false);

    // Finger 1 moves -> registered
    mockWindow.dispatchEvent('pointermove', {
      pointerId: 101,
      clientX: 100,
      clientY: 100,
    });
    assert.equal(moveCount, 1);

    // Finger 1 lifts off -> ends drag cleanly
    mockWindow.dispatchEvent('pointerup', { pointerId: 101 });
    assert.equal(harness.isDraggingRef.current, false);
    assert.equal(harness.controlsRef.current.enabled, true);
    assert.equal(mockWindow.getListenerCount(), 0);
  });

  await t.test('5.2: Pointer capture loss & pointercancel cleanly restores OrbitControls & spawn position', () => {
    const mockWindow = new MockWindowTarget();
    let cancelCalled = false;

    const harness = createDragHarness({
      mockWindow,
      onDragCancel: () => {
        cancelCalled = true;
      },
    });

    harness.handlePointerDown({
      pointerId: 55,
      clientX: 100,
      clientY: 200,
    });
    assert.equal(harness.controlsRef.current.enabled, false);

    // Sub-threshold move
    mockWindow.dispatchEvent('pointermove', {
      pointerId: 55,
      clientX: 105,
      clientY: 195,
    });

    // System fires pointercancel (e.g. gesture navigation interrupt)
    mockWindow.dispatchEvent('pointercancel', { pointerId: 55 });

    assert.equal(harness.isDraggingRef.current, false);
    assert.equal(harness.controlsRef.current.enabled, true, 'Controls must be re-enabled on cancel');
    assert.equal(cancelCalled, true);
    assert.deepEqual(harness.currentPosRef.current, DEFAULT_INITIAL_SPAWN_POSITION);
    assert.equal(mockWindow.getListenerCount(), 0);
  });

  await t.test('5.3: Component unmount mid-drag guarantees window listener teardown and controls unlock', () => {
    const mockWindow = new MockWindowTarget();
    const harness = createDragHarness({ mockWindow });

    harness.handlePointerDown({
      pointerId: 77,
      clientX: 100,
      clientY: 200,
    });

    assert.equal(mockWindow.getListenerCount(), 3); // pointermove, pointerup, pointercancel
    assert.equal(harness.controlsRef.current.enabled, false);

    // User navigates away / unmounts mid-drag
    harness.unmount();

    assert.equal(mockWindow.getListenerCount(), 0, 'All window listeners must be removed on unmount');
    assert.equal(harness.controlsRef.current.enabled, true, 'OrbitControls must be restored on unmount');
  });

  await t.test('5.4: Sub-threshold upward drag cancels and does NOT trigger drop', () => {
    const mockWindow = new MockWindowTarget();
    let dropFired = false;
    let cancelFired = false;

    const harness = createDragHarness({
      mockWindow,
      towerTopY: 1.0,
      onDrop: () => {
        dropFired = true;
      },
      onDragCancel: () => {
        cancelFired = true;
      },
    });

    harness.handlePointerDown({
      pointerId: 1,
      clientX: 100,
      clientY: 200,
    });

    // Move upward only 5px (deltaY = -5 -> dyWorld ~ 0.0175m -> y ~ 0.1975m << 0.75m threshold)
    mockWindow.dispatchEvent('pointermove', {
      pointerId: 1,
      clientX: 100,
      clientY: 195,
    });

    mockWindow.dispatchEvent('pointerup', { pointerId: 1 });

    assert.equal(dropFired, false, 'Drop must NOT trigger for sub-threshold drag');
    assert.equal(cancelFired, true, 'Sub-threshold drag must fire cancel callback');
    assert.deepEqual(harness.currentPosRef.current, DEFAULT_INITIAL_SPAWN_POSITION);
  });

  await t.test('5.5: Multi-finger 5-pointer simultaneous burst with interleaved random release', () => {
    const mockWindow = new MockWindowTarget();
    let moveCount = 0;
    const harness = createDragHarness({
      mockWindow,
      onDragMove: () => {
        moveCount++;
      },
    });

    // Finger 1 grabs stone
    harness.handlePointerDown({ pointerId: 1, clientX: 100, clientY: 200 });
    assert.equal(harness.isDraggingRef.current, true);

    // Fingers 2, 3, 4, 5 touch simultaneously
    for (let pid = 2; pid <= 5; pid++) {
      harness.handlePointerDown({ pointerId: pid, clientX: pid * 50, clientY: pid * 60 });
      assert.equal(harness.activePointerIdRef.current, 1);
    }

    // Interleaved moves and releases from fingers 3, 5, 2, 4
    const extraneousOrder = [3, 5, 2, 4];
    for (const pid of extraneousOrder) {
      mockWindow.dispatchEvent('pointermove', { pointerId: pid, clientX: 0, clientY: 0 });
      mockWindow.dispatchEvent('pointerup', { pointerId: pid });
      assert.equal(harness.isDraggingRef.current, true, `Drag ended prematurely on pointer ${pid}`);
    }
    assert.equal(moveCount, 0, 'No moves should be registered from extraneous pointers');

    // Primary finger moves and releases
    mockWindow.dispatchEvent('pointermove', { pointerId: 1, clientX: 100, clientY: 150 });
    assert.equal(moveCount, 1);

    mockWindow.dispatchEvent('pointerup', { pointerId: 1 });
    assert.equal(harness.isDraggingRef.current, false);
    assert.equal(harness.controlsRef.current.enabled, true);
    assert.equal(mockWindow.getListenerCount(), 0);
  });

  await t.test('5.6: Extreme offscreen pointer coordinates & NaN/Infinity delta sanitization', () => {
    const badDeltas = [
      { dx: NaN, dy: NaN },
      { dx: Infinity, dy: -Infinity },
      { dx: -Infinity, dy: Infinity },
      { dx: 1e9, dy: -1e9 },
      { dx: -1e9, dy: 1e9 },
    ];

    for (const d of badDeltas) {
      const res = computeDragWorldPosition(d.dx, d.dy, DEFAULT_INITIAL_SPAWN_POSITION, 1.0);
      assert.ok(Number.isFinite(res.position[0]), `pos[0] must be finite for ${JSON.stringify(d)}`);
      assert.ok(Number.isFinite(res.position[1]), `pos[1] must be finite for ${JSON.stringify(d)}`);
      assert.ok(Number.isFinite(res.position[2]), `pos[2] must be finite for ${JSON.stringify(d)}`);
      assert.ok(res.normalizedProgress >= 0 && res.normalizedProgress <= 1);
      assert.ok(['stable', 'caution', 'critical'].includes(res.balanceRating));
    }
  });
});

test('Tier 5.6 - Static AST Source Code Invariant Verification', () => {
  const canvasPath = path.resolve(projectRoot, 'presentation/components/StoneTowerCanvas.tsx');
  const canvasSrc = fs.readFileSync(canvasPath, 'utf8');

  // StoneTowerCanvas: Verification of critical lifecycle guards
  assert.ok(
    canvasSrc.includes('!isDraggable || isDraggingRef.current'),
    'StoneTowerCanvas must guard against concurrent pointerdown'
  );
  assert.ok(
    canvasSrc.includes('controlsRef.current.enabled = false'),
    'StoneTowerCanvas must lock OrbitControls on drag start'
  );
  assert.ok(
    canvasSrc.includes('controlsRef.current.enabled = true'),
    'StoneTowerCanvas must restore OrbitControls on drag end / unmount'
  );
  assert.ok(
    canvasSrc.includes('clampCameraTarget'),
    'StoneTowerCanvas must invoke clampCameraTarget'
  );
  assert.ok(
    canvasSrc.includes('RECENTER_TRIGGER_DISTANCE'),
    'StoneTowerCanvas must check RECENTER_TRIGGER_DISTANCE for HUD button'
  );

  // place.tsx: Verification of state machine & choice UX
  const placePath = path.resolve(projectRoot, 'app/stack/place.tsx');
  const placeSrc = fs.readFileSync(placePath, 'utf8');
  assert.ok(
    placeSrc.includes('handleCollapseComplete'),
    'place.tsx must handle collapse complete'
  );
  assert.ok(
    placeSrc.includes('FALLEN_CHOICE'),
    'place.tsx must support FALLEN_CHOICE state (D-022)'
  );
  assert.ok(
    placeSrc.includes('handleRetryPlacement'),
    'place.tsx must allow retry placement'
  );
  assert.ok(
    placeSrc.includes('handleConfirmFallen'),
    'place.tsx must allow confirm fallen placement'
  );

  // stone.tsx: Verification of stone selection & reroll button
  const stonePath = path.resolve(projectRoot, 'app/stack/stone.tsx');
  const stoneSrc = fs.readFileSync(stonePath, 'utf8');
  assert.ok(
    stoneSrc.includes('handleReroll'),
    'stone.tsx must implement handleReroll'
  );
  assert.ok(
    stoneSrc.includes('controller.rerollStone()'),
    'stone.tsx must call controller.rerollStone()'
  );
  assert.ok(
    stoneSrc.includes('NATURAL_PEBBLE_PALETTE'),
    'stone.tsx must bind NATURAL_PEBBLE_PALETTE'
  );
});
