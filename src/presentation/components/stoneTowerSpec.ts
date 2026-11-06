import { Stone, type StoneShape } from '../../domain/entities/Stone.ts';
import { type TowerStoneItem } from '../../domain/entities/Tower.ts';
import { type WishId } from '../../domain/entities/Wish.ts';
import { type SimulationFrame } from '../../domain/ports/PhysicsWorld.ts';
import { type BloomType } from '../../domain/value-objects/BloomType.ts';
import { type CheerLevelValue } from '../../domain/value-objects/CheerLevel.ts';
import { type Quat, type Vec3 } from '../../domain/value-objects/Pose.ts';

export interface ProceduralStoneGeometrySpec {
  readonly shape: StoneShape;
  readonly scale: Vec3;
  readonly segments: number;
  readonly roughness: number;
  readonly metalness: number;
  readonly flatShading: boolean;
  readonly bevelRadius: number;
}

export interface StoneMaterialShaderSpec {
  readonly baseColor: string;
  readonly roughness: number;
  readonly metalness: number;
  readonly emissiveColor: string;
  readonly emissiveIntensity: number;
  readonly outlineHighlighted: boolean;
  readonly outlineColor: string;
}

export interface BloomDecorationSpec {
  readonly bloom: BloomType;
  readonly emoji: string;
  readonly label: string;
  readonly accentColor: string;
  readonly offsetY: number;
  readonly particleCount: number;
}

export interface TowerLightingRigSpec {
  readonly ambientIntensity: number;
  readonly directionalIntensity: number;
  readonly directionalPosition: Vec3;
  readonly hemisphereSkyColor: string;
  readonly hemisphereGroundColor: string;
}

export interface StoneRenderNode {
  readonly id: WishId;
  readonly position: Vec3;
  readonly geometry: ProceduralStoneGeometrySpec;
  readonly material: StoneMaterialShaderSpec;
  readonly decoration: BloomDecorationSpec | null;
  readonly nicknameLabel: string | null;
}

const SHAPE_SPECS: Record<StoneShape, ProceduralStoneGeometrySpec> = {
  round: {
    shape: 'round',
    scale: { x: 1.0, y: 0.82, z: 1.0 },
    segments: 24,
    roughness: 0.88,
    metalness: 0.05,
    flatShading: true,
    bevelRadius: 0.18,
  },
  flat: {
    shape: 'flat',
    scale: { x: 1.35, y: 0.42, z: 1.25 },
    segments: 20,
    roughness: 0.92,
    metalness: 0.04,
    flatShading: true,
    bevelRadius: 0.12,
  },
  pebble: {
    shape: 'pebble',
    scale: { x: 0.72, y: 0.58, z: 0.68 },
    segments: 18,
    roughness: 0.84,
    metalness: 0.06,
    flatShading: false,
    bevelRadius: 0.25,
  },
  tall: {
    shape: 'tall',
    scale: { x: 0.78, y: 1.45, z: 0.76 },
    segments: 22,
    roughness: 0.9,
    metalness: 0.05,
    flatShading: true,
    bevelRadius: 0.14,
  },
  boulder: {
    shape: 'boulder',
    scale: { x: 1.25, y: 1.05, z: 1.2 },
    segments: 16,
    roughness: 0.95,
    metalness: 0.03,
    flatShading: true,
    bevelRadius: 0.08,
  },
};

const GLOW_BY_CHEER_LEVEL: Record<
  CheerLevelValue,
  { emissiveColor: string; emissiveIntensity: number }
> = {
  0: { emissiveColor: '#000000', emissiveIntensity: 0.0 },
  1: { emissiveColor: '#FFE066', emissiveIntensity: 0.22 },
  2: { emissiveColor: '#FFD43B', emissiveIntensity: 0.48 },
  3: { emissiveColor: '#FF922B', emissiveIntensity: 0.82 },
};

const BLOOM_DECORATIONS: Record<
  BloomType,
  Omit<BloomDecorationSpec, 'offsetY'>
> = {
  flower: {
    bloom: 'flower',
    emoji: '🌸',
    label: '산들꽃 피어남',
    accentColor: '#FF8787',
    particleCount: 8,
  },
  sprout: {
    bloom: 'sprout',
    emoji: '🌱',
    label: '초록 새싹 돋아남',
    accentColor: '#69DB7C',
    particleCount: 5,
  },
  moss: {
    bloom: 'moss',
    emoji: '🍀',
    label: '포근한 이끼 덮임',
    accentColor: '#38D9A9',
    particleCount: 12,
  },
};

/**
 * 돌 모양(`round`, `flat`, `pebble`, `tall`, `boulder`)에 따른 절차적 3D 지오메트리 스펙을 생성한다.
 */
export function buildStoneGeometrySpec(
  shape: StoneShape
): ProceduralStoneGeometrySpec {
  return SHAPE_SPECS[shape] ?? SHAPE_SPECS.round;
}

/**
 * 거친 돌 표면 질감의 매트 셰이더 재질과 응원 단계별(`0~3단계`) 은은한 발광(emissive) 스펙을 계산한다 (D-006, D-017).
 */

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return { r: 128, g: 128, b: 128 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function adjustColorForDarkBackground(hexColor: string): {
  readonly adjustedColor: string;
  readonly isDarkStone: boolean;
  readonly rimGlowColor: string;
  readonly rimGlowIntensity: number;
} {
  const { r, g, b } = parseHexColor(hexColor);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  const isDarkStone = luminance < 75;

  if (!isDarkStone) {
    return {
      adjustedColor: hexColor,
      isDarkStone: false,
      rimGlowColor: '#000000',
      rimGlowIntensity: 0.0,
    };
  }

  // Lift luminance by 25% so dark stones contrast distinctly against dark background
  const liftFactor = 1.35;
  const minFloor = 38;
  const newR = Math.min(255, Math.round(Math.max(minFloor, r * liftFactor)));
  const newG = Math.min(255, Math.round(Math.max(minFloor, g * liftFactor)));
  const newB = Math.min(255, Math.round(Math.max(minFloor, b * liftFactor)));
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  const adjustedColor = '#' + toHex(newR) + toHex(newG) + toHex(newB);

  return {
    adjustedColor,
    isDarkStone: true,
    rimGlowColor: '#3A485E', // Subtle cool slate rim glow
    rimGlowIntensity: 0.22,
  };
}

export function buildStoneMaterialSpec(
  color: string,
  shape: StoneShape,
  cheerLevel: CheerLevelValue,
  isMine: boolean
): StoneMaterialShaderSpec {
  const geo = buildStoneGeometrySpec(shape);
  const glow = GLOW_BY_CHEER_LEVEL[cheerLevel] ?? GLOW_BY_CHEER_LEVEL[0];
  const darkAdjust = adjustColorForDarkBackground(color);
  
  return {
    baseColor: color,
    roughness: darkAdjust.isDarkStone ? 0.68 : geo.roughness,
    metalness: darkAdjust.isDarkStone ? 0.12 : geo.metalness,
    emissiveColor: glow.emissiveColor,
    emissiveIntensity: glow.emissiveIntensity,
    outlineHighlighted: isMine,
    outlineColor: isMine ? '#FFD43B' : 'transparent',
  };
}

/**
 * 소원이 이루어졌을 때(`fulfilled`) 돌 상단에 피어나는 자연물(`flower`, `sprout`, `moss`) 데코레이션 스펙을 생성한다 (DB-020, D-012).
 */
export function buildBloomDecorationSpec(
  bloom: BloomType | null,
  stoneScaleY = 0.82
): BloomDecorationSpec | null {
  if (!bloom) return null;
  const preset = BLOOM_DECORATIONS[bloom];
  if (!preset) return null;
  return {
    ...preset,
    offsetY: Number((stoneScaleY * 0.55).toFixed(3)),
  };
}

/**
 * 자연스러운 돌탑 음영을 위한 3점 조명 리그(Ambient + Directional Sun + Hemisphere) 스펙 반환
 */
export function buildNaturalLightingRig(): TowerLightingRigSpec {
  return {
    ambientIntensity: 0.55,
    directionalIntensity: 1.15,
    directionalPosition: { x: 3.5, y: 6.0, z: 4.0 },
    hemisphereSkyColor: '#EAE4DC',
    hemisphereGroundColor: '#1E2026',
  };
}

/**
 * 돌탑의 돌 목록(`TowerStoneItem[]`)을 Three.js/R3F 씬 그래프용 렌더 노드 배열로 변환한다 (최대 200개 개별 렌더링, D-010).
 */
export function buildTowerSceneGraph(
  stones: readonly TowerStoneItem[],
  maxDetailedStones = 200
): StoneRenderNode[] {
  const sliced = stones.slice(-maxDetailedStones);
  return sliced.map((item) => {
    const geometry = buildStoneGeometrySpec(item.stone.shape);
    const material = buildStoneMaterialSpec(
      item.stone.color,
      item.stone.shape,
      item.cheerLevel,
      item.isMine
    );
    const decoration =
      item.status === 'fulfilled'
        ? buildBloomDecorationSpec(item.bloom, geometry.scale.y)
        : null;

    return {
      id: item.id,
      position: item.stone.pose.position,
      geometry,
      material,
      decoration,
      nicknameLabel: item.nickname,
    };
  });
}

export interface InterpolatedStonePose {
  readonly position: Vec3;
  readonly rotation: Quat;
}

export interface TrajectoryInterpolationResult {
  readonly isComplete: boolean;
  readonly currentStep: number;
  readonly poses: ReadonlyMap<string, InterpolatedStonePose>;
}

/**
 * 60Hz 물리 시뮬레이션 궤적(trajectory)을 임의의 경과 시간에 맞추어 LERP(위치) 및 SLERP(쿼터니언)로 보간한다.
 * 순수 수학 계산으로 WebGL/GPU 없이 Node.js 헤드리스 테스트에서 100% 검증 가능.
 */
export function interpolateTrajectoryFrame(
  trajectory: readonly SimulationFrame[],
  elapsedSeconds: number,
  fixedDeltaTime = 1 / 60
): TrajectoryInterpolationResult {
  if (!trajectory || trajectory.length === 0) {
    return { isComplete: true, currentStep: 0, poses: new Map() };
  }

  const N = trajectory.length;
  if (N === 1 || !Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
    const frame = trajectory[0];
    const map = new Map<string, InterpolatedStonePose>();
    for (const [id, pose] of frame.poses) {
      map.set(id, { position: pose.position, rotation: pose.rotation });
    }
    return { isComplete: N === 1, currentStep: 0, poses: map };
  }

  const floatStep = elapsedSeconds / fixedDeltaTime;
  if (floatStep >= N - 1) {
    const last = trajectory[N - 1];
    const map = new Map<string, InterpolatedStonePose>();
    for (const [id, pose] of last.poses) {
      map.set(id, { position: pose.position, rotation: pose.rotation });
    }
    return { isComplete: true, currentStep: N - 1, poses: map };
  }

  const k = Math.max(0, Math.floor(floatStep));
  const alpha = floatStep - k;
  const frameA = trajectory[k];
  const frameB = trajectory[k + 1];

  const interpolatedPoses = new Map<string, InterpolatedStonePose>();

  for (const [id, poseA] of frameA.poses) {
    const poseB = frameB.poses.get(id);
    if (!poseB) {
      interpolatedPoses.set(id, { position: poseA.position, rotation: poseA.rotation });
      continue;
    }

    // 1. Position Linear Interpolation (LERP)
    const px = poseA.position.x + (poseB.position.x - poseA.position.x) * alpha;
    const py = poseA.position.y + (poseB.position.y - poseA.position.y) * alpha;
    const pz = poseA.position.z + (poseB.position.z - poseA.position.z) * alpha;

    // 2. Quaternion Spherical Linear Interpolation (SLERP)
    let qbx = poseB.rotation.qx;
    let qby = poseB.rotation.qy;
    let qbz = poseB.rotation.qz;
    let qbw = poseB.rotation.qw;

    let dot =
      poseA.rotation.qx * qbx +
      poseA.rotation.qy * qby +
      poseA.rotation.qz * qbz +
      poseA.rotation.qw * qbw;

    // Shortest path on 4D hypersphere
    if (dot < 0) {
      dot = -dot;
      qbx = -qbx;
      qby = -qby;
      qbz = -qbz;
      qbw = -qbw;
    }

    let rx: number;
    let ry: number;
    let rz: number;
    let rw: number;

    if (dot > 0.9995) {
      // Near-identical rotations: fall back to normalized linear interpolation
      rx = poseA.rotation.qx + (qbx - poseA.rotation.qx) * alpha;
      ry = poseA.rotation.qy + (qby - poseA.rotation.qy) * alpha;
      rz = poseA.rotation.qz + (qbz - poseA.rotation.qz) * alpha;
      rw = poseA.rotation.qw + (qbw - poseA.rotation.qw) * alpha;
      const len = Math.hypot(rx, ry, rz, rw) || 1;
      rx /= len;
      ry /= len;
      rz /= len;
      rw /= len;
    } else {
      const theta = Math.acos(Math.min(1, Math.max(-1, dot)));
      const sinTheta = Math.sin(theta);
      const wA = Math.sin((1 - alpha) * theta) / sinTheta;
      const wB = Math.sin(alpha * theta) / sinTheta;
      rx = wA * poseA.rotation.qx + wB * qbx;
      ry = wA * poseA.rotation.qy + wB * qby;
      rz = wA * poseA.rotation.qz + wB * qbz;
      rw = wA * poseA.rotation.qw + wB * qbw;
    }

    interpolatedPoses.set(id, {
      position: {
        x: Number(px.toFixed(4)),
        y: Number(py.toFixed(4)),
        z: Number(pz.toFixed(4)),
      },
      rotation: {
        qx: Number(rx.toFixed(4)),
        qy: Number(ry.toFixed(4)),
        qz: Number(rz.toFixed(4)),
        qw: Number(rw.toFixed(4)),
      },
    });
  }

  // Handle any stones present in frameB that weren't in frameA
  for (const [id, poseB] of frameB.poses) {
    if (!interpolatedPoses.has(id)) {
      interpolatedPoses.set(id, {
        position: poseB.position,
        rotation: poseB.rotation,
      });
    }
  }

  return {
    isComplete: false,
    currentStep: k,
    poses: interpolatedPoses,
  };
}

/**
 * 궤적 프레임 포스 맵에서 돌 ID, 인덱스('tower-stone-${index}'), 또는 드롭된 돌('dropped-stone')을 해석한다.
 */
export function resolveStonePose(
  poses: ReadonlyMap<string, InterpolatedStonePose>,
  stoneId: string,
  index?: number
): InterpolatedStonePose | undefined {
  return (
    poses.get(stoneId) ??
    (index !== undefined ? poses.get(`tower-stone-${index}`) : undefined) ??
    poses.get('dropped-stone')
  );
}

export interface TransformableMesh {
  readonly position: { set(x: number, y: number, z: number): void };
  readonly quaternion: { set(x: number, y: number, z: number, w: number): void };
}

/**
 * Three.js 메쉬들의 위치와 회전을 초기 돌탑 배치(node.position) 및 단위 쿼터니언([0, 0, 0, 1])으로 복원한다.
 * phase가 'IDLE'로 복귀하거나 궤적 재생이 초기화될 때 호출되어 무너진 돌들이 다시 제자리로 돌아오도록 보장한다.
 */
export function resetTowerMeshTransforms(
  meshMap: Map<string, any>,
  nodes: readonly StoneRenderNode[],
  droppedStone?: Stone | null
): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const mesh = meshMap.get(node.id) ?? meshMap.get(`tower-stone-${i}`);
    if (mesh) {
      mesh.position.set(node.position.x, node.position.y, node.position.z);
      mesh.quaternion.set(0, 0, 0, 1);
    }
  }
  if (droppedStone) {
    const droppedMesh = meshMap.get('dropped-stone');
    if (droppedMesh) {
      droppedMesh.position.set(
        droppedStone.pose.position.x,
        droppedStone.pose.position.y,
        droppedStone.pose.position.z
      );
      droppedMesh.quaternion.set(
        droppedStone.pose.rotation.qx,
        droppedStone.pose.rotation.qy,
        droppedStone.pose.rotation.qz,
        droppedStone.pose.rotation.qw
      );
    }
  }
}

