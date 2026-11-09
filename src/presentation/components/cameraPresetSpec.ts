export type CameraPresetType = 'front' | 'side45' | 'top' | 'free';

export interface CameraViewConfig {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}

export const ZEN_GARDEN_RADIUS = 28.0;
export const CAMERA_PAN_MAX_RADIUS = 15.0;
export const CAMERA_MIN_DISTANCE = 1.2;
export const CAMERA_MAX_DISTANCE = 24.0;
export const RECENTER_TRIGGER_DISTANCE = 2.0;

export interface FocusCameraViewConfig {
  readonly target: readonly [number, number, number];
  readonly position: readonly [number, number, number];
}

/**
 * Computes camera coordinates and look-at target for given viewpoint presets.
 * Presets adapt dynamically to the tower's height (towerTopY) while ensuring
 * a minimum focus height (targetY >= 0.6) and avoiding gimbal-lock singularities.
 */
export function computePresetCameraView(
  preset: Exclude<CameraPresetType, 'free'>,
  towerTopY?: number
): CameraViewConfig {
  const targetY = Math.max(0.6, Number(((towerTopY ?? 1.0) * 0.5).toFixed(3)));

  switch (preset) {
    case 'front':
      return {
        position: [0, Number((targetY + 0.7).toFixed(3)), 3.8],
        target: [0, targetY, 0],
      };
    case 'side45':
      return {
        position: [2.55, Number((targetY + 0.7).toFixed(3)), 2.55],
        target: [0, targetY, 0],
      };
    case 'top':
      return {
        position: [0, Number((targetY + 3.1).toFixed(3)), 0.45],
        target: [0, targetY, 0],
      };
    default: {
      const exhaustiveCheck: never = preset;
      throw new Error(`Unsupported camera preset: ${String(exhaustiveCheck)}`);
    }
  }
}

/**
 * Computes inspection camera view coordinates focused on a specific stone.
 * Distance is set to 1.8m with +0.35m vertical offset, maintaining azimuth relative to current camera position.
 */
export function computeFocusCameraView(
  stonePosition: { x: number; y: number; z: number },
  currentCameraPosition?: { x: number; y: number; z: number }
): FocusCameraViewConfig {
  const sx = Number.isFinite(stonePosition.x) ? stonePosition.x : 0;
  const sy = Number.isFinite(stonePosition.y) ? stonePosition.y : 0;
  const sz = Number.isFinite(stonePosition.z) ? stonePosition.z : 0;

  const target: readonly [number, number, number] = [
    Number(sx.toFixed(4)),
    Number(sy.toFixed(4)),
    Number(sz.toFixed(4)),
  ];

  const focusDistance = 1.8;
  const elevationOffset = 0.35;

  let azimuth = 0;
  if (currentCameraPosition) {
    const dx = currentCameraPosition.x - sx;
    const dz = currentCameraPosition.z - sz;
    if (Math.hypot(dx, dz) > 1e-4) {
      azimuth = Math.atan2(dx, dz);
    }
  }

  const posX = sx + Math.sin(azimuth) * focusDistance;
  const posY = sy + elevationOffset;
  const posZ = sz + Math.cos(azimuth) * focusDistance;

  return {
    target,
    position: [
      Number(posX.toFixed(4)),
      Number(posY.toFixed(4)),
      Number(posZ.toFixed(4)),
    ],
  };
}

/**
 * Clamps the camera target within safe cylindrical boundaries:
 * - Radial distance R <= maxRadius (default: CAMERA_PAN_MAX_RADIUS = 15.0m)
 * - Vertical target 0.2m <= Y <= max(1.5m, towerTopY + 2.5m)
 */
export function clampCameraTarget(
  target: [number, number, number] | readonly [number, number, number],
  maxRadius: number = CAMERA_PAN_MAX_RADIUS,
  towerTopY?: number
): [number, number, number] {
  const rawX = Number.isFinite(target[0]) ? target[0] : 0;
  const rawY = Number.isFinite(target[1]) ? target[1] : 0.2;
  const rawZ = Number.isFinite(target[2]) ? target[2] : 0;

  // 1. Horizontal radial clamping (cylinder radius <= maxRadius)
  const distXZ = Math.hypot(rawX, rawZ);
  let clampedX = rawX;
  let clampedZ = rawZ;

  if (distXZ > maxRadius && distXZ > 0) {
    const scale = maxRadius / distXZ;
    clampedX = rawX * scale;
    clampedZ = rawZ * scale;
  }

  // 2. Vertical height clamping (0.2m <= y <= towerTopY + 2.5m)
  const effectiveTopY =
    towerTopY !== undefined && Number.isFinite(towerTopY)
      ? Math.max(0, towerTopY)
      : 1.0;
  const minY = 0.2;
  const maxY = Math.max(1.5, effectiveTopY + 2.5);
  const clampedY = Math.max(minY, Math.min(maxY, rawY));

  return [
    Number(clampedX.toFixed(4)),
    Number(clampedY.toFixed(4)),
    Number(clampedZ.toFixed(4)),
  ];
}

