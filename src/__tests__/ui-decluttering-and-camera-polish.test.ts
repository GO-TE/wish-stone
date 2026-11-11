/**
 * UI Decluttering & Camera Polish (R4, Milestone 3) Test Suite
 *
 * Requirements:
 * - ORIGINAL_REQUEST.md (R4: UI Decluttering and Camera Exploration)
 * - PROJECT.md (F17: 4 Camera Presets, F18: Cylindrical Clamp & Recenter HUD,
 *               F23: UI Clutter Elimination, F26: Fallen Stone Choice UX D-022,
 *               F27: 3-Attempt Placement & Auto-Settling)
 * - DISPATCH.md (Milestone 3 Task Assignment)
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createMsaAppContainer } from '../container.ts';
import { Stone } from '../domain/entities/Stone.ts';
import { Tower } from '../domain/entities/Tower.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import { TowerKey } from '../domain/value-objects/TowerKey.ts';
import { StonePhysicsBodyFactory } from '../infrastructure/physics/StonePhysicsBodyFactory.ts';
import {
  clampCameraTarget,
  computeFocusCameraView,
  computePresetCameraView,
  CAMERA_PAN_MAX_RADIUS,
  RECENTER_TRIGGER_DISTANCE,
} from '../presentation/components/cameraPresetSpec.ts';
import { StackStoneController } from '../presentation/controllers/StackStoneController.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

test('R4-1: StoneTowerCanvas.tsx - Elimination of dead UI clutter', () => {
  const canvasPath = path.resolve(projectRoot, 'presentation/components/StoneTowerCanvas.tsx');
  assert.ok(fs.existsSync(canvasPath), 'StoneTowerCanvas.tsx must exist');
  const src = fs.readFileSync(canvasPath, 'utf8');

  // 1. Verify dead control panel block is deleted
  assert.ok(
    !src.includes('{false && showControls && ('),
    'StoneTowerCanvas.tsx must NOT contain dead {false && showControls && ( block'
  );

  // 2. Verify dead laser guide beam mesh is deleted
  assert.ok(
    !src.includes('{false && (\n              <mesh position='),
    'StoneTowerCanvas.tsx must NOT contain dead laser guide beam mesh'
  );

  // 3. Verify dead moss blanket layer with broken emojis is deleted
  assert.ok(
    !src.includes('{false && lushMossEnabled && ('),
    'StoneTowerCanvas.tsx must NOT contain dead {false && lushMossEnabled && ( block'
  );
  assert.ok(
    !src.includes('<Text style={styles.creviceFlower1}>🌸</Text>'),
    'StoneTowerCanvas.tsx must NOT render broken crevice flower emojis'
  );
  assert.ok(
    !src.includes('<Text style={styles.creviceFlower2}>🌼</Text>'),
    'StoneTowerCanvas.tsx must NOT render broken crevice flower 2 emojis'
  );
});

test('R4-2: StoneTowerCanvas.tsx - Camera presets, cylindrical clamp, and recenter HUD preservation', () => {
  const canvasPath = path.resolve(projectRoot, 'presentation/components/StoneTowerCanvas.tsx');
  const src = fs.readFileSync(canvasPath, 'utf8');

  // 1. Preserves recenter HUD button
  assert.ok(
    src.includes('🎯 돌탑으로 복귀'),
    'StoneTowerCanvas.tsx must render [🎯 돌탑으로 복귀] recenter HUD button'
  );
  assert.ok(
    src.includes('RECENTER_TRIGGER_DISTANCE'),
    'StoneTowerCanvas.tsx must check RECENTER_TRIGGER_DISTANCE threshold'
  );

  // 2. Camera presets verified
  const frontView = computePresetCameraView('front', 2.0);
  assert.deepEqual(frontView.target, [0, 1.0, 0], 'Front preset must center vertically at 0.5 * towerTopY');
  assert.ok(frontView.position[2] > 0, 'Front preset must position along positive Z axis');

  const topView = computePresetCameraView('top', 2.0);
  assert.deepEqual(topView.position, [0, 4.1, 0.45], 'Top view must look down with slight forward tilt');

  // 3. Cylindrical target clamping
  const farTarget: [number, number, number] = [25.0, 1.0, 25.0];
  const [clampedX, clampedY, clampedZ] = clampCameraTarget(farTarget, CAMERA_PAN_MAX_RADIUS, 2.0);
  const clampedDist = Math.hypot(clampedX, clampedZ);
  assert.ok(
    clampedDist <= CAMERA_PAN_MAX_RADIUS + 1e-4,
    `Target radius must be clamped within ${CAMERA_PAN_MAX_RADIUS}m`
  );
  assert.ok(clampedY >= 0.2, 'Target Y must respect ground clearance');
  assert.ok(clampedY <= 2.0 + 2.5, 'Target Y must not exceed top + 2.5m ceiling');

  // 4. Recenter trigger boundary
  assert.equal(RECENTER_TRIGGER_DISTANCE, 2.0, 'Recenter trigger distance must be exactly 2.0m');
});

test('R4-3: place.tsx - Elimination of invasive buttons and quota bypass hacks', () => {
  const placePath = path.resolve(projectRoot, 'app/stack/place.tsx');
  assert.ok(fs.existsSync(placePath), 'place.tsx must exist');
  const src = fs.readFileSync(placePath, 'utf8');

  // 1. Invasive button deleted from JSX rendering
  assert.ok(
    !src.includes('<Text style={styles.primaryText}>🎯 즉시 안착하기</Text>'),
    'place.tsx must NOT render active [🎯 즉시 안착하기] Pressable button'
  );

  // 2. Arbitrary quota bonus bypass deleted from executable logic
  assert.ok(
    !src.includes('controller.grantRewardQuotaBonus(999);'),
    'place.tsx must NOT execute controller.grantRewardQuotaBonus(999);'
  );

  // 3. Captions consolidated: canvasCaption removed from inside canvasContainer
  assert.ok(
    !src.includes('<Text style={styles.canvasCaption}>'),
    'place.tsx must eliminate redundant <Text style={styles.canvasCaption}> from canvas'
  );

  // 4. Clean guidance row rendered during drag / idle
  assert.ok(
    src.includes('styles.guidanceRow'),
    'place.tsx must render clean guidanceRow for status messaging'
  );
});

test('R4-4: D-022 FALLEN_CHOICE - Peaceful choices & state machine verification', async () => {
  const originalFetch = globalThis.fetch;
  let savedWishPayload: any = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';

    if (url.includes('/api/v1/auth/login')) {
      return new Response(
        JSON.stringify({
          accessToken: 'mock-token-r4',
          user: { id: 'user-r4', nickname: null, isGuest: true },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url.includes('/api/v1/wishes') && method === 'POST') {
      savedWishPayload = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({
          id: 'wish-fallen-d022',
          content: savedWishPayload.content,
          category: savedWishPayload.category,
          scope: savedWishPayload.scope,
          stone: savedWishPayload.stone,
          createdAt: new Date().toISOString(),
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({}), { status: 200 });
  }) as typeof fetch;

  try {
    const container = createMsaAppContainer();
    await container.auth.signIn('guest');
    const controller = new StackStoneController(container);
    controller.updateContent('언제나 평온하기를');

    // Simulate collapse transition to COLLAPSING
    (controller as any).updateState({
      phase: 'COLLAPSING',
      attempt: 1,
      towerCollapsed: true,
    });

    // 1. Choice A: [ ↺ 다시 올려보기 ] (retryPlacement)
    const retryState = controller.retryPlacement();
    assert.equal(retryState.phase, 'IDLE', 'retryPlacement must return state to IDLE');
    assert.equal(retryState.attempt, 1, 'retryPlacement must preserve attempt count (1)');
    assert.equal(retryState.towerCollapsed, false, 'retryPlacement must clear collapse flag');

    // 2. Choice B: [ ⛰️ 이 자리에 그대로 두기 ] (confirmFallenPlacement)
    const roundConfig = StonePhysicsBodyFactory.getShapeConfig('round');
    const groundY = Number(roundConfig.halfExtents.y.toFixed(4));
    const fallenGroundPose = new Pose({ x: 0.285, y: groundY, z: -0.142 });

    const confirmRes = await controller.confirmFallenPlacement(fallenGroundPose);
    assert.equal(confirmRes.status, 'saved', 'confirmFallenPlacement must return saved status');
    assert.equal(confirmRes.pose.position.y, groundY, 'Stone must be saved at authentic ground height');
    assert.equal(confirmRes.pose.position.x, 0.285);
    assert.equal(confirmRes.pose.position.z, -0.142);
    assert.equal(controller.getState().phase, 'SETTLED', 'State must transition to SETTLED');
    assert.equal(controller.getState().savedWishId, 'wish-fallen-d022');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('R4-5: Strict Quota Integrity - Depleted quota throws DAILY_QUOTA_EXCEEDED without bypass', async () => {
  const container = createMsaAppContainer();
  const controller = new StackStoneController(container);

  // Consume all remaining quota until canStack is false
  while (controller.getState().quota.canStack()) {
    (controller as any).updateState({
      quota: controller.getState().quota.consumeOne(),
    });
  }

  assert.equal(controller.getState().quota.canStack(), false, 'Quota must be fully depleted');

  const emptyTower = new Tower(
    TowerKey.global(),
    [],
    { stoneCount: 0, todayCount: 0, fulfilledCount: 0, cheerCount: 0 }
  );

  // Must reject placement when quota is 0 (no arbitrary 999 grant)
  await assert.rejects(
    async () => {
      await controller.placeStone(emptyTower, Pose.origin());
    },
    (err: Error) => err.message === 'DAILY_QUOTA_EXCEEDED',
    'placeStone must throw DAILY_QUOTA_EXCEEDED when quota is exhausted'
  );

  // Must reject confirmFallenPlacement when quota is 0
  await assert.rejects(
    async () => {
      await controller.confirmFallenPlacement(Pose.origin());
    },
    (err: Error) => err.message === 'DAILY_QUOTA_EXCEEDED',
    'confirmFallenPlacement must throw DAILY_QUOTA_EXCEEDED when quota is exhausted'
  );
});

test('R4-6: 3rd Consecutive Drop Failure triggers automatic summit auto-placement', async () => {
  const container = createMsaAppContainer();
  await container.auth.signIn('guest');
  const controller = new StackStoneController(container);
  controller.updateContent('세 번째 시도 소원');

  // Base stone on tower
  const baseStone = new Stone({
    shape: 'boulder',
    color: '#3182F6',
    pose: new Pose({ x: 0, y: 0.125, z: 0 }),
  });
  const tower = new Tower(
    TowerKey.global(),
    [
      {
        id: 'stone-0',
        stone: baseStone,
        status: 'active',
        bloom: null,
        cheerLevel: 0,
        isMine: false,
        nickname: null,
      },
    ],
    { stoneCount: 1, todayCount: 1, cheerCount: 0, fulfilledCount: 0 }
  );

  // Attempt 1: off-center drop (fails -> retry)
  const offDrop = new Pose({ x: 1.5, y: 1.0, z: 0 });
  const res1 = await controller.placeStone(tower, offDrop);
  assert.equal(res1.status, 'retry');
  assert.equal(controller.getState().attempt, 1);

  // User retries
  controller.retryPlacement();

  // Attempt 2: off-center drop (fails -> retry)
  const res2 = await controller.placeStone(tower, offDrop);
  assert.equal(res2.status, 'retry');
  assert.equal(controller.getState().attempt, 2);

  // User retries
  controller.retryPlacement();

  // Attempt 3: 3rd drop failure must auto-place on summit
  const res3 = await controller.placeStone(tower, offDrop);
  assert.equal(res3.status, 'saved', '3rd attempt must auto-save');
  assert.equal(res3.autoPlaced, true, '3rd attempt must set autoPlaced: true');
  assert.equal(controller.getState().phase, 'SETTLED');
});
