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
 * 돌 모양(shape) 기본 프로필
 */
interface StoneGeometryProfile {
  baseWidth: number;
  baseHeight: number;
  baseRadius: number;
}

const SHAPE_BASE_PROFILES: Record<StoneShape, StoneGeometryProfile> = {
  flat: { baseWidth: 154, baseHeight: 42, baseRadius: 24 },
  round: { baseWidth: 126, baseHeight: 52, baseRadius: 32 },
  tall: { baseWidth: 92, baseHeight: 68, baseRadius: 30 },
  pebble: { baseWidth: 80, baseHeight: 36, baseRadius: 18 },
  boulder: { baseWidth: 176, baseHeight: 56, baseRadius: 26 },
};

/**
 * 문자열 기반 의사 난수 해시 함수
 */
function pseudoHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * 층(Tier) 단위 다석 적층 구조 모델
 */
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
  else if (n === 2) tierSizes = [2];
  else if (n === 3) tierSizes = [2, 1];
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
 * - 한 층에 여러 돌이 포개어지는 복합 적석탑 / 젠 조약돌탑 / 원석탑
 * - [신규] '생김새 랜덤 변형(Re-roll)': 돌마다 고유한 무작위 유기적 곡면 및 버튼 클릭 시 실시간 외형 재편
 * - [신규] '이끼 & 꽃 전체 덮기 (Lush Moss & Wildflower Blanket)': 돌탑 전체를 자연의 푸른 이끼와 들꽃/새싹으로 포근하게 감싸는 연출
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

  // 생김새 랜덤 변형 시드 (클릭할 때마다 돌들의 외형·각도·라운딩이 무작위로 재배치)
  const [randomSeed, setRandomSeed] = useState(42);

  // 전체 이끼 & 들꽃 덮기 토글 (기본 활성화)
  const [lushMossEnabled, setLushMossEnabled] = useState(true);

  const tiers = organizeTowerTiers(nodes, towerStyle);

  const handleStonePress = (node: StoneRenderNode) => {
    setSelectedNode(node);
    onSelectStone?.(node.id);
  };

  const handleReroll = () => {
    setRandomSeed((prev) => (prev * 1664525 + 1013904223) % 100000);
  };

  return (
    <View
      style={[
        styles.canvasContainer,
        collapsedShake && styles.collapsedShakeBorder,
      ]}
    >
      {/* 컨트롤 패널 1: 돌탑 유형 전환 (적석탑 / 조약돌탑 / 보석탑) */}
      <View style={styles.topControlRow}>
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
      </View>

      {/* 컨트롤 패널 2: 생김새 랜덤 변형 & 이끼/꽃 덮기 토글 */}
      <View style={styles.subControlRow}>
        <Pressable style={styles.actionPill} onPress={handleReroll}>
          <Text style={styles.actionPillText}>🎲 돌 모양 무작위 변형</Text>
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
            {lushMossEnabled ? '🌿 이끼·꽃 덮기: 켬' : '🌿 이끼·꽃 덮기: 끔'}
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
          {/* 꼭대기 은은한 소원 파티클 */}
          <View style={styles.topSparkleContainer}>
            <Text style={styles.topSparkle}>✨</Text>
          </View>

          {/* 돌탑 적층 뷰포트 (바닥단부터 위로 column-reverse) */}
          <View style={styles.stackedTiersColumn}>
            {tiers.map((tier, tIdx) => {
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

                    // 1. 유기적인 랜덤 크기 변형 (폭·높이 ±18% 지터)
                    const widthJitter = 0.85 + (hash % 30) / 100;
                    const heightJitter = 0.85 + ((hash >> 3) % 30) / 100;

                    const scaleFactor =
                      tier.stones.length === 1
                        ? 1.0
                        : tier.stones.length === 2
                        ? 0.76
                        : 0.62;

                    const width = Math.round(
                      rawProfile.baseWidth * scaleFactor * widthJitter
                    );
                    const height = Math.round(
                      rawProfile.baseHeight * scaleFactor * heightJitter
                    );

                    // 2. 비대칭 랜덤 모서리 곡률 (각 모서리마다 독특한 조약돌 곡면 생성)
                    const rTL = 16 + (hash % 28);
                    const rTR = 14 + ((hash >> 2) % 28);
                    const rBR = 14 + ((hash >> 4) % 24);
                    const rBL = 16 + ((hash >> 6) % 26);

                    // 3. 미세한 랜덤 틸트 각도 (-4° ~ +4°)
                    const tiltDegree = `${((hash >> 5) % 9) - 4}deg`;

                    const isSelected = selectedNode?.id === node.id;
                    const hasGlow = node.material.emissiveIntensity > 0;

                    // 색상 결정 (보석/조약돌/자연석)
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

                        {/* 실제 자연석 모양 돌 컴포넌트 */}
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

                          {/* 2. [신규] 전체를 포근하게 덮는 풍성한 이끼 & 들꽃 블랭킷 */}
                          {lushMossEnabled && (
                            <View style={styles.mossBlanketLayer}>
                              {/* 상단 전면 이끼 망토 */}
                              <View
                                style={[
                                  styles.mossMantle,
                                  {
                                    width: Math.round(width * 0.85),
                                    borderTopLeftRadius: rTL,
                                    borderTopRightRadius: rTR,
                                  },
                                ]}
                              >
                                <View style={styles.mossLobe1} />
                                <View style={styles.mossLobe2} />
                                <View style={styles.mossLobe3} />
                              </View>

                              {/* 돌 틈새에 피어난 들꽃 & 새싹 디테일 */}
                              {(globalIdx + sIdx) % 2 === 0 ? (
                                <Text style={styles.creviceFlower}>🌸</Text>
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
                { width: tiers[0]?.stones.length > 1 ? 250 : 190 },
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
  topControlRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  styleSelector: {
    flexDirection: 'row',
    gap: 6,
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
  subControlRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  actionPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
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
    marginTop: -10,
  },
  stoneWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  horizontalNestle: {
    marginHorizontal: -5,
  },
  stonePebble: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    borderTopWidth: 2.5,
    borderTopColor: 'rgba(255, 255, 255, 0.42)',
    borderBottomWidth: 3.5,
    borderBottomColor: 'rgba(0, 0, 0, 0.48)',
    borderLeftWidth: 1.5,
    borderLeftColor: 'rgba(255, 255, 255, 0.15)',
    borderRightWidth: 1.5,
    borderRightColor: 'rgba(0, 0, 0, 0.3)',
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
  /* ============================================== */
  /* 풍성한 이끼 & 들꽃 전체 덮개 레이어            */
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
    height: 12,
    backgroundColor: '#38761D',
    opacity: 0.88,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 8,
  },
  mossLobe1: {
    position: 'absolute',
    bottom: -4,
    left: 6,
    width: 14,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#439A28',
  },
  mossLobe2: {
    position: 'absolute',
    bottom: -5,
    left: 24,
    width: 18,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2E7D32',
  },
  mossLobe3: {
    position: 'absolute',
    bottom: -3,
    right: 8,
    width: 12,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#68B04D',
  },
  creviceFlower: {
    position: 'absolute',
    top: 1,
    right: 4,
    fontSize: 10,
    opacity: 0.95,
  },
  creviceFlower2: {
    position: 'absolute',
    bottom: 3,
    left: 6,
    fontSize: 9,
    opacity: 0.9,
  },
  creviceSprout: {
    position: 'absolute',
    top: 1,
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
