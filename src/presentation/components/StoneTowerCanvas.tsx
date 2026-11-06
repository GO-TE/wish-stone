import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Stone, type StoneShape } from '../../domain/entities/Stone.ts';
import { type TowerStoneItem } from '../../domain/entities/Tower.ts';
import { type WishId } from '../../domain/entities/Wish.ts';
import { type SimulationFrame } from '../../domain/ports/PhysicsWorld.ts';
import { Pose } from '../../domain/value-objects/Pose.ts';
import { type StackPlacementPhase } from '../controllers/StackStoneController.ts';
import {
  buildStoneGeometrySpec,
  buildTowerSceneGraph,
  interpolateTrajectoryFrame,
  resetTowerMeshTransforms,
  type StoneRenderNode,
} from './stoneTowerSpec.ts';

export * from './stoneTowerSpec.ts';

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
  flat: { baseWidth: 140, baseHeight: 46, rTL: 26, rTR: 22, rBR: 12, rBL: 14 },
  round: { baseWidth: 118, baseHeight: 52, rTL: 26, rTR: 26, rBR: 14, rBL: 16 },
  tall: { baseWidth: 88, baseHeight: 68, rTL: 28, rTR: 24, rBR: 14, rBL: 16 },
  pebble: { baseWidth: 80, baseHeight: 40, rTL: 20, rTR: 22, rBR: 12, rBL: 14 },
  boulder: { baseWidth: 152, baseHeight: 56, rTL: 30, rTR: 24, rBR: 14, rBL: 16 },
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
}: {
  node: StoneRenderNode;
  index: number;
  meshMapRef: React.MutableRefObject<Map<string, THREE.Mesh>>;
  onSelect?: () => void;
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
  const sx = geo.scale.x * 0.5;
  const sy = geo.scale.y * 0.5;
  const sz = geo.scale.z * 0.5;

  return (
    <mesh
      ref={meshRef}
      position={[node.position.x, node.position.y, node.position.z]}
      castShadow
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
    >
      {geo.shape === 'round' ? (
        <dodecahedronGeometry args={[sy * 1.1, 1]} />
      ) : geo.shape === 'flat' ? (
        <boxGeometry args={[sx, sy, sz]} />
      ) : geo.shape === 'tall' ? (
        <boxGeometry args={[sx, sy, sz]} />
      ) : geo.shape === 'pebble' ? (
        <dodecahedronGeometry args={[sy * 1.05, 1]} />
      ) : (
        <dodecahedronGeometry args={[sy * 1.2, 0]} />
      )}
      <meshStandardMaterial
        color={node.material.baseColor}
        roughness={node.material.roughness}
        metalness={node.material.metalness}
        emissive={node.material.emissiveColor}
        emissiveIntensity={node.material.emissiveIntensity}
        flatShading={geo.flatShading}
      />
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
  const sx = geo.scale.x * 0.5;
  const sy = geo.scale.y * 0.5;
  const sz = geo.scale.z * 0.5;

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
      castShadow
      receiveShadow
    >
      {geo.shape === 'round' ? (
        <dodecahedronGeometry args={[sy * 1.1, 1]} />
      ) : geo.shape === 'flat' ? (
        <boxGeometry args={[sx, sy, sz]} />
      ) : geo.shape === 'tall' ? (
        <boxGeometry args={[sx, sy, sz]} />
      ) : geo.shape === 'pebble' ? (
        <dodecahedronGeometry args={[sy * 1.05, 1]} />
      ) : (
        <dodecahedronGeometry args={[sy * 1.2, 0]} />
      )}
      <meshStandardMaterial
        color={stone.color}
        roughness={geo.roughness}
        metalness={geo.metalness}
        flatShading={geo.flatShading}
      />
    </mesh>
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
    if (!initialCameraPosRef.current) {
      initialCameraPosRef.current = camera.position.clone();
    }

    if (
      phase === 'IDLE' ||
      !trajectory ||
      trajectory.length === 0 ||
      completedRef.current
    ) {
      if (
        initialCameraPosRef.current &&
        camera.position.distanceTo(initialCameraPosRef.current) > 0.001
      ) {
        camera.position.lerp(initialCameraPosRef.current, 0.1);
      }
      return;
    }
    if (playbackStartTimeRef.current === null) return;

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
    } else if (initialCameraPosRef.current) {
      camera.position.lerp(initialCameraPosRef.current, 0.15);
    }

    if (result.isComplete) {
      completedRef.current = true;
      onPlaybackComplete?.();
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
}: StoneTowerCanvasProps) {
  const normalizedStones = useMemo(() => normalizeTowerStoneItems(stones), [stones]);
  const nodes = buildTowerSceneGraph(normalizedStones);
  const [towerStyle, setTowerStyle] = useState<TowerArchStyle>(defaultStyle);
  const [selectedNode, setSelectedNode] = useState<StoneRenderNode | null>(null);
  const [randomSeed, setRandomSeed] = useState(42);
  const [lushMossEnabled, setLushMossEnabled] = useState(true);
  const meshMapRef = useRef<Map<string, THREE.Mesh>>(new Map());

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
      resetTowerMeshTransforms(meshMapRef.current, nodes, droppedStone);
    }
  }, [phase, trajectory, nodes, droppedStone]);

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
        <View style={styles.threeCanvasWrapper}>
          <Canvas
            shadows
            camera={{ position: [0, 1.8, 3.8], fov: 45 }}
            style={styles.threeCanvas}
          >
            <ambientLight intensity={0.55} />
            <directionalLight
              position={[3.5, 6.0, 4.0]}
              intensity={1.15}
              castShadow
            />
            <hemisphereLight args={['#EAE4DC', '#1E2026', 0.4]} />

            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
              <planeGeometry args={[8, 8]} />
              <shadowMaterial opacity={0.28} />
            </mesh>

            {nodes.map((node, index) => (
              <StoneMesh3D
                key={node.id}
                node={node}
                index={index}
                meshMapRef={meshMapRef}
                onSelect={() => handleStonePress(node)}
              />
            ))}

            {droppedStone && (
              <DroppedStoneMesh3D
                stone={droppedStone}
                meshMapRef={meshMapRef}
                initialPoseOverride={
                  (droppedStone.pose.position.x === 0 &&
                    droppedStone.pose.position.y === 0 &&
                    droppedStone.pose.position.z === 0 &&
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

                    const isSelected = selectedNode?.id === node.id;

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
                                { scale: pressed ? 0.96 : isSelected ? 1.05 : 1 },
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
            selectedNode ? (
              <View style={styles.infoPill}>
                <Text style={styles.infoPillText}>
                  {selectedNode.nicknameLabel
                    ? `${selectedNode.nicknameLabel}님의 소원 돌`
                    : '익명의 소원 돌'}
                  {selectedNode.decoration
                    ? ` · ${selectedNode.decoration.label}`
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
  },
  threeCanvas: {
    width: '100%',
    height: '100%',
  },
});
