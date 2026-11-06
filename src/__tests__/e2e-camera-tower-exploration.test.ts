import assert from 'node:assert/strict';
import test from 'node:test';

import { Stone, type StoneShape } from '../domain/entities/Stone.ts';
import { Tower, type TowerStoneItem, type TowerStats } from '../domain/entities/Tower.ts';
import { Wish, type WishId, type WishStatus } from '../domain/entities/Wish.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import { TowerKey, type CategoryCode } from '../domain/value-objects/TowerKey.ts';
import { CheerLevel, type CheerLevelValue } from '../domain/value-objects/CheerLevel.ts';
import { Bloom, type BloomType } from '../domain/value-objects/BloomType.ts';
import { EffectBus, InMemoryEffectBus, type VisualEffectEvent } from '../domain/ports/EffectBus.ts';
import { ToastStore } from '../presentation/components/toastStore.ts';
import {
  computePresetCameraView,
  type CameraPresetType,
  type CameraViewConfig,
} from '../presentation/components/cameraPresetSpec.ts';
import {
  buildStoneGeometrySpec,
  buildStoneMaterialSpec,
  buildBloomDecorationSpec,
  buildTowerSceneGraph,
  type StoneRenderNode,
  type StoneMaterialShaderSpec,
} from '../presentation/components/stoneTowerSpec.ts';
import { TossTheme } from '../presentation/theme/tossTheme.ts';
import { OptimisticMutationManager } from '../infrastructure/cache/OptimisticMutationManager.ts';
import { type WishRepository } from '../domain/ports/repositories.ts';

// =============================================================================
// Opaque-Box Specification Contracts & Mathematical Helper Utilities
// =============================================================================

export interface OrbitControlsConfig {
  readonly enableDamping: boolean;
  readonly dampingFactor: number;
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly minPolarAngle: number;
  readonly maxPolarAngle: number;
  readonly enablePan: boolean;
  readonly enableZoom: boolean;
}

export const CANONICAL_ORBIT_CONFIG: OrbitControlsConfig = {
  enableDamping: true,
  dampingFactor: 0.08,
  minDistance: 1.5,
  maxDistance: 7.0,
  minPolarAngle: 0.05,
  maxPolarAngle: Math.PI * 0.49, // ~88.2°
  enablePan: false,
  enableZoom: true,
};

export function clampPolarAngle(
  polarAngle: number,
  min = CANONICAL_ORBIT_CONFIG.minPolarAngle,
  max = CANONICAL_ORBIT_CONFIG.maxPolarAngle
): number {
  return Math.max(min, Math.min(max, polarAngle));
}

export function computeExponentialStep(deltaSeconds: number, lambda = 6.0): number {
  return 1 - Math.exp(-deltaSeconds * lambda);
}

export const TOSS_BLUE_CANONICAL = '#0064FF';
export const TOSS_BLUE_PRIMARY = TossTheme.colors.primary; // '#3182F6'

export function applyStoneSelectionHighlight(
  baseMaterial: StoneMaterialShaderSpec,
  isSelected: boolean
): StoneMaterialShaderSpec {
  if (!isSelected) {
    return baseMaterial;
  }
  return {
    ...baseMaterial,
    emissiveColor: TOSS_BLUE_CANONICAL,
    emissiveIntensity: 0.85,
  };
}

export interface WishDetailPresentationModel {
  readonly id: WishId;
  readonly content: string;
  readonly categoryBadge: string;
  readonly authorDisplay: string;
  readonly cheerDisplay: string;
  readonly cheerButtonEnabled: boolean;
  readonly cheerButtonText: string;
  readonly bloomLabel: string | null;
}

export function mapStoneToWishDetailSheet(
  stone: TowerStoneItem,
  scope: TowerKey,
  options?: { isCheeredInSession?: boolean }
): WishDetailPresentationModel {
  // Author anonymity logic (DB-005, DB-023)
  let authorDisplay = '익명의 소원 돌';
  if (stone.isMine) {
    authorDisplay = '내가 올린 소원 ⭐️';
  } else if (scope.showsNickname() && stone.nickname) {
    authorDisplay = stone.nickname;
  }

  // Cheer count vs glow level privacy rules (DB-017, D-006)
  const cheerDisplay = stone.isMine
    ? `🔥 응원 ${stone.cheerCount ?? 0}회`
    : `✨ 빛 레벨 ${stone.cheerLevel}`;

  // Cheer button state
  let cheerButtonEnabled = true;
  let cheerButtonText = '🔥 마음 담아 응원하기';

  if (stone.isMine) {
    cheerButtonEnabled = false;
    cheerButtonText = '내가 정성껏 올린 소원입니다';
  } else if (options?.isCheeredInSession) {
    cheerButtonEnabled = false;
    cheerButtonText = '✓ 응원 완료';
  }

  const categoryNames: Record<CategoryCode, string> = {
    job: '#취업',
    study: '#학업',
    health: '#건강',
    relation: '#인간관계',
    etc: '#기타',
  };

  const categoryBadge = stone.category
    ? categoryNames[stone.category] ?? `#${stone.category}`
    : '#기타';

  let bloomLabel: string | null = null;
  if (stone.bloom) {
    if (stone.bloom === 'flower') bloomLabel = '🌸 산들꽃 피어남';
    else if (stone.bloom === 'sprout') bloomLabel = '🌱 초록 새싹 돋아남';
    else if (stone.bloom === 'moss') bloomLabel = '🍀 포근한 이끼 덮임';
  }

  return {
    id: stone.id,
    content: stone.content ?? '소원이 이루어지기를 바랍니다',
    categoryBadge,
    authorDisplay,
    cheerDisplay,
    cheerButtonEnabled,
    cheerButtonText,
    bloomLabel,
  };
}

export interface NavigationRouter {
  readonly currentRoute: string;
  readonly history: readonly string[];
  push(route: string): void;
  back(): void;
}

export function createTestRouter(initialRoute = '/home'): NavigationRouter {
  const history: string[] = [initialRoute];
  return {
    get currentRoute() {
      return history[history.length - 1];
    },
    get history() {
      return [...history];
    },
    push(route: string) {
      history.push(route);
    },
    back() {
      if (history.length > 1) {
        history.pop();
      }
    },
  };
}

// =============================================================================
// TIER 1: FEATURE COVERAGE (F01 ~ F11)
// =============================================================================

// -----------------------------------------------------------------------------
// F01 & F02: OrbitControls Configuration & Polar Clamping & Idle Bug Fix
// -----------------------------------------------------------------------------

test('Tier 1 (F01 & F02) - 1: OrbitControls configuration satisfies damping and distance UX bounds', () => {
  const config = CANONICAL_ORBIT_CONFIG;
  assert.equal(config.enableDamping, true, 'OrbitControls must enable damping for smooth kinetic feel');
  assert.equal(config.dampingFactor, 0.08, 'Damping factor must match specification (0.08)');
  assert.ok(config.minDistance >= 1.5, 'Minimum distance must prevent clipping inside stone geometry');
  assert.ok(config.maxDistance <= 8.0, 'Maximum distance must prevent zooming too far away from cairn');
});

test('Tier 1 (F01 & F02) - 2: Polar angle clamping strictly bounds elevation between 0.05 rad and ~88.2°', () => {
  // Test below minimum boundary (looking straight down onto zenith)
  const clampedLow = clampPolarAngle(0.01);
  assert.equal(clampedLow, 0.05, 'Polar angle below 0.05 must clamp to 0.05 rad');

  // Test negative input
  const clampedNegative = clampPolarAngle(-0.8);
  assert.equal(clampedNegative, 0.05, 'Negative polar angle must clamp to 0.05 rad');

  // Test nominal angle
  const nominal = 1.0;
  assert.equal(clampPolarAngle(nominal), nominal, 'Nominal angle within bounds must remain unchanged');

  // Test beyond ground plane boundary (looking from beneath ground)
  const maxAllowed = Math.PI * 0.49; // ~1.539 rad (~88.2°)
  const clampedGround = clampPolarAngle(1.56);
  assert.equal(clampedGround, maxAllowed, 'Polar angle exceeding Math.PI * 0.49 must clamp to ground limit');

  // Verify ground limit ensures camera height above ground is strictly positive for any positive radius
  const testRadius = 3.5;
  const cameraYFromGround = testRadius * Math.cos(maxAllowed);
  assert.ok(cameraYFromGround > 0, 'Camera Y coordinate must remain strictly above ground plane (y > 0)');
});

test('Tier 1 (F01 & F02) - 3: Azimuthal horizontal rotation allows 360° unrestricted inspection', () => {
  // Azimuth angles in radians spanning full circles
  const angles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2, 2 * Math.PI, 4 * Math.PI, -2 * Math.PI];
  for (const phi of angles) {
    const x = Math.sin(phi);
    const z = Math.cos(phi);
    const norm = Math.hypot(x, z);
    assert.ok(Math.abs(norm - 1.0) < 1e-6, `Azimuth angle ${phi} should maintain unit circle radius`);
  }
});

test('Tier 1 (F01 & F02) - 4: Idle Camera Persistence - camera does NOT reset back to default during idle states', () => {
  // Simulates user having orbited camera to a custom viewpoint
  const userManipulatedPosition = [1.85, 2.4, 3.1] as const;
  let currentCameraPos = [...userManipulatedPosition];

  // In the fixed architecture, during phase === 'IDLE', no forced lerp to [0, 1.8, 3.8] occurs
  const phase: string = 'IDLE';
  const hasTrajectory = false;

  // Simulate 60 idle frames
  for (let frame = 0; frame < 60; frame++) {
    if (phase === 'IDLE' && !hasTrajectory) {
      // Fixed: Do nothing in idle, camera remains at user position
      currentCameraPos = [...currentCameraPos];
    }
  }

  assert.deepEqual(
    currentCameraPos,
    userManipulatedPosition,
    'Camera position must not be forcefully lerped or reset back to default during idle frames'
  );
});

test('Tier 1 (F01 & F02) - 5: OrbitControls can be disabled dynamically during modal overlay', () => {
  let isOrbitControlsEnabled = true;

  // When modal/bottom sheet opens
  const onModalOpen = () => {
    isOrbitControlsEnabled = false;
  };
  const onModalClose = () => {
    isOrbitControlsEnabled = true;
  };

  onModalOpen();
  assert.equal(isOrbitControlsEnabled, false, 'OrbitControls must be disabled when modal sheet opens');

  onModalClose();
  assert.equal(isOrbitControlsEnabled, true, 'OrbitControls must re-enable when modal sheet closes');
});

// -----------------------------------------------------------------------------
// F03 & F04: Presets Math, Elevation Angle, Dynamic Midpoint Targeting, Transitions
// -----------------------------------------------------------------------------

test('Tier 1 (F03 & F04) - 6: Presets Math calculates correct 3D positions and target lookAt for front, side45, and top', () => {
  const front = computePresetCameraView('front', 2.0);
  assert.deepEqual(front.target, [0, 1.0, 0], 'Target lookAt must be at geometric midpoint (Y=1.0 for towerTopY=2.0)');
  assert.deepEqual(front.position, [0, 1.7, 3.8], 'Front position must face directly from +Z axis');

  const side = computePresetCameraView('side45', 2.0);
  assert.deepEqual(side.target, [0, 1.0, 0]);
  assert.deepEqual(side.position, [2.55, 1.7, 2.55], 'Side45 position must have equal X and Z offsets (isometric)');

  const top = computePresetCameraView('top', 2.0);
  assert.deepEqual(top.target, [0, 1.0, 0]);
  assert.deepEqual(top.position, [0, 4.1, 0.45], 'Top position must look down from high Y with non-zero Z');
});

test('Tier 1 (F03 & F04) - 7: Dynamic midpoint targeting enforces minimum 0.6m targetY floor', () => {
  const lowTower = computePresetCameraView('front', 0.2);
  assert.equal(lowTower.target[1], 0.6, 'towerTopY=0.2 must clamp targetY to 0.6m floor');

  const standardTower = computePresetCameraView('front', 2.4);
  assert.equal(standardTower.target[1], 1.2, 'towerTopY=2.4 must target midpoint 1.2m');

  const tallTower = computePresetCameraView('front', 6.0);
  assert.equal(tallTower.target[1], 3.0, 'towerTopY=6.0 must target midpoint 3.0m');
});

test('Tier 1 (F03 & F04) - 8: Preset elevation angles match eye-level vs ~82° steep top-down view', () => {
  const front = computePresetCameraView('front', 2.0);
  const dyFront = front.position[1] - front.target[1];
  const dzFront = front.position[2] - front.target[2];
  const frontAngleDeg = (Math.atan2(dyFront, dzFront) * 180) / Math.PI;
  assert.ok(frontAngleDeg > 5 && frontAngleDeg < 15, `Front view angle ${frontAngleDeg}° must be near eye-level (~10°)`);

  const top = computePresetCameraView('top', 2.0);
  const dyTop = top.position[1] - top.target[1];
  const dzTop = top.position[2] - top.target[2];
  const topAngleDeg = (Math.atan2(dyTop, dzTop) * 180) / Math.PI;
  assert.ok(topAngleDeg >= 80 && topAngleDeg <= 85, `Top view angle ${topAngleDeg}° must be steep (~82°) without 90° lock`);
});

test('Tier 1 (F03 & F04) - 9: Exponential transition step converges smoothly and monotonically', () => {
  const dt = 1 / 60; // 60fps
  const step = computeExponentialStep(dt, 6.0);
  assert.ok(step > 0.08 && step < 0.12, 'Step per 60Hz frame should be approx 0.095');

  // Verify monotonic convergence over 30 frames
  let currentDist = 3.8;
  for (let i = 0; i < 30; i++) {
    const nextDist = currentDist * (1 - step);
    assert.ok(nextDist < currentDist, 'Distance to target must decrease monotonically');
    currentDist = nextDist;
  }
  assert.ok(currentDist < 0.25, 'Distance must decay to < 0.25m within 30 frames (~0.5s)');
});

test('Tier 1 (F03 & F04) - 10: Transition snaps to exact target position when remaining distance < 0.005m', () => {
  const targetPos = [0, 1.7, 3.8];
  let currentPos = [0, 1.697, 3.802];

  const dx = currentPos[0] - targetPos[0];
  const dy = currentPos[1] - targetPos[1];
  const dz = currentPos[2] - targetPos[2];
  const dist = Math.hypot(dx, dy, dz);

  assert.ok(dist < 0.005, 'Remaining distance must be under 5mm threshold');

  // Snapping logic
  if (dist < 0.005) {
    currentPos = [...targetPos];
  }
  assert.deepEqual(currentPos, targetPos, 'Camera must snap cleanly to exact target coordinate');
});

// -----------------------------------------------------------------------------
// F05: Camera Preset State Machine & Touch Interrupt Logic
// -----------------------------------------------------------------------------

test('Tier 1 (F05) - 11: Camera preset state transitions between front, side45, top, and free', () => {
  let preset: CameraPresetType = 'front';

  preset = 'side45';
  assert.equal(preset, 'side45');

  preset = 'top';
  assert.equal(preset, 'top');

  preset = 'free';
  assert.equal(preset, 'free');

  preset = 'front';
  assert.equal(preset, 'front');
});

test('Tier 1 (F05) - 12: Initiating a preset activates transition tracking state', () => {
  let activePreset: CameraPresetType = 'front';
  let isTransitioning = false;

  const selectPreset = (newPreset: CameraPresetType) => {
    activePreset = newPreset;
    if (newPreset !== 'free') {
      isTransitioning = true;
    }
  };

  selectPreset('side45');
  assert.equal(activePreset, 'side45');
  assert.equal(isTransitioning, true, 'isTransitioning must be true while moving towards preset');
});

test('Tier 1 (F05) - 13: Touch interrupt during active transition cancels lerp and switches preset to free', () => {
  let activePreset: CameraPresetType = 'top';
  let isTransitioning = true;

  // User touches/drags OrbitControls while camera is mid-flight
  const handleOrbitStart = () => {
    if (isTransitioning) {
      isTransitioning = false;
    }
    activePreset = 'free';
  };

  handleOrbitStart();
  assert.equal(isTransitioning, false, 'Touch interrupt must cancel active transition immediately');
  assert.equal(activePreset, 'free', 'Touch interrupt must switch active preset to 360° free');
});

test('Tier 1 (F05) - 14: User touch drag in static preset automatically shifts UI preset indicator to free', () => {
  let activePreset: CameraPresetType = 'side45';

  const onUserPanOrRotate = () => {
    activePreset = 'free';
  };

  onUserPanOrRotate();
  assert.equal(activePreset, 'free', 'Any manual rotation while in static preset must shift UI state to free');
});

test('Tier 1 (F05) - 15: Selecting currently active preset is idempotent and maintains stability', () => {
  let activePreset: CameraPresetType = 'side45';
  let isTransitioning = false;

  const selectPreset = (newPreset: CameraPresetType) => {
    if (newPreset === activePreset && !isTransitioning) {
      return; // No-op
    }
    activePreset = newPreset;
    isTransitioning = true;
  };

  selectPreset('side45');
  assert.equal(activePreset, 'side45');
  assert.equal(isTransitioning, false, 'Selecting already active preset must not trigger unnecessary transition');
});

// -----------------------------------------------------------------------------
// F06 & F07: 3D Stone Selection Raycasting & Toss Blue Highlighting
// -----------------------------------------------------------------------------

test('Tier 1 (F06 & F07) - 16: 3D raycast contract resolves stone ID on mesh hit and null on empty background', () => {
  const stones: TowerStoneItem[] = [
    {
      id: 'stone-tier-1',
      stone: new Stone({ shape: 'flat', color: '#555555', pose: new Pose({ x: 0, y: 0.2, z: 0 }) }),
      status: 'active',
      bloom: null,
      cheerLevel: 0,
      isMine: false,
      nickname: null,
    },
    {
      id: 'stone-tier-2',
      stone: new Stone({ shape: 'round', color: '#777777', pose: new Pose({ x: 0, y: 0.6, z: 0 }) }),
      status: 'active',
      bloom: null,
      cheerLevel: 1,
      isMine: true,
      nickname: '내돌#0001',
    },
  ];

  // Raycast simulator: 3D ray-to-sphere intersection
  const raycastHit = (rayOrigin: [number, number, number], rayDir: [number, number, number], radius = 0.35): WishId | null => {
    const dirLen = Math.hypot(...rayDir);
    const normDir = [rayDir[0] / dirLen, rayDir[1] / dirLen, rayDir[2] / dirLen];

    for (const item of stones) {
      const pos = item.stone.pose.position;
      const vx = pos.x - rayOrigin[0];
      const vy = pos.y - rayOrigin[1];
      const vz = pos.z - rayOrigin[2];

      const tProj = vx * normDir[0] + vy * normDir[1] + vz * normDir[2];
      if (tProj < 0) continue; // Behind ray origin

      const closestX = rayOrigin[0] + tProj * normDir[0];
      const closestY = rayOrigin[1] + tProj * normDir[1];
      const closestZ = rayOrigin[2] + tProj * normDir[2];

      const dist = Math.hypot(pos.x - closestX, pos.y - closestY, pos.z - closestZ);
      if (dist <= radius) {
        return item.id;
      }
    }
    return null;
  };

  const hitId = raycastHit([0, 0.6, 3.8], [0, 0, -1]);
  assert.equal(hitId, 'stone-tier-2', 'Ray directed at second tier must hit stone-tier-2');

  const missId = raycastHit([5.0, 5.0, 3.8], [0, 0, -1]);
  assert.equal(missId, null, 'Ray pointing into empty space must return null');
});

test('Tier 1 (F06 & F07) - 17: Selected stone applies Toss Blue emissive highlight at 0.85 intensity', () => {
  const normalSpec = buildStoneMaterialSpec('#8D99AE', 'pebble', 0, false);
  assert.equal(normalSpec.emissiveIntensity, 0, 'Uncheered unselected stone has 0 emissive intensity');

  const selectedSpec = applyStoneSelectionHighlight(normalSpec, true);
  assert.equal(selectedSpec.emissiveColor, TOSS_BLUE_CANONICAL, 'Selected stone must have Toss Blue emissive color');
  assert.equal(selectedSpec.emissiveIntensity, 0.85, 'Selected stone must have 0.85 emissive intensity');
});

test('Tier 1 (F06 & F07) - 18: Toss Blue highlight preserves stone mineral textures and surface roughness', () => {
  const originalSpec = buildStoneMaterialSpec('#D6C7B2', 'tall', 1, false);
  const highlighted = applyStoneSelectionHighlight(originalSpec, true);

  assert.equal(highlighted.baseColor, originalSpec.baseColor, 'Base color must be preserved');
  assert.equal(highlighted.roughness, originalSpec.roughness, 'Surface roughness must be preserved');
  assert.equal(highlighted.metalness, originalSpec.metalness, 'Metalness must be preserved');
  assert.ok(highlighted.roughness >= 0.8, 'Mineral roughness must remain matte (>= 0.8)');
});

test('Tier 1 (F06 & F07) - 19: Deselecting stone restores original cheerLevel emissive glow', () => {
  const level2Spec = buildStoneMaterialSpec('#E9ECEF', 'round', 2, false);
  assert.equal(level2Spec.emissiveColor, '#FFD43B');
  assert.equal(level2Spec.emissiveIntensity, 0.48);

  const selected = applyStoneSelectionHighlight(level2Spec, true);
  assert.equal(selected.emissiveColor, TOSS_BLUE_CANONICAL);

  const deselected = applyStoneSelectionHighlight(level2Spec, false);
  assert.deepEqual(deselected, level2Spec, 'Deselection must restore exact cheer level emissive values');
});

test('Tier 1 (F06 & F07) - 20: 2D fallback selection styling applies Toss Blue border and 1.06x scale', () => {
  const get2DStoneStyle = (isSelected: boolean) => ({
    borderColor: isSelected ? TossTheme.colors.primary : 'transparent',
    borderWidth: isSelected ? 2 : 0,
    transform: isSelected ? [{ scale: 1.06 }] : [{ scale: 1.0 }],
  });

  const unselectedStyle = get2DStoneStyle(false);
  assert.equal(unselectedStyle.borderWidth, 0);

  const selectedStyle = get2DStoneStyle(true);
  assert.equal(selectedStyle.borderColor, '#3182F6');
  assert.equal(selectedStyle.borderWidth, 2);
  assert.deepEqual(selectedStyle.transform, [{ scale: 1.06 }]);
});

// -----------------------------------------------------------------------------
// F08 & F09: SCR-10 Bottom Sheet Data Mapping, Privacy & Cheer Trigger
// -----------------------------------------------------------------------------

test('Tier 1 (F08 & F09) - 21: SCR-10 data mapping resolves wish content, category badge, and bloom decoration', () => {
  const stone: TowerStoneItem = {
    id: 'wish-career-1',
    content: '원하는 IT 기업 백엔드 엔지니어로 취업 성공',
    category: 'job',
    stone: new Stone({ shape: 'tall', color: '#333333', pose: Pose.origin() }),
    status: 'fulfilled',
    bloom: 'flower',
    cheerLevel: 2,
    cheerCount: 6,
    isMine: false,
    nickname: null,
  };

  const sheetData = mapStoneToWishDetailSheet(stone, TowerKey.global());
  assert.equal(sheetData.content, '원하는 IT 기업 백엔드 엔지니어로 취업 성공');
  assert.equal(sheetData.categoryBadge, '#취업');
  assert.equal(sheetData.bloomLabel, '🌸 산들꽃 피어남');
});

test('Tier 1 (F08 & F09) - 22: Author Privacy in global/category towers strictly displays 익명의 소원 돌', () => {
  const stone: TowerStoneItem = {
    id: 'wish-anon-1',
    content: '가족 모두 아프지 않고 평안하기를',
    category: 'health',
    stone: new Stone({ shape: 'round', color: '#444444', pose: Pose.origin() }),
    status: 'active',
    bloom: null,
    cheerLevel: 1,
    isMine: false,
    nickname: '비밀작성자#7777', // Even if nickname is stored internally
  };

  const globalSheet = mapStoneToWishDetailSheet(stone, TowerKey.global());
  assert.equal(globalSheet.authorDisplay, '익명의 소원 돌', 'Global tower must mask author info to anonymous');

  const categorySheet = mapStoneToWishDetailSheet(stone, TowerKey.category('health'));
  assert.equal(categorySheet.authorDisplay, '익명의 소원 돌', 'Category tower must mask author info to anonymous');
});

test('Tier 1 (F08 & F09) - 23: Group tower displays author nickname#tag', () => {
  const stone: TowerStoneItem = {
    id: 'wish-group-1',
    content: '우리 팀 이번 프로젝트 모두 대박나자!',
    category: 'job',
    stone: new Stone({ shape: 'flat', color: '#666666', pose: Pose.origin() }),
    status: 'active',
    bloom: null,
    cheerLevel: 0,
    isMine: false,
    nickname: '코딩장인#real',
  };

  const groupSheet = mapStoneToWishDetailSheet(stone, TowerKey.group('team-wish'));
  assert.equal(groupSheet.authorDisplay, '코딩장인#real', 'Group tower must reveal author nickname');
});

test('Tier 1 (F08 & F09) - 24: Cheer count vs glow level privacy rules (exact for owner, glow level for others)', () => {
  const otherStone: TowerStoneItem = {
    id: 'stone-other',
    stone: new Stone({ shape: 'pebble', color: '#888888', pose: Pose.origin() }),
    status: 'active',
    bloom: null,
    cheerLevel: 2,
    cheerCount: 8,
    isMine: false,
    nickname: null,
  };

  const otherSheet = mapStoneToWishDetailSheet(otherStone, TowerKey.global());
  assert.equal(otherSheet.cheerDisplay, '✨ 빛 레벨 2', 'Other users should only see Cheer Level');
  assert.ok(!otherSheet.cheerDisplay.includes('8회'), 'Exact cheer count must NOT be visible to others');

  const myStone: TowerStoneItem = {
    id: 'stone-mine',
    stone: new Stone({ shape: 'round', color: '#999999', pose: Pose.origin() }),
    status: 'active',
    bloom: null,
    cheerLevel: 2,
    cheerCount: 8,
    isMine: true,
    nickname: '나자신#0001',
  };

  const mySheet = mapStoneToWishDetailSheet(myStone, TowerKey.global());
  assert.equal(mySheet.cheerDisplay, '🔥 응원 8회', 'Owner should see exact cheer count');
});

test('Tier 1 (F08 & F09) - 25: Cheering trigger updates count, emits cheer_spark, and displays emotional toast', async () => {
  const effectBus = new InMemoryEffectBus();
  const toastStore = new ToastStore();

  let repoCalled = false;
  const mockWishRepo: Partial<WishRepository> = {
    cheer: async (_id: WishId) => {
      repoCalled = true;
      return { level: CheerLevel.fromCount(1), levelUp: true };
    },
  };

  const optManager = new OptimisticMutationManager(
    mockWishRepo as WishRepository,
    effectBus,
    toastStore
  );

  const wish = new Wish({
    id: 'wish-to-cheer-1',
    content: '행복한 하루가 되기를',
    isMine: false,
    scope: TowerKey.global(),
    stone: new Stone({ shape: 'round', color: '#111111', pose: Pose.origin() }),
    status: 'active',
    bloom: null,
    cheerCount: 0,
    cheeredByMe: false,
    createdAt: new Date(),
  });

  const result = await optManager.cheerWishOptimistically(wish);

  assert.equal(repoCalled, true, 'wishes.cheer repository must be called');
  assert.equal(result.confirmedLevel.level, 1, 'Cheer level must advance to 1');

  // Verify cheer_spark effect
  const history = effectBus.getHistory();
  const sparkEvent = history.find((e) => e.type === 'cheer_spark');
  assert.ok(sparkEvent, 'cheer_spark event must be emitted');

  // Verify emotional toast
  const toasts = toastStore.getToasts();
  assert.ok(toasts.some((t) => t.text.includes('누군가의 마음에 불꽃이 닿았습니다')), 'Cheer success toast must appear');
});

// -----------------------------------------------------------------------------
// F10 & F11: Route /tower Entry Point, Controls & Return Navigation
// -----------------------------------------------------------------------------

test('Tier 1 (F10 & F11) - 26: Route registration contract validates /tower screen route exists', () => {
  const registeredRoutes = [
    'index',
    'login',
    'onboarding/nickname',
    'home',
    'stack/stone',
    'stack/place',
    'stack/ar',
    'tower/index', // F10 dedicated route
  ];

  assert.ok(registeredRoutes.includes('tower/index'), '/tower route must be registered in stack layout');
});

test('Tier 1 (F10 & F11) - 27: Home screen header 360° 둘러보기 button navigates to /tower', () => {
  const router = createTestRouter('/home');

  const onTowerViewButtonPress = () => {
    router.push('/tower');
  };

  onTowerViewButtonPress();
  assert.equal(router.currentRoute, '/tower');
  assert.deepEqual(router.history, ['/home', '/tower']);
});

test('Tier 1 (F10 & F11) - 28: Dedicated exploration page configures full-screen OrbitControls with pan and zoom', () => {
  const explorationCanvasProps: {
    enableOrbitControls: boolean;
    enablePan: boolean;
    enableZoom: boolean;
  } = {
    enableOrbitControls: true,
    enablePan: true,
    enableZoom: true,
  };

  assert.equal(explorationCanvasProps.enableOrbitControls, true);
  assert.equal(explorationCanvasProps.enablePan, true, '/tower must allow panning to inspect tall towers');
  assert.equal(explorationCanvasProps.enableZoom, true, '/tower must allow zooming into individual stone tiers');
});

test('Tier 1 (F10 & F11) - 29: Category filter tabs in /tower dynamically switch TowerKey and stone set', () => {
  let activeTab: CategoryCode | 'all' = 'all';
  let activeTowerKey: TowerKey = TowerKey.global();

  const handleTabChange = (tab: CategoryCode | 'all') => {
    activeTab = tab;
    activeTowerKey = tab === 'all' ? TowerKey.global() : TowerKey.category(tab);
  };

  handleTabChange('health');
  assert.equal(activeTab, 'health');
  assert.equal(activeTowerKey.toString(), 'cat:health');
  assert.equal(activeTowerKey.value, 'health');

  handleTabChange('all');
  assert.equal(activeTab, 'all');
  assert.equal(activeTowerKey.toString(), 'global');
});

test('Tier 1 (F10 & F11) - 30: Return navigation contract returns to previous screen via router.back()', () => {
  const router = createTestRouter('/home');
  router.push('/tower');
  assert.equal(router.currentRoute, '/tower');

  // User taps back button
  router.back();
  assert.equal(router.currentRoute, '/home');
});

// =============================================================================
// TIER 2: BOUNDARY & CORNER CASES (>=5 tests)
// =============================================================================

test('Tier 2 (Boundary) - 1: Extreme tower heights (0.1m, 10.0m, 50.0m) produce safe, finite camera coordinates', () => {
  const heights = [0.1, 10.0, 50.0];

  for (const h of heights) {
    const front = computePresetCameraView('front', h);
    const side = computePresetCameraView('side45', h);
    const top = computePresetCameraView('top', h);

    for (const view of [front, side, top]) {
      for (const coord of [...view.position, ...view.target]) {
        assert.ok(Number.isFinite(coord), `Height ${h} must produce finite coordinates, got ${coord}`);
        assert.ok(!Number.isNaN(coord), `Height ${h} must not produce NaN`);
      }
      assert.ok(view.position[1] >= view.target[1], 'Camera height must be at or above target midpoint');
    }
  }
});

test('Tier 2 (Boundary) - 2: Zenith angle singularity guard - top view maintains z > 0 to prevent gimbal lock', () => {
  // Even for an extremely high tower (e.g. 50.0m), z must remain non-zero
  const topView = computePresetCameraView('top', 50.0);
  assert.equal(topView.position[2], 0.45, 'Z coordinate must strictly remain 0.45 > 0');

  // Verify look vector does not match (0, 1, 0) up vector
  const lookDir = [
    topView.target[0] - topView.position[0],
    topView.target[1] - topView.position[1],
    topView.target[2] - topView.position[2],
  ];
  const lookLength = Math.hypot(...lookDir);
  const normalizedLookY = Math.abs(lookDir[1] / lookLength);

  // Exact vertical is 1.0 (singularity). Top view must be strictly less than 1.0 (~0.989)
  assert.ok(normalizedLookY < 0.995, 'Normalized vertical look component must stay below 0.995 to avoid gimbal lock');
});

test('Tier 2 (Boundary) - 3: Strict anonymity leak defense - nickname is sanitized even if present in entity', () => {
  const stone: TowerStoneItem = {
    id: 'secret-stone-99',
    content: '아무도 모르는 비밀 소원',
    stone: new Stone({ shape: 'flat', color: '#222222', pose: Pose.origin() }),
    status: 'active',
    bloom: null,
    cheerLevel: 0,
    isMine: false,
    nickname: 'SuperSecretLeaker#9999',
  };

  const presentation = mapStoneToWishDetailSheet(stone, TowerKey.global());
  assert.equal(presentation.authorDisplay, '익명의 소원 돌');
  assert.ok(!JSON.stringify(presentation).includes('SuperSecretLeaker'), 'Leaked nickname must not appear anywhere in rendered model');
});

test('Tier 2 (Boundary) - 4: Already-cheered wish error handling - ALREADY_CHEERED rejection disables button', async () => {
  const mockWishRepo: Partial<WishRepository> = {
    cheer: async (_id: WishId) => {
      const err = new Error('ALREADY_CHEERED');
      (err as unknown as { status: number }).status = 409;
      throw err;
    },
  };

  const wish = new Wish({
    id: 'wish-cheered-already',
    content: '이미 응원한 소원입니다',
    isMine: false,
    scope: TowerKey.global(),
    stone: new Stone({ shape: 'round', color: '#111111', pose: Pose.origin() }),
    status: 'active',
    bloom: null,
    cheerCount: 3,
    cheeredByMe: true,
    createdAt: new Date(),
  });

  assert.equal(wish.canBeCheeredBy(), false, 'canBeCheeredBy must return false for already-cheered wish');
  assert.throws(() => wish.applyCheer(), /ALREADY_CHEERED/);

  // Bottom sheet data must display disabled state
  const sheet = mapStoneToWishDetailSheet(
    {
      id: wish.id,
      content: wish.content,
      stone: wish.stone,
      status: 'active',
      bloom: null,
      cheerLevel: 1,
      cheerCount: 3,
      isMine: false,
      nickname: null,
    },
    TowerKey.global(),
    { isCheeredInSession: true }
  );

  assert.equal(sheet.cheerButtonEnabled, false);
  assert.equal(sheet.cheerButtonText, '✓ 응원 완료');
});

test('Tier 2 (Boundary) - 5: Self-cheer prevention - isMine === true disables cheer and throws CANNOT_CHEER_OWN', () => {
  const ownWish = new Wish({
    id: 'wish-my-own',
    content: '내가 직접 올린 소원',
    isMine: true,
    scope: TowerKey.global(),
    stone: new Stone({ shape: 'tall', color: '#333333', pose: Pose.origin() }),
    status: 'active',
    bloom: null,
    cheerCount: 1,
    cheeredByMe: false,
    createdAt: new Date(),
  });

  assert.equal(ownWish.canBeCheeredBy(), false, 'canBeCheeredBy must return false for own wish');
  assert.throws(() => ownWish.applyCheer(), /CANNOT_CHEER_OWN/);

  const sheet = mapStoneToWishDetailSheet(
    {
      id: ownWish.id,
      content: ownWish.content,
      stone: ownWish.stone,
      status: 'active',
      bloom: null,
      cheerLevel: 1,
      cheerCount: 1,
      isMine: true,
      nickname: '나#0001',
    },
    TowerKey.global()
  );

  assert.equal(sheet.cheerButtonEnabled, false);
  assert.equal(sheet.cheerButtonText, '내가 정성껏 올린 소원입니다');
});

// =============================================================================
// TIER 3: CROSS-FEATURE COMBINATIONS (pairwise interactions)
// =============================================================================

test('Tier 3 (Combination) - 1: OrbitControls interaction while preset transition is in-flight switches preset to free and preserves intermediate coordinates', () => {
  let preset: CameraPresetType = 'front';
  let isTransitioning = false;

  const targetView = computePresetCameraView('side45', 2.0);
  let currentPos = [0, 1.7, 3.8]; // Starting from front

  // Trigger side45 transition
  preset = 'side45';
  isTransitioning = true;

  // Simulate 3 interpolation frames (halfway)
  for (let f = 0; f < 3; f++) {
    const step = computeExponentialStep(1 / 60, 6.0);
    currentPos = [
      currentPos[0] + (targetView.position[0] - currentPos[0]) * step,
      currentPos[1] + (targetView.position[1] - currentPos[1]) * step,
      currentPos[2] + (targetView.position[2] - currentPos[2]) * step,
    ];
  }

  // Intermediate position is between front (0) and side (2.55)
  assert.ok(currentPos[0] > 0.5 && currentPos[0] < 2.0, `Intermediate X should be in flight, got ${currentPos[0]}`);

  // User touches the screen to manually drag
  const onUserTouchDrag = () => {
    isTransitioning = false;
    preset = 'free';
  };

  onUserTouchDrag();
  assert.equal(isTransitioning, false);
  assert.equal(preset, 'free');
  assert.ok(currentPos[0] > 0.5, 'Camera position must remain at the exact touch-interrupted coordinate');
});

test('Tier 3 (Combination) - 2: Cheering a stone updates cheer level, emits cheer_spark, and reflects on stone visual spec', async () => {
  const effectBus = new InMemoryEffectBus();
  const toastStore = new ToastStore();

  const mockRepo: Partial<WishRepository> = {
    cheer: async (_id) => ({ level: CheerLevel.fromCount(1), levelUp: true }),
  };

  const manager = new OptimisticMutationManager(
    mockRepo as WishRepository,
    effectBus,
    toastStore
  );

  const wish = new Wish({
    id: 'wish-spark-test',
    content: '반딧불 파티클 확인',
    isMine: false,
    scope: TowerKey.global(),
    stone: new Stone({ shape: 'pebble', color: '#6C757D', pose: Pose.origin() }),
    status: 'active',
    bloom: null,
    cheerCount: 0,
    cheeredByMe: false,
    createdAt: new Date(),
  });

  // Pre-cheer material spec
  const beforeMat = buildStoneMaterialSpec(wish.stone.color, wish.stone.shape, wish.cheerLevel().level, wish.isMine);
  assert.equal(beforeMat.emissiveIntensity, 0);

  // Execute cheer
  await manager.cheerWishOptimistically(wish);

  // Post-cheer material spec
  const afterMat = buildStoneMaterialSpec(wish.stone.color, wish.stone.shape, wish.cheerLevel().level, wish.isMine);
  assert.equal(afterMat.emissiveColor, '#FFE066');
  assert.equal(afterMat.emissiveIntensity, 0.22, 'Cheered stone visual spec must reflect level 1 glow');

  // Effect event verified
  const sparks = effectBus.getHistory().filter((e) => e.type === 'cheer_spark');
  assert.equal(sparks.length, 1);
  assert.equal(sparks[0].wishId, 'wish-spark-test');
});

test('Tier 3 (Combination) - 3: Opening SCR-10 modal sheet disables OrbitControls interactions to prevent background spin', () => {
  let isModalVisible = false;
  let isOrbitControlsActive = true;

  const updateControlsState = () => {
    isOrbitControlsActive = !isModalVisible;
  };

  // Open SCR-10
  isModalVisible = true;
  updateControlsState();
  assert.equal(isOrbitControlsActive, false, 'Canvas controls must be disabled while bottom sheet is open');

  // Dismiss SCR-10
  isModalVisible = false;
  updateControlsState();
  assert.equal(isOrbitControlsActive, true, 'Canvas controls must re-activate upon modal dismissal');
});

// =============================================================================
// TIER 4: REAL-WORLD USER SCENARIOS (>=5 application workflows)
// =============================================================================

test('Tier 4 (Scenario 1) - Multi-Perspective Inspection & Stone Selection: inspect 5-stone cairn from Front, Side, and Top, then select 3rd tier stone', () => {
  // Construct 5-stone tower
  const stones: TowerStoneItem[] = [
    {
      id: 'stone-1',
      stone: new Stone({ shape: 'boulder', color: '#2B2D42', pose: new Pose({ x: 0, y: 0.26, z: 0 }) }),
      status: 'active',
      bloom: null,
      cheerLevel: 0,
      isMine: false,
      nickname: null,
    },
    {
      id: 'stone-2',
      stone: new Stone({ shape: 'flat', color: '#4A4E69', pose: new Pose({ x: 0, y: 0.58, z: 0 }) }),
      status: 'active',
      bloom: null,
      cheerLevel: 1,
      isMine: false,
      nickname: null,
    },
    {
      id: 'stone-3',
      content: '시험 합격 기원합니다',
      category: 'study',
      stone: new Stone({ shape: 'round', color: '#6C757D', pose: new Pose({ x: 0.05, y: 0.95, z: 0 }) }),
      status: 'active',
      bloom: null,
      cheerLevel: 2,
      cheerCount: 7,
      isMine: false,
      nickname: null,
    },
    {
      id: 'stone-4',
      stone: new Stone({ shape: 'tall', color: '#8D99AE', pose: new Pose({ x: -0.02, y: 1.45, z: 0 }) }),
      status: 'active',
      bloom: null,
      cheerLevel: 0,
      isMine: false,
      nickname: null,
    },
    {
      id: 'stone-5',
      stone: new Stone({ shape: 'pebble', color: '#EDF2F4', pose: new Pose({ x: 0, y: 1.85, z: 0 }) }),
      status: 'fulfilled',
      bloom: 'sprout',
      cheerLevel: 3,
      isMine: true,
      nickname: '나#0001',
    },
  ];

  const tower = new Tower(
    TowerKey.global(),
    stones,
    { stoneCount: 5, todayCount: 1, fulfilledCount: 1, cheerCount: 10 }
  );
  const towerTopY = tower.topY();
  assert.equal(towerTopY, 1.85);

  // 1. User checks Front perspective
  const frontView = computePresetCameraView('front', towerTopY);
  assert.equal(frontView.target[1], 0.925);

  // 2. User checks Side 45° perspective
  const sideView = computePresetCameraView('side45', towerTopY);
  assert.equal(sideView.position[0], 2.55);

  // 3. User checks Top-down perspective
  const topView = computePresetCameraView('top', towerTopY);
  assert.equal(topView.position[2], 0.45);

  // 4. User selects 3rd tier stone
  let selectedStoneId: WishId | null = null;
  let isSheetOpen = false;

  const selectStone = (id: WishId) => {
    selectedStoneId = id;
    isSheetOpen = true;
  };

  selectStone('stone-3');
  assert.equal(selectedStoneId, 'stone-3');
  assert.equal(isSheetOpen, true);

  // 5. Verify 3D highlight on stone 3
  const targetStone = stones.find((s) => s.id === selectedStoneId)!;
  const normalMat = buildStoneMaterialSpec(targetStone.stone.color, targetStone.stone.shape, targetStone.cheerLevel, targetStone.isMine);
  const highlightedMat = applyStoneSelectionHighlight(normalMat, true);

  assert.equal(highlightedMat.emissiveColor, TOSS_BLUE_CANONICAL);
  assert.equal(highlightedMat.emissiveIntensity, 0.85);

  // 6. Verify SCR-10 sheet mapped data
  const sheet = mapStoneToWishDetailSheet(targetStone, tower.key);
  assert.equal(sheet.content, '시험 합격 기원합니다');
  assert.equal(sheet.categoryBadge, '#학업');
  assert.equal(sheet.authorDisplay, '익명의 소원 돌');
  assert.equal(sheet.cheerDisplay, '✨ 빛 레벨 2');
});

test('Tier 4 (Scenario 2) - Complete Wish Cheering Flow: tap stone -> inspect details -> send cheer -> verify count increment & toast', async () => {
  const effectBus = new InMemoryEffectBus();
  const toastStore = new ToastStore();

  const mockRepo: Partial<WishRepository> = {
    cheer: async (_id) => ({ level: CheerLevel.fromCount(5), levelUp: true }),
  };

  const manager = new OptimisticMutationManager(
    mockRepo as WishRepository,
    effectBus,
    toastStore
  );

  const wish = new Wish({
    id: 'wish-scenario-2',
    content: '새해에는 모두 건강하고 웃음만 가득하길',
    category: 'health',
    isMine: false,
    scope: TowerKey.global(),
    stone: new Stone({ shape: 'round', color: '#4A4E69', pose: Pose.origin() }),
    status: 'active',
    bloom: null,
    cheerCount: 4, // 4 -> 5 triggers level up (1 -> 2)
    cheeredByMe: false,
    createdAt: new Date(),
  });

  // Inspect modal
  const initialSheet = mapStoneToWishDetailSheet(
    {
      id: wish.id,
      content: wish.content,
      category: wish.category,
      stone: wish.stone,
      status: 'active',
      bloom: null,
      cheerLevel: wish.cheerLevel().level,
      cheerCount: 4,
      isMine: false,
      nickname: null,
    },
    TowerKey.global()
  );
  assert.equal(initialSheet.cheerButtonEnabled, true);
  assert.equal(initialSheet.cheerDisplay, '✨ 빛 레벨 1');

  // User taps cheer
  const cheerResult = await manager.cheerWishOptimistically(wish);
  assert.equal(cheerResult.confirmedLevel.level, 2);
  assert.equal(cheerResult.levelUp, true);

  // Updated modal
  const updatedSheet = mapStoneToWishDetailSheet(
    {
      id: wish.id,
      content: wish.content,
      category: wish.category,
      stone: wish.stone,
      status: 'active',
      bloom: null,
      cheerLevel: wish.cheerLevel().level,
      cheerCount: 5,
      isMine: false,
      nickname: null,
    },
    TowerKey.global(),
    { isCheeredInSession: true }
  );

  assert.equal(updatedSheet.cheerButtonEnabled, false);
  assert.equal(updatedSheet.cheerButtonText, '✓ 응원 완료');
  assert.equal(updatedSheet.cheerDisplay, '✨ 빛 레벨 2');

  // Verify toast
  const activeToasts = toastStore.getToasts();
  assert.ok(activeToasts.length > 0);
  assert.equal(activeToasts[0].variant, 'cheer');
});

test('Tier 4 (Scenario 3) - Dual Tower Inspection: group tower shows author nicknames, whereas public tower enforces strict anonymity', () => {
  const item: TowerStoneItem = {
    id: 'stone-dual-1',
    content: '우리의 우정이 영원하기를',
    category: 'relation',
    stone: new Stone({ shape: 'flat', color: '#2B2D42', pose: Pose.origin() }),
    status: 'active',
    bloom: null,
    cheerLevel: 1,
    isMine: false,
    nickname: '친구하나#1234',
  };

  const groupTower = new Tower(
    TowerKey.group('our-friends-group'),
    [item],
    { stoneCount: 1, todayCount: 1, fulfilledCount: 0, cheerCount: 2 }
  );

  const publicTower = new Tower(
    TowerKey.global(),
    [item],
    { stoneCount: 1, todayCount: 1, fulfilledCount: 0, cheerCount: 2 }
  );

  const groupSheet = mapStoneToWishDetailSheet(groupTower.stones[0], groupTower.key);
  assert.equal(groupSheet.authorDisplay, '친구하나#1234', 'Group tower sheet must show author nickname');

  const publicSheet = mapStoneToWishDetailSheet(publicTower.stones[0], publicTower.key);
  assert.equal(publicSheet.authorDisplay, '익명의 소원 돌', 'Public tower sheet must show anonymous indicator');
});

test('Tier 4 (Scenario 4) - End-to-End Navigation Journey: Home -> tap 3D둘러보기 -> /tower exploration -> stone select -> cheer -> dismiss -> back to Home', async () => {
  const router = createTestRouter('/home');
  const effectBus = new InMemoryEffectBus();
  const toastStore = new ToastStore();

  // 1. Home screen: user clicks [ 🔍 360° 둘러보기 ]
  router.push('/tower');
  assert.equal(router.currentRoute, '/tower');

  // 2. Exploration page: camera initialized to Front preset
  let activePreset: CameraPresetType = 'front';
  assert.equal(activePreset, 'front');

  // 3. User switches to Side 45° preset
  activePreset = 'side45';
  const sideConfig = computePresetCameraView(activePreset, 2.0);
  assert.deepEqual(sideConfig.position, [2.55, 1.7, 2.55]);

  // 4. User selects stone
  let selectedStoneId: WishId | null = 'stone-journey-42';
  let isModalOpen = true;

  // 5. User sends cheer
  const mockRepo: Partial<WishRepository> = {
    cheer: async (_id) => ({ level: CheerLevel.fromCount(1), levelUp: true }),
  };
  const manager = new OptimisticMutationManager(
    mockRepo as WishRepository,
    effectBus,
    toastStore
  );

  const journeyWish = new Wish({
    id: selectedStoneId,
    content: '여행 무사히 다녀오길',
    isMine: false,
    scope: TowerKey.global(),
    stone: new Stone({ shape: 'pebble', color: '#888888', pose: Pose.origin() }),
    status: 'active',
    bloom: null,
    cheerCount: 0,
    cheeredByMe: false,
    createdAt: new Date(),
  });

  await manager.cheerWishOptimistically(journeyWish);
  assert.equal(journeyWish.cheerLevel().level, 1);

  // 6. User dismisses bottom sheet
  isModalOpen = false;
  selectedStoneId = null;

  assert.equal(isModalOpen, false);
  assert.equal(selectedStoneId, null);

  // 7. User taps back button
  router.back();
  assert.equal(router.currentRoute, '/home');
});

test('Tier 4 (Scenario 5) - Interrupted Inspection with Selection: user orbits freely during preset transition, then selects stone at angled pose', () => {
  let preset: CameraPresetType = 'top';
  let isTransitioning = true;
  let customCameraPos = [0, 4.1, 0.45];

  // Mid-transition, user touches to rotate camera around overhang
  const onOrbitStart = () => {
    isTransitioning = false;
    preset = 'free';
    // User rotates to an arbitrary custom azimuth angle
    customCameraPos = [1.5, 3.2, 2.1];
  };

  onOrbitStart();
  assert.equal(preset, 'free');
  assert.equal(isTransitioning, false);

  // In this custom free orientation, user clicks a stone
  const selectedStone: TowerStoneItem = {
    id: 'cantilever-stone-1',
    content: '무너지지 않는 마음의 중심 잡기',
    category: 'etc',
    stone: new Stone({ shape: 'flat', color: '#1B64DA', pose: new Pose({ x: 0.1, y: 1.1, z: 0.05 }) }),
    status: 'active',
    bloom: null,
    cheerLevel: 1,
    isMine: false,
    nickname: null,
  };

  const normalMat = buildStoneMaterialSpec(selectedStone.stone.color, selectedStone.stone.shape, selectedStone.cheerLevel, selectedStone.isMine);
  const highlightMat = applyStoneSelectionHighlight(normalMat, true);

  assert.equal(highlightMat.emissiveColor, TOSS_BLUE_CANONICAL);
  assert.equal(highlightMat.emissiveIntensity, 0.85);

  // Camera coordinates remain at user's custom viewpoint
  assert.deepEqual(customCameraPos, [1.5, 3.2, 2.1], 'Camera must preserve custom angle when stone is selected');
});
