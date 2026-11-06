export type CameraPresetType = 'front' | 'side45' | 'top' | 'free';

export interface CameraViewConfig {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
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
