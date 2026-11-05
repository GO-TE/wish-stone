import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type StoneShape } from '../../domain/entities/Stone.ts';
import { type TowerStoneItem } from '../../domain/entities/Tower.ts';
import { type WishId } from '../../domain/entities/Wish.ts';
import {
  buildTowerSceneGraph,
  type StoneRenderNode,
} from './stoneTowerSpec.ts';

export * from './stoneTowerSpec.ts';

export type TowerArchStyle = 'cairn' | 'pebble' | 'gem';

export interface StoneTowerCanvasProps {
  readonly stones: readonly TowerStoneItem[];
  readonly collapsedShake?: boolean;
  readonly onSelectStone?: (stoneId: WishId) => void;
  readonly defaultStyle?: TowerArchStyle;
}

/**
 * 돌 모양(shape) 및 탑 스타일에 따른 유기적인 자연석 지오메트리
 */
interface StoneGeometryProfile {
  width: number;
  height: number;
  borderTopLeftRadius: number;
  borderTopRightRadius: number;
  borderBottomRightRadius: number;
  borderBottomLeftRadius: number;
}

const SHAPE_PROFILES: Record<StoneShape, StoneGeometryProfile> = {
  flat: {
    width: 150,
    height: 40,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 22,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 24,
  },
  round: {
    width: 124,
    height: 50,
    borderTopLeftRadius: 34,
    borderTopRightRadius: 28,
    borderBottomRightRadius: 30,
    borderBottomLeftRadius: 36,
  },
  tall: {
    width: 88,
    height: 66,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 32,
    borderBottomRightRadius: 24,
    borderBottomLeftRadius: 26,
  },
  pebble: {
    width: 78,
    height: 34,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 22,
    borderBottomRightRadius: 16,
    borderBottomLeftRadius: 20,
  },
  boulder: {
    width: 170,
    height: 54,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 30,
    borderBottomRightRadius: 22,
    borderBottomLeftRadius: 24,
  },
};

/**
 * 돌 고유의 암석 텍스처 유형
 */
type RockTextureType = 'moss' | 'quartz_vein' | 'basalt_pores' | 'sediment' | 'crystal' | 'smooth';

function getRockTextureType(node: StoneRenderNode, index: number, style: TowerArchStyle): RockTextureType {
  if (style === 'gem') return 'crystal';
  if (style === 'pebble') return 'smooth';
  
  // cairn(적석) 모드에서는 돌마다 고유한 암석 디테일 부여
  const pattern = (index + node.geometry.segments) % 5;
  switch (pattern) {
    case 0: return 'moss';          // 초록 이끼가 낀 자연석
    case 1: return 'quartz_vein';   // 백색 석영 맥이 흐르는 화강암
    case 2: return 'basalt_pores';  // 미세 구멍이 있는 제주 현무암
    case 3: return 'sediment';      // 층상 퇴적 줄무늬
    default: return 'smooth';       // 매끄러운 강돌
  }
}

/**
 * 돌탑 스타일별 색상 보정
 */
function resolveStoneColor(baseColor: string, texture: RockTextureType, style: TowerArchStyle, index: number): string {
  if (style === 'gem') {
    const gemColors = ['#5E4A7D', '#7B5E99', '#4E6B66', '#8FA89B', '#486382'];
    return gemColors[index % gemColors.length];
  }
  if (style === 'pebble') {
    const pebbleColors = ['#D1D5DB', '#9CA3AF', '#6B7280', '#A3A3A3', '#E5E7EB'];
    return pebbleColors[index % pebbleColors.length];
  }
  if (texture === 'basalt_pores') return '#262930';
  if (texture === 'moss') return '#3E4947';
  if (texture === 'quartz_vein') return '#6E675F';
  if (texture === 'sediment') return '#8A735E';
  return baseColor || '#4B5563';
}

/**
 * 층(Tier) 단위 다석 적층 구조 모델
 * 한 층에 여러 개의 돌이 나란히 포개어질 수 있습니다.
 */
interface StoneTier {
  tierIndex: number;
  stones: StoneRenderNode[];
}

/**
 * 전통 적석 케언 알고리즘:
 * - 바닥단(기초)은 2~3개의 돌이 안정적인 주춧돌을 형성
 * - 중간단은 그 사이 골(Valley)에 1~2개의 돌이 안착
 * - 상단은 1개의 돌로 모아지며 균형을 이룸
 */
function organizeTowerTiers(nodes: StoneRenderNode[], style: TowerArchStyle): StoneTier[] {
  if (nodes.length === 0) return [];

  // 조약돌(Pebble/Zen) 모드: 1개씩 단독으로 아슬아슬하게 균형 잡는 1D 젠 타워
  if (style === 'pebble') {
    return nodes.map((node, i) => ({
      tierIndex: i,
      stones: [node],
    }));
  }

  // 전통 적석 돌탑(Cairn) 및 보석탑(Gem): 층마다 1~3개씩 복합 적층
  const n = nodes.length;
  let tierSizes: number[] = [];

  if (n === 1) tierSizes = [1];
  else if (n === 2) tierSizes = [2]; // 2개일 때: 나란히 2개의 기초 받침돌 형성
  else if (n === 3) tierSizes = [2, 1]; // 3개일 때: 기초 2개 + 위 1개 (삼각 적석 구조)
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

/**
 * 3D 돌탑 캔버스 컴포넌트 (`SCR-04`, `SCR-07`, `SCR-10`)
 * - 한 층에 1~3개의 돌이 안정적으로 나란히 포개어지는 전통 복합 적석 돌탑 구현
 * - 조약돌탑(Pebble), 적석탑(Cairn), 보석원석탑(Gem) 스타일 실시간 전환
 * - 이끼(Moss), 석영 맥(Quartz Vein), 현무암 기공(Pores), 층상 퇴적선(Sediment) 등 실감 텍스처 구현
 */
export function StoneTowerCanvas({
  stones,
  collapsedShake = false,
  onSelectStone,
  defaultStyle = 'cairn',
}: StoneTowerCanvasProps) {
  const nodes = buildTowerSceneGraph(stones);
  const [towerStyle, setTowerStyle] = useState<TowerArchStyle>(defaultStyle);
  const [selectedNode, setSelectedNode] = useState<StoneRenderNode | null>(null);

  const tiers = organizeTowerTiers(nodes, towerStyle);

  const handleStonePress = (node: StoneRenderNode) => {
    setSelectedNode(node);
    onSelectStone?.(node.id);
  };

  return (
    <View
      style={[
        styles.canvasContainer,
        collapsedShake && styles.collapsedShakeBorder,
      ]}
    >
      {/* 상단 돌탑 스타일 전환 토글 칩 */}
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
            🧘 선 조약돌탑
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

      {nodes.length === 0 ? (
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
          {/* 상단 꼭대기 빛 파티클 */}
          <View style={styles.topSparkleContainer}>
            <Text style={styles.topSparkle}>✨</Text>
          </View>

          {/* 물리적 돌탑: 바닥단부터 위로 쌓이도록 column-reverse 배치 */}
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
                    const texture = getRockTextureType(node, globalIdx, towerStyle);
                    const resolvedColor = resolveStoneColor(
                      node.material.baseColor,
                      texture,
                      towerStyle,
                      globalIdx
                    );
                    const rawProfile =
                      SHAPE_PROFILES[node.geometry.shape] ?? SHAPE_PROFILES.round;

                    // 한 층에 돌이 2~3개 있을 때 폭을 자연스럽게 조정
                    const scaleFactor =
                      tier.stones.length === 1
                        ? 1.0
                        : tier.stones.length === 2
                        ? 0.78
                        : 0.62;

                    const width = Math.round(rawProfile.width * scaleFactor);
                    const height = Math.round(rawProfile.height * scaleFactor);

                    const isSelected = selectedNode?.id === node.id;
                    const hasGlow = node.material.emissiveIntensity > 0;

                    // 자연스러운 비대칭 틸트
                    const tiltDegree = `${
                      ((globalIdx * 7 + sIdx * 5 + 3) % 7) - 3
                    }deg`;

                    return (
                      <View
                        key={node.id}
                        style={[
                          styles.stoneWrapper,
                          tier.stones.length > 1 && styles.horizontalNestle,
                        ]}
                      >
                        {/* 소원 이뤄짐 데코레이션 (꽃/새싹) */}
                        {node.decoration ? (
                          <View style={styles.bloomBadge}>
                            <Text style={styles.bloomEmoji}>
                              {node.decoration.emoji}
                            </Text>
                          </View>
                        ) : null}

                        {/* 실제 자연석 모양 돌 컴포넌트 */}
                        <Pressable
                          style={({ pressed }) => [
                            styles.stonePebble,
                            {
                              width,
                              height,
                              borderTopLeftRadius: rawProfile.borderTopLeftRadius,
                              borderTopRightRadius: rawProfile.borderTopRightRadius,
                              borderBottomRightRadius: rawProfile.borderBottomRightRadius,
                              borderBottomLeftRadius: rawProfile.borderBottomLeftRadius,
                              backgroundColor: resolvedColor,
                              transform: [
                                { rotate: tiltDegree },
                                { scale: pressed ? 0.96 : isSelected ? 1.06 : 1 },
                              ],
                            },
                            hasGlow && {
                              shadowColor: '#FFD43B',
                              shadowOpacity: 0.75,
                              shadowRadius: 16,
                              elevation: 10,
                            },
                            isSelected && styles.stoneSelectedHighlight,
                            node.material.outlineHighlighted &&
                              styles.myStoneHighlight,
                          ]}
                          onPress={() => handleStonePress(node)}
                        >
                          {/* 1. 상단 자연광 하이라이트 층 */}
                          <View style={styles.stoneSurfaceHighlight} />

                          {/* 2. 돌 특유의 질감 디테일 (이끼/석영맥/현무암기공/퇴적선/결정) */}
                          {texture === 'moss' && (
                            <View style={styles.mossCap}>
                              <View style={styles.mossDot1} />
                              <View style={styles.mossDot2} />
                            </View>
                          )}

                          {texture === 'quartz_vein' && (
                            <View style={styles.quartzStreak} />
                          )}

                          {texture === 'basalt_pores' && (
                            <View style={styles.basaltPoresCluster}>
                              <View style={styles.pore1} />
                              <View style={styles.pore2} />
                              <View style={styles.pore3} />
                            </View>
                          )}

                          {texture === 'sediment' && (
                            <View style={styles.sedimentBands} />
                          )}

                          {texture === 'crystal' && (
                            <View style={styles.crystalGleam} />
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
                { width: tiers[0]?.stones.length > 1 ? 240 : 190 },
              ]}
            />
          </View>

          {/* 선택한 돌 정보 툴팁 */}
          {selectedNode ? (
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
    paddingVertical: 4,
  },
  collapsedShakeBorder: {
    borderWidth: 2,
    borderColor: '#FF6B6B',
    borderRadius: 16,
  },
  styleSelector: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  styleChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
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
  towerStage: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 4,
  },
  topSparkleContainer: {
    marginBottom: 4,
  },
  topSparkle: {
    fontSize: 15,
    opacity: 0.9,
  },
  stackedTiersColumn: {
    flexDirection: 'column-reverse',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierOverlap: {
    marginTop: -10, // 층과 층 사이가 물리적으로 포개어지도록 음수 마진
  },
  stoneWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  horizontalNestle: {
    marginHorizontal: -5, // 한 층에 여러 돌이 있을 때 자연스럽게 기대어지는 음수 마진
  },
  stonePebble: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    // 3D 조명 하이라이트 & 앰비언트 그림자
    borderTopWidth: 2.5,
    borderTopColor: 'rgba(255, 255, 255, 0.42)',
    borderBottomWidth: 3.5,
    borderBottomColor: 'rgba(0, 0, 0, 0.48)',
    borderLeftWidth: 1.5,
    borderLeftColor: 'rgba(255, 255, 255, 0.15)',
    borderRightWidth: 1.5,
    borderRightColor: 'rgba(0, 0, 0, 0.3)',
    // 자연스러운 드리움 그림자
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
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  stoneSelectedHighlight: {
    borderColor: '#3182F6',
    borderWidth: 2,
  },
  myStoneHighlight: {
    borderColor: '#FFD43B',
    borderWidth: 2,
  },
  /* 텍스처 1: 이끼 패치 */
  mossCap: {
    position: 'absolute',
    top: -2,
    right: 8,
    flexDirection: 'row',
    gap: 2,
  },
  mossDot1: {
    width: 14,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#529642',
    opacity: 0.85,
  },
  mossDot2: {
    width: 9,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#68B04D',
    opacity: 0.75,
  },
  /* 텍스처 2: 백색 석영 맥 */
  quartzStreak: {
    position: 'absolute',
    top: 10,
    left: 8,
    width: '75%',
    height: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    transform: [{ rotate: '-14deg' }],
  },
  /* 텍스처 3: 현무암 기공 구멍들 */
  basaltPoresCluster: {
    position: 'absolute',
    top: 8,
    left: 12,
    flexDirection: 'row',
    gap: 5,
  },
  pore1: {
    width: 3.5,
    height: 3.5,
    borderRadius: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  pore2: {
    width: 2.5,
    height: 2.5,
    borderRadius: 1.5,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    marginTop: 6,
  },
  pore3: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    marginLeft: 8,
  },
  /* 텍스처 4: 퇴적암 줄무늬 */
  sedimentBands: {
    position: 'absolute',
    top: 14,
    left: 4,
    right: 4,
    height: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
  },
  /* 텍스처 5: 보석 결정 광채 */
  crystalGleam: {
    position: 'absolute',
    top: 5,
    left: '25%',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    transform: [{ rotate: '45deg' }, { scaleX: 0.5 }],
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
    marginTop: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
  infoPillText: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '600',
  },
  guideHintText: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 10,
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
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2D323F',
    borderTopWidth: 2,
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
});
