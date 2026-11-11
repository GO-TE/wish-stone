import { Pose } from '../../domain/value-objects/Pose.ts';

export interface DragWorldPositionResult {
  readonly position: readonly [number, number, number];
  readonly normalizedProgress: number; // 0 (bottom idle) to 1 (top drop ready)
  readonly isOverDropZone: boolean;
  readonly balanceRating: 'stable' | 'caution' | 'critical';
}

export const DEFAULT_INITIAL_SPAWN_POSITION: readonly [number, number, number] = [
  0, 0.18, 1.15,
] as const;

export const BALANCE_THRESHOLD_STABLE = 0.22;
export const BALANCE_THRESHOLD_CAUTION = 0.35;
export const DROP_ZONE_MAX_LATERAL_X = 0.35;
export const DROP_ZONE_MAX_DEPTH_Z = 0.30;
export const DROP_HEIGHT_THRESHOLD_RATIO = 0.75;

/**
 * Pure geometric initial spawn calculation for unplaced stone in front of cairn.
 * Centered at X=0, elevated at comfortable floor Y=0.18, and forward at Z=1.15.
 */
export function computeInitialSpawnPosition(
  targetDropY = 1.0
): readonly [number, number, number] {
  const initialY = 0.18;
  const initialZ = 1.15;
  return [0, initialY, initialZ] as const;
}

function sanitizeDelta(val: number): number {
  if (Number.isNaN(val)) return 0;
  if (val === Infinity) return 10000;
  if (val === -Infinity) return -10000;
  return Number.isFinite(val) ? val : 0;
}

/**
 * Maps 2D screen pointer movement to 3D world coordinates with depth convergence and camera azimuth unprojection.
 * Screen horizontal movement translates along camera tangent/right vector.
 * Screen vertical movement lifts stone smoothly in Y while converging Z depth from initial spawn offset (1.15m) to cairn center (0.0m): Z(p) = 1.15(1-p).
 * Live balance evaluation: stable (Toss Blue aura), caution (Amber), critical (Coral Red).
 */
export function computeDragWorldPosition(
  deltaX: number,
  deltaY: number,
  initialPos: readonly [number, number, number] = DEFAULT_INITIAL_SPAWN_POSITION,
  topSurfaceY = 1.0,
  cameraAzimuth = 0
): DragWorldPositionResult {
  // Sanitize non-finite inputs
  const safeDeltaX = sanitizeDelta(deltaX);
  const safeDeltaY = sanitizeDelta(deltaY);
  const safeTopSurface = Number.isFinite(topSurfaceY) ? Math.max(0, topSurfaceY) : 0;
  const safeAzimuth = Number.isFinite(cameraAzimuth) ? cameraAzimuth : 0;

  // Pointer displacement sensitivity
  const dxWorld = safeDeltaX * 0.003;
  // Dragging upward on screen is negative screen deltaY
  const dyWorld = -safeDeltaY * 0.0035;

  const rawY = initialPos[1] + dyWorld;

  const targetDropY = safeTopSurface + 0.35;
  const totalVerticalSpan = Math.max(0.2, targetDropY - initialPos[1]);

  // Clamp vertical progress [0, 1]
  const rawProgress = (rawY - initialPos[1]) / totalVerticalSpan;
  const normalizedProgress = Math.max(0, Math.min(1, rawProgress));

  // Depth convergence: Z smoothly lerps from initial Z (1.15) to cairn axis (0.0)
  const depthZ = initialPos[2] * (1 - normalizedProgress);

  // Camera azimuth projection:
  // right vector = (cos(theta), 0, -sin(theta))
  // forward vector = (sin(theta), 0, cos(theta))
  const rightX = Math.cos(safeAzimuth);
  const rightZ = -Math.sin(safeAzimuth);
  const forwardX = Math.sin(safeAzimuth);
  const forwardZ = Math.cos(safeAzimuth);

  let x: number;
  let z: number;
  if (Math.abs(safeAzimuth) < 1e-6) {
    x = Number((initialPos[0] + dxWorld).toFixed(4));
    z = Number(depthZ.toFixed(4));
  } else {
    // 3D spatial unprojection taking camera azimuth into account
    const convergedOffset = depthZ - initialPos[2];
    x = Number((initialPos[0] + forwardX * convergedOffset + rightX * dxWorld).toFixed(4));
    z = Number((initialPos[2] + forwardZ * convergedOffset + rightZ * dxWorld).toFixed(4));
  }
  const y = Number(rawY.toFixed(4));

  // Live balance evaluation: horizontal cantilever displacement from center axis
  let balanceRating: 'stable' | 'caution' | 'critical' = 'stable';
  const absX = Math.abs(dxWorld !== 0 && Math.abs(safeAzimuth) > 1e-6 ? dxWorld : x);
  if (absX <= BALANCE_THRESHOLD_STABLE) {
    balanceRating = 'stable';
  } else if (absX <= BALANCE_THRESHOLD_CAUTION) {
    balanceRating = 'caution';
  } else {
    balanceRating = 'critical';
  }

  // Drop zone boundary check: within height threshold, lateral width, and depth convergence
  const isOverDropZone =
    y >= targetDropY - 0.20 &&
    Math.abs(x) <= DROP_ZONE_MAX_LATERAL_X &&
    Math.abs(z) <= DROP_ZONE_MAX_DEPTH_Z;

  return {
    position: [x, y, z] as const,
    normalizedProgress,
    isOverDropZone,
    balanceRating,
  };
}

/**
 * Evaluates live balance rating and returns visual aura colors & status hints.
 * Supports both lateral displacement threshold and 3-zone eccentricity ratio evaluation (eta = d_ecc / R_support).
 * - Stable (<0.40 or |X| <= 0.22): Toss Blue `#3182F6` soft aura
 * - Tension / Caution (0.40 - 0.90 or 0.22 < |X| <= 0.35): Amber `#FFB300` warning aura
 * - Topple / Critical (>0.90 or |X| > 0.35): Coral Red `#FF6B6B` alert aura
 */
export function evaluateLiveBalance(
  x: number,
  supportRadius?: number
): {
  readonly rating: 'stable' | 'caution' | 'critical';
  readonly auraColor: string;
  readonly isBalanced: boolean;
  readonly statusHint: string;
  readonly eccentricity?: number;
} {
  const absX = Math.abs(Number.isFinite(x) ? x : 0);

  if (supportRadius !== undefined && Number.isFinite(supportRadius) && supportRadius > 0) {
    const eta = absX / supportRadius;
    if (eta < 0.40) {
      return {
        rating: 'stable',
        auraColor: '#3182F6', // Toss Blue
        isBalanced: true,
        statusHint: '✨ 안정적인 균형 위치 (놓으면 안착)',
        eccentricity: Number(eta.toFixed(4)),
      };
    }
    if (eta <= 0.90) {
      return {
        rating: 'caution',
        auraColor: '#FFB300', // Amber
        isBalanced: false,
        statusHint: '🌱 자연스러운 위치 (손을 놓으면 안착)',
        eccentricity: Number(eta.toFixed(4)),
      };
    }
    return {
      rating: 'critical',
      auraColor: '#FF6B6B', // Coral Red
      isBalanced: false,
      statusHint: '🍃 바닥 및 주변 위치 (자유롭게 놓아보세요)',
      eccentricity: Number(eta.toFixed(4)),
    };
  }

  if (absX <= BALANCE_THRESHOLD_STABLE) {
    return {
      rating: 'stable',
      auraColor: '#3182F6', // Toss Blue
      isBalanced: true,
      statusHint: '✨ 안정적인 균형 위치 (놓으면 안착)',
    };
  }
  if (absX <= BALANCE_THRESHOLD_CAUTION) {
    return {
      rating: 'caution',
      auraColor: '#FFB300', // Amber
      isBalanced: false,
      statusHint: '🌱 자연스러운 위치 (손을 놓으면 안착)',
    };
  }
  return {
    rating: 'critical',
    auraColor: '#FF6B6B', // Coral Red
    isBalanced: false,
    statusHint: '🍃 바닥 및 주변 위치 (자유롭게 놓아보세요)',
  };
}

/**
 * Evaluates live balance based strictly on 3-zone eccentricity ratio:
 * - Stable (<0.40): Toss Blue `#3182F6`
 * - Tension (0.40-0.90): Amber `#FFB300`
 * - Topple (>0.90): Coral Red `#FF6B6B`
 */
export function evaluateLiveBalanceByEccentricity(eta: number): {
  readonly rating: 'stable' | 'caution' | 'critical';
  readonly auraColor: string;
  readonly isBalanced: boolean;
  readonly statusHint: string;
  readonly eccentricity: number;
} {
  const safeEta = Number.isFinite(eta) ? Math.max(0, eta) : Infinity;
  const res = evaluateLiveBalance(safeEta, 1.0);
  return {
    rating: res.rating,
    auraColor: res.auraColor,
    isBalanced: res.isBalanced,
    statusHint: res.statusHint,
    eccentricity: safeEta,
  };
}

/**
 * Authentic 3D spatial unprojection: casts a ray from camera origin in rayDirection
 * onto a horizontal placement plane at Y = planeY.
 * Returns intersection point [x, planeY, z] or null if ray does not intersect plane in front of camera.
 */
export function raycastToPlacementPlane(
  rayOrigin: readonly [number, number, number],
  rayDirection: readonly [number, number, number],
  planeY: number
): readonly [number, number, number] | null {
  const dy = rayDirection[1];
  if (Math.abs(dy) < 1e-6) return null; // Parallel to placement plane
  const t = (planeY - rayOrigin[1]) / dy;
  if (t < 0) return null; // Behind ray origin
  return [
    Number((rayOrigin[0] + t * rayDirection[0]).toFixed(4)),
    Number(planeY.toFixed(4)),
    Number((rayOrigin[2] + t * rayDirection[2]).toFixed(4)),
  ] as const;
}

/**
 * Checks whether stone elevation qualifies for drop release.
 * Returns true if current elevation exceeds drop height threshold (>= 75% of topSurfaceY or >= minDropY).
 */
export function shouldTriggerDrop(
  currentY: number,
  topSurfaceY: number,
  thresholdRatio = DROP_HEIGHT_THRESHOLD_RATIO
): boolean {
  if (!Number.isFinite(currentY)) return false;
  const safeTop = Number.isFinite(topSurfaceY) ? Math.max(0, topSurfaceY) : 0;
  const threshold = Math.max(0.25, safeTop * thresholdRatio);
  return currentY >= threshold;
}

/**
 * Converts 3D world position to a physical drop Pose.
 * Ensures non-penetration clearance when topSurfaceY and stoneHalfHeight are provided.
 */
export function calculate3DDropPoseFromWorldPosition(
  worldPos: readonly [number, number, number],
  topSurfaceY?: number,
  stoneHalfHeight?: number
): Pose {
  const x = Number.isFinite(worldPos[0]) ? Number(worldPos[0].toFixed(4)) : 0;
  let y = Number.isFinite(worldPos[1]) ? Number(worldPos[1].toFixed(4)) : 1.0;
  const z = Number.isFinite(worldPos[2]) ? Number(worldPos[2].toFixed(4)) : 0;

  if (topSurfaceY !== undefined && Number.isFinite(topSurfaceY)) {
    const halfH =
      stoneHalfHeight !== undefined && Number.isFinite(stoneHalfHeight)
        ? stoneHalfHeight
        : 0.25;
    const safeClearance = 0.08;
    const isOverTower = Math.abs(x) <= DROP_ZONE_MAX_LATERAL_X && Math.abs(z) <= DROP_ZONE_MAX_DEPTH_Z;
    const effectiveSurfaceY = isOverTower ? topSurfaceY : 0;
    const minSafeY = Number((effectiveSurfaceY + halfH + safeClearance).toFixed(4));
    if (y < minSafeY) {
      y = minSafeY;
    }
  }

  return new Pose({ x, y, z }, { qx: 0, qy: 0, qz: 0, qw: 1 });
}
