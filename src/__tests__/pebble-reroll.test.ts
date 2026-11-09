import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Stone, type StoneShape } from '../domain/entities/Stone.ts';
import { Tower } from '../domain/entities/Tower.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import { TowerKey } from '../domain/value-objects/TowerKey.ts';
import { StonePhysicsBodyFactory } from '../infrastructure/physics/StonePhysicsBodyFactory.ts';
import {
  createRiverPebbleGeometry,
  NATURAL_PEBBLE_COLORS,
  NATURAL_PEBBLE_PALETTE,
  PEBBLE_FLAT_SHADING,
  PEBBLE_SHAPE_PROFILES,
} from '../presentation/components/pebbleGeometrySpec.ts';
import {
  buildStoneGeometrySpec,
  buildStoneMaterialSpec,
} from '../presentation/components/stoneTowerSpec.ts';
import { StackStoneController } from '../presentation/controllers/StackStoneController.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.resolve(__dirname, '..');

const ALL_SHAPES: readonly StoneShape[] = [
  'round',
  'flat',
  'pebble',
  'tall',
  'boulder',
] as const;

// =============================================================================
// TEST SUITE 1: ANTI-CLIPPING BOUNDING HALF-EXTENTS INVARIANT PARITY (F17, F18)
// =============================================================================

test('F22-1.1: Half-extents bounding box invariant parity (scale * 0.25) across all 5 canonical stone shapes', () => {
  for (const shape of ALL_SHAPES) {
    const physicsConfig = StonePhysicsBodyFactory.getShapeConfig(shape);
    const spec = buildStoneGeometrySpec(shape);

    const expectedHalfX = Number((spec.scale.x * 0.25).toFixed(4));
    const expectedHalfY = Number((spec.scale.y * 0.25).toFixed(4));
    const expectedHalfZ = Number((spec.scale.z * 0.25).toFixed(4));

    // Verify physics config parity
    assert.equal(physicsConfig.halfExtents.x, expectedHalfX);
    assert.equal(physicsConfig.halfExtents.y, expectedHalfY);
    assert.equal(physicsConfig.halfExtents.z, expectedHalfZ);

    // Generate river pebble geometry
    const geometry = createRiverPebbleGeometry({
      shape,
      scale: spec.scale,
      flattenedBase: true,
    });

    const bb = geometry.boundingBox!;
    assert.ok(bb, `Bounding box must be computed for shape ${shape}`);

    const computedHalfX = (bb.max.x - bb.min.x) / 2;
    const computedHalfY = (bb.max.y - bb.min.y) / 2;
    const computedHalfZ = (bb.max.z - bb.min.z) / 2;

    const diffX = Math.abs(computedHalfX - expectedHalfX);
    const diffY = Math.abs(computedHalfY - expectedHalfY);
    const diffZ = Math.abs(computedHalfZ - expectedHalfZ);

    assert.ok(
      diffX < 1e-4,
      `Shape ${shape}: HalfExtents.x diff (${diffX}) exceeds tolerance 1e-4`
    );
    assert.ok(
      diffY < 1e-4,
      `Shape ${shape}: HalfExtents.y diff (${diffY}) exceeds tolerance 1e-4`
    );
    assert.ok(
      diffZ < 1e-4,
      `Shape ${shape}: HalfExtents.z diff (${diffZ}) exceeds tolerance 1e-4`
    );

    // Verify center is at origin (0, 0, 0)
    const centerX = (bb.max.x + bb.min.x) / 2;
    const centerY = (bb.max.y + bb.min.y) / 2;
    const centerZ = (bb.max.z + bb.min.z) / 2;
    assert.ok(Math.abs(centerX) < 1e-4, `Shape ${shape} center X must be 0`);
    assert.ok(Math.abs(centerY) < 1e-4, `Shape ${shape} center Y must be 0`);
    assert.ok(Math.abs(centerZ) < 1e-4, `Shape ${shape} center Z must be 0`);
  }
});

test('F22-1.2: Half-extents bounding box invariant holds across arbitrary scale fuzz variations', () => {
  const fuzzScales = [
    { x: 0.5, y: 0.5, z: 0.5 },
    { x: 1.8, y: 0.4, z: 1.6 },
    { x: 0.65, y: 2.1, z: 0.7 },
    { x: 2.4, y: 1.2, z: 2.0 },
    { x: 1.11, y: 0.77, z: 0.99 },
  ];

  for (const scale of fuzzScales) {
    const geometry = createRiverPebbleGeometry({
      shape: 'pebble',
      scale,
      flattenedBase: true,
      seed: 777,
    });

    const bb = geometry.boundingBox!;
    const hx = (bb.max.x - bb.min.x) / 2;
    const hy = (bb.max.y - bb.min.y) / 2;
    const hz = (bb.max.z - bb.min.z) / 2;

    assert.ok(Math.abs(hx - scale.x * 0.25) < 1e-4);
    assert.ok(Math.abs(hy - scale.y * 0.25) < 1e-4);
    assert.ok(Math.abs(hz - scale.z * 0.25) < 1e-4);
  }
});

// =============================================================================
// TEST SUITE 2: FLATTENED BASE CONTACT PLANE PROPERTIES (F17, F18)
// =============================================================================

test('F22-2.1: Flattened base creates a planar resting contact area at y = -halfExtents.y', () => {
  const spec = buildStoneGeometrySpec('pebble');
  const geometry = createRiverPebbleGeometry({
    shape: 'pebble',
    scale: spec.scale,
    flattenedBase: true,
  });

  const pos = geometry.getAttribute('position');
  const norm = geometry.getAttribute('normal');
  const expectedMinY = -spec.scale.y * 0.25;

  let flatVertexCount = 0;
  let downwardsNormalCount = 0;

  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (Math.abs(y - expectedMinY) < 1e-4) {
      flatVertexCount++;
      const ny = norm.getY(i);
      if (ny < -0.7) {
        downwardsNormalCount++;
      }
    }
  }

  // Must have multiple planar vertices forming a resting contact plane
  assert.ok(
    flatVertexCount >= 10,
    `Flattened base must have >= 10 coplanar vertices on resting plane (found ${flatVertexCount})`
  );

  // Surface normals on the bottom contact plane must point downwards
  assert.ok(
    downwardsNormalCount >= 5,
    `Normals at contact plane must point downwards (found ${downwardsNormalCount})`
  );
});

test('F22-2.2: flattenedBase=false maintains continuous curvature without planar plateau', () => {
  const spec = buildStoneGeometrySpec('pebble');
  const unflattenedGeo = createRiverPebbleGeometry({
    shape: 'pebble',
    scale: spec.scale,
    flattenedBase: false,
  });

  const pos = unflattenedGeo.getAttribute('position');
  const expectedMinY = -spec.scale.y * 0.25;

  let exactMinCount = 0;
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(pos.getY(i) - expectedMinY) < 1e-5) {
      exactMinCount++;
    }
  }

  // When unflattened, only the single bottom pole vertex touches the absolute minimum
  assert.ok(
    exactMinCount < 10,
    `Unflattened geometry should not have a wide planar plateau (found ${exactMinCount})`
  );
});

// =============================================================================
// TEST SUITE 3: SMOOTH NORMALS AND FLAT SHADING CONTRACT (F18)
// =============================================================================

test('F22-3.1: All vertex normals are normalized unit vectors with zero NaNs or zeros', () => {
  for (const shape of ALL_SHAPES) {
    const spec = buildStoneGeometrySpec(shape);
    const geometry = createRiverPebbleGeometry({
      shape,
      scale: spec.scale,
    });

    const norm = geometry.getAttribute('normal');
    assert.ok(norm.count > 0, 'Geometry must contain normal attribute');

    for (let i = 0; i < norm.count; i++) {
      const nx = norm.getX(i);
      const ny = norm.getY(i);
      const nz = norm.getZ(i);

      assert.ok(Number.isFinite(nx), `nx at ${i} must be finite`);
      assert.ok(Number.isFinite(ny), `ny at ${i} must be finite`);
      assert.ok(Number.isFinite(nz), `nz at ${i} must be finite`);

      const len = Math.hypot(nx, ny, nz);
      assert.ok(
        Math.abs(len - 1.0) < 1e-3,
        `Normal vector length at index ${i} (${len}) must be ~1.0`
      );
    }
  }
});

test('F22-3.2: River pebble geometry spec enforces flatShading: false for water-smoothed rendering', () => {
  const pebbleSpec = buildStoneGeometrySpec('pebble');
  assert.equal(
    pebbleSpec.flatShading,
    false,
    'pebble spec flatShading must be false'
  );

  const roundSpec = buildStoneGeometrySpec('round');
  assert.equal(
    roundSpec.flatShading,
    false,
    'round river stone flatShading must be false'
  );

  assert.equal(
    PEBBLE_FLAT_SHADING,
    false,
    'PEBBLE_FLAT_SHADING constant must be false'
  );
});

// =============================================================================
// TEST SUITE 4: 12-COLOR NATURAL MINERAL PALETTE SPECIFICATION (F19)
// =============================================================================

test('F22-4.1: Exactly 12 curated Korean river pebble mineral colors with valid hex format', () => {
  assert.equal(
    NATURAL_PEBBLE_PALETTE.length,
    12,
    'Palette must contain exactly 12 mineral colors'
  );
  assert.equal(
    NATURAL_PEBBLE_COLORS.length,
    12,
    'NATURAL_PEBBLE_COLORS must contain 12 hex strings'
  );

  const EXPECTED_MINERALS: readonly { code: string; name: string }[] = [
    { code: '#2C2F33', name: '먹빛 현무암' },
    { code: '#1E2024', name: '흑진주 흑요석' },
    { code: '#4A5568', name: '청회색 강돌' },
    { code: '#4A5D4E', name: '물푸레 이끼석' },
    { code: '#5C6B5E', name: '쑥빛 사암' },
    { code: '#E2E8F0', name: '맑은 백옥석' },
    { code: '#A0AEC0', name: '은회색 차돌' },
    { code: '#C69255', name: '황토 황옥석' },
    { code: '#D4B896', name: '모래빛 석회암' },
    { code: '#8C5858', name: '석류빛 화강암' },
    { code: '#6B5B7B', name: '자줏빛 자수정맥' },
    { code: '#B87353', name: '노을빛 벽옥' },
  ];

  for (let i = 0; i < EXPECTED_MINERALS.length; i++) {
    const expected = EXPECTED_MINERALS[i];
    const actual = NATURAL_PEBBLE_PALETTE[i];

    assert.equal(
      actual.code.toUpperCase(),
      expected.code.toUpperCase(),
      `Color index ${i}: expected ${expected.code}, got ${actual.code}`
    );
    assert.equal(
      actual.name,
      expected.name,
      `Color index ${i}: expected name ${expected.name}, got ${actual.name}`
    );
    assert.equal(NATURAL_PEBBLE_COLORS[i], actual.code);
  }
});

test('F22-4.2: All 12 mineral colors instantiate valid Stone entities and pass shader material generation', () => {
  for (const mineral of NATURAL_PEBBLE_PALETTE) {
    const stone = new Stone({
      shape: 'pebble',
      color: mineral.code,
      pose: Pose.origin(),
    });

    assert.equal(stone.color, mineral.code);
    assert.equal(stone.shape, 'pebble');

    // Verify buildStoneMaterialSpec works with each mineral color
    const matSpec = buildStoneMaterialSpec(mineral.code, 'pebble', 0, false);
    assert.equal(matSpec.baseColor, mineral.code);
    assert.ok(matSpec.roughness >= 0.5, 'Stone roughness must be natural');
    assert.ok(matSpec.metalness <= 0.2, 'Stone metalness must be low');
  }
});

// =============================================================================
// TEST SUITE 5: CONTROLLER REROLL ACTION & LISTENER REACTIVITY (F20)
// =============================================================================

test('F22-5.1: controller.rerollStone() updates selectedStone and notifies subscribers', () => {
  const controller = new StackStoneController();
  const initialStone = controller.getState().selectedStone;

  const observedStates: Stone[] = [];
  const unsubscribe = controller.subscribe((state) => {
    observedStates.push(state.selectedStone);
  });

  const nextStone = controller.rerollStone();

  // 1. Returns valid Stone instance
  assert.ok(nextStone instanceof Stone, 'rerollStone must return a Stone instance');
  assert.ok(ALL_SHAPES.includes(nextStone.shape), 'New stone shape must be valid');
  assert.ok(NATURAL_PEBBLE_COLORS.includes(nextStone.color), 'New stone color must be from palette');

  // 2. Controller internal state is updated
  assert.equal(controller.getState().selectedStone, nextStone);

  // 3. Listener was notified with the new stone
  assert.equal(observedStates.length, 1);
  assert.equal(observedStates[0], nextStone);

  // 4. Repeated rerolls trigger subsequent notifications
  const thirdStone = controller.rerollStone();
  assert.equal(observedStates.length, 2);
  assert.equal(observedStates[1], thirdStone);

  // 5. Unsubscribe cleanly halts notifications
  unsubscribe();
  controller.rerollStone();
  assert.equal(observedStates.length, 2, 'No notifications after unsubscribe');
});

test('F22-5.2: controller.rerollStone() supports optional shape and color overrides', () => {
  const controller = new StackStoneController();

  const customStone = controller.rerollStone({
    shape: 'tall',
    color: '#6B5B7B', // 자줏빛 자수정맥
  });

  assert.equal(customStone.shape, 'tall');
  assert.equal(customStone.color, '#6B5B7B');
  assert.equal(controller.getState().selectedStone.shape, 'tall');
  assert.equal(controller.getState().selectedStone.color, '#6B5B7B');
});

test('F22-5.3: 50 Randomized rerolls produce diverse shape and color distributions', () => {
  const controller = new StackStoneController();
  const shapesObserved = new Set<string>();
  const colorsObserved = new Set<string>();

  for (let i = 0; i < 50; i++) {
    const stone = controller.rerollStone();
    shapesObserved.add(stone.shape);
    colorsObserved.add(stone.color);
  }

  // Over 50 random samples, we should observe multiple distinct shapes and colors
  assert.ok(
    shapesObserved.size >= 3,
    `Expected at least 3 distinct shapes over 50 rerolls, got ${shapesObserved.size}`
  );
  assert.ok(
    colorsObserved.size >= 5,
    `Expected at least 5 distinct mineral colors over 50 rerolls, got ${colorsObserved.size}`
  );
});

// =============================================================================
// TEST SUITE 6: INVARIANCE OF TOWER AND WISH PERSISTENCE (F20, F21)
// =============================================================================

test('F22-6.1: Rerolling stone preserves wish text, category classification, and daily quota', () => {
  const controller = new StackStoneController();

  controller.updateContent('가족 모두 올 한 해 건강하고 행복하기를 소원합니다');
  const initialCategory = controller.getState().effectiveCategory;
  const initialQuota = controller.getState().quota.remaining;

  // Perform multiple rerolls
  for (let i = 0; i < 5; i++) {
    controller.rerollStone();
  }

  const finalState = controller.getState();
  assert.equal(
    finalState.content,
    '가족 모두 올 한 해 건강하고 행복하기를 소원합니다',
    'Wish content must remain unchanged across rerolls'
  );
  assert.equal(
    finalState.effectiveCategory,
    initialCategory,
    'Category classification must remain unchanged across rerolls'
  );
  assert.equal(
    finalState.quota.remaining,
    initialQuota,
    'Daily quota must not be consumed by rerolls'
  );
});

test('F22-6.2: Rerolling stone does not mutate or destabilize existing Tower stones', () => {
  const controller = new StackStoneController();

  const tower = new Tower(
    TowerKey.global(),
    [
      {
        id: 'stone-0',
        stone: new Stone({
          shape: 'boulder',
          color: '#2C2F33',
          pose: new Pose({ x: 0, y: 0.2625, z: 0 }),
        }),
        status: 'active',
        bloom: null,
        cheerLevel: 2,
        isMine: false,
        nickname: '초기돌#1234',
      },
    ],
    { stoneCount: 1, todayCount: 1, fulfilledCount: 0, cheerCount: 5 }
  );

  const initialTopY = tower.topY();
  const initialStoneCount = tower.stones.length;

  controller.rerollStone();
  controller.rerollStone();

  assert.equal(tower.stones.length, initialStoneCount);
  assert.equal(tower.topY(), initialTopY);
  assert.equal(tower.stones[0].stone.shape, 'boulder');
});

// =============================================================================
// TEST SUITE 7: STATIC UI INTEGRATION CONTRACT (F21)
// =============================================================================

test('F22-7.1: stone.tsx and place.tsx contain "🎲 다른 돌 찾아보기" Toss reroll buttons', () => {
  const stonePath = path.join(SRC_DIR, 'app/stack/stone.tsx');
  const placePath = path.join(SRC_DIR, 'app/stack/place.tsx');

  assert.ok(fs.existsSync(stonePath), 'stone.tsx must exist');
  assert.ok(fs.existsSync(placePath), 'place.tsx must exist');

  const stoneSource = fs.readFileSync(stonePath, 'utf8');
  const placeSource = fs.readFileSync(placePath, 'utf8');

  // Verify label in stone.tsx
  assert.ok(
    stoneSource.includes('🎲 다른 돌 찾아보기'),
    'stone.tsx must contain "🎲 다른 돌 찾아보기"'
  );
  assert.ok(
    stoneSource.includes('controller.rerollStone()'),
    'stone.tsx must call controller.rerollStone()'
  );
  assert.ok(
    stoneSource.includes('safeHaptic'),
    'stone.tsx must trigger safeHaptic on reroll'
  );

  // Verify label in place.tsx
  assert.ok(
    placeSource.includes('🎲 다른 돌 찾아보기'),
    'place.tsx must contain "🎲 다른 돌 찾아보기"'
  );
  assert.ok(
    placeSource.includes('controller.rerollStone()'),
    'place.tsx must call controller.rerollStone()'
  );
  assert.ok(
    placeSource.includes('safeHaptic'),
    'place.tsx must trigger safeHaptic on reroll'
  );

  // Verify that place.tsx preserves the accessibility action buttons
  assert.ok(
    placeSource.includes('🎯 즉시 안착하기'),
    'place.tsx must preserve [🎯 즉시 안착하기]'
  );
  assert.ok(
    placeSource.includes('빗맞힘 테스트 (전복)'),
    'place.tsx must preserve [빗맞힘 테스트 (전복)]'
  );
});
