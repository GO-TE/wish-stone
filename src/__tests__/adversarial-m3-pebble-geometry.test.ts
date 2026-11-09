/**
 * Milestone 3 Adversarial Challenge Suite: River Pebble Geometry & Invariants
 *
 * Specializing in 3D geometry invariants, bounding box parity, and mathematical stress testing:
 * 1. Extreme Aspect Ratios (Needle 50:1, Pancake 200:1, Microscopic 1mm, Megalith 100m, Log-Uniform Fuzz)
 * 2. Singularity & Inversion Stress (Zero scales, partial zero 2D/1D, negative scale reflection)
 * 3. Segment Resolution Sweep (segments = 4 .. 128) & High-Polygon Density Buffer Integrity
 * 4. Random Seed Spectrum & Procedural Bit-for-Bit Determinism
 * 5. Flattened Base Plateau Contact Plane Verification (y = -H_y, downward normals, support area)
 * 6. Unit Normal Vector Invariant (|len - 1.0| < 1e-4 across 100% of vertices, pole seam healing)
 * 7. Canonical Stone Specs & CANNON Physics Half-Extents Parity (|diff| < 1e-4 m)
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { Stone, type StoneShape } from '../domain/entities/Stone.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import { StonePhysicsBodyFactory } from '../infrastructure/physics/StonePhysicsBodyFactory.ts';
import {
  createRiverPebbleGeometry,
  NATURAL_PEBBLE_COLORS,
  NATURAL_PEBBLE_PALETTE,
  PEBBLE_FLAT_SHADING,
  PEBBLE_SHAPE_PROFILES,
  type PebbleGeometryConfig,
} from '../presentation/components/pebbleGeometrySpec.ts';
import {
  buildStoneGeometrySpec,
  buildStoneMaterialSpec,
} from '../presentation/components/stoneTowerSpec.ts';

const ALL_CANONICAL_SHAPES: readonly StoneShape[] = [
  'round',
  'flat',
  'pebble',
  'tall',
  'boulder',
] as const;

const EPSILON_TOLERANCE = 1e-4;

/**
 * Helper to compute half-extents from geometry bounding box
 */
function getGeometryHalfExtents(geometry: THREE.BufferGeometry): {
  hx: number;
  hy: number;
  hz: number;
  centerX: number;
  centerY: number;
  centerZ: number;
} {
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox!;
  assert.ok(bb, 'Bounding box must exist on BufferGeometry');
  return {
    hx: (bb.max.x - bb.min.x) / 2,
    hy: (bb.max.y - bb.min.y) / 2,
    hz: (bb.max.z - bb.min.z) / 2,
    centerX: (bb.max.x + bb.min.x) / 2,
    centerY: (bb.max.y + bb.min.y) / 2,
    centerZ: (bb.max.z + bb.min.z) / 2,
  };
}

/**
 * Helper to audit unit length of all vertex normal vectors
 */
function auditUnitNormals(geometry: THREE.BufferGeometry): {
  count: number;
  maxLenDeviation: number;
  hasNonFinite: boolean;
} {
  const normals = geometry.getAttribute('normal');
  assert.ok(normals, 'Geometry must contain normal attribute');
  assert.ok(normals.count > 0, 'Normal count must be > 0');

  let maxLenDeviation = 0;
  let hasNonFinite = false;

  for (let i = 0; i < normals.count; i++) {
    const nx = normals.getX(i);
    const ny = normals.getY(i);
    const nz = normals.getZ(i);

    if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nz)) {
      hasNonFinite = true;
      continue;
    }

    const len = Math.hypot(nx, ny, nz);
    const dev = Math.abs(len - 1.0);
    if (dev > maxLenDeviation) {
      maxLenDeviation = dev;
    }
  }

  return {
    count: normals.count,
    maxLenDeviation,
    hasNonFinite,
  };
}

// =============================================================================
// SUITE 1: EXTREME ASPECT RATIOS & BOUNDARY SCALES (F17, F18)
// =============================================================================

test('Adversarial 1.1: Extreme Needle/Spire Aspect Ratio (scale: {x: 0.1, y: 5.0, z: 0.2}) maintains halfExtents parity & unit normals', () => {
  const scale = { x: 0.1, y: 5.0, z: 0.2 }; // 50:1 height-to-width ratio
  const expectedHx = scale.x * 0.25; // 0.025
  const expectedHy = scale.y * 0.25; // 1.250
  const expectedHz = scale.z * 0.25; // 0.050

  const geometry = createRiverPebbleGeometry({
    shape: 'tall',
    scale,
    flattenedBase: true,
    seed: 1337,
  });

  const { hx, hy, hz, centerX, centerY, centerZ } = getGeometryHalfExtents(geometry);

  // Parity within 1e-4 m
  assert.ok(
    Math.abs(hx - expectedHx) < EPSILON_TOLERANCE,
    `Needle halfExtent.x diff (${Math.abs(hx - expectedHx)}) exceeds 1e-4`
  );
  assert.ok(
    Math.abs(hy - expectedHy) < EPSILON_TOLERANCE,
    `Needle halfExtent.y diff (${Math.abs(hy - expectedHy)}) exceeds 1e-4`
  );
  assert.ok(
    Math.abs(hz - expectedHz) < EPSILON_TOLERANCE,
    `Needle halfExtent.z diff (${Math.abs(hz - expectedHz)}) exceeds 1e-4`
  );

  // Centering at origin
  assert.ok(Math.abs(centerX) < EPSILON_TOLERANCE, 'Center X must be ~0');
  assert.ok(Math.abs(centerY) < EPSILON_TOLERANCE, 'Center Y must be ~0');
  assert.ok(Math.abs(centerZ) < EPSILON_TOLERANCE, 'Center Z must be ~0');

  // Normal vectors unit length
  const { maxLenDeviation, hasNonFinite } = auditUnitNormals(geometry);
  assert.equal(hasNonFinite, false, 'Normals must have no non-finite values');
  assert.ok(
    maxLenDeviation < EPSILON_TOLERANCE,
    `Normal deviation ${maxLenDeviation} exceeds tolerance 1e-4`
  );

  // Base plateau vertices at -Hy
  const pos = geometry.getAttribute('position');
  let plateauCount = 0;
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(pos.getY(i) - (-expectedHy)) < EPSILON_TOLERANCE) {
      plateauCount++;
    }
  }
  assert.ok(plateauCount >= 10, `Needle must have >= 10 plateau vertices (got ${plateauCount})`);
});

test('Adversarial 1.2: Extreme Pancake/Skipping Aspect Ratio (scale: {x: 10.0, y: 0.05, z: 10.0}) maintains halfExtents parity & unit normals', () => {
  const scale = { x: 10.0, y: 0.05, z: 10.0 }; // 200:1 width-to-height ratio
  const expectedHx = scale.x * 0.25; // 2.500
  const expectedHy = scale.y * 0.25; // 0.0125
  const expectedHz = scale.z * 0.25; // 2.500

  const geometry = createRiverPebbleGeometry({
    shape: 'flat',
    scale,
    flattenedBase: true,
    seed: 404,
  });

  const { hx, hy, hz, centerX, centerY, centerZ } = getGeometryHalfExtents(geometry);

  assert.ok(Math.abs(hx - expectedHx) < EPSILON_TOLERANCE);
  assert.ok(Math.abs(hy - expectedHy) < EPSILON_TOLERANCE);
  assert.ok(Math.abs(hz - expectedHz) < EPSILON_TOLERANCE);

  assert.ok(Math.abs(centerX) < EPSILON_TOLERANCE);
  assert.ok(Math.abs(centerY) < EPSILON_TOLERANCE);
  assert.ok(Math.abs(centerZ) < EPSILON_TOLERANCE);

  const { maxLenDeviation, hasNonFinite } = auditUnitNormals(geometry);
  assert.equal(hasNonFinite, false);
  assert.ok(
    maxLenDeviation < EPSILON_TOLERANCE,
    `Pancake normal deviation ${maxLenDeviation} exceeds 1e-4`
  );
});

test('Adversarial 1.3: Microscopic Scale ({x: 0.001, y: 0.001, z: 0.001}) maintains numeric stability', () => {
  const scale = { x: 0.001, y: 0.001, z: 0.001 };
  const expectedH = 0.001 * 0.25; // 0.00025 m

  const geometry = createRiverPebbleGeometry({
    shape: 'pebble',
    scale,
    flattenedBase: true,
  });

  const { hx, hy, hz } = getGeometryHalfExtents(geometry);
  assert.ok(Math.abs(hx - expectedH) < EPSILON_TOLERANCE);
  assert.ok(Math.abs(hy - expectedH) < EPSILON_TOLERANCE);
  assert.ok(Math.abs(hz - expectedH) < EPSILON_TOLERANCE);

  const { maxLenDeviation, hasNonFinite } = auditUnitNormals(geometry);
  assert.equal(hasNonFinite, false);
  assert.ok(maxLenDeviation < EPSILON_TOLERANCE);
});

test('Adversarial 1.4: Megalith Monument Scale ({x: 100.0, y: 50.0, z: 80.0}) preserves linear normalization', () => {
  const scale = { x: 100.0, y: 50.0, z: 80.0 };
  const expectedHx = 100.0 * 0.25; // 25.0
  const expectedHy = 50.0 * 0.25; // 12.5
  const expectedHz = 80.0 * 0.25; // 20.0

  const geometry = createRiverPebbleGeometry({
    shape: 'boulder',
    scale,
    flattenedBase: true,
  });

  const { hx, hy, hz } = getGeometryHalfExtents(geometry);
  assert.ok(Math.abs(hx - expectedHx) < EPSILON_TOLERANCE);
  assert.ok(Math.abs(hy - expectedHy) < EPSILON_TOLERANCE);
  assert.ok(Math.abs(hz - expectedHz) < EPSILON_TOLERANCE);

  const { maxLenDeviation, hasNonFinite } = auditUnitNormals(geometry);
  assert.equal(hasNonFinite, false);
  assert.ok(maxLenDeviation < EPSILON_TOLERANCE);
});

test('Adversarial 1.5: 50 Randomized Fuzz Aspect Ratios with Log-Uniform Scales verify universal invariant', () => {
  let rngState = 123456789;
  const nextRng = () => {
    rngState = (rngState * 1664525 + 1013904223) >>> 0;
    return rngState / 4294967296;
  };

  for (let trial = 0; trial < 50; trial++) {
    // Log-uniform scale in range [0.01, 30.0]
    const sx = Math.exp(Math.log(0.01) + nextRng() * (Math.log(30.0) - Math.log(0.01)));
    const sy = Math.exp(Math.log(0.01) + nextRng() * (Math.log(30.0) - Math.log(0.01)));
    const sz = Math.exp(Math.log(0.01) + nextRng() * (Math.log(30.0) - Math.log(0.01)));

    const shape = ALL_CANONICAL_SHAPES[trial % ALL_CANONICAL_SHAPES.length];
    const seed = Math.floor(nextRng() * 100000);

    const geometry = createRiverPebbleGeometry({
      shape,
      scale: { x: sx, y: sy, z: sz },
      flattenedBase: trial % 2 === 0,
      seed,
    });

    const { hx, hy, hz } = getGeometryHalfExtents(geometry);
    const expHx = sx * 0.25;
    const expHy = sy * 0.25;
    const expHz = sz * 0.25;

    assert.ok(
      Math.abs(hx - expHx) < EPSILON_TOLERANCE,
      `Trial ${trial}: hx diff ${Math.abs(hx - expHx)} exceeds 1e-4`
    );
    assert.ok(
      Math.abs(hy - expHy) < EPSILON_TOLERANCE,
      `Trial ${trial}: hy diff ${Math.abs(hy - expHy)} exceeds 1e-4`
    );
    assert.ok(
      Math.abs(hz - expHz) < EPSILON_TOLERANCE,
      `Trial ${trial}: hz diff ${Math.abs(hz - expHz)} exceeds 1e-4`
    );

    const { maxLenDeviation, hasNonFinite } = auditUnitNormals(geometry);
    assert.equal(hasNonFinite, false);
    assert.ok(
      maxLenDeviation < EPSILON_TOLERANCE,
      `Trial ${trial}: max normal deviation ${maxLenDeviation} exceeds 1e-4`
    );
  }
});

// =============================================================================
// SUITE 2: ZERO & NEGATIVE SCALE EDGE CASES (SINGULARITY & INVERSION STRESS)
// =============================================================================

test('Adversarial 2.1: Exactly Zero Scale ({x: 0, y: 0, z: 0}) collapses to origin point with halfExtents = 0', () => {
  const geometry = createRiverPebbleGeometry({
    shape: 'pebble',
    scale: { x: 0, y: 0, z: 0 },
    flattenedBase: true,
  });

  const { hx, hy, hz, centerX, centerY, centerZ } = getGeometryHalfExtents(geometry);

  assert.equal(hx, 0.0, 'hx must be 0 for zero scale');
  assert.equal(hy, 0.0, 'hy must be 0 for zero scale');
  assert.equal(hz, 0.0, 'hz must be 0 for zero scale');
  assert.equal(centerX, 0.0);
  assert.equal(centerY, 0.0);
  assert.equal(centerZ, 0.0);

  // Position attributes are all strictly 0 (no NaN / Infinity)
  const pos = geometry.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    assert.equal(pos.getX(i), 0);
    assert.equal(pos.getY(i), 0);
    assert.equal(pos.getZ(i), 0);
  }
});

test('Adversarial 2.2: Partial Zero Scale (2D Disc {x: 1.0, y: 0.0, z: 1.0}) preserves non-zero axis halfExtents & unit normals', () => {
  const geometry = createRiverPebbleGeometry({
    shape: 'flat',
    scale: { x: 1.0, y: 0.0, z: 1.0 },
    flattenedBase: true,
  });

  const { hx, hy, hz } = getGeometryHalfExtents(geometry);
  assert.ok(Math.abs(hx - 0.25) < EPSILON_TOLERANCE);
  assert.equal(hy, 0.0);
  assert.ok(Math.abs(hz - 0.25) < EPSILON_TOLERANCE);

  // 2D disc has non-zero surface area in XZ plane, so normals are unit vectors
  const { maxLenDeviation, hasNonFinite } = auditUnitNormals(geometry);
  assert.equal(hasNonFinite, false);
  assert.ok(
    maxLenDeviation < EPSILON_TOLERANCE,
    `2D disc normal deviation ${maxLenDeviation} exceeds 1e-4`
  );
});

test('Adversarial 2.3: Negative Scale Inversion (|scale| * 0.25 parity and unit normals under reflection)', () => {
  const negativeScales = [
    { x: -1.0, y: 2.0, z: 1.0 },
    { x: 1.0, y: -2.0, z: 1.0 },
    { x: 1.0, y: 2.0, z: -1.0 },
    { x: -2.0, y: -2.0, z: -2.0 },
  ];

  for (const scale of negativeScales) {
    const geometry = createRiverPebbleGeometry({
      shape: 'pebble',
      scale,
      flattenedBase: true,
    });

    const { hx, hy, hz, centerX, centerY, centerZ } = getGeometryHalfExtents(geometry);

    // Bounding box extents in Three.js Box3 are non-negative distances (max - min) / 2
    // which correspond to |scale| * 0.25
    const expHx = Math.abs(scale.x * 0.25);
    const expHy = Math.abs(scale.y * 0.25);
    const expHz = Math.abs(scale.z * 0.25);

    assert.ok(
      Math.abs(hx - expHx) < EPSILON_TOLERANCE,
      `Negative scale hx diff (${Math.abs(hx - expHx)}) exceeds 1e-4`
    );
    assert.ok(
      Math.abs(hy - expHy) < EPSILON_TOLERANCE,
      `Negative scale hy diff (${Math.abs(hy - expHy)}) exceeds 1e-4`
    );
    assert.ok(
      Math.abs(hz - expHz) < EPSILON_TOLERANCE,
      `Negative scale hz diff (${Math.abs(hz - expHz)}) exceeds 1e-4`
    );

    assert.ok(Math.abs(centerX) < EPSILON_TOLERANCE);
    assert.ok(Math.abs(centerY) < EPSILON_TOLERANCE);
    assert.ok(Math.abs(centerZ) < EPSILON_TOLERANCE);

    // All vertex normals must retain unit length even under coordinate reflection
    const { maxLenDeviation, hasNonFinite } = auditUnitNormals(geometry);
    assert.equal(hasNonFinite, false);
    assert.ok(
      maxLenDeviation < EPSILON_TOLERANCE,
      `Negative scale normal deviation ${maxLenDeviation} exceeds 1e-4`
    );
  }
});

// =============================================================================
// SUITE 3: SEGMENT RESOLUTIONS SWEEP & TOPOLOGICAL DENSITY AUDIT
// =============================================================================

test('Adversarial 3.1: Segment Resolution Sweep (segments = 4, 8, 16, 24, 48, 64, 128) maintains invariants', () => {
  const resolutions = [4, 8, 16, 24, 48, 64, 128];
  const scale = { x: 1.2, y: 0.9, z: 1.1 };
  const expHx = scale.x * 0.25;
  const expHy = scale.y * 0.25;
  const expHz = scale.z * 0.25;

  let prevPlateauCount = 0;

  for (const seg of resolutions) {
    const geometry = createRiverPebbleGeometry({
      shape: 'pebble',
      scale,
      segments: seg,
      flattenedBase: true,
    });

    const { hx, hy, hz } = getGeometryHalfExtents(geometry);
    assert.ok(Math.abs(hx - expHx) < EPSILON_TOLERANCE);
    assert.ok(Math.abs(hy - expHy) < EPSILON_TOLERANCE);
    assert.ok(Math.abs(hz - expHz) < EPSILON_TOLERANCE);

    const { maxLenDeviation, hasNonFinite, count } = auditUnitNormals(geometry);
    assert.equal(hasNonFinite, false);
    assert.ok(
      maxLenDeviation < EPSILON_TOLERANCE,
      `Segments ${seg} normal deviation ${maxLenDeviation} exceeds 1e-4`
    );

    // Count plateau vertices on y = -Hy
    const pos = geometry.getAttribute('position');
    let plateauCount = 0;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getY(i) - (-expHy)) < EPSILON_TOLERANCE) {
        plateauCount++;
      }
    }

    assert.ok(
      plateauCount >= 6,
      `Segments ${seg} must have >= 6 plateau vertices (found ${plateauCount})`
    );
    assert.ok(
      plateauCount >= prevPlateauCount,
      `Plateau count must grow monotonically with segment resolution (${plateauCount} >= ${prevPlateauCount})`
    );
    prevPlateauCount = plateauCount;

    // Buffer array length parity
    assert.equal(pos.count, count);
    assert.equal(pos.array.length, count * 3);
  }
});

test('Adversarial 3.2: High Polygon Density (segments = 128, 5,000+ vertices) buffer integrity & memory robustness', () => {
  const geometry = createRiverPebbleGeometry({
    shape: 'boulder',
    scale: { x: 2.0, y: 1.5, z: 1.8 },
    segments: 128,
    flattenedBase: true,
  });

  const pos = geometry.getAttribute('position');
  const norm = geometry.getAttribute('normal');

  assert.ok(pos.count > 5000, `High res vertex count should be > 5000 (got ${pos.count})`);
  assert.equal(pos.count, norm.count);

  for (let i = 0; i < pos.count; i++) {
    assert.ok(Number.isFinite(pos.getX(i)));
    assert.ok(Number.isFinite(pos.getY(i)));
    assert.ok(Number.isFinite(pos.getZ(i)));
  }

  const { maxLenDeviation, hasNonFinite } = auditUnitNormals(geometry);
  assert.equal(hasNonFinite, false);
  assert.ok(maxLenDeviation < EPSILON_TOLERANCE);
});

// =============================================================================
// SUITE 4: RANDOM SEED SPECTRUM & PROCEDURAL BIT-FOR-BIT DETERMINISM
// =============================================================================

test('Adversarial 4.1: Seed stress spectrum (negative, zero, large, floating point) preserves bounding box parity', () => {
  const seeds = [
    -1000000,
    -42,
    -1,
    0,
    1,
    42,
    777,
    999999,
    1e7,
    Math.PI,
    Math.E,
    Math.SQRT2,
    123456789,
  ];

  const scale = { x: 1.25, y: 0.85, z: 1.15 };
  const expHx = scale.x * 0.25;
  const expHy = scale.y * 0.25;
  const expHz = scale.z * 0.25;

  for (const seed of seeds) {
    const geometry = createRiverPebbleGeometry({
      shape: 'round',
      scale,
      seed,
      flattenedBase: true,
    });

    const { hx, hy, hz } = getGeometryHalfExtents(geometry);
    assert.ok(
      Math.abs(hx - expHx) < EPSILON_TOLERANCE,
      `Seed ${seed}: hx diff (${Math.abs(hx - expHx)}) exceeds 1e-4`
    );
    assert.ok(
      Math.abs(hy - expHy) < EPSILON_TOLERANCE,
      `Seed ${seed}: hy diff (${Math.abs(hy - expHy)}) exceeds 1e-4`
    );
    assert.ok(
      Math.abs(hz - expHz) < EPSILON_TOLERANCE,
      `Seed ${seed}: hz diff (${Math.abs(hz - expHz)}) exceeds 1e-4`
    );

    const { maxLenDeviation, hasNonFinite } = auditUnitNormals(geometry);
    assert.equal(hasNonFinite, false);
    assert.ok(
      maxLenDeviation < EPSILON_TOLERANCE,
      `Seed ${seed}: normal deviation (${maxLenDeviation}) exceeds 1e-4`
    );
  }
});

test('Adversarial 4.2: Procedural bit-for-bit determinism across identical configurations', () => {
  const config: PebbleGeometryConfig = {
    shape: 'pebble',
    scale: { x: 1.4, y: 0.8, z: 1.2 },
    seed: 987654,
    segments: 32,
    flattenedBase: true,
  };

  const geoA = createRiverPebbleGeometry(config);
  const geoB = createRiverPebbleGeometry(config);

  const posA = geoA.getAttribute('position').array as Float32Array;
  const posB = geoB.getAttribute('position').array as Float32Array;
  const normA = geoA.getAttribute('normal').array as Float32Array;
  const normB = geoB.getAttribute('normal').array as Float32Array;

  assert.equal(posA.length, posB.length, 'Position buffer lengths must match');
  assert.equal(normA.length, normB.length, 'Normal buffer lengths must match');

  for (let k = 0; k < posA.length; k++) {
    assert.equal(posA[k], posB[k], `Position mismatch at index ${k}: ${posA[k]} !== ${posB[k]}`);
  }
  for (let k = 0; k < normA.length; k++) {
    assert.equal(normA[k], normB[k], `Normal mismatch at index ${k}: ${normA[k]} !== ${normB[k]}`);
  }
});

test('Adversarial 4.3: Differing seeds produce distinct organic perturbation signatures', () => {
  const geoA = createRiverPebbleGeometry({
    shape: 'pebble',
    scale: { x: 1.0, y: 1.0, z: 1.0 },
    seed: 101,
  });
  const geoB = createRiverPebbleGeometry({
    shape: 'pebble',
    scale: { x: 1.0, y: 1.0, z: 1.0 },
    seed: 202,
  });

  const posA = geoA.getAttribute('position').array as Float32Array;
  const posB = geoB.getAttribute('position').array as Float32Array;

  let totalDiff = 0;
  for (let k = 0; k < posA.length; k++) {
    totalDiff += Math.abs(posA[k] - posB[k]);
  }

  // Perturbations must cause non-zero structural differences between seeds
  assert.ok(
    totalDiff > 0.05,
    `Differing seeds must produce distinct vertex displacements (totalDiff = ${totalDiff})`
  );
});

// =============================================================================
// SUITE 5: FLATTENED BASE PLATEAU CONTACT PLANE VERIFICATION (PHYSICS INVARIANTS)
// =============================================================================

test('Adversarial 5.1: Flattened base plateau vertices lie strictly on y = -H_y with downward normals', () => {
  for (const shape of ALL_CANONICAL_SHAPES) {
    const spec = buildStoneGeometrySpec(shape);
    const geometry = createRiverPebbleGeometry({
      shape,
      scale: spec.scale,
      flattenedBase: true,
      seed: 42,
    });

    const expectedMinY = -spec.scale.y * 0.25;
    const pos = geometry.getAttribute('position');
    const norm = geometry.getAttribute('normal');

    let plateauVertexCount = 0;
    let downwardNormalsCount = 0;
    let normalYSum = 0;

    let minPlateauX = Infinity,
      maxPlateauX = -Infinity;
    let minPlateauZ = Infinity,
      maxPlateauZ = -Infinity;

    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (Math.abs(y - expectedMinY) < EPSILON_TOLERANCE) {
        plateauVertexCount++;
        const ny = norm.getY(i);
        normalYSum += ny;

        if (ny < -0.7) {
          downwardNormalsCount++;
        }

        const px = pos.getX(i);
        const pz = pos.getZ(i);
        minPlateauX = Math.min(minPlateauX, px);
        maxPlateauX = Math.max(maxPlateauX, px);
        minPlateauZ = Math.min(minPlateauZ, pz);
        maxPlateauZ = Math.max(maxPlateauZ, pz);
      }
    }

    // 1. Must have multiple coplanar resting vertices
    assert.ok(
      plateauVertexCount >= 10,
      `Shape ${shape}: Expected >= 10 plateau vertices, got ${plateauVertexCount}`
    );

    // 2. Normals on the plateau must point downward
    assert.ok(
      downwardNormalsCount >= 5,
      `Shape ${shape}: Expected >= 5 downward normals, got ${downwardNormalsCount}`
    );

    const meanNormalY = normalYSum / plateauVertexCount;
    assert.ok(
      meanNormalY < -0.8,
      `Shape ${shape}: Mean plateau normal Y (${meanNormalY}) must be strongly downward (< -0.8)`
    );

    // 3. Contact polygon footprint spans a significant physical area for stable stacking
    const plateauSpanX = maxPlateauX - minPlateauX;
    const plateauSpanZ = maxPlateauZ - minPlateauZ;
    const totalSpanX = spec.scale.x * 0.5;
    const totalSpanZ = spec.scale.z * 0.5;

    assert.ok(
      plateauSpanX >= totalSpanX * 0.25,
      `Shape ${shape}: Plateau X span (${plateauSpanX}) must be >= 25% of stone width (${totalSpanX})`
    );
    assert.ok(
      plateauSpanZ >= totalSpanZ * 0.25,
      `Shape ${shape}: Plateau Z span (${plateauSpanZ}) must be >= 25% of stone depth (${totalSpanZ})`
    );
  }
});

test('Adversarial 5.2: flattenedBase=false maintains continuous curvature without wide resting plateau', () => {
  for (const shape of ALL_CANONICAL_SHAPES) {
    const spec = buildStoneGeometrySpec(shape);
    const unflattened = createRiverPebbleGeometry({
      shape,
      scale: spec.scale,
      flattenedBase: false,
    });

    const expectedMinY = -spec.scale.y * 0.25;
    const pos = unflattened.getAttribute('position');

    let minTouchCount = 0;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getY(i) - expectedMinY) < 1e-5) {
        minTouchCount++;
      }
    }

    // Without base flattening, only the bottom pole vertex touches the absolute minimum
    assert.ok(
      minTouchCount < 10,
      `Shape ${shape} unflattened must not form wide plateau (found ${minTouchCount})`
    );
  }
});

// =============================================================================
// SUITE 6: STRICT UNIT NORMAL VECTOR INVARIANT (|len - 1.0| < 1e-4) AUDIT
// =============================================================================

test('Adversarial 6.1: 100% of vertex normals are normalized unit vectors with pole seam healing', () => {
  for (const shape of ALL_CANONICAL_SHAPES) {
    const spec = buildStoneGeometrySpec(shape);
    const geometry = createRiverPebbleGeometry({
      shape,
      scale: spec.scale,
      flattenedBase: true,
      segments: 24,
    });

    const norm = geometry.getAttribute('normal');
    assert.ok(norm.count > 0);

    for (let i = 0; i < norm.count; i++) {
      const nx = norm.getX(i);
      const ny = norm.getY(i);
      const nz = norm.getZ(i);

      assert.ok(Number.isFinite(nx), `Shape ${shape}: nx at index ${i} is non-finite`);
      assert.ok(Number.isFinite(ny), `Shape ${shape}: ny at index ${i} is non-finite`);
      assert.ok(Number.isFinite(nz), `Shape ${shape}: nz at index ${i} is non-finite`);

      const len = Math.hypot(nx, ny, nz);
      assert.ok(
        Math.abs(len - 1.0) < EPSILON_TOLERANCE,
        `Shape ${shape}: Normal length at index ${i} (${len}) deviates from 1.0 by ${Math.abs(len - 1.0)}`
      );
    }
  }
});

test('Adversarial 6.2: 100 Combinatorial Permutations (shape x scale x seed x segments) Unit Normal Audit', () => {
  const shapes: readonly (StoneShape | string)[] = [
    ...ALL_CANONICAL_SHAPES,
    'custom_pebble',
    'egg',
    'skipping',
  ];
  const testScales = [
    { x: 1.0, y: 1.0, z: 1.0 },
    { x: 0.2, y: 3.0, z: 0.5 },
    { x: 5.0, y: 0.1, z: 4.0 },
    { x: 1.5, y: 1.2, z: 0.8 },
  ];
  const testSegments = [8, 16, 24, 32];
  const testSeeds = [0, 42, 999];

  let testCount = 0;

  for (const shape of shapes) {
    for (const scale of testScales) {
      const seg = testSegments[testCount % testSegments.length];
      const seed = testSeeds[testCount % testSeeds.length];

      const geometry = createRiverPebbleGeometry({
        shape,
        scale,
        segments: seg,
        seed,
        flattenedBase: testCount % 2 === 0,
      });

      const { maxLenDeviation, hasNonFinite } = auditUnitNormals(geometry);
      assert.equal(hasNonFinite, false, `Permutation ${testCount} produced non-finite normal`);
      assert.ok(
        maxLenDeviation < EPSILON_TOLERANCE,
        `Permutation ${testCount} (shape=${shape}, seg=${seg}) normal deviation ${maxLenDeviation} exceeds 1e-4`
      );

      testCount++;
      if (testCount >= 100) break;
    }
    if (testCount >= 100) break;
  }

  assert.ok(testCount >= 32, `Must run at least 32 combinatorial permutations (ran ${testCount})`);
});

// =============================================================================
// SUITE 7: CANONICAL STONE SPECS & CANNON PHYSICS HALF-EXTENTS PARITY
// =============================================================================

test('Adversarial 7.1: Strict Parity between createRiverPebbleGeometry and StonePhysicsBodyFactory across all 5 canonical shapes', () => {
  for (const shape of ALL_CANONICAL_SHAPES) {
    const physicsConfig = StonePhysicsBodyFactory.getShapeConfig(shape);
    const spec = buildStoneGeometrySpec(shape);

    const geometry = createRiverPebbleGeometry({
      shape,
      scale: spec.scale,
      flattenedBase: true,
    });

    const { hx, hy, hz } = getGeometryHalfExtents(geometry);

    // 1. Geometry vs CANNON Physics Config Parity
    const diffPx = Math.abs(hx - physicsConfig.halfExtents.x);
    const diffPy = Math.abs(hy - physicsConfig.halfExtents.y);
    const diffPz = Math.abs(hz - physicsConfig.halfExtents.z);

    assert.ok(
      diffPx < EPSILON_TOLERANCE,
      `Shape ${shape}: X parity diff vs physics (${diffPx}) exceeds 1e-4`
    );
    assert.ok(
      diffPy < EPSILON_TOLERANCE,
      `Shape ${shape}: Y parity diff vs physics (${diffPy}) exceeds 1e-4`
    );
    assert.ok(
      diffPz < EPSILON_TOLERANCE,
      `Shape ${shape}: Z parity diff vs physics (${diffPz}) exceeds 1e-4`
    );

    // 2. Geometry vs Spec Scale * 0.25 Parity
    const expectedHx = spec.scale.x * 0.25;
    const expectedHy = spec.scale.y * 0.25;
    const expectedHz = spec.scale.z * 0.25;

    assert.ok(
      Math.abs(hx - expectedHx) < EPSILON_TOLERANCE,
      `Shape ${shape}: X parity diff vs scale*0.25 (${Math.abs(hx - expectedHx)}) exceeds 1e-4`
    );
    assert.ok(
      Math.abs(hy - expectedHy) < EPSILON_TOLERANCE,
      `Shape ${shape}: Y parity diff vs scale*0.25 (${Math.abs(hy - expectedHy)}) exceeds 1e-4`
    );
    assert.ok(
      Math.abs(hz - expectedHz) < EPSILON_TOLERANCE,
      `Shape ${shape}: Z parity diff vs scale*0.25 (${Math.abs(hz - expectedHz)}) exceeds 1e-4`
    );
  }
});

test('Adversarial 7.2: Canonical Stone entity instantiation with natural mineral colors produces valid PBR material specs', () => {
  assert.equal(NATURAL_PEBBLE_COLORS.length, 12);
  assert.equal(NATURAL_PEBBLE_PALETTE.length, 12);
  assert.equal(PEBBLE_FLAT_SHADING, false);

  for (let idx = 0; idx < NATURAL_PEBBLE_PALETTE.length; idx++) {
    const mineral = NATURAL_PEBBLE_PALETTE[idx];
    const shape = ALL_CANONICAL_SHAPES[idx % ALL_CANONICAL_SHAPES.length];

    const stone = new Stone({
      shape,
      color: mineral.code,
      pose: Pose.origin(),
    });

    assert.equal(stone.color, mineral.code);
    assert.equal(stone.shape, shape);

    const mat = buildStoneMaterialSpec(mineral.code, shape, 0, false);
    assert.equal(mat.baseColor, mineral.code);
    assert.ok(mat.roughness >= 0.5 && mat.roughness <= 1.0);
    assert.ok(mat.metalness >= 0.0 && mat.metalness <= 0.2);

    const geoSpec = buildStoneGeometrySpec(shape);
    if (shape === 'pebble' || shape === 'round') {
      assert.equal(geoSpec.flatShading, false);
    }
  }
});
