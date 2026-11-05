import { type StoneShape } from '../../domain/entities/Stone.ts';
import { type TowerStoneItem } from '../../domain/entities/Tower.ts';
import { type WishId } from '../../domain/entities/Wish.ts';
import { type BloomType } from '../../domain/value-objects/BloomType.ts';
import { type CheerLevelValue } from '../../domain/value-objects/CheerLevel.ts';
import { type Vec3 } from '../../domain/value-objects/Pose.ts';

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
export function buildStoneMaterialSpec(
  color: string,
  shape: StoneShape,
  cheerLevel: CheerLevelValue,
  isMine: boolean
): StoneMaterialShaderSpec {
  const geo = buildStoneGeometrySpec(shape);
  const glow = GLOW_BY_CHEER_LEVEL[cheerLevel] ?? GLOW_BY_CHEER_LEVEL[0];
  return {
    baseColor: color,
    roughness: geo.roughness,
    metalness: geo.metalness,
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
