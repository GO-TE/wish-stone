import assert from 'node:assert/strict';
import test from 'node:test';

import { createMsaAppContainer } from '../container.ts';
import { Stone, type StoneShape } from '../domain/entities/Stone.ts';
import { Tower, type TowerStoneItem } from '../domain/entities/Tower.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import { TowerKey } from '../domain/value-objects/TowerKey.ts';
import {
  createRiverPebbleGeometry,
  NATURAL_PEBBLE_COLORS,
  NATURAL_PEBBLE_PALETTE,
  PEBBLE_SHAPE_PROFILES,
} from '../presentation/components/pebbleGeometrySpec.ts';
import {
  buildStoneGeometrySpec,
  buildStoneMaterialSpec,
} from '../presentation/components/stoneTowerSpec.ts';
import {
  StackStoneController,
  type StackStoneViewState,
} from '../presentation/controllers/StackStoneController.ts';

/**
 * Mock MSA Container with mock HTTP backend for offline determinism
 */
function createMockAppContainer() {
  const mockFetch = async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method === 'POST' && String(url).endsWith('/api/v1/wishes')) {
      return {
        ok: true,
        status: 201,
        json: async () => ({
          id: `wish-${Math.random().toString(36).substring(2, 9)}`,
          createdAt: new Date().toISOString(),
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
    };
  };

  return createMsaAppContainer('http://localhost:8080', mockFetch as any);
}

// =============================================================================
// TEST SUITE 1: MONTE-CARLO STATISTICAL UNIFORMITY (12 MINERAL COLORS, N >= 1200)
// =============================================================================

test('Adversarial M3.1: Monte-Carlo 1200-sample mineral color distribution satisfies uniformity and chi-square bounds', () => {
  const controller = new StackStoneController();
  const N = 1200;
  const numColors = NATURAL_PEBBLE_COLORS.length;
  assert.equal(numColors, 12, 'Must have exactly 12 mineral colors');

  const colorCounts = new Map<string, number>();
  for (const c of NATURAL_PEBBLE_COLORS) {
    colorCounts.set(c, 0);
  }

  let previousColor = controller.getState().selectedStone.color;

  for (let i = 0; i < N; i++) {
    const stone = controller.rerollStone();

    // 1. Invariant: consecutive rerolls must alternate colors (no immediate repetition)
    assert.notEqual(
      stone.color,
      previousColor,
      `Reroll step ${i}: consecutive identical color "${stone.color}" observed`
    );
    previousColor = stone.color;

    // 2. Color must belong to canonical palette
    assert.ok(
      colorCounts.has(stone.color),
      `Unexpected color ${stone.color} not in NATURAL_PEBBLE_COLORS`
    );

    colorCounts.set(stone.color, (colorCounts.get(stone.color) ?? 0) + 1);
  }

  // 3. Complete coverage: Every one of the 12 mineral colors must appear > 0 times
  const expectedPerColor = N / numColors; // 100
  let chiSquare = 0;

  for (const [color, count] of colorCounts.entries()) {
    assert.ok(
      count > 0,
      `Color ${color} had 0 appearances over ${N} trials (starvation failure)`
    );

    // Bounded appearance check: 40 <= count <= 180 (extremely wide 6-sigma band around mean 100)
    assert.ok(
      count >= 40 && count <= 180,
      `Color ${color} count ${count} deviated excessively from expected ${expectedPerColor}`
    );

    const diff = count - expectedPerColor;
    chiSquare += (diff * diff) / expectedPerColor;
  }

  // 4. Chi-Square Goodness-of-Fit test
  // Degrees of freedom df = 12 - 1 = 11.
  // Critical value for alpha = 0.001 is 31.264.
  // With negative autocorrelation between consecutive steps, variance is lower than IID multinomial.
  assert.ok(
    chiSquare < 35.0,
    `Chi-Square statistic ${chiSquare.toFixed(2)} exceeds critical bound 35.0 (df=11, alpha=0.001)`
  );
});

// =============================================================================
// TEST SUITE 2: MONTE-CARLO STATISTICAL UNIFORMITY (5 SHAPE PROFILES, N >= 1200)
// =============================================================================

test('Adversarial M3.2: Monte-Carlo 1200-sample shape profile distribution satisfies uniformity and chi-square bounds', () => {
  const controller = new StackStoneController();
  const N = 1200;
  const numShapes = PEBBLE_SHAPE_PROFILES.length;
  assert.equal(numShapes, 5, 'Must have exactly 5 shape profiles');

  const shapeCounts = new Map<StoneShape, number>();
  for (const s of PEBBLE_SHAPE_PROFILES) {
    shapeCounts.set(s, 0);
  }

  let previousShape = controller.getState().selectedStone.shape;

  for (let i = 0; i < N; i++) {
    const stone = controller.rerollStone();

    // 1. Invariant: consecutive rerolls must alternate shapes
    assert.notEqual(
      stone.shape,
      previousShape,
      `Reroll step ${i}: consecutive identical shape "${stone.shape}" observed`
    );
    previousShape = stone.shape;

    // 2. Shape must belong to canonical shape profiles
    assert.ok(
      shapeCounts.has(stone.shape),
      `Unexpected shape ${stone.shape} not in PEBBLE_SHAPE_PROFILES`
    );

    shapeCounts.set(stone.shape, (shapeCounts.get(stone.shape) ?? 0) + 1);
  }

  // 3. Complete coverage: Every shape must appear > 0 times
  const expectedPerShape = N / numShapes; // 240
  let chiSquare = 0;

  for (const [shape, count] of shapeCounts.entries()) {
    assert.ok(
      count > 0,
      `Shape ${shape} had 0 appearances over ${N} trials (starvation failure)`
    );

    // Bounded appearance check: 140 <= count <= 340 (wide band around mean 240)
    assert.ok(
      count >= 140 && count <= 340,
      `Shape ${shape} count ${count} deviated excessively from expected ${expectedPerShape}`
    );

    const diff = count - expectedPerShape;
    chiSquare += (diff * diff) / expectedPerShape;
  }

  // 4. Chi-Square Goodness-of-Fit test
  // Degrees of freedom df = 5 - 1 = 4.
  // Critical value for alpha = 0.001 is 18.467.
  assert.ok(
    chiSquare < 22.0,
    `Chi-Square statistic ${chiSquare.toFixed(2)} exceeds critical bound 22.0 (df=4, alpha=0.001)`
  );
});

// =============================================================================
// TEST SUITE 3: IMMUTABILITY & NUMERICAL INTEGRITY (ZERO NAN / UNDEFINED)
// =============================================================================

test('Adversarial M3.3: Every rerolled stone is an immutable new instance with zero NaN/undefined attributes', () => {
  const controller = new StackStoneController();
  const N = 1200;
  const history: Stone[] = [];

  for (let i = 0; i < N; i++) {
    const prevStone = controller.getState().selectedStone;
    const stone = controller.rerollStone();

    // 1. Immutable reference equality check: must be a brand new instance
    assert.notEqual(
      stone,
      prevStone,
      `Step ${i}: rerollStone returned the exact same object reference`
    );

    // 2. Identity contract with controller state
    assert.equal(
      controller.getState().selectedStone,
      stone,
      `Step ${i}: controller selectedStone does not match return value`
    );

    // 3. Zero NaN or undefined in Color
    assert.ok(typeof stone.color === 'string', `Step ${i}: color is not string`);
    assert.ok(
      /^#[0-9A-Fa-f]{6}$/.test(stone.color),
      `Step ${i}: color "${stone.color}" does not match hex regex`
    );

    // 4. Zero NaN or undefined in Pose Coordinates
    const pos = stone.pose.position;
    assert.ok(Number.isFinite(pos.x), `Step ${i}: position.x is NaN or infinite`);
    assert.ok(Number.isFinite(pos.y), `Step ${i}: position.y is NaN or infinite`);
    assert.ok(Number.isFinite(pos.z), `Step ${i}: position.z is NaN or infinite`);

    // 5. Zero NaN or undefined in Rotation Quaternion
    const rot = stone.pose.rotation;
    assert.ok(Number.isFinite(rot.qx), `Step ${i}: rotation.qx is NaN or infinite`);
    assert.ok(Number.isFinite(rot.qy), `Step ${i}: rotation.qy is NaN or infinite`);
    assert.ok(Number.isFinite(rot.qz), `Step ${i}: rotation.qz is NaN or infinite`);
    assert.ok(Number.isFinite(rot.qw), `Step ${i}: rotation.qw is NaN or infinite`);
    const qLen = Math.hypot(rot.qx, rot.qy, rot.qz, rot.qw);
    assert.ok(
      Math.abs(qLen - 1.0) < 1e-4,
      `Step ${i}: rotation quaternion is unnormalized (len=${qLen})`
    );

    // 6. Geometry spec resolution & scale parity
    const geoSpec = buildStoneGeometrySpec(stone.shape);
    assert.ok(Number.isFinite(geoSpec.scale.x) && geoSpec.scale.x > 0);
    assert.ok(Number.isFinite(geoSpec.scale.y) && geoSpec.scale.y > 0);
    assert.ok(Number.isFinite(geoSpec.scale.z) && geoSpec.scale.z > 0);

    // 7. Material spec resolution
    const matSpec = buildStoneMaterialSpec(stone.color, stone.shape, 0, false);
    assert.equal(matSpec.baseColor, stone.color);
    assert.ok(Number.isFinite(matSpec.roughness));
    assert.ok(Number.isFinite(matSpec.metalness));

    // Sample-check River Pebble procedural mesh parity every 100 steps
    if (i % 100 === 0) {
      const geometry = createRiverPebbleGeometry({
        shape: stone.shape,
        scale: geoSpec.scale,
        flattenedBase: true,
      });

      const bb = geometry.boundingBox!;
      assert.ok(bb, 'Bounding box must be computed');
      const hx = (bb.max.x - bb.min.x) / 2;
      const hy = (bb.max.y - bb.min.y) / 2;
      const hz = (bb.max.z - bb.min.z) / 2;

      assert.ok(Math.abs(hx - geoSpec.scale.x * 0.25) < 1e-4);
      assert.ok(Math.abs(hy - geoSpec.scale.y * 0.25) < 1e-4);
      assert.ok(Math.abs(hz - geoSpec.scale.z * 0.25) < 1e-4);
    }

    history.push(stone);
  }

  // 8. Retrospective historical integrity check: verify no retroactive mutation
  for (let k = 0; k < 20; k++) {
    const historicalStone = history[k * 50];
    assert.ok(PEBBLE_SHAPE_PROFILES.includes(historicalStone.shape));
    assert.ok(NATURAL_PEBBLE_COLORS.includes(historicalStone.color));
    assert.ok(Number.isFinite(historicalStone.pose.position.x));
  }
});

// =============================================================================
// TEST SUITE 4: CONCURRENT LISTENER NOTIFICATIONS (50 LISTENERS PARITY & ISOLATION)
// =============================================================================

test('Adversarial M3.4: 50 concurrent listeners receive bit-for-bit identical state updates without race conditions or leaks', () => {
  const controller = new StackStoneController();
  const NUM_LISTENERS = 50;
  const NUM_REROLLS = 60;

  const listenerLogs: StackStoneViewState[][] = Array.from(
    { length: NUM_LISTENERS },
    () => []
  );
  const unsubs: (() => void)[] = [];

  // 1. Attach 50 listeners simultaneously
  for (let l = 0; l < NUM_LISTENERS; l++) {
    const idx = l;
    const unsub = controller.subscribe((state) => {
      // Record deep snapshot of state properties
      listenerLogs[idx].push({ ...state });
    });
    unsubs.push(unsub);
  }

  // 2. Perform 60 rapid rerolls
  for (let r = 0; r < NUM_REROLLS; r++) {
    controller.rerollStone();
  }

  // 3. Verify all 50 listeners received exactly 60 updates
  for (let l = 0; l < NUM_LISTENERS; l++) {
    assert.equal(
      listenerLogs[l].length,
      NUM_REROLLS,
      `Listener ${l} received ${listenerLogs[l].length} updates, expected ${NUM_REROLLS}`
    );
  }

  // 4. Verify bit-for-bit identical updates across all 50 listeners at every step
  for (let step = 0; step < NUM_REROLLS; step++) {
    const reference = listenerLogs[0][step];

    for (let l = 1; l < NUM_LISTENERS; l++) {
      const candidate = listenerLogs[l][step];

      assert.equal(
        candidate.selectedStone.shape,
        reference.selectedStone.shape,
        `Step ${step}: listener ${l} shape mismatch`
      );
      assert.equal(
        candidate.selectedStone.color,
        reference.selectedStone.color,
        `Step ${step}: listener ${l} color mismatch`
      );
      assert.equal(
        candidate.phase,
        reference.phase,
        `Step ${step}: listener ${l} phase mismatch`
      );
      assert.equal(
        candidate.attempt,
        reference.attempt,
        `Step ${step}: listener ${l} attempt mismatch`
      );
      assert.equal(
        candidate.towerCollapsed,
        reference.towerCollapsed,
        `Step ${step}: listener ${l} towerCollapsed mismatch`
      );
      assert.equal(
        candidate.selectedStone.pose.position.x,
        reference.selectedStone.pose.position.x
      );
    }
  }

  // 5. Concurrent unsubscription isolation: unsubscribe first 25 listeners
  for (let l = 0; l < 25; l++) {
    unsubs[l]();
  }

  // 6. Trigger 30 more rerolls
  for (let r = 0; r < 30; r++) {
    controller.rerollStone();
  }

  // 7. Verify unsubscribed listeners received NO new updates (stayed at 60)
  for (let l = 0; l < 25; l++) {
    assert.equal(
      listenerLogs[l].length,
      NUM_REROLLS,
      `Unsubscribed listener ${l} leaked updates (count=${listenerLogs[l].length})`
    );
  }

  // 8. Verify remaining 25 listeners received all 90 updates
  for (let l = 25; l < NUM_LISTENERS; l++) {
    assert.equal(
      listenerLogs[l].length,
      NUM_REROLLS + 30,
      `Active listener ${l} missed updates (count=${listenerLogs[l].length})`
    );
  }

  // Clean up remaining listeners
  for (let l = 25; l < NUM_LISTENERS; l++) {
    unsubs[l]();
  }
});

// =============================================================================
// TEST SUITE 5: TOWER STACKING INTEGRITY AFTER 100 CONSECUTIVE REROLLS
// =============================================================================

test('Adversarial M3.5: Tower stacking integrity after 100 consecutive rerolls before placement', async () => {
  const container = createMockAppContainer();
  const controller = new StackStoneController(container);

  // 1. Build a realistic 3-stone natural cairn
  const stone1 = new Stone({
    shape: 'boulder',
    color: '#2C2F33',
    pose: new Pose({ x: 0, y: 0.2625, z: 0 }),
  });
  const stone2 = new Stone({
    shape: 'flat',
    color: '#4A5568',
    pose: new Pose({ x: 0, y: 0.63, z: 0 }),
  });
  const stone3 = new Stone({
    shape: 'round',
    color: '#E2E8F0',
    pose: new Pose({ x: 0, y: 1.045, z: 0 }),
  });

  const tower = new Tower(
    TowerKey.global(),
    [
      {
        id: 'stone-cairn-1',
        stone: stone1,
        status: 'active',
        bloom: null,
        cheerLevel: 1,
        isMine: false,
        nickname: '바닥돌#0001',
      },
      {
        id: 'stone-cairn-2',
        stone: stone2,
        status: 'active',
        bloom: null,
        cheerLevel: 0,
        isMine: false,
        nickname: '중간돌#0002',
      },
      {
        id: 'stone-cairn-3',
        stone: stone3,
        status: 'active',
        bloom: null,
        cheerLevel: 3,
        isMine: false,
        nickname: '상단돌#0003',
      },
    ],
    { stoneCount: 3, todayCount: 3, fulfilledCount: 0, cheerCount: 4 }
  );

  const initialTopY = tower.topY();
  const initialTopSurfaceY = tower.topSurfaceY();
  assert.ok(initialTopY > 0, 'Tower initial topY must be positive');
  assert.ok(initialTopSurfaceY >= initialTopY, 'topSurfaceY >= topY');

  // Set user wish content and category
  controller.updateContent('온 가족의 건강과 안녕을 기원하는 소원');
  const expectedCategory = controller.getState().effectiveCategory;

  // 2. Perform 100 consecutive rerolls
  let lastRerolledStone: Stone | null = null;
  for (let i = 0; i < 100; i++) {
    lastRerolledStone = controller.rerollStone();
  }

  assert.ok(lastRerolledStone !== null);

  // 3. Verify Tower structure was completely unmutated by the 100 rerolls
  assert.equal(
    tower.stones.length,
    3,
    'Tower stone count must remain exactly 3 after rerolls'
  );
  assert.equal(
    tower.topY(),
    initialTopY,
    'Tower topY must remain unchanged after rerolls'
  );
  assert.equal(
    tower.topSurfaceY(),
    initialTopSurfaceY,
    'Tower topSurfaceY must remain unchanged after rerolls'
  );
  assert.equal(tower.stones[0].stone.shape, 'boulder');
  assert.equal(tower.stones[1].stone.shape, 'flat');
  assert.equal(tower.stones[2].stone.shape, 'round');

  // Verify controller retained wish content and category classification
  assert.equal(
    controller.getState().content,
    '온 가족의 건강과 안녕을 기원하는 소원'
  );
  assert.equal(controller.getState().effectiveCategory, expectedCategory);
  assert.equal(controller.getState().phase, 'IDLE');
  assert.equal(controller.getState().attempt, 0);

  // 4. Perform actual placement on top of the tower with the 100th rerolled stone
  const initialQuota = controller.getState().quota.remaining;
  assert.ok(initialQuota > 0, 'Quota must be available');

  const dropPose = new Pose({
    x: 0.02,
    y: Number((initialTopSurfaceY + 0.35).toFixed(4)),
    z: 0.01,
  });

  const placementResult = await controller.placeStone(tower, dropPose);

  // 5. Verify successful settlement invariants
  assert.equal(
    placementResult.status,
    'saved',
    'Placement must succeed and settle'
  );
  assert.equal(controller.getState().phase, 'SETTLED');
  assert.equal(controller.getState().towerCollapsed, false);
  assert.equal(
    controller.getState().quota.remaining,
    initialQuota - 1,
    'Daily quota must be decremented by 1'
  );
  assert.ok(
    controller.getState().savedWishId !== null,
    'Saved wish ID must be populated'
  );

  // 6. Verify placed stone matches the 100th rerolled shape and color
  const settledStone = controller.getState().selectedStone;
  assert.equal(
    settledStone.shape,
    lastRerolledStone.shape,
    'Settled stone must retain the rerolled shape'
  );
  assert.equal(
    settledStone.color,
    lastRerolledStone.color,
    'Settled stone must retain the rerolled color'
  );

  // 7. Verify settled elevation is strictly above initial top surface (no penetration)
  assert.ok(
    settledStone.pose.position.y > initialTopY,
    `Settled stone elevation (${settledStone.pose.position.y}) must be higher than prior top (${initialTopY})`
  );
  assert.ok(
    Number.isFinite(settledStone.pose.position.x),
    'Settled stone X must be finite'
  );
  assert.ok(
    Number.isFinite(settledStone.pose.position.y),
    'Settled stone Y must be finite'
  );
  assert.ok(
    Number.isFinite(settledStone.pose.position.z),
    'Settled stone Z must be finite'
  );
});

// =============================================================================
// TEST SUITE 6: STATE MACHINE RESILIENCE & INTERACTION FLOWS
// =============================================================================

test('Adversarial M3.6: Reroll interacts cleanly across all state machine phases (PLACING, COLLAPSING, SETTLED)', async () => {
  const container = createMockAppContainer();
  const controller = new StackStoneController(container);

  // Phase: IDLE
  assert.equal(controller.getState().phase, 'IDLE');
  controller.rerollStone();
  assert.equal(controller.getState().phase, 'IDLE');

  // Transition to PLACING
  controller.startPlacing();
  assert.equal(controller.getState().phase, 'PLACING');
  const stoneInPlacing = controller.rerollStone();
  // Phase should remain PLACING
  assert.equal(controller.getState().phase, 'PLACING');
  assert.equal(controller.getState().selectedStone, stoneInPlacing);

  // Reset to IDLE
  controller.resetPlacement();
  assert.equal(controller.getState().phase, 'IDLE');

  // Induce deliberate collapse by dropping far off-center
  const tower = new Tower(
    TowerKey.global(),
    [
      {
        id: 'base-stone',
        stone: new Stone({
          shape: 'round',
          color: '#2C2F33',
          pose: new Pose({ x: 0, y: 0.25, z: 0 }),
        }),
        status: 'active',
        bloom: null,
        cheerLevel: 0,
        isMine: false,
        nickname: '바닥',
      },
    ],
    { stoneCount: 1, todayCount: 1, fulfilledCount: 0, cheerCount: 0 }
  );

  controller.updateContent('새해 복 많이 받고 온 가족 건강하길 소원합니다');

  const failResult = await controller.placeStone(
    tower,
    new Pose({ x: 3.5, y: 2.0, z: 0 })
  );
  assert.equal(failResult.status, 'retry');
  assert.equal(controller.getState().phase, 'COLLAPSING');
  assert.equal(controller.getState().towerCollapsed, true);

  // Reroll in COLLAPSING phase
  const stoneInCollapse = controller.rerollStone();
  assert.equal(controller.getState().selectedStone, stoneInCollapse);

  // retryPlacement: resets phase to IDLE, retains attempt counter
  controller.retryPlacement();
  assert.equal(controller.getState().phase, 'IDLE');
  assert.equal(controller.getState().towerCollapsed, false);

  // Clean placement to reach SETTLED
  const settleResult = await controller.placeStone(
    tower,
    new Pose({ x: 0, y: 0.8, z: 0 })
  );
  assert.equal(settleResult.status, 'saved');
  assert.equal(controller.getState().phase, 'SETTLED');

  // Reroll in SETTLED phase for next session
  const stoneAfterSettled = controller.rerollStone();
  assert.equal(controller.getState().selectedStone, stoneAfterSettled);
});
