import * as THREE from 'three';
import { Stone, type StoneShape } from '../../domain/entities/Stone.ts';

/**
 * F19: 12-Tone Natural River Pebble (몽돌) Mineral Color Palette Specification
 * 먹빛 현무암, 흑진주 흑요석, 청회색 강돌, 물푸레 이끼석 등 한국의 자연 하천·계곡 몽돌 스펙트럼
 */
export interface PebbleMineralColor {
  readonly code: string;
  readonly name: string;
}

export const NATURAL_PEBBLE_PALETTE: readonly PebbleMineralColor[] = [
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
] as const;

export const NATURAL_PEBBLE_COLORS: readonly string[] = NATURAL_PEBBLE_PALETTE.map(
  (c) => c.code
);

export const PEBBLE_SHAPE_PROFILES: readonly StoneShape[] = [
  'round',
  'flat',
  'pebble',
  'tall',
  'boulder',
] as const;

export const PEBBLE_FLAT_SHADING = false;

export interface PebbleGeometryConfig {
  readonly shape: StoneShape | string;
  readonly scale: { x: number; y: number; z: number };
  readonly seed?: number;
  readonly flattenedBase?: boolean;
  readonly segments?: number;
}

/**
 * F17: Natural River Pebble (몽돌) Procedural Geometry Generator
 * - Generates smooth, water-worn river pebble geometry with organic contours
 * - Flattened bottom base (`flattenedBase: true`) provides a realistic physical contact plane
 * - Smooth vertex normals (`flatShading: false`) eliminate sharp polyhedral artifacts
 * - CRITICAL ANTI-CLIPPING PARITY INVARIANT:
 *   Visual bounding halfExtents strictly equal `scale * 0.25` (within +/- 1e-4 m)
 *   guaranteeing exact parity with StonePhysicsBodyFactory.ts and zero clipping regressions.
 */
export function createRiverPebbleGeometry(
  config: PebbleGeometryConfig
): THREE.BufferGeometry {
  const latSegments = config.segments ?? 24;
  const lonSegments = Math.round(latSegments * 1.33);

  const baseSphere = new THREE.SphereGeometry(1.0, lonSegments, latSegments);
  const posAttribute = baseSphere.getAttribute('position');
  const positions = posAttribute.array as Float32Array;

  const H_x = config.scale.x * 0.25;
  const H_y = config.scale.y * 0.25;
  const H_z = config.scale.z * 0.25;

  const seed = config.seed ?? 42;
  const flattenedBase = config.flattenedBase ?? true;

  for (let k = 0; k < positions.length; k += 3) {
    let x = positions[k];
    let y = positions[k + 1];
    let z = positions[k + 2];

    const theta = Math.atan2(z, x);
    const phi = Math.asin(Math.max(-1, Math.min(1, y)));

    // 1. Organic shape profile asymmetry
    let shapeFactor = 1.0;
    if (config.shape === 'pebble' || config.shape === 'egg') {
      shapeFactor = 1.0 + 0.07 * Math.cos(theta);
    } else if (config.shape === 'tall') {
      shapeFactor = 1.0 - 0.08 * y;
    } else if (config.shape === 'flat' || config.shape === 'skipping') {
      shapeFactor = 1.0 + 0.05 * Math.sin(2 * theta);
    } else if (config.shape === 'boulder') {
      shapeFactor = 1.0 + 0.04 * Math.cos(2 * theta) * Math.sin(phi);
    }

    // 2. Smooth water-worn organic harmonic modulation (no high-frequency spikes)
    const wave =
      1.0 +
      0.025 * Math.sin(2 * theta + seed) +
      0.02 * Math.cos(3 * phi + seed * 0.6);
    const r = shapeFactor * wave;

    x *= r;
    z *= r;

    // 3. Base flattening for physical resting contact plane
    if (flattenedBase && y < -0.4) {
      if (y < -0.75) {
        y = -0.88;
      } else {
        const t = (-y - 0.4) / 0.35;
        const s = t * t * (3 - 2 * t);
        y = (1 - s) * y + s * -0.88;
      }
    } else {
      y *= r;
    }

    positions[k] = x;
    positions[k + 1] = y;
    positions[k + 2] = z;
  }

  // 4. Exact Anti-Clipping Parity Invariant Normalization
  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;
  let minZ = Infinity,
    maxZ = -Infinity;

  for (let k = 0; k < positions.length; k += 3) {
    minX = Math.min(minX, positions[k]);
    maxX = Math.max(maxX, positions[k]);
    minY = Math.min(minY, positions[k + 1]);
    maxY = Math.max(maxY, positions[k + 1]);
    minZ = Math.min(minZ, positions[k + 2]);
    maxZ = Math.max(maxZ, positions[k + 2]);
  }

  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const spanZ = maxZ - minZ || 1;

  for (let k = 0; k < positions.length; k += 3) {
    positions[k] = -H_x + ((positions[k] - minX) / spanX) * (2 * H_x);
    positions[k + 1] = -H_y + ((positions[k + 1] - minY) / spanY) * (2 * H_y);
    positions[k + 2] = -H_z + ((positions[k + 2] - minZ) / spanZ) * (2 * H_z);
  }

  posAttribute.needsUpdate = true;
  baseSphere.computeVertexNormals();

  const normals = baseSphere.getAttribute('normal');
  for (let i = 0; i < normals.count; i++) {
    const len = Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i));
    if (len < 1e-4) {
      if (i <= lonSegments) {
        normals.setXYZ(i, normals.getX(0), normals.getY(0), normals.getZ(0));
      } else {
        const refIdx = normals.count - 2;
        normals.setXYZ(i, normals.getX(refIdx), normals.getY(refIdx), normals.getZ(refIdx));
      }
    }
  }
  normals.needsUpdate = true;

  baseSphere.computeBoundingBox();
  baseSphere.computeBoundingSphere();

  (baseSphere as any).userData = {
    shape: config.shape,
    scale: { ...config.scale },
    halfExtents: { x: H_x, y: H_y, z: H_z },
    flattenedBase,
    seed,
  };

  return baseSphere;
}
