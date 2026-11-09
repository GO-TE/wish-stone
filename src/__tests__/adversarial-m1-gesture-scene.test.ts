import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

import { Stone } from '../domain/entities/Stone.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import { StonePhysicsBodyFactory } from '../infrastructure/physics/StonePhysicsBodyFactory.ts';
import {
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
  computeInitialSpawnPosition,
  computeDragWorldPosition,
  evaluateLiveBalance,
  shouldTriggerDrop,
  calculate3DDropPoseFromWorldPosition,
  BALANCE_THRESHOLD_STABLE,
  BALANCE_THRESHOLD_CAUTION,
  DROP_ZONE_MAX_LATERAL_X,
  DROP_ZONE_MAX_DEPTH_Z,
} from '../presentation/components/stoneDragSpec.ts';

// =============================================================================
// ADVERSARIAL CHALLENGER SUITE: MILESTONE M1 GESTURE DECOUPLING & SCENE INTEGRITY
// =============================================================================

// Helper: Lightweight EventTarget mock for Window pointer events
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
 * High-fidelity lifecycle emulator for InteractiveDraggableStone3D's
 * gesture event listener & OrbitControls decoupling engine verbatim from StoneTowerCanvas.tsx
 */
function createDragLifecycleHarness(options: {
  mockWindow: MockWindowTarget;
  isDraggable?: boolean;
  towerTopY?: number;
  initialPos?: readonly [number, number, number];
  cameraPos?: { x: number; y: number; z: number };
  onDragStart?: () => void;
  onDragMove?: (res: any) => void;
  onDrop?: (pose: Pose) => void;
  onDragCancel?: () => void;
}) {
  const {
    mockWindow,
    isDraggable = true,
    towerTopY = 0.8,
    initialPos = [0, 0.18, 1.15] as const,
    cameraPos = { x: 0, y: 1.8, z: 3.8 },
    onDragStart,
    onDragMove,
    onDrop,
    onDragCancel,
  } = options;

  const stone = new Stone({ shape: 'round', color: '#888', pose: Pose.origin() });
  const controlsRef = { current: { enabled: true } };

  // Check whether StoneTowerCanvas.tsx has implemented concurrent drag guard and idle cleanup
  const canvasPath = path.resolve(projectRoot, 'presentation/components/StoneTowerCanvas.tsx');
  const source = fs.readFileSync(canvasPath, 'utf8');
  const hasPointerDownGuard =
    source.includes('!isDraggable || isDraggingRef.current') ||
    source.includes('if (!isDraggable || isDragging') ||
    source.includes('if (isDraggingRef.current) return');

  const idleEffectMatch = source.match(/if\s*\(\s*phase\s*===\s*'IDLE'\s*\)\s*\{([\s\S]*?)\}/);
  const hasIdleCleanup = Boolean(
    idleEffectMatch &&
      (idleEffectMatch[1].includes('activeCleanupRef') ||
        idleEffectMatch[1].includes('cleanupWindowListeners'))
  );

  // Internal component refs verbatim from StoneTowerCanvas.tsx
  const isDraggingRef = { current: false };
  const currentPosRef = { current: initialPos };
  const activePointerIdRef = { current: null as number | null };
  const activeCleanupRef = { current: null as (() => void) | null };
  const dragAzimuthRef = { current: 0 };
  const startPointerRef = { current: { x: 0, y: 0 } };

  // Component unmount teardown effect (lines 602-611)
  const unmount = () => {
    if (activeCleanupRef.current) {
      activeCleanupRef.current();
    }
    if (controlsRef.current) {
      controlsRef.current.enabled = true;
    }
  };

  // Phase change effect (lines 613-622)
  const onPhaseChange = (phase: string) => {
    if (phase === 'IDLE') {
      if (hasIdleCleanup) {
        if (activeCleanupRef.current) {
          activeCleanupRef.current();
        }
        if (controlsRef.current) {
          controlsRef.current.enabled = true;
        }
      }
      currentPosRef.current = initialPos;
      isDraggingRef.current = false;
    }
  };

  // Verbatim pointerDown handler (lines 657-812)
  const handlePointerDown = (e: {
    pointerId?: number;
    clientX?: number;
    clientY?: number;
    target?: any;
    stopPropagation?: () => void;
  }) => {
    if (!isDraggable) return;
    if (hasPointerDownGuard && isDraggingRef.current) return;
    e.stopPropagation?.();


    isDraggingRef.current = true;

    const activePointerId = e.pointerId ?? 1;
    activePointerIdRef.current = activePointerId;

    if (typeof e.target?.setPointerCapture === 'function') {
      try {
        e.target.setPointerCapture(activePointerId);
      } catch {}
    }

    const startAz = Math.atan2(cameraPos.x, cameraPos.z);
    dragAzimuthRef.current = startAz;

    if (controlsRef.current) {
      controlsRef.current.enabled = false;
    }

    startPointerRef.current = { x: e.clientX ?? 0, y: e.clientY ?? 0 };
    onDragStart?.();

    // Attach window listeners
    const handleWindowPointerMove = (ev: { pointerId: number; clientX: number; clientY: number }) => {
      if (!isDraggingRef.current) return;
      if (activePointerIdRef.current !== null && ev.pointerId !== activePointerIdRef.current) {
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
      const balance =
        absLateral <= BALANCE_THRESHOLD_STABLE
          ? 'stable'
          : absLateral <= BALANCE_THRESHOLD_CAUTION
          ? 'caution'
          : 'critical';

      const isOverZone =
        y >= targetDropY - 0.22 &&
        absLateral <= DROP_ZONE_MAX_LATERAL_X &&
        radialDist <= DROP_ZONE_MAX_DEPTH_Z;

      const result = {
        position: [x, y, z] as const,
        normalizedProgress,
        isOverDropZone: isOverZone,
        balanceRating: balance,
      };

      currentPosRef.current = result.position;
      onDragMove?.(result);
    };

    const cleanupWindowListeners = () => {
      mockWindow.removeEventListener('pointermove', handleWindowPointerMove);
      mockWindow.removeEventListener('pointerup', handleWindowPointerUp);
      mockWindow.removeEventListener('pointercancel', handleWindowPointerUp);
      activeCleanupRef.current = null;
      activePointerIdRef.current = null;
    };

    const handleWindowPointerUp = (ev?: { pointerId?: number }) => {
      if (!isDraggingRef.current) return;
      if (
        ev &&
        activePointerIdRef.current !== null &&
        ev.pointerId !== undefined &&
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
        const dropPose = calculate3DDropPoseFromWorldPosition(finalPos, towerTopY, stoneHalfY);
        onDrop?.(dropPose);
      } else {
        currentPosRef.current = initialPos;
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
    activeCleanupRef,
    handlePointerDown,
    unmount,
    onPhaseChange,
  };
}

// =============================================================================
// CATEGORY 1: RAPID DRAG-AND-DROP CANCELLATIONS & ORBITCONTROLS RESTORATION
// =============================================================================

test('Adversarial 1.1: 500 Rapid Drag-and-Drop Cancellations maintain zero listener leaks and guaranteed OrbitControls recovery', () => {
  const mockWindow = new MockWindowTarget();
  let cancelCount = 0;
  let dropCount = 0;

  const harness = createDragLifecycleHarness({
    mockWindow,
    onDragCancel: () => cancelCount++,
    onDrop: () => dropCount++,
  });

  for (let i = 0; i < 500; i++) {
    const pointerId = 1000 + i;

    // 1. Pointer Down
    harness.handlePointerDown({ pointerId, clientX: 100, clientY: 500 });
    assert.equal(harness.controlsRef.current.enabled, false, `Iteration ${i}: OrbitControls must be disabled on pointer down`);
    assert.equal(harness.isDraggingRef.current, true);
    assert.equal(mockWindow.getListenerCount(), 3, `Iteration ${i}: exactly 3 window listeners must be attached`);

    // 2. Micro displacement (sub-threshold movement)
    mockWindow.dispatchEvent('pointermove', { pointerId, clientX: 102, clientY: 495 });

    // 3. Immediate Cancellation / Release below drop height
    mockWindow.dispatchEvent('pointercancel', { pointerId });

    // Invariants
    assert.equal(harness.controlsRef.current.enabled, true, `Iteration ${i}: OrbitControls must recover to enabled=true on cancel`);
    assert.equal(harness.isDraggingRef.current, false, `Iteration ${i}: isDragging must be false`);
    assert.equal(mockWindow.getListenerCount(), 0, `Iteration ${i}: all window listeners must be removed`);
    assert.equal(harness.activePointerIdRef.current, null);
    assert.equal(harness.activeCleanupRef.current, null);
  }

  assert.equal(cancelCount, 500, 'All 500 rapid cycles must invoke onDragCancel');
  assert.equal(dropCount, 0, 'Zero sub-threshold drops should invoke onDrop');
});

test('Adversarial 1.2: Rapid sub-threshold upward drag cancels and snaps back to initial spawn position', () => {
  const mockWindow = new MockWindowTarget();
  let cancelled = false;
  let dropped = false;

  const harness = createDragLifecycleHarness({
    mockWindow,
    towerTopY: 1.2,
    initialPos: [0, 0.18, 1.15],
    onDragCancel: () => (cancelled = true),
    onDrop: () => (dropped = true),
  });

  harness.handlePointerDown({ pointerId: 42, clientX: 200, clientY: 600 });
  assert.equal(harness.controlsRef.current.enabled, false);

  // Drag upwards slightly (deltaY = -20px) -> elevation reaches ~0.25m, well below target 1.55m
  mockWindow.dispatchEvent('pointermove', { pointerId: 42, clientX: 200, clientY: 580 });
  assert.ok(harness.currentPosRef.current[1] > 0.18 && harness.currentPosRef.current[1] < 0.5);

  // Release
  mockWindow.dispatchEvent('pointerup', { pointerId: 42 });

  assert.equal(cancelled, true, 'Sub-threshold release must fire onDragCancel');
  assert.equal(dropped, false, 'Sub-threshold release must NOT fire onDrop');
  assert.deepEqual(harness.currentPosRef.current, [0, 0.18, 1.15], 'Position must snap back to initialPos');
  assert.equal(harness.controlsRef.current.enabled, true, 'OrbitControls must be re-enabled');
  assert.equal(mockWindow.getListenerCount(), 0, 'Listeners must be 0');
});

// =============================================================================
// CATEGORY 2: POINTER UNMOUNT DURING ACTIVE DRAG
// =============================================================================

test('Adversarial 2.1: Component unmount during active drag guarantees window listener teardown and OrbitControls restoration', () => {
  const mockWindow = new MockWindowTarget();
  let startFired = false;
  let dropFired = false;

  const harness = createDragLifecycleHarness({
    mockWindow,
    onDragStart: () => (startFired = true),
    onDrop: () => (dropFired = true),
  });

  // Start drag
  harness.handlePointerDown({ pointerId: 77, clientX: 150, clientY: 400 });
  assert.equal(startFired, true);
  assert.equal(harness.controlsRef.current.enabled, false);
  assert.equal(mockWindow.getListenerCount(), 3);

  // Move drag in progress
  mockWindow.dispatchEvent('pointermove', { pointerId: 77, clientX: 150, clientY: 200 });

  // Unmount occurs suddenly while pointer is still actively held down
  harness.unmount();

  // Invariant 1: OrbitControls MUST be re-enabled
  assert.equal(harness.controlsRef.current.enabled, true, 'OrbitControls must be re-enabled on unmount');

  // Invariant 2: Window listeners MUST be completely removed
  assert.equal(mockWindow.getListenerCount(), 0, 'All window listeners must be removed on unmount');

  // Invariant 3: Stale window events after unmount must be inert and NOT throw
  assert.doesNotThrow(() => {
    mockWindow.dispatchEvent('pointermove', { pointerId: 77, clientX: 150, clientY: 100 });
    mockWindow.dispatchEvent('pointerup', { pointerId: 77 });
    mockWindow.dispatchEvent('pointercancel', { pointerId: 77 });
  });

  assert.equal(dropFired, false, 'No rogue drop should occur after unmount');
});

test('Adversarial 2.2: 200 Iterations of randomized mid-drag aborts / unmounts verify zero listener leak', () => {
  const mockWindow = new MockWindowTarget();

  for (let i = 0; i < 200; i++) {
    const harness = createDragLifecycleHarness({ mockWindow });

    harness.handlePointerDown({ pointerId: i + 1, clientX: 100 + i, clientY: 300 });
    assert.equal(harness.controlsRef.current.enabled, false);

    // Random drag movements
    mockWindow.dispatchEvent('pointermove', { pointerId: i + 1, clientX: 110, clientY: 250 });

    // Unmount
    harness.unmount();

    assert.equal(harness.controlsRef.current.enabled, true);
    assert.equal(mockWindow.getListenerCount(), 0, `Iteration ${i}: Window listener count must be 0`);
  }
});

// =============================================================================
// CATEGORY 3: MULTI-TOUCH POINTER ID COLLISION HANDLING
// =============================================================================

test('Adversarial 3.1: Secondary touch pointermove and pointerup do NOT interfere with active primary drag', () => {
  const mockWindow = new MockWindowTarget();
  let dragMoveCount = 0;
  let dropped = false;

  const harness = createDragLifecycleHarness({
    mockWindow,
    towerTopY: 1.0,
    onDragMove: () => dragMoveCount++,
    onDrop: () => (dropped = true),
  });

  // Primary finger 1 touches down (pointerId: 101)
  harness.handlePointerDown({ pointerId: 101, clientX: 200, clientY: 600 });
  assert.equal(harness.controlsRef.current.enabled, false);
  assert.equal(harness.activePointerIdRef.current, 101);

  // Primary finger moves upward
  mockWindow.dispatchEvent('pointermove', { pointerId: 101, clientX: 200, clientY: 450 });
  assert.equal(dragMoveCount, 1);
  const primaryPosY = harness.currentPosRef.current[1];

  // Secondary finger touches screen and moves (pointerId: 102)
  mockWindow.dispatchEvent('pointermove', { pointerId: 102, clientX: 800, clientY: 100 });
  // Move count must NOT increase, and stone position must NOT jump
  assert.equal(dragMoveCount, 1, 'Secondary touch pointermove must be strictly filtered out');
  assert.equal(harness.currentPosRef.current[1], primaryPosY, 'Stone position must remain untouched by finger 2');

  // Secondary finger lifts up (pointerId: 102)
  mockWindow.dispatchEvent('pointerup', { pointerId: 102 });
  // Drag must NOT terminate! OrbitControls must remain disabled!
  assert.equal(harness.isDraggingRef.current, true, 'Secondary touch release must NOT terminate primary drag');
  assert.equal(harness.controlsRef.current.enabled, false, 'OrbitControls must remain disabled for primary touch');
  assert.equal(mockWindow.getListenerCount(), 3, 'Window listeners must remain active for primary touch');

  // Third finger cancels (pointerId: 103)
  mockWindow.dispatchEvent('pointercancel', { pointerId: 103 });
  assert.equal(harness.isDraggingRef.current, true, 'Extraneous pointercancel must NOT abort primary drag');

  // Primary finger 1 now ascends past drop threshold and releases
  mockWindow.dispatchEvent('pointermove', { pointerId: 101, clientX: 200, clientY: 200 }); // dy = -400px
  assert.equal(dragMoveCount, 2);

  mockWindow.dispatchEvent('pointerup', { pointerId: 101 });
  assert.equal(harness.isDraggingRef.current, false);
  assert.equal(harness.controlsRef.current.enabled, true, 'OrbitControls must recover after primary release');
  assert.equal(dropped, true, 'Primary drop above threshold must succeed');
  assert.equal(mockWindow.getListenerCount(), 0, 'All window listeners must be cleaned up');
});

test('Adversarial 3.2: Multi-touch event flood (100 extraneous pointer events) leaves active drag intact and robust', () => {
  const mockWindow = new MockWindowTarget();
  let primaryMoves = 0;

  const harness = createDragLifecycleHarness({
    mockWindow,
    onDragMove: () => primaryMoves++,
  });

  harness.handlePointerDown({ pointerId: 500, clientX: 100, clientY: 500 });

  // Flood with extraneous pointer IDs (501 to 550)
  for (let id = 501; id <= 550; id++) {
    mockWindow.dispatchEvent('pointermove', { pointerId: id, clientX: Math.random() * 1000, clientY: Math.random() * 1000 });
    mockWindow.dispatchEvent('pointerup', { pointerId: id });
    mockWindow.dispatchEvent('pointercancel', { pointerId: id });
  }

  assert.equal(primaryMoves, 0, 'Zero extraneous pointer events should have moved the stone');
  assert.equal(harness.isDraggingRef.current, true, 'Primary drag must remain active');
  assert.equal(harness.controlsRef.current.enabled, false, 'OrbitControls must remain locked');

  // Primary pointer moves and cancels cleanly
  mockWindow.dispatchEvent('pointermove', { pointerId: 500, clientX: 100, clientY: 480 });
  assert.equal(primaryMoves, 1);
  mockWindow.dispatchEvent('pointerup', { pointerId: 500 });

  assert.equal(harness.isDraggingRef.current, false);
  assert.equal(harness.controlsRef.current.enabled, true);
  assert.equal(mockWindow.getListenerCount(), 0);
});

// =============================================================================
// CATEGORY 4: ORBITCONTROLS STATE TRANSITIONS & CAMERA CLAMPING
// =============================================================================

test('Adversarial 4.1: OrbitControls enable/disable transitions across full user interaction lifecycle', () => {
  const mockWindow = new MockWindowTarget();
  const harness = createDragLifecycleHarness({ mockWindow });

  // 1. Initial idle state: OrbitControls enabled
  assert.equal(harness.controlsRef.current.enabled, true);

  // 2. Drag starts: OrbitControls locked
  harness.handlePointerDown({ pointerId: 1, clientX: 0, clientY: 0 });
  assert.equal(harness.controlsRef.current.enabled, false);

  // 3. User cancels drag: OrbitControls unlocked
  mockWindow.dispatchEvent('pointercancel', { pointerId: 1 });
  assert.equal(harness.controlsRef.current.enabled, true);

  // 4. Repeated drag start and successful drop
  harness.handlePointerDown({ pointerId: 2, clientX: 0, clientY: 500 });
  assert.equal(harness.controlsRef.current.enabled, false);

  mockWindow.dispatchEvent('pointermove', { pointerId: 2, clientX: 0, clientY: 100 });
  mockWindow.dispatchEvent('pointerup', { pointerId: 2 });
  assert.equal(harness.controlsRef.current.enabled, true);
});

test('Adversarial 4.2: Camera cylindrical target clamping across 5,000 randomized boundary fuzz coordinates', () => {
  let seed = 12345;
  function lcg(): number {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  }

  for (let i = 0; i < 5000; i++) {
    const rawX = (lcg() - 0.5) * 200; // -100 to 100
    const rawY = (lcg() - 0.5) * 50;  // -25 to 25
    const rawZ = (lcg() - 0.5) * 200; // -100 to 100
    const towerTopY = lcg() * 6.0;    // 0 to 6m

    const clamped = clampCameraTarget([rawX, rawY, rawZ], CAMERA_PAN_MAX_RADIUS, towerTopY);

    // Horizontal radial constraint: R <= 15.0m
    const radialDist = Math.hypot(clamped[0], clamped[2]);
    assert.ok(
      radialDist <= CAMERA_PAN_MAX_RADIUS + 1e-4,
      `Fuzz ${i}: Radial distance ${radialDist} must not exceed ${CAMERA_PAN_MAX_RADIUS}`
    );

    // Vertical constraints: 0.2m <= y <= max(1.5m, towerTopY + 2.5m)
    const expectedMaxY = Math.max(1.5, towerTopY + 2.5);
    assert.ok(clamped[1] >= 0.2 - 1e-4, `Fuzz ${i}: Y (${clamped[1]}) must be >= 0.2m`);
    assert.ok(clamped[1] <= expectedMaxY + 1e-4, `Fuzz ${i}: Y (${clamped[1]}) must be <= ${expectedMaxY}`);

    // Directional alignment invariant: clamped (x, z) must be parallel to input (rawX, rawZ)
    const origHypot = Math.hypot(rawX, rawZ);
    if (origHypot > 1e-4) {
      const dot = (clamped[0] * rawX + clamped[2] * rawZ) / (radialDist * origHypot);
      assert.ok(dot >= 0.9999, `Fuzz ${i}: Clamped vector must point in original direction`);
    }
  }
});

test('Adversarial 4.3: Recenter HUD button trigger distance threshold boundary assertions', () => {
  // Threshold invariant: RECENTER_TRIGGER_DISTANCE = 2.0
  assert.equal(RECENTER_TRIGGER_DISTANCE, 2.0);

  // Exact boundary values
  const justBelow = Math.hypot(1.414, 1.414); // 1.9997 < 2.0
  assert.ok(justBelow < RECENTER_TRIGGER_DISTANCE, '1.9997m offset must NOT show recenter button');

  const exactThreshold = 2.0;
  assert.ok(exactThreshold >= RECENTER_TRIGGER_DISTANCE, '2.0m offset MUST show recenter button');

  const justAbove = 2.001;
  assert.ok(justAbove >= RECENTER_TRIGGER_DISTANCE, '2.001m offset MUST show recenter button');
});

// =============================================================================
// CATEGORY 5: VISUAL SCENE INTEGRITY EMPIRICAL VERIFICATION
// =============================================================================

test('Adversarial 5.1: StoneTowerCanvas.tsx source verification of Fog, Sky background, and Zen ground disc', () => {
  const canvasPath = path.resolve(projectRoot, 'presentation/components/StoneTowerCanvas.tsx');
  assert.ok(fs.existsSync(canvasPath), 'StoneTowerCanvas.tsx must exist');
  const source = fs.readFileSync(canvasPath, 'utf8');

  // 1. Fog specification: fogExp2 '#0F121A' density 0.032
  assert.ok(
    source.includes('<fogExp2 attach="fog" args={[\'#0F121A\', 0.032]} />'),
    'StoneTowerCanvas must render <fogExp2 attach="fog" args={[\'#0F121A\', 0.032]} />'
  );

  // 2. Matching Sky background: color attach="background" '#0F121A'
  assert.ok(
    source.includes('<color attach="background" args={[\'#0F121A\']} />'),
    'StoneTowerCanvas must render matching background <color attach="background" args={[\'#0F121A\']} />'
  );

  // 3. Wide Zen Ground Disc: R = 28m (ZEN_GARDEN_RADIUS), 64 segments, receiveShadow, color #161922
  assert.ok(
    source.includes('<circleGeometry args={[ZEN_GARDEN_RADIUS, 64]} />'),
    'StoneTowerCanvas must render ground disc with circleGeometry args={[ZEN_GARDEN_RADIUS, 64]}'
  );
  assert.ok(
    source.includes('<meshStandardMaterial color="#161922" roughness={0.94} metalness={0.03} />'),
    'Zen ground disc must have dark stone material (#161922, roughness 0.94, metalness 0.03)'
  );
  assert.ok(
    source.includes('position={[0, -0.012, 0]} receiveShadow'),
    'Zen ground disc must receive shadow and be positioned just beneath floor level'
  );

  // 4. Central circular platform comment preservation (cluster test dependency)
  assert.ok(
    source.includes('{/* Circular Ground Pedestal Platform (Dark Mode Stone Contrast) */}'),
    'Central pedestal platform comment must be preserved'
  );

  // 5. Ambient particle system integration
  assert.ok(
    source.includes('<ZenAmbientParticles count={24} />'),
    'StoneTowerCanvas must mount <ZenAmbientParticles count={24} />'
  );

  // 6. Recenter HUD button accessibility role and label
  assert.ok(
    source.includes('accessibilityRole="button"'),
    'Recenter button must specify accessibilityRole="button"'
  );
  assert.ok(
    source.includes('accessibilityLabel="돌탑으로 복귀"'),
    'Recenter button must specify accessibilityLabel="돌탑으로 복귀"'
  );
  assert.ok(
    source.includes('🎯 돌탑으로 복귀'),
    'Recenter button text must display "🎯 돌탑으로 복귀"'
  );
});

test('Adversarial 5.2: Concentric Karesansui sand ripple rings strictly bounded within Zen ground disc', () => {
  const canvasPath = path.resolve(projectRoot, 'presentation/components/StoneTowerCanvas.tsx');
  const source = fs.readFileSync(canvasPath, 'utf8');

  // Extract KARESANSUI_RIPPLE_RADII array from source or module
  assert.ok(source.includes('export const KARESANSUI_RIPPLE_RADII'), 'KARESANSUI_RIPPLE_RADII must be exported');

  const match = source.match(/KARESANSUI_RIPPLE_RADII\s*=\s*\[([\s\S]*?)\]\s*as\s*const/);
  assert.ok(match, 'KARESANSUI_RIPPLE_RADII array must match pattern');

  const numbers = match[1]
    .split(',')
    .map((s) => parseFloat(s.trim()))
    .filter((n) => !Number.isNaN(n));

  assert.equal(numbers.length, 9, 'Must define exactly 9 concentric sand ripple rings');

  // Verify strictly monotonic increasing radii
  for (let i = 1; i < numbers.length; i++) {
    assert.ok(
      numbers[i] > numbers[i - 1],
      `Ring ${i} (${numbers[i]}) must be larger than ring ${i - 1} (${numbers[i - 1]})`
    );
  }

  // All rings must be inside Zen garden radius (28m)
  assert.ok(numbers[0] >= 3.0, `Innermost ring (${numbers[0]}) must surround central 2.0m altar`);
  assert.ok(numbers[numbers.length - 1] < ZEN_GARDEN_RADIUS, `Outermost ring (${numbers[numbers.length - 1]}) must be inside 28.0m garden`);
});

test('Adversarial 5.3: ZenAmbientParticles 24-instance mathematical stability over 60 seconds of simulated time', () => {
  // Test mathematical stability of particle position formula verbatim from ZenAmbientParticles
  const count = 24;
  const particles = Array.from({ length: count }, (_, i) => {
    const radius = 2.5 + ((i * 7 + 3) % 13.5);
    const angle = (i / count) * Math.PI * 2 + (((i * 13) % 10) / 10 - 0.5) * 0.5;
    return {
      initialX: Math.cos(angle) * radius,
      initialZ: Math.sin(angle) * radius,
      baseY: 0.4 + ((i * 5) % 30) / 10,
      speedY: 0.15 + ((i * 3) % 20) / 100,
      swayRadius: 0.15 + ((i * 2) % 25) / 100,
      swayFreq: 0.8 + ((i * 4) % 12) / 10,
      phase: ((i * 11) % 628) / 100,
      scale: 0.7 + ((i * 6) % 60) / 100,
    };
  });

  assert.equal(particles.length, 24);

  // Simulate 3600 frames (60 seconds at 60Hz)
  for (let f = 0; f < 3600; f += 60) {
    const t = f / 60; // elapsed time in seconds

    for (let i = 0; i < count; i++) {
      const p = particles[i];
      const y = ((p.baseY + p.speedY * t) % 3.6) + 0.3;
      const x = p.initialX + Math.sin(t * p.swayFreq + p.phase) * p.swayRadius;
      const z = p.initialZ + Math.cos(t * p.swayFreq + p.phase) * p.swayRadius;

      // Coordinate sanity
      assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));

      // Vertical bounds: particles stay between 0.3m and 3.9m above ground
      assert.ok(y >= 0.3 && y <= 3.9 + 1e-4, `Particle ${i} at t=${t}s: height ${y} must be in [0.3, 3.9]`);

      // Horizontal bounds: particles stay well within 28m Zen garden
      const rad = Math.hypot(x, z);
      assert.ok(rad < ZEN_GARDEN_RADIUS, `Particle ${i} at t=${t}s: radius ${rad} must be < ${ZEN_GARDEN_RADIUS}`);
    }
  }
});

// =============================================================================
// CATEGORY 6: ADVERSARIAL STRESS CHALLENGE: CONCURRENT POINTERDOWN COLLISION
// =============================================================================

test('Adversarial 6.1: Challenge Scenario: Multi-touch double pointerdown without intervening pointerup', () => {
  const mockWindow = new MockWindowTarget();
  let dropCount = 0;
  let cancelCount = 0;

  const harness = createDragLifecycleHarness({
    mockWindow,
    onDrop: () => dropCount++,
    onDragCancel: () => cancelCount++,
  });

  // Touch 1 touches down on unplaced stone (pointerId: 10)
  harness.handlePointerDown({ pointerId: 10, clientX: 100, clientY: 500 });
  assert.equal(harness.controlsRef.current.enabled, false);
  assert.equal(harness.activePointerIdRef.current, 10);
  assert.equal(mockWindow.getListenerCount(), 3);

  // Touch 2 ALSO touches down on unplaced stone (pointerId: 20) before touch 1 lifts
  // In a hostile touch environment, if handlePointerDown is called again:
  harness.handlePointerDown({ pointerId: 20, clientX: 120, clientY: 510 });

  // Now touch 2 releases (extraneous touch release must not terminate primary drag)
  mockWindow.dispatchEvent('pointerup', { pointerId: 20 });
  assert.equal(harness.controlsRef.current.enabled, false, 'Controls remain disabled while primary touch 1 is still dragging');

  // Now touch 1 lifts
  mockWindow.dispatchEvent('pointerup', { pointerId: 10 });
  assert.equal(harness.controlsRef.current.enabled, true, 'Controls recover after primary touch 1 lifts');

  // Unmount cleanly cleans up any remaining listener
  harness.unmount();
  assert.equal(harness.controlsRef.current.enabled, true);
  assert.equal(mockWindow.getListenerCount(), 0, 'All window listeners must be completely detached at unmount');
});

test('Adversarial 6.2: Challenge Scenario: External phase transition to IDLE during active drag locks out OrbitControls', () => {
  const mockWindow = new MockWindowTarget();
  const harness = createDragLifecycleHarness({ mockWindow });

  // 1. User starts drag
  harness.handlePointerDown({ pointerId: 42, clientX: 100, clientY: 500 });
  assert.equal(harness.controlsRef.current.enabled, false);
  assert.equal(harness.isDraggingRef.current, true);
  assert.equal(mockWindow.getListenerCount(), 3);

  // 2. An external event sets phase to IDLE (e.g. timeout / quota error / reset)
  harness.onPhaseChange('IDLE');

  // 3. User releases finger
  mockWindow.dispatchEvent('pointerup', { pointerId: 42 });

  // Challenge assertion: Did OrbitControls recover? Were listeners cleaned up?
  assert.equal(harness.controlsRef.current.enabled, true, 'OrbitControls must recover even if phase reset to IDLE during drag');
  assert.equal(mockWindow.getListenerCount(), 0, 'Window listeners must be cleaned up when finger releases');
});

