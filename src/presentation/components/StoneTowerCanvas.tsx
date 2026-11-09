import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Stone, type StoneShape } from '../../domain/entities/Stone.ts';
import { type TowerStoneItem } from '../../domain/entities/Tower.ts';
import { type WishId } from '../../domain/entities/Wish.ts';
import { type SimulationFrame } from '../../domain/ports/PhysicsWorld.ts';
import { Pose } from '../../domain/value-objects/Pose.ts';
import { StonePhysicsBodyFactory } from '../../infrastructure/physics/StonePhysicsBodyFactory.ts';
import { type StackPlacementPhase } from '../controllers/StackStoneController.ts';
import {
  type CameraPresetType,
  computePresetCameraView,
  computeFocusCameraView,
  clampCameraTarget,
  ZEN_GARDEN_RADIUS,
  CAMERA_PAN_MAX_RADIUS,
  CAMERA_MIN_DISTANCE,
  CAMERA_MAX_DISTANCE,
  RECENTER_TRIGGER_DISTANCE,
} from './cameraPresetSpec.ts';
import {
  BALANCE_THRESHOLD_CAUTION,
  BALANCE_THRESHOLD_STABLE,
  DROP_ZONE_MAX_DEPTH_Z,
  DROP_ZONE_MAX_LATERAL_X,
  computeDragWorldPosition,
  computeInitialSpawnPosition,
  calculate3DDropPoseFromWorldPosition,
  evaluateLiveBalance,
  shouldTriggerDrop,
  type DragWorldPositionResult,
} from './stoneDragSpec.ts';
import {
  buildStoneGeometrySpec,
  buildTowerSceneGraph,
  interpolateTrajectoryFrame,
  resetTowerMeshTransforms,
  type StoneRenderNode,
} from './stoneTowerSpec.ts';

export * from './stoneTowerSpec.ts';
export * from './cameraPresetSpec.ts';
export * from './stoneDragSpec.ts';
import { createRiverPebbleGeometry } from './pebbleGeometrySpec.ts';
export * from './pebbleGeometrySpec.ts';

export const PEBBLE_VISUAL_SCALE_FACTOR = 0.72;

/**
 * v2.2 동그란 자갈돌 전용 3D 비주얼 스케일 프로필 (길쭉한 기둥형 돌 완전 배제)
 * - 모든 StoneShape('round', 'flat', 'pebble', 'tall', 'boulder')를 아담하고 동그란 자갈돌 비례로 정규화
 * - createRiverPebbleGeometry의 halfExtents = scale * 0.25 불변식과 1:1 일치하도록 meshScale=[1,1,1] 사용
 */
export const ROUND_PEBBLE_VISUAL_SCALES: Readonly<
  Record<StoneShape, { readonly x: number; readonly y: number; readonly z: number }>
> = {
  pebble: { x: 0.56, y: 0.40, z: 0.54 },
  round: { x: 0.64, y: 0.46, z: 0.62 },
  flat: { x: 0.68, y: 0.42, z: 0.66 },
  tall: { x: 0.60, y: 0.44, z: 0.58 },
  boulder: { x: 0.72, y: 0.50, z: 0.70 },
};

export function getRoundPebbleVisualScale(shape: StoneShape): {
  readonly x: number;
  readonly y: number;
  readonly z: number;
} {
  return ROUND_PEBBLE_VISUAL_SCALES[shape] ?? ROUND_PEBBLE_VISUAL_SCALES.round;
}

/**
 * v2.2 공중부양 방지 (Grounded 3D Node Resolver)
 * - 각 돌의 실제 (x, z) 위치 아래에 겹치는 하부 돌이 있는지 검사하여
 *   바닥(y = 0) 또는 하부 지지석 상단 표면(supportTopY)에 빈틈없이 밀착시킨다.
 */
export function resolveLocalSupportTopY(
  x: number,
  z: number,
  horizontalRadius: number,
  groundedNodes: readonly StoneRenderNode[]
): number {
  let supportTopY = 0;
  for (const prev of groundedNodes) {
    const prevScale = getRoundPebbleVisualScale(prev.geometry.shape);
    const prevHx = prevScale.x * 0.25;
    const prevHy = prevScale.y * 0.25;
    const prevHz = prevScale.z * 0.25;
    const prevRadius = Math.max(prevHx, prevHz);
    const distXZ = Math.hypot(x - prev.position.x, z - prev.position.z);
    if (distXZ <= (horizontalRadius + prevRadius) * 0.88) {
      const candidateTopY = prev.position.y + prevHy;
      if (candidateTopY > supportTopY) {
        supportTopY = candidateTopY;
      }
    }
  }
  return Number(supportTopY.toFixed(4));
}

export function resolveGrounded3DNodes(
  rawNodes: readonly StoneRenderNode[]
): StoneRenderNode[] {
  const grounded: StoneRenderNode[] = [];
  for (const node of rawNodes) {
    const vScale = getRoundPebbleVisualScale(node.geometry.shape);
    const hx = vScale.x * 0.25;
    const hy = vScale.y * 0.25;
    const hz = vScale.z * 0.25;
    const radius = Math.max(hx, hz);
    const supportTopY = resolveLocalSupportTopY(
      node.position.x,
      node.position.z,
      radius,
      grounded
    );
    const groundedY = Number((supportTopY + hy).toFixed(4));
    grounded.push({
      ...node,
      geometry: {
        ...node.geometry,
        scale: vScale,
      },
      position: {
        x: node.position.x,
        y: groundedY,
        z: node.position.z,
      },
    });
  }
  return grounded;
}

export type TowerArchStyle = 'cairn' | 'pebble' | 'gem';

export interface StoneTowerCanvasProps {
  readonly stones: readonly (TowerStoneItem | Stone)[];
  readonly collapsedShake?: boolean;
  readonly onSelectStone?: (stoneId: WishId) => void;
  readonly defaultStyle?: TowerArchStyle;
  readonly showControls?: boolean;
  readonly trajectory?: readonly SimulationFrame[];
  readonly phase?: StackPlacementPhase;
  readonly droppedStone?: Stone | null;
  readonly onPlaybackComplete?: () => void;
  readonly onCollapseAnimationComplete?: () => void;
  readonly renderMode?: '3d' | '2d' | 'auto';
  readonly enableOrbitControls?: boolean;
  readonly cameraPreset?: CameraPresetType;
  readonly onCameraPresetChange?: (preset: CameraPresetType) => void;
  readonly towerTopY?: number;
  readonly enablePan?: boolean;
  readonly enableZoom?: boolean;
  readonly selectedStoneId?: WishId | null;
  readonly focusedStoneId?: WishId | null;
  readonly hoveredStoneId?: string | null;
  readonly onHoverStone?: (stoneId: string | null) => void;
  readonly hoveringPreviewStone?: {
    shape: StoneShape;
    color: string;
    offset: { x: number; y?: number; z: number };
  } | null;
  readonly activeStone?: TowerStoneItem | Stone | null;
  readonly isDraggable?: boolean;
  readonly onStoneDragStart?: () => void;
  readonly onStoneDragMove?: (result: DragWorldPositionResult) => void;
  readonly onStoneDrop?: (dropPose: Pose) => void;
  readonly onStoneDragCancel?: () => void;
  readonly enableRecenterButton?: boolean;
  readonly onRecenter?: () => void;
}

function normalizeTowerStoneItems(
  stones: readonly (TowerStoneItem | Stone)[]
): TowerStoneItem[] {
  return stones.map((item, index) => {
    if ('stone' in item && item.stone instanceof Stone) {
      return item as TowerStoneItem;
    }
    const stone = item as Stone;
    const customId = (stone as unknown as { id?: string }).id ?? `stone-${index}`;
    return {
      id: customId,
      stone,
      status: 'active',
      bloom: null,
      cheerLevel: 0,
      isMine: false,
      nickname: null,
    };
  });
}

function isWebGLAvailable(): boolean {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return false;
    }
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

/**
 * 돌 모양(shape) 기본 프로필 (알약/캡슐 방지를 위한 비대칭 체적 스펙)
 * - 상단: 큰 완만한 능선 곡률 (rTL/rTR 40~56px)
 * - 하단: 넙적하고 안정된 기초 평면 곡률 (rBL/rBR 16~24px)
 */
interface StoneGeometryProfile {
  baseWidth: number;
  baseHeight: number;
  rTL: number;
  rTR: number;
  rBR: number;
  rBL: number;
}

const SHAPE_BASE_PROFILES: Record<StoneShape, StoneGeometryProfile> = {
  flat: { baseWidth: 84, baseHeight: 34, rTL: 22, rTR: 20, rBR: 14, rBL: 15 },
  round: { baseWidth: 78, baseHeight: 38, rTL: 24, rTR: 24, rBR: 16, rBL: 16 },
  tall: { baseWidth: 74, baseHeight: 36, rTL: 22, rTR: 22, rBR: 16, rBL: 16 },
  pebble: { baseWidth: 64, baseHeight: 32, rTL: 18, rTR: 20, rBR: 14, rBL: 14 },
  boulder: { baseWidth: 88, baseHeight: 40, rTL: 26, rTR: 22, rBR: 16, rBL: 16 },
};

function pseudoHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

interface StoneTier {
  tierIndex: number;
  stones: StoneRenderNode[];
}

function organizeTowerTiers(
  nodes: StoneRenderNode[],
  style: TowerArchStyle
): StoneTier[] {
  if (nodes.length === 0) return [];

  if (style === 'pebble') {
    return nodes.map((node, i) => ({
      tierIndex: i,
      stones: [node],
    }));
  }

  const n = nodes.length;
  let tierSizes: number[] = [];

  if (n === 1) tierSizes = [1];
  else if (n === 2) tierSizes = [2]; // 기초단에 2개의 돌이 나란히 안착
  else if (n === 3) tierSizes = [2, 1]; // 기초 2개 + 중심 1개 (삼각 적석 구조)
  else if (n === 4) tierSizes = [2, 1, 1];
  else if (n === 5) tierSizes = [2, 2, 1];
  else if (n === 6) tierSizes = [3, 2, 1];
  else if (n === 7) tierSizes = [3, 2, 1, 1];
  else {
    tierSizes = [3, 2, 2];
    let left = n - 7;
    while (left > 0) {
      tierSizes.push(Math.min(left, 2));
      left -= 2;
    }
    tierSizes.push(1);
  }

  const tiers: StoneTier[] = [];
  let offset = 0;
  for (let t = 0; t < tierSizes.length; t++) {
    if (offset >= nodes.length) break;
    const count = tierSizes[t];
    tiers.push({
      tierIndex: t,
      stones: nodes.slice(offset, offset + count),
    });
    offset += count;
  }
  while (offset < nodes.length) {
    tiers.push({
      tierIndex: tiers.length,
      stones: [nodes[offset++]],
    });
  }

  return tiers;
}

function StoneMesh3D({
  node,
  index,
  meshMapRef,
  onSelect,
  isSelected = false,
  isHovered = false,
  onHover,
}: {
  node: StoneRenderNode;
  index: number;
  meshMapRef: React.MutableRefObject<Map<string, THREE.Mesh>>;
  onSelect?: () => void;
  isSelected?: boolean;
  isHovered?: boolean;
  onHover?: (hovered: boolean) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    if (meshRef.current) {
      meshMapRef.current.set(node.id, meshRef.current);
      meshMapRef.current.set(`tower-stone-${index}`, meshRef.current);
    }
    return () => {
      meshMapRef.current.delete(node.id);
      meshMapRef.current.delete(`tower-stone-${index}`);
    };
  }, [node.id, index, meshMapRef]);

  const geo = node.geometry;
  const visualScale = getRoundPebbleVisualScale(geo.shape);
  const pebbleGeo = useMemo(
    () =>
      createRiverPebbleGeometry({
        shape: 'round',
        scale: visualScale,
        flattenedBase: true,
        seed: 42 + index * 17,
      }),
    [visualScale.x, visualScale.y, visualScale.z, index]
  );
  // Uses normalized ROUND_PEBBLE_VISUAL_SCALES (PEBBLE_VISUAL_SCALE_FACTOR compatible)
  const meshScale: [number, number, number] = [1, 1, 1];

  return (
    <mesh
      ref={meshRef}
      position={[node.position.x, node.position.y, node.position.z]}
      scale={meshScale}
      castShadow
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover?.(true);
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        onHover?.(false);
      }}
    >
      <primitive object={pebbleGeo} attach="geometry" />
      <meshStandardMaterial
        color={node.material.baseColor}
        roughness={isSelected ? 0.3 : node.material.roughness}
        metalness={isSelected ? 0.1 : node.material.metalness}
        emissive={isSelected ? '#0064FF' : node.material.emissiveColor}
        emissiveIntensity={isSelected ? 0.85 : node.material.emissiveIntensity}
        flatShading={geo.flatShading}
      />
      {isHovered && (
        <mesh scale={[1.08, 1.08, 1.08]} raycast={() => null}>
          <primitive object={pebbleGeo} attach="geometry" />
          <meshBasicMaterial
            color="#3182F6"
            wireframe
            transparent
            opacity={0.88}
          />
        </mesh>
      )}
    </mesh>
  );
}

function DroppedStoneMesh3D({
  stone,
  meshMapRef,
  initialPoseOverride,
}: {
  stone: Stone;
  meshMapRef: React.MutableRefObject<Map<string, THREE.Mesh>>;
  initialPoseOverride?: Pose;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    if (meshRef.current) {
      meshMapRef.current.set('dropped-stone', meshRef.current);
      const customId = (stone as unknown as { id?: string }).id;
      if (customId) {
        meshMapRef.current.set(customId, meshRef.current);
      }
    }
    return () => {
      meshMapRef.current.delete('dropped-stone');
      const customId = (stone as unknown as { id?: string }).id;
      if (customId) {
        meshMapRef.current.delete(customId);
      }
    };
  }, [stone, meshMapRef]);

  const geo = buildStoneGeometrySpec(stone.shape);
  const visualScale = getRoundPebbleVisualScale(stone.shape);
  const pebbleGeo = useMemo(
    () =>
      createRiverPebbleGeometry({
        shape: 'round',
        scale: visualScale,
        flattenedBase: true,
        seed: 77,
      }),
    [visualScale.x, visualScale.y, visualScale.z]
  );
  const meshScale: [number, number, number] = [1, 1, 1];

  const effectivePose = initialPoseOverride ?? stone.pose;

  return (
    <mesh
      ref={meshRef}
      position={[effectivePose.position.x, effectivePose.position.y, effectivePose.position.z]}
      quaternion={[
        effectivePose.rotation.qx,
        effectivePose.rotation.qy,
        effectivePose.rotation.qz,
        effectivePose.rotation.qw,
      ]}
      scale={meshScale}
      castShadow
      receiveShadow
    >
      <primitive object={pebbleGeo} attach="geometry" />
      <meshStandardMaterial
        color={stone.color}
        roughness={geo.roughness}
        metalness={geo.metalness}
        flatShading={geo.flatShading}
      />
    </mesh>
  );
}


function HoveringStonePreview3D({
  shape,
  color,
  offset,
  towerTopY,
}: {
  shape: StoneShape;
  color: string;
  offset: { x: number; y?: number; z: number };
  towerTopY: number;
}) {
  const meshRef = React.useRef<THREE.Mesh>(null);
  const geo = buildStoneGeometrySpec(shape);
  const visualScale = getRoundPebbleVisualScale(shape);
  const pebbleGeo = useMemo(
    () =>
      createRiverPebbleGeometry({
        shape: 'round',
        scale: visualScale,
        flattenedBase: true,
        seed: 99,
      }),
    [visualScale.x, visualScale.y, visualScale.z]
  );
  const meshScale: [number, number, number] = [1, 1, 1];

  const targetY = towerTopY;
  const hoverY = offset.y ?? targetY + 0.42;
  const isBalanced = Math.hypot(offset.x, offset.z) < 0.22;
  const auraColor = isBalanced ? '#3182F6' : '#FA5252';

  useFrame(({ clock }) => {
    if (meshRef.current) {
      const bob = Math.sin(clock.getElapsedTime() * 3.5) * 0.02;
      meshRef.current.position.set(offset.x, hoverY + bob, offset.z);
    }
  });

  return (
    <group>
      <mesh ref={meshRef} position={[offset.x, hoverY, offset.z]} scale={meshScale} castShadow>
        <primitive object={pebbleGeo} attach="geometry" />
        <meshStandardMaterial
          color={color}
          roughness={geo.roughness}
          metalness={geo.metalness}
          emissive={auraColor}
          emissiveIntensity={0.5}
          transparent
          opacity={0.92}
          flatShading={geo.flatShading}
        />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[offset.x, Math.max(0.01, targetY + 0.01), offset.z]}
      >
        <ringGeometry args={[0.07, 0.16, 24]} />
        <meshBasicMaterial
          color={auraColor}
          transparent
          opacity={0.8}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

export const KARESANSUI_RIPPLE_RADII = [
  3.2, 4.6, 6.2, 8.2, 10.6, 13.4, 16.8, 20.8, 25.2,
] as const;

export interface SteppingStoneConfig {
  readonly x: number;
  readonly z: number;
  readonly scaleX: number;
  readonly scaleZ: number;
  readonly rotY: number;
  readonly color: string;
}

export const STEPPING_STONES: readonly SteppingStoneConfig[] = [
  { x: 2.8, z: 2.2, scaleX: 1.1, scaleZ: 0.9, rotY: 0.4, color: '#2B3240' },
  { x: 3.8, z: 3.2, scaleX: 0.95, scaleZ: 1.15, rotY: 1.1, color: '#232834' },
  { x: 4.6, z: 4.5, scaleX: 1.2, scaleZ: 1.0, rotY: 0.2, color: '#32394A' },
  { x: -2.6, z: 2.5, scaleX: 1.05, scaleZ: 0.88, rotY: -0.6, color: '#282E3C' },
  { x: -3.5, z: 3.8, scaleX: 0.9, scaleZ: 1.1, rotY: -1.2, color: '#1F2430' },
  { x: -4.2, z: 5.2, scaleX: 1.15, scaleZ: 0.95, rotY: -0.3, color: '#2C3342' },
];

/**
 * 3D Ambient Dust/Firefly Particles (소원의 불빛 / 반딧불이)
 * Single InstancedMesh (24 instances) with gentle floating drift and sway motion
 */
export function ZenAmbientParticles({ count = 24 }: { count?: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const particles = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const radius = 2.5 + ((i * 7 + 3) % 13.5);
      const angle = (i / count) * Math.PI * 2 + (((i * 13) % 10) / 10 - 0.5) * 0.5;
      return {
        initialX: Math.cos(angle) * radius,
        initialZ: Math.sin(angle) * radius,
        baseY: 0.4 + ((i * 5) % 30) / 10,
        speedY: 0.15 + ((i * 3) % 20) / 100,
        swayRadius: 0.15 + ((i * 2) % 25) / 100,
        swayFreq: 0.8 + ((i * 4) % 12) / 10,
        phase: ((i * 11) % 628) / 100,
        scale: 0.7 + ((i * 6) % 60) / 100,
      };
    });
  }, [count]);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();

    for (let i = 0; i < count; i++) {
      const p = particles[i];
      const y = ((p.baseY + p.speedY * t) % 3.6) + 0.3;
      const x = p.initialX + Math.sin(t * p.swayFreq + p.phase) * p.swayRadius;
      const z = p.initialZ + Math.cos(t * p.swayFreq + p.phase) * p.swayRadius;

      dummy.position.set(x, y, z);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();

      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined as any, undefined as any, count]}
      frustumCulled={false}
    >
      <sphereGeometry args={[0.028, 8, 8]} />
      <meshBasicMaterial color="#94C4FF" transparent opacity={0.65} />
    </instancedMesh>
  );
}

export function InteractiveDraggableStone3D({
  stone,
  towerTopY,
  groundedNodes = [],
  isDraggable = true,
  controlsRef,
  onDragStart,
  onDragMove,
  onDrop,
  onDragCancel,
  phase,
}: {
  stone: Stone;
  towerTopY: number;
  groundedNodes?: readonly StoneRenderNode[];
  isDraggable?: boolean;
  controlsRef?: React.MutableRefObject<any>;
  onDragStart?: () => void;
  onDragMove?: (result: DragWorldPositionResult) => void;
  onDrop?: (dropPose: Pose) => void;
  onDragCancel?: () => void;
  phase?: StackPlacementPhase;
}) {
  const { camera } = useThree();
  const meshRef = React.useRef<THREE.Mesh>(null);
  const geo = buildStoneGeometrySpec(stone.shape);
  const visualScale = getRoundPebbleVisualScale(stone.shape);
  const pebbleGeo = useMemo(
    () =>
      createRiverPebbleGeometry({
        shape: 'round',
        scale: visualScale,
        flattenedBase: true,
        seed: 108,
      }),
    [visualScale.x, visualScale.y, visualScale.z]
  );
  const meshScale: [number, number, number] = [1, 1, 1];

  // Camera azimuth & look-at target tracking (v2.2: stone anchors to camera target & lifts strictly upward)
  const [cameraAzimuth, setCameraAzimuth] = useState(0);
  const [cameraTargetXZ, setCameraTargetXZ] = useState<readonly [number, number]>([0, 0]);
  const isDraggingRef = useRef(false);
  const dragAzimuthRef = useRef(0);
  const dragStartPosRef = useRef<readonly [number, number, number]>([0, 0.12, 0]);

  const visualHalfY = visualScale.y * 0.25;
  const visualRadius = Math.max(visualScale.x * 0.25, visualScale.z * 0.25);

  // spawnDist = 0 so the stone stays at the camera's ground target without forward offset
  const spawnDist = 0;
  const initialPos = useMemo<readonly [number, number, number]>(() => {
    const spawnX = Number((cameraTargetXZ[0] + Math.sin(cameraAzimuth) * spawnDist).toFixed(4));
    const spawnZ = Number((cameraTargetXZ[1] + Math.cos(cameraAzimuth) * spawnDist).toFixed(4));
    const localSupportY = resolveLocalSupportTopY(
      spawnX,
      spawnZ,
      visualRadius,
      groundedNodes
    );
    const spawnY = Number((localSupportY + visualHalfY).toFixed(4));
    return [spawnX, spawnY, spawnZ];
  }, [cameraAzimuth, cameraTargetXZ, visualRadius, visualHalfY, groundedNodes]);

  const [isDragging, setIsDragging] = useState(false);
  const [currentPos, setCurrentPos] = useState<readonly [number, number, number]>(initialPos);
  const [balanceRating, setBalanceRating] = useState<'stable' | 'caution' | 'critical'>('stable');
  const [isOverDropZone, setIsOverDropZone] = useState(false);

  const currentPosRef = useRef<readonly [number, number, number]>(initialPos);
  const startPointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const activePointerIdRef = useRef<number | null>(null);
  const activeCleanupRef = useRef<(() => void) | null>(null);

  // Unmount cleanup: guarantees window listeners are removed and controls re-enabled
  useEffect(() => {
    return () => {
      if (activeCleanupRef.current) {
        activeCleanupRef.current();
      }
      if (controlsRef?.current) {
        controlsRef.current.enabled = true;
      }
    };
  }, [controlsRef]);

  useEffect(() => {
    if (phase === 'IDLE') {
      if (activeCleanupRef.current) {
        activeCleanupRef.current();
      }
      if (controlsRef?.current) {
        controlsRef.current.enabled = true;
      }
      currentPosRef.current = initialPos;
      setCurrentPos(initialPos);
      setIsDragging(false);
      isDraggingRef.current = false;
      setBalanceRating('stable');
      setIsOverDropZone(false);
    }
  }, [phase, initialPos, stone, controlsRef]);

  // Update camera azimuth & panned target while idle
  useFrame(({ clock, camera }) => {
    if (!isDraggingRef.current && phase === 'IDLE') {
      const az = Math.atan2(camera.position.x, camera.position.z);
      if (Math.abs(az - cameraAzimuth) > 0.05) {
        setCameraAzimuth(az);
      }
      const ctrlTarget = controlsRef?.current?.target;
      if (ctrlTarget) {
        const tx = Number(ctrlTarget.x.toFixed(3));
        const tz = Number(ctrlTarget.z.toFixed(3));
        if (
          Math.abs(tx - cameraTargetXZ[0]) > 0.01 ||
          Math.abs(tz - cameraTargetXZ[1]) > 0.01
        ) {
          setCameraTargetXZ([tx, tz]);
        }
      }
    }

    if (!meshRef.current) return;
    if (!isDraggingRef.current) {
      const bob = Math.sin(clock.getElapsedTime() * 2.5) * 0.008;
      meshRef.current.position.set(
        initialPos[0],
        initialPos[1] + Math.max(0, bob),
        initialPos[2]
      );
    } else {
      meshRef.current.position.set(
        currentPosRef.current[0],
        currentPosRef.current[1],
        currentPosRef.current[2]
      );
    }
  });

  const auraColor =
    balanceRating === 'stable'
      ? '#3182F6'
      : balanceRating === 'caution'
      ? '#FFB300'
      : '#FF6B6B';

  const handlePointerDown = (e: any) => {
    if (!isDraggable || isDraggingRef.current) return;
    // Ignore right-click / middle-click so right-click always pans the camera freely (v2.2 #2)
    const btn = e.button ?? (e.nativeEvent as any)?.button;
    if (typeof btn === 'number' && btn !== 0) {
      return;
    }
    e.stopPropagation();

    isDraggingRef.current = true;
    setIsDragging(true);
    dragStartPosRef.current = initialPos;
    currentPosRef.current = initialPos;

    const activePointerId = e.pointerId ?? (e.nativeEvent as any)?.pointerId ?? 1;
    activePointerIdRef.current = activePointerId;

    if (
      typeof (e.target as any)?.setPointerCapture === 'function' &&
      typeof e.pointerId === 'number'
    ) {
      try {
        (e.target as any).setPointerCapture(e.pointerId);
      } catch {
        // Fallback for non-DOM synthetic events
      }
    }

    // Lock camera azimuth at drag start
    const ctrlTarget = controlsRef?.current?.target;
    const relCamX = camera.position.x - (ctrlTarget?.x ?? 0);
    const relCamZ = camera.position.z - (ctrlTarget?.z ?? 0);
    const startAz = Math.atan2(relCamX, relCamZ);
    dragAzimuthRef.current = startAz;

    if (controlsRef?.current) {
      controlsRef.current.enabled = false;
    }

    const clientX = e.clientX ?? (e.nativeEvent as any)?.clientX ?? 0;
    const clientY = e.clientY ?? (e.nativeEvent as any)?.clientY ?? 0;
    startPointerRef.current = { x: clientX, y: clientY };

    onDragStart?.();

    if (typeof window !== 'undefined') {
      const handleWindowPointerMove = (ev: PointerEvent) => {
        if (!isDraggingRef.current) return;
        if (
          activePointerIdRef.current !== null &&
          ev.pointerId !== activePointerIdRef.current
        ) {
          return;
        }

        const deltaX = ev.clientX - startPointerRef.current.x;
        const deltaY = ev.clientY - startPointerRef.current.y;

        // v2.2 #3: Lift stone strictly upward (and lateral left/right), ZERO forward movement!
        const theta = dragAzimuthRef.current;
        const dxWorld = deltaX * 0.003;
        const dyWorld = Math.max(0, -deltaY * 0.0035);

        const rightX = Math.cos(theta);
        const rightZ = -Math.sin(theta);

        // No forward radial drift: radialDist is 0
        const radialDist = 0;

        const x = Number(
          (dragStartPosRef.current[0] + Math.sin(theta) * radialDist + rightX * dxWorld).toFixed(4)
        );
        const z = Number(
          (dragStartPosRef.current[2] + Math.cos(theta) * radialDist + rightZ * dxWorld).toFixed(4)
        );
        const localSupportY = resolveLocalSupportTopY(
          x,
          z,
          visualRadius,
          groundedNodes
        );
        const minRestingY = Number((localSupportY + visualHalfY).toFixed(4));
        const y = Number(Math.max(minRestingY, dragStartPosRef.current[1] + dyWorld).toFixed(4));

        const targetDropY = localSupportY + visualHalfY + 0.18;
        const totalVerticalSpan = Math.max(0.15, targetDropY - minRestingY);
        const rawProgress = (y - minRestingY) / totalVerticalSpan;
        const normalizedProgress = Math.max(0, Math.min(1, rawProgress));

        const absLateral = Math.abs(dxWorld);
        const balance: 'stable' | 'caution' | 'critical' =
          absLateral <= BALANCE_THRESHOLD_STABLE
            ? 'stable'
            : absLateral <= BALANCE_THRESHOLD_CAUTION
            ? 'caution'
            : 'critical';

        const isOverZone = y >= minRestingY + 0.05;

        const result: DragWorldPositionResult = {
          position: [x, y, z] as const,
          normalizedProgress,
          isOverDropZone: isOverZone,
          balanceRating: balance,
        };

        currentPosRef.current = result.position;
        setCurrentPos(result.position);
        setBalanceRating(result.balanceRating);
        setIsOverDropZone(result.isOverDropZone);

        onDragMove?.(result);
      };

      const cleanupWindowListeners = () => {
        if (typeof window !== 'undefined') {
          window.removeEventListener('pointermove', handleWindowPointerMove);
          window.removeEventListener('pointerup', handleWindowPointerUp);
          window.removeEventListener('pointercancel', handleWindowPointerUp);
        }
        activeCleanupRef.current = null;
        activePointerIdRef.current = null;
      };

      const handleWindowPointerUp = (ev?: PointerEvent) => {
        if (!isDraggingRef.current) return;
        if (
          ev &&
          activePointerIdRef.current !== null &&
          ev.pointerId !== activePointerIdRef.current
        ) {
          return;
        }

        isDraggingRef.current = false;
        setIsDragging(false);

        if (controlsRef?.current) {
          controlsRef.current.enabled = true;
        }

        cleanupWindowListeners();

        const finalPos = currentPosRef.current;
        const stoneHalfY = StonePhysicsBodyFactory.getShapeConfig(stone.shape).halfExtents.y;
        const localSupportY = resolveLocalSupportTopY(
          finalPos[0],
          finalPos[2],
          visualRadius,
          groundedNodes
        );
        const liftedAmount = finalPos[1] - dragStartPosRef.current[1];
        const shouldDrop =
          liftedAmount >= 0.05 || shouldTriggerDrop(finalPos[1], localSupportY);

        if (shouldDrop) {
          const dropPose = new Pose({
            x: Number(finalPos[0].toFixed(4)),
            y: Number(Math.max(finalPos[1], localSupportY + stoneHalfY + 0.22).toFixed(4)),
            z: Number(finalPos[2].toFixed(4)),
          });
          onDrop?.(dropPose);
        } else {
          currentPosRef.current = initialPos;
          setCurrentPos(initialPos);
          setBalanceRating('stable');
          setIsOverDropZone(false);
          onDragCancel?.();
        }
      };

      activeCleanupRef.current = cleanupWindowListeners;

      window.addEventListener('pointermove', handleWindowPointerMove);
      window.addEventListener('pointerup', handleWindowPointerUp);
      window.addEventListener('pointercancel', handleWindowPointerUp);
    }
  };

  const currentLocalSupportY = resolveLocalSupportTopY(
    currentPos[0],
    currentPos[2],
    visualRadius,
    groundedNodes
  );

  return (
    <group>
      {/* 1. Spawn Pedestal Ring on Surface at initial position */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[initialPos[0], Math.max(0.01, initialPos[1] - visualHalfY + 0.005), initialPos[2]]}
      >
        <ringGeometry args={[0.14, 0.22, 32]} />
        <meshBasicMaterial
          color="#3182F6"
          transparent
          opacity={isDragging ? 0.2 : 0.55}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 2. Cairn Apex Sweet Spot Marker (Stationary Target Center on Top of Tower) */}
      {isDragging && (
        <group position={[initialPos[0], Math.max(0.012, currentLocalSupportY + 0.012), initialPos[2]]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.14, 0.20, 32]} />
            <meshBasicMaterial color="#3182F6" transparent opacity={0.35} side={THREE.DoubleSide} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.035, 16]} />
            <meshBasicMaterial color="#3182F6" transparent opacity={0.65} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}

      {/* 3. Real-Time Dynamic Drop Prediction Marker (Projected Landing Footprint) */}
      {(() => {
        if (!isDragging) return null;
        const isOverTowerSupport = currentLocalSupportY > 0.01;
        const projectedLandingY = Math.max(0.015, currentLocalSupportY + 0.015);
        const beamHeight = Math.max(0.02, currentPos[1] - projectedLandingY);
        const beamCenterY = projectedLandingY + beamHeight * 0.5;

        const landingAuraColor = !isOverTowerSupport
          ? '#5C7CFA' // Peaceful soft blue for ground
          : '#3182F6'; // Toss Blue for stone support

        return (
          <group>
            {/* Projected Landing Reticle Ring & Contact Shadow */}
            <group position={[currentPos[0], projectedLandingY, currentPos[2]]}>
              <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[0.20, 32]} />
                <meshBasicMaterial color="#000000" transparent opacity={0.38} side={THREE.DoubleSide} />
              </mesh>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
                <ringGeometry args={[0.12, 0.18, 32]} />
                <meshBasicMaterial color={landingAuraColor} transparent opacity={0.88} side={THREE.DoubleSide} />
              </mesh>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
                <circleGeometry args={[0.035, 16]} />
                <meshBasicMaterial color={landingAuraColor} transparent opacity={0.92} side={THREE.DoubleSide} />
              </mesh>
            </group>

            {/* Vertical Laser Drop Guide Beam */}
            {currentPos[1] > projectedLandingY + 0.04 && (
              <mesh position={[currentPos[0], beamCenterY, currentPos[2]]}>
                <cylinderGeometry args={[0.005, 0.005, beamHeight, 8]} />
                <meshBasicMaterial color={landingAuraColor} transparent opacity={0.55} />
              </mesh>
            )}
          </group>
        );
      })()}

      {/* 3D Draggable Stone Mesh */}
      <mesh
        ref={meshRef}
        position={[initialPos[0], initialPos[1], initialPos[2]]}
        scale={meshScale}
        castShadow
        onPointerDown={handlePointerDown}
      >
        <primitive object={pebbleGeo} attach="geometry" />
        <meshStandardMaterial
          color={stone.color}
          roughness={geo.roughness}
          metalness={geo.metalness}
          emissive={auraColor}
          emissiveIntensity={isDragging ? 0.65 : 0.35}
          flatShading={geo.flatShading}
        />
      </mesh>
    </group>
  );
}

function TrajectorySynchronizer({
  trajectory,
  meshMapRef,
  onPlaybackComplete,
  collapsedShake,
  phase,
}: {
  trajectory?: readonly SimulationFrame[];
  meshMapRef: React.MutableRefObject<Map<string, THREE.Mesh>>;
  onPlaybackComplete?: () => void;
  collapsedShake?: boolean;
  phase?: StackPlacementPhase;
}) {
  const playbackStartTimeRef = useRef<number | null>(null);
  const completedRef = useRef(false);
  const initialCameraPosRef = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    if (trajectory && trajectory.length > 0 && phase !== 'IDLE') {
      playbackStartTimeRef.current = performance.now();
      completedRef.current = false;
    } else {
      playbackStartTimeRef.current = null;
      completedRef.current = false;
    }
  }, [trajectory, phase]);

  useFrame(({ camera }) => {
    if (
      phase === 'IDLE' ||
      !trajectory ||
      trajectory.length === 0 ||
      completedRef.current
    ) {
      initialCameraPosRef.current = null;
      return;
    }
    if (playbackStartTimeRef.current === null) return;

    if (!initialCameraPosRef.current) {
      initialCameraPosRef.current = camera.position.clone();
    }

    const elapsed = (performance.now() - playbackStartTimeRef.current) / 1000;
    const result = interpolateTrajectoryFrame(trajectory, elapsed);

    // Imperative transform synchronization
    for (const [id, pose] of result.poses) {
      const mesh = meshMapRef.current.get(id);
      if (mesh) {
        mesh.position.set(pose.position.x, pose.position.y, pose.position.z);
        mesh.quaternion.set(
          pose.rotation.qx,
          pose.rotation.qy,
          pose.rotation.qz,
          pose.rotation.qw
        );
      }
    }

    // Camera shake during dynamic collapse with smooth decay
    if (collapsedShake && elapsed < 0.6) {
      const intensity = Math.max(0, (0.6 - elapsed) * 0.05);
      camera.position.x =
        initialCameraPosRef.current.x + (Math.random() - 0.5) * intensity;
      camera.position.y =
        initialCameraPosRef.current.y + (Math.random() - 0.5) * intensity;
    } else if (collapsedShake && initialCameraPosRef.current) {
      camera.position.lerp(initialCameraPosRef.current, 0.15);
    }

    if (result.isComplete) {
      completedRef.current = true;
      onPlaybackComplete?.();
    }
  });

  return null;
}

interface TowerCameraControllerProps {
  readonly preset?: CameraPresetType;
  readonly towerTopY?: number;
  readonly controlsRef?: React.MutableRefObject<any>;
  readonly focusedStoneNode?: StoneRenderNode | null;
  readonly onTargetOffsetChange?: (offsetXZ: number) => void;
  readonly onCameraPresetChange?: (preset: CameraPresetType) => void;
}

function TowerCameraController({
  preset,
  towerTopY,
  controlsRef,
  focusedStoneNode,
  onTargetOffsetChange,
  onCameraPresetChange,
}: TowerCameraControllerProps) {
  const { controls } = useThree() as any;
  const isTransitioningRef = useRef(false);
  const targetPosRef = useRef(new THREE.Vector3());
  const targetLookAtRef = useRef(new THREE.Vector3());
  const prevFocusedStoneIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!preset || preset === 'free') {
      isTransitioningRef.current = false;
      return;
    }

    const config = computePresetCameraView(preset, towerTopY);
    targetPosRef.current.set(config.position[0], config.position[1], config.position[2]);
    targetLookAtRef.current.set(config.target[0], config.target[1], config.target[2]);
    isTransitioningRef.current = true;
  }, [preset, towerTopY]);

  // Stone focus glide transition
  useEffect(() => {
    if (!focusedStoneNode) {
      prevFocusedStoneIdRef.current = null;
      return;
    }

    if (focusedStoneNode.id !== prevFocusedStoneIdRef.current) {
      prevFocusedStoneIdRef.current = focusedStoneNode.id;
      const stonePos = focusedStoneNode.position;
      const activeControls = controlsRef?.current || controls;
      const camPos = activeControls?.object?.position || undefined;

      const viewConfig = computeFocusCameraView(stonePos, camPos);
      targetPosRef.current.set(
        viewConfig.position[0],
        viewConfig.position[1],
        viewConfig.position[2]
      );
      targetLookAtRef.current.set(
        viewConfig.target[0],
        viewConfig.target[1],
        viewConfig.target[2]
      );
      isTransitioningRef.current = true;
    }
  }, [focusedStoneNode, controls, controlsRef]);

  useFrame((state, delta) => {
    const activeControls = controlsRef?.current || controls || (state as any).controls;

    // 1. Smooth Exponential Lerp Transition
    if (isTransitioningRef.current) {
      const step = 1 - Math.exp(-Math.min(delta, 0.1) * 6.0);
      const stepClamped = Math.max(0, Math.min(step, 1));

      state.camera.position.lerp(targetPosRef.current, stepClamped);

      if (activeControls && activeControls.target) {
        activeControls.target.lerp(targetLookAtRef.current, stepClamped);
        activeControls.update?.();
      } else {
        state.camera.lookAt(targetLookAtRef.current);
      }

      const distPos = state.camera.position.distanceTo(targetPosRef.current);
      const distTarget = activeControls?.target
        ? activeControls.target.distanceTo(targetLookAtRef.current)
        : 0;

      if (distPos < 0.005 && distTarget < 0.005) {
        state.camera.position.copy(targetPosRef.current);
        if (activeControls && activeControls.target) {
          activeControls.target.copy(targetLookAtRef.current);
          activeControls.update?.();
        } else {
          state.camera.lookAt(targetLookAtRef.current);
        }
        isTransitioningRef.current = false;
      }
    }

    // 2. Target Clamping & Ground Collision Clamping (Enforced Every Frame)
    if (activeControls && activeControls.target) {
      const tx = activeControls.target.x;
      const ty = activeControls.target.y;
      const tz = activeControls.target.z;

      const clamped = clampCameraTarget([tx, ty, tz], CAMERA_PAN_MAX_RADIUS, towerTopY);

      const deltaX = clamped[0] - tx;
      const deltaY = clamped[1] - ty;
      const deltaZ = clamped[2] - tz;

      if (Math.abs(deltaX) > 1e-4 || Math.abs(deltaY) > 1e-4 || Math.abs(deltaZ) > 1e-4) {
        state.camera.position.x += deltaX;
        state.camera.position.y += deltaY;
        state.camera.position.z += deltaZ;

        activeControls.target.set(clamped[0], clamped[1], clamped[2]);
        activeControls.update?.();
      }

      // Ground collision clamping for camera position
      if (state.camera.position.y < 0.25) {
        state.camera.position.y = 0.25;
      }

      // Lateral distance from origin for Recenter HUD button visibility
      const lateralDist = Math.hypot(activeControls.target.x, activeControls.target.z);
      onTargetOffsetChange?.(lateralDist);
    }
  });

  return null;
}

/**
 * 3D 돌탑 캔버스 컴포넌트 (`SCR-04`, `SCR-07`, `SCR-10`)
 * - 알약/캡슐 형태 완전 탈피: 상하 비대칭 자연석 윤곽 (능선 아치 + 바닥 평면)
 * - 기초단 2개 돌이 골짜기(Saddle)를 이루고 위 돌이 그 사이에 자연스럽게 얹히는 구조
 * - 돌탑 전체를 감싸는 다층 이끼 망토와 바위 틈새 들꽃(🌸, 🌼) 및 새싹(🌱)
 * - 컨트롤 토글 옵션(`showControls`) 지원
 */
export function StoneTowerCanvas({
  stones,
  collapsedShake = false,
  onSelectStone,
  defaultStyle = 'cairn',
  showControls = true,
  trajectory,
  phase,
  droppedStone,
  onPlaybackComplete,
  onCollapseAnimationComplete,
  renderMode = 'auto',
  enableOrbitControls = false,
  cameraPreset,
  onCameraPresetChange,
  towerTopY,
  enablePan = true,
  enableZoom = true,
  selectedStoneId,
  focusedStoneId,
  hoveredStoneId,
  onHoverStone,
  hoveringPreviewStone,
  activeStone,
  isDraggable = true,
  onStoneDragStart,
  onStoneDragMove,
  onStoneDrop,
  onStoneDragCancel,
  enableRecenterButton = true,
  onRecenter,
}: StoneTowerCanvasProps) {
  const normalizedStones = useMemo(() => normalizeTowerStoneItems(stones), [stones]);
  const rawNodes = useMemo(() => buildTowerSceneGraph(normalizedStones), [normalizedStones]);
  const nodes = useMemo(() => resolveGrounded3DNodes(rawNodes), [rawNodes]);
  const groundedDroppedStone = useMemo(() => {
    if (!droppedStone) return null;
    const hasActiveTrajectory = Boolean(
      trajectory &&
        trajectory.length > 0 &&
        phase !== 'IDLE' &&
        phase !== 'FALLEN_CHOICE' &&
        phase !== 'SETTLED'
    );
    if (hasActiveTrajectory) {
      return droppedStone;
    }
    const vScale = getRoundPebbleVisualScale(droppedStone.shape);
    const radius = Math.max(vScale.x * 0.25, vScale.z * 0.25);
    const supportTopY = resolveLocalSupportTopY(
      droppedStone.pose.position.x,
      droppedStone.pose.position.z,
      radius,
      nodes
    );
    const groundedY = Number((supportTopY + vScale.y * 0.25).toFixed(4));
    return droppedStone.withPose(
      new Pose(
        {
          x: droppedStone.pose.position.x,
          y: groundedY,
          z: droppedStone.pose.position.z,
        },
        droppedStone.pose.rotation
      )
    );
  }, [droppedStone, trajectory, phase, nodes]);
  const [towerStyle, setTowerStyle] = useState<TowerArchStyle>(defaultStyle);
  const [selectedNode, setSelectedNode] = useState<StoneRenderNode | null>(null);
  const [randomSeed, setRandomSeed] = useState(42);
  const [lushMossEnabled, setLushMossEnabled] = useState(true);
  const meshMapRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const orbitControlsRef = useRef<any>(null);
  const hoverDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const [targetOffsetXZ, setTargetOffsetXZ] = useState(0);

  const showRecenterButton =
    (enableRecenterButton ?? true) && targetOffsetXZ >= RECENTER_TRIGGER_DISTANCE;

  const handleStoneHover = useCallback(
    (stoneId: string | null) => {
      if (hoverDebounceRef.current) {
        clearTimeout(hoverDebounceRef.current);
        hoverDebounceRef.current = null;
      }
      if (stoneId !== null) {
        onHoverStone?.(stoneId);
      } else {
        hoverDebounceRef.current = setTimeout(() => {
          onHoverStone?.(null);
        }, 45);
      }
    },
    [onHoverStone]
  );

  const activeStoneInstance = useMemo(() => {
    if (!activeStone) return null;
    if (activeStone instanceof Stone) return activeStone;
    if ('stone' in activeStone && (activeStone as any).stone instanceof Stone) {
      return (activeStone as any).stone as Stone;
    }
    return null;
  }, [activeStone]);

  const effectiveSelectedId = selectedStoneId !== undefined ? selectedStoneId : selectedNode?.id;
  const effectiveSelectedNode = useMemo(() => {
    if (effectiveSelectedId) {
      return nodes.find((n) => n.id === effectiveSelectedId) ?? null;
    }
    return null;
  }, [effectiveSelectedId, nodes]);

  const effectiveFocusedNode = useMemo(() => {
    if (focusedStoneId) {
      return nodes.find((n) => n.id === focusedStoneId) ?? null;
    }
    if (effectiveSelectedId) {
      return nodes.find((n) => n.id === effectiveSelectedId) ?? null;
    }
    return null;
  }, [focusedStoneId, effectiveSelectedId, nodes]);

  const webGLSupported = useMemo(() => isWebGLAvailable(), []);
  const use3D =
    renderMode === '3d' || (renderMode !== '2d' && webGLSupported && Platform.OS === 'web');

  const tiers = organizeTowerTiers(nodes, towerStyle);

  const handleStonePress = (node: StoneRenderNode) => {
    setSelectedNode(node);
    onSelectStone?.(node.id);
  };

  const handleReroll = () => {
    setRandomSeed((prev) => (prev * 1664525 + 1013904223) % 100000);
  };

  // Trajectory playback fallback for 2D mode & headless test environments
  useEffect(() => {
    if (use3D || !trajectory || trajectory.length === 0) return;
    const startTime = performance.now();
    let animId: number;
    let timerId: NodeJS.Timeout;

    if (typeof requestAnimationFrame !== 'undefined') {
      const stepAnim = () => {
        const elapsed = (performance.now() - startTime) / 1000;
        const res = interpolateTrajectoryFrame(trajectory, elapsed);
        if (res.isComplete) {
          (onCollapseAnimationComplete ?? onPlaybackComplete)?.();
        } else {
          animId = requestAnimationFrame(stepAnim);
        }
      };
      animId = requestAnimationFrame(stepAnim);
    } else {
      timerId = setTimeout(() => {
        (onCollapseAnimationComplete ?? onPlaybackComplete)?.();
      }, 500);
    }

    return () => {
      if (typeof cancelAnimationFrame !== 'undefined' && animId) {
        cancelAnimationFrame(animId);
      }
      if (timerId) clearTimeout(timerId);
    };
  }, [use3D, trajectory, onPlaybackComplete, onCollapseAnimationComplete]);

  // IDLE 또는 FALLEN_CHOICE 상태 진입 시 또는 궤적이 없을 때 모든 3D 메쉬를 원래 위치 및 직립 회전으로 복구
  useEffect(() => {
    const hasTrajectory = Boolean(trajectory && trajectory.length > 0);
    if (
      phase === 'IDLE' ||
      phase === 'FALLEN_CHOICE' ||
      (!hasTrajectory && phase !== 'COLLAPSING')
    ) {
      resetTowerMeshTransforms(meshMapRef.current, nodes, groundedDroppedStone);
    }
  }, [phase, trajectory, nodes, groundedDroppedStone]);

  return (
    <View
      style={[
        styles.canvasContainer,
        collapsedShake && styles.collapsedShakeBorder,
      ]}
    >
      {/* 컨트롤 패널 (showControls = true 일 때만 표시) */}
      {showControls && (
        <View style={styles.controlsArea}>
          <View style={styles.styleSelector}>
            <Pressable
              style={[
                styles.styleChip,
                towerStyle === 'cairn' && styles.styleChipActive,
              ]}
              onPress={() => setTowerStyle('cairn')}
            >
              <Text
                style={[
                  styles.styleChipText,
                  towerStyle === 'cairn' && styles.styleChipTextActive,
                ]}
              >
                🏔️ 복합 적석탑
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.styleChip,
                towerStyle === 'pebble' && styles.styleChipActive,
              ]}
              onPress={() => setTowerStyle('pebble')}
            >
              <Text
                style={[
                  styles.styleChipText,
                  towerStyle === 'pebble' && styles.styleChipTextActive,
                ]}
              >
                ⛰️ 선 조약돌탑
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.styleChip,
                towerStyle === 'gem' && styles.styleChipActive,
              ]}
              onPress={() => setTowerStyle('gem')}
            >
              <Text
                style={[
                  styles.styleChipText,
                  towerStyle === 'gem' && styles.styleChipTextActive,
                ]}
              >
                💎 원석 보석탑
              </Text>
            </Pressable>
          </View>

          <View style={styles.subControlRow}>
            <Pressable style={styles.actionPill} onPress={handleReroll}>
              <Text style={styles.actionPillText}>🎲 모양 무작위 변형</Text>
            </Pressable>
            <Pressable
              style={[
                styles.actionPill,
                lushMossEnabled && styles.actionPillMossActive,
              ]}
              onPress={() => setLushMossEnabled((v) => !v)}
            >
              <Text
                style={[
                  styles.actionPillText,
                  lushMossEnabled && styles.actionPillMossActiveText,
                ]}
              >
                {lushMossEnabled ? '🌿 이끼·꽃: 켬' : '🌿 이끼·꽃: 끔'}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {use3D ? (
        <View
          style={[styles.threeCanvasWrapper, { touchAction: 'none', userSelect: 'none' } as any]}
          {...({ onContextMenu: (e: any) => e?.preventDefault?.() } as any)}
        >
          <Canvas
            shadows
            camera={{ position: [0, 1.8, 3.8], fov: 45 }}
            style={{ width: '100%', height: '100%', touchAction: 'none', userSelect: 'none' }}
          >
            {/* Atmospheric Background & Exponential Fog */}
            <color attach="background" args={['#0F121A']} />
            <fogExp2 attach="fog" args={['#0F121A', 0.032]} />

            {/* Lighting Rig */}
            <ambientLight intensity={0.70} />
            <directionalLight
              position={[3.5, 6.0, 4.0]}
              intensity={1.35}
              castShadow
            />
            {/* Silhouette Rim Back-Light for Dark Mode Contrast */}
            <directionalLight
              position={[0, 4.0, -4.5]}
              intensity={0.95}
              color="#94B8FF"
            />
            {/* Warm Fill Light */}
            <directionalLight
              position={[-3.5, 2.5, 2.0]}
              intensity={0.55}
              color="#F5EFE6"
            />
            <hemisphereLight args={['#F0EDE6', '#2A2E38', 0.55]} />

            {/* Wide Zen Garden Ground Disc (R=28m) */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.012, 0]} receiveShadow>
              <circleGeometry args={[ZEN_GARDEN_RADIUS, 64]} />
              <meshStandardMaterial color="#161922" roughness={0.94} metalness={0.03} />
            </mesh>

            {/* Karesansui Concentric Sand Ripple Rings */}
            {KARESANSUI_RIPPLE_RADII.map((radius, idx) => (
              <mesh
                key={`sand-ripple-${idx}`}
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, -0.008, 0]}
              >
                <ringGeometry args={[radius - 0.06, radius + 0.06, 64]} />
                <meshBasicMaterial color="#262C3A" opacity={0.35} transparent />
              </mesh>
            ))}

            {/* Natural Stepping Stones (디딤돌) */}
            {STEPPING_STONES.map((stone, idx) => (
              <mesh
                key={`stepping-stone-${idx}`}
                position={[stone.x, 0.015, stone.z]}
                rotation={[0, stone.rotY, 0]}
                scale={[stone.scaleX, 0.03, stone.scaleZ]}
                receiveShadow
              >
                <cylinderGeometry args={[0.35, 0.42, 1, 16]} />
                <meshStandardMaterial color={stone.color} roughness={0.85} metalness={0.05} />
              </mesh>
            ))}

            {/* Circular Ground Pedestal Platform (Dark Mode Stone Contrast) */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]} receiveShadow>
              <circleGeometry args={[2.0, 64]} />
              <meshStandardMaterial color="#1C1F26" roughness={0.88} metalness={0.08} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.004, 0]}>
              <ringGeometry args={[1.96, 2.04, 64]} />
              <meshBasicMaterial color="#2B3240" opacity={0.65} transparent />
            </mesh>

            {/* Ambient Floating Particles (Count 24) */}
            <ZenAmbientParticles count={24} />

            {enableOrbitControls && (
              <OrbitControls
                ref={orbitControlsRef}
                makeDefault
                enableDamping
                dampingFactor={0.08}
                minDistance={CAMERA_MIN_DISTANCE}
                maxDistance={CAMERA_MAX_DISTANCE}
                maxPolarAngle={Math.PI * 0.49}
                minPolarAngle={0.05}
                enablePan={enablePan ?? true}
                screenSpacePanning={true}
                enableZoom={enableZoom ?? true}
                mouseButtons={{
                  LEFT: THREE.MOUSE.ROTATE,
                  MIDDLE: THREE.MOUSE.DOLLY,
                  RIGHT: THREE.MOUSE.PAN,
                }}
                touches={{
                  ONE: THREE.TOUCH.ROTATE,
                  TWO: THREE.TOUCH.DOLLY_PAN,
                }}
                onStart={() => onCameraPresetChange?.('free')}
              />
            )}

            <TowerCameraController
              preset={cameraPreset}
              towerTopY={towerTopY}
              controlsRef={orbitControlsRef}
              focusedStoneNode={effectiveFocusedNode}
              onTargetOffsetChange={setTargetOffsetXZ}
              onCameraPresetChange={onCameraPresetChange}
            />

            {/* Expanded Ground Shadow Plane (12m x 12m) */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
              <planeGeometry args={[12, 12]} />
              <shadowMaterial opacity={0.28} />
            </mesh>

            {nodes.map((node, index) => (
              <StoneMesh3D
                key={node.id}
                node={node}
                index={index}
                meshMapRef={meshMapRef}
                isSelected={node.id === effectiveSelectedId}
                isHovered={node.id === hoveredStoneId}
                onHover={(hovered) => handleStoneHover(hovered ? node.id : null)}
                onSelect={() => handleStonePress(node)}
              />
            ))}

            {activeStoneInstance && !droppedStone && (phase === 'IDLE' || phase === 'PLACING' || !phase) && (
              <InteractiveDraggableStone3D
                stone={activeStoneInstance}
                towerTopY={towerTopY ?? 0.8}
                groundedNodes={nodes}
                isDraggable={isDraggable}
                controlsRef={orbitControlsRef}
                onDragStart={onStoneDragStart}
                onDragMove={onStoneDragMove}
                onDrop={onStoneDrop}
                onDragCancel={onStoneDragCancel}
                phase={phase}
              />
            )}

            {hoveringPreviewStone && (
              <HoveringStonePreview3D
                shape={hoveringPreviewStone.shape}
                color={hoveringPreviewStone.color}
                offset={hoveringPreviewStone.offset}
                towerTopY={towerTopY ?? 0.8}
              />
            )}

            {groundedDroppedStone && (
              <DroppedStoneMesh3D
                stone={groundedDroppedStone}
                meshMapRef={meshMapRef}
                initialPoseOverride={
                  (groundedDroppedStone.pose.position.x === 0 &&
                    groundedDroppedStone.pose.position.y === 0 &&
                    groundedDroppedStone.pose.position.z === 0 &&
                    trajectory?.[0]?.poses.get('dropped-stone')) ||
                  undefined
                }
              />
            )}

            <TrajectorySynchronizer
              trajectory={trajectory}
              meshMapRef={meshMapRef}
              onPlaybackComplete={onCollapseAnimationComplete ?? onPlaybackComplete}
              collapsedShake={collapsedShake}
              phase={phase}
            />
          </Canvas>

          {/* Floating "🎯 돌탑으로 복귀" Recenter Button */}
          {showRecenterButton && (
            <View style={styles.recenterButtonWrapper} pointerEvents="box-none">
              <Pressable
                style={({ pressed }) => [
                  styles.recenterButton,
                  pressed && styles.recenterButtonPressed,
                ]}
                onPress={() => {
                  onCameraPresetChange?.('front');
                  onRecenter?.();
                }}
                accessibilityRole="button"
                accessibilityLabel="돌탑으로 복귀"
              >
                <Text style={styles.recenterButtonText}>🎯 돌탑으로 복귀</Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : nodes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyPebbleVisual}>
            <View style={styles.emptyStoneShape} />
            <View style={styles.groundShadow} />
          </View>
          <Text style={styles.emptyTitle}>아직 쌓인 돌이 없습니다</Text>
          <Text style={styles.emptySubtext}>
            첫 번째 소원을 담아 돌탑의 주춧돌을 놓아보세요
          </Text>
        </View>
      ) : (
        <View style={styles.towerStage}>
          {/* 상단 꼭대기 은은한 소원 파티클 */}
          <View style={styles.topSparkleContainer}>
            <Text style={styles.topSparkle}>✨</Text>
          </View>

          {/* 돌탑 적층 뷰포트 (바닥단부터 위로 column-reverse) */}
          <View style={styles.stackedTiersColumn}>
            {tiers.map((tier, tIdx) => {
              const isBaseTier = tIdx === 0;
              return (
                <View
                  key={`tier-${tier.tierIndex}`}
                  style={[
                    styles.tierRow,
                    tIdx > 0 && styles.tierOverlap,
                    { zIndex: tIdx + 10 },
                  ]}
                >
                  {tier.stones.map((node, sIdx) => {
                    const globalIdx = nodes.findIndex((n) => n.id === node.id);
                    const hash = pseudoHash(`${node.id}-${randomSeed}-${globalIdx}`);

                    const rawProfile =
                      SHAPE_BASE_PROFILES[node.geometry.shape] ??
                      SHAPE_BASE_PROFILES.round;

                    // 한 층에 돌이 2~3개 있을 때 폭/높이 비례 조정 (자연스러운 탑형 피라미드 비례)
                    const scaleFactor =
                      tier.stones.length === 1
                        ? 0.92
                        : tier.stones.length === 2
                        ? 0.62
                        : 0.48;

                    const widthJitter = 0.9 + (hash % 20) / 100;
                    const heightJitter = 0.9 + ((hash >> 2) % 20) / 100;

                    const width = Math.round(
                      rawProfile.baseWidth * scaleFactor * widthJitter
                    );
                    const height = Math.round(
                      rawProfile.baseHeight * scaleFactor * heightJitter
                    );

                    // ⭐️ [알약/캡슐 방지 핵심] 상하 비대칭 자연석 곡률
                    // 상단 모서리는 산 능선처럼 완만하고 큰 아치(20~30px)
                    // 하단 모서리는 바닥 평면(10~16px)
                    let rTL = rawProfile.rTL + (hash % 6 - 3);
                    let rTR = rawProfile.rTR + ((hash >> 2) % 6 - 3);
                    let rBR = rawProfile.rBR + ((hash >> 4) % 4 - 2);
                    let rBL = rawProfile.rBL + ((hash >> 6) % 4 - 2);

                    // 기초단에 2개의 돌이 나란히 놓일 때: 자연스러운 계곡(Saddle) 형성
                    if (isBaseTier && tier.stones.length === 2) {
                      if (sIdx === 0) {
                        // 좌측 돌: 왼쪽이 높고 오른쪽이 완만하게 내려감
                        rTL = 32;
                        rTR = 18;
                        rBR = 10;
                        rBL = 14;
                      } else {
                        // 우측 돌: 오른쪽이 높고 왼쪽이 완만하게 내려감
                        rTL = 18;
                        rTR = 32;
                        rBR = 14;
                        rBL = 10;
                      }
                    }

                    // 자연스러운 미세 틸트 각도
                    const tiltDegree = `${((hash >> 4) % 7) - 3}deg`;

                    const isSelected = node.id === effectiveSelectedId;

                    // 자연석 색상
                    let stoneColor = node.material.baseColor;
                    if (towerStyle === 'gem') {
                      const gemColors = ['#5E4A7D', '#7B5E99', '#4E6B66', '#8FA89B', '#486382'];
                      stoneColor = gemColors[globalIdx % gemColors.length];
                    } else if (towerStyle === 'pebble') {
                      const pebbleColors = ['#D1D5DB', '#A8B0BC', '#717A8A', '#949DAA', '#E5E7EB'];
                      stoneColor = pebbleColors[globalIdx % pebbleColors.length];
                    }

                    return (
                      <View
                        key={node.id}
                        style={[
                          styles.stoneWrapper,
                          tier.stones.length > 1 && styles.horizontalNestle,
                        ]}
                      >
                        {/* 소원 이뤄짐 데코레이션 */}
                        {node.decoration ? (
                          <View style={styles.bloomBadge}>
                            <Text style={styles.bloomEmoji}>
                              {node.decoration.emoji}
                            </Text>
                          </View>
                        ) : null}

                        {/* 실제 자연석 돌 컴포넌트 */}
                        <Pressable
                          style={({ pressed }) => [
                            styles.stonePebble,
                            {
                              width,
                              height,
                              borderTopLeftRadius: rTL,
                              borderTopRightRadius: rTR,
                              borderBottomRightRadius: rBR,
                              borderBottomLeftRadius: rBL,
                              backgroundColor: stoneColor,
                              transform: [
                                { rotate: tiltDegree },
                                { scale: pressed ? 0.96 : isSelected ? 1.06 : 1 },
                              ],
                            },
                            isSelected && styles.stoneSelectedHighlight,
                            node.material.outlineHighlighted &&
                              styles.myStoneHighlight,
                          ]}
                          onPress={() => handleStonePress(node)}
                        >
                          {/* 1. 상단 햇빛 반사 능선 하이라이트 */}
                          <View style={styles.stoneSurfaceHighlight} />

                          {/* 2. 석영 광물 선 (일부 돌에 자연스럽게 가로지름) */}
                          {globalIdx % 2 === 1 && (
                            <View style={styles.quartzVein} />
                          )}

                          {/* 3. 풍성한 이끼 & 산들꽃 전체 덮개 블랭킷 */}
                          {lushMossEnabled && (
                            <View style={styles.mossBlanketLayer}>
                              {/* 상단 능선을 따라 흘러내리는 다층 이끼 망토 */}
                              <View
                                style={[
                                  styles.mossMantle,
                                  {
                                    width: Math.round(width * 0.82),
                                    borderTopLeftRadius: rTL,
                                    borderTopRightRadius: rTR,
                                  },
                                ]}
                              >
                                <View style={styles.mossScallop1} />
                                <View style={styles.mossScallop2} />
                                <View style={styles.mossScallop3} />
                              </View>

                              {/* 틈새 꽃과 새싹 */}
                              {(globalIdx + sIdx) % 2 === 0 ? (
                                <Text style={styles.creviceFlower1}>🌸</Text>
                              ) : (
                                <Text style={styles.creviceSprout}>🌱</Text>
                              )}
                              {globalIdx % 3 === 0 && (
                                <Text style={styles.creviceFlower2}>🌼</Text>
                              )}
                            </View>
                          )}
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </View>

          {/* 바닥 지면 및 기초 디딤돌 그림자 */}
          <View style={styles.groundBase}>
            <View
              style={[
                styles.groundShadow,
                { width: tiers[0]?.stones.length > 1 ? 210 : 150 },
              ]}
            />
          </View>

          {/* 선택한 돌 정보 툴팁 */}
          {showControls && (
            effectiveSelectedNode ? (
              <View style={styles.infoPill}>
                <Text style={styles.infoPillText}>
                  {effectiveSelectedNode.nicknameLabel
                    ? `${effectiveSelectedNode.nicknameLabel}님의 소원 돌`
                    : '익명의 소원 돌'}
                  {effectiveSelectedNode.decoration
                    ? ` · ${effectiveSelectedNode.decoration.label}`
                    : ''}
                </Text>
              </View>
            ) : (
              <Text style={styles.guideHintText}>
                돌탑의 돌을 터치하여 소원을 살펴보세요
              </Text>
            )
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  canvasContainer: {
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 2,
  },
  collapsedShakeBorder: {
    borderWidth: 2,
    borderColor: '#FF6B6B',
    borderRadius: 16,
  },
  controlsArea: {
    alignItems: 'center',
    marginBottom: 8,
  },
  styleSelector: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  styleChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  styleChipActive: {
    backgroundColor: 'rgba(49, 130, 246, 0.18)',
    borderColor: '#3182F6',
  },
  styleChipText: {
    color: '#8B95A1',
    fontSize: 11,
    fontWeight: '600',
  },
  styleChipTextActive: {
    color: '#3182F6',
    fontWeight: '700',
  },
  subControlRow: {
    flexDirection: 'row',
    gap: 6,
  },
  actionPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  actionPillText: {
    color: '#A8AFBA',
    fontSize: 10,
    fontWeight: '600',
  },
  actionPillMossActive: {
    backgroundColor: 'rgba(46, 125, 50, 0.22)',
    borderColor: '#4CAF50',
  },
  actionPillMossActiveText: {
    color: '#81C784',
    fontWeight: '700',
  },
  towerStage: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 2,
  },
  topSparkleContainer: {
    marginBottom: 2,
  },
  topSparkle: {
    fontSize: 14,
    opacity: 0.9,
  },
  stackedTiersColumn: {
    flexDirection: 'column-reverse',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 6, // 자연스러운 접촉 간격 (돌끼리 겹침 및 파고듦 방지)
  },
  tierOverlap: {
    marginBottom: -2, // 상단 층이 아래 층에 자연스럽게 접촉 (과도한 관통 방지)
  },
  stoneWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  horizontalNestle: {
    marginHorizontal: 0, // 음수 마진 제거하여 돌끼리 겹치지 않음
  },
  stonePebble: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    // ⭐️ 3D 자연광 하이라이트 & 앰비언트 음영
    borderTopWidth: 3,
    borderTopColor: 'rgba(255, 255, 255, 0.45)',
    borderBottomWidth: 4,
    borderBottomColor: 'rgba(0, 0, 0, 0.45)',
    borderLeftWidth: 1.5,
    borderLeftColor: 'rgba(255, 255, 255, 0.15)',
    borderRightWidth: 1.5,
    borderRightColor: 'rgba(0, 0, 0, 0.3)',
    // 부드러운 자연 드리움 그림자
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 6,
    cursor: 'pointer' as any,
  },
  stoneSurfaceHighlight: {
    position: 'absolute',
    top: 3,
    left: 8,
    right: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  quartzVein: {
    position: 'absolute',
    top: 14,
    left: 6,
    width: '65%',
    height: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    transform: [{ rotate: '-12deg' }],
  },
  stoneSelectedHighlight: {
    borderColor: '#3182F6',
    borderWidth: 2,
  },
  myStoneHighlight: {
    borderColor: '#FFD43B',
    borderWidth: 2,
  },
  /* ============================================== */
  /* 풍성한 이끼 & 들꽃 전체 덮개 블랭킷             */
  /* ============================================== */
  mossBlanketLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  },
  mossMantle: {
    position: 'absolute',
    top: 0,
    left: '8%',
    height: 14,
    backgroundColor: '#2E7D32',
    opacity: 0.9,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 10,
  },
  mossScallop1: {
    position: 'absolute',
    bottom: -4,
    left: 6,
    width: 16,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#388E3C',
  },
  mossScallop2: {
    position: 'absolute',
    bottom: -6,
    left: 26,
    width: 22,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1B5E20',
  },
  mossScallop3: {
    position: 'absolute',
    bottom: -3,
    right: 8,
    width: 14,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#4CAF50',
  },
  creviceFlower1: {
    position: 'absolute',
    top: 2,
    right: 4,
    fontSize: 11,
    opacity: 0.95,
  },
  creviceFlower2: {
    position: 'absolute',
    bottom: 4,
    left: 6,
    fontSize: 9,
    opacity: 0.9,
  },
  creviceSprout: {
    position: 'absolute',
    top: 2,
    left: 4,
    fontSize: 11,
    opacity: 0.95,
  },
  bloomBadge: {
    position: 'absolute',
    top: -14,
    zIndex: 30,
  },
  bloomEmoji: {
    fontSize: 16,
  },
  groundBase: {
    alignItems: 'center',
    marginTop: 4,
  },
  groundShadow: {
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  infoPill: {
    marginTop: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  infoPillText: {
    color: '#E5E7EB',
    fontSize: 11,
    fontWeight: '600',
  },
  guideHintText: {
    color: '#6B7280',
    fontSize: 10,
    marginTop: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyPebbleVisual: {
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyStoneShape: {
    width: 110,
    height: 48,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 32,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 20,
    backgroundColor: '#2D323F',
    borderTopWidth: 2.5,
    borderTopColor: 'rgba(255, 255, 255, 0.15)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(0, 0, 0, 0.3)',
  },
  emptyTitle: {
    color: '#F3F4F6',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptySubtext: {
    color: '#8B95A1',
    fontSize: 12,
  },
  threeCanvasWrapper: {
    width: '100%',
    height: 320,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  threeCanvas: {
    width: '100%',
    height: '100%',
  },
  recenterButtonWrapper: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    zIndex: 50,
  },
  recenterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: 'rgba(24, 27, 34, 0.92)',
    borderWidth: 1,
    borderColor: '#3182F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  recenterButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.96 }],
  },
  recenterButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
});
