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
 * Maps 2D screen pointer movement to 3D world coordinates with depth convergence.
 * As normalized vertical progress moves from 0 to 1, Z converges from 1.15 -> 0.0.
 * Live balance evaluation: |X| <= 0.22 => 'stable' (Toss Blue aura), caution/critical otherwise.
 */
export function computeDragWorldPosition(
  deltaX: number,
  deltaY: number,
  initialPos: readonly [number, number, number] = DEFAULT_INITIAL_SPAWN_POSITION,
  topSurfaceY = 1.0
): DragWorldPositionResult {
  // Sanitize non-finite inputs
  const safeDeltaX = sanitizeDelta(deltaX);
  const safeDeltaY = sanitizeDelta(deltaY);
  const safeTopSurface = Number.isFinite(topSurfaceY) ? Math.max(0, topSurfaceY) : 0;

  // Pointer displacement sensitivity
  const dxWorld = safeDeltaX * 0.003;
  // Dragging upward on screen is negative screen deltaY
  const dyWorld = -safeDeltaY * 0.0035;

  const rawX = initialPos[0] + dxWorld;
  const rawY = initialPos[1] + dyWorld;

  const targetDropY = safeTopSurface + 0.35;
  const totalVerticalSpan = Math.max(0.2, targetDropY - initialPos[1]);

  // Clamp vertical progress [0, 1]
  const rawProgress = (rawY - initialPos[1]) / totalVerticalSpan;
  const normalizedProgress = Math.max(0, Math.min(1, rawProgress));

  // Depth convergence: Z smoothly lerps from initial Z (1.15) to cairn axis (0.0)
  const z = Number((initialPos[2] * (1 - normalizedProgress)).toFixed(4));
  const y = Number(rawY.toFixed(4));
  const x = Number(rawX.toFixed(4));

  // Live balance evaluation: horizontal cantilever displacement from center axis
  let balanceRating: 'stable' | 'caution' | 'critical' = 'stable';
  const absX = Math.abs(x);
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
 */
export function evaluateLiveBalance(x: number): {
  readonly rating: 'stable' | 'caution' | 'critical';
  readonly auraColor: string;
  readonly isBalanced: boolean;
  readonly statusHint: string;
} {
  const absX = Math.abs(Number.isFinite(x) ? x : 0);
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
      auraColor: '#FFB300', // Amber Caution
      isBalanced: false,
      statusHint: '⚡ 약간 기울어짐 (조금 더 가운데로 맞춰주세요)',
    };
  }
  return {
    rating: 'critical',
    auraColor: '#FF6B6B', // Coral Red Warning
    isBalanced: false,
    statusHint: '⚠️ 중심에서 벗어남 (전복 위험!)',
  };
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
  const threshold = Math.max(0.35, safeTop * thresholdRatio);
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
    const minSafeY = Number((topSurfaceY + halfH + safeClearance).toFixed(4));
    if (y < minSafeY) {
      y = minSafeY;
    }
  }

  return new Pose({ x, y, z }, { qx: 0, qy: 0, qz: 0, qw: 1 });
}
