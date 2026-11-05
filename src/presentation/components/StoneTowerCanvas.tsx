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

export interface StoneTowerCanvasProps {
  readonly stones: readonly TowerStoneItem[];
  readonly collapsedShake?: boolean;
  readonly onSelectStone?: (stoneId: WishId) => void;
}

/**
 * 돌 모양(shape)별 유기적인 자연석(돌탑) 지오메트리 & 라운딩 스펙
 * - flat: 넙적한 디딤돌/받침돌
 * - round: 부드러운 둥근 몽돌
 * - tall: 높이 솟은 선돌
 * - pebble: 앙증맞은 조약돌
 * - boulder: 우직한 기초 암석
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
    width: 176,
    height: 44,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 20,
    borderBottomLeftRadius: 26,
  },
  round: {
    width: 142,
    height: 52,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 30,
    borderBottomRightRadius: 32,
    borderBottomLeftRadius: 38,
  },
  tall: {
    width: 100,
    height: 68,
    borderTopLeftRadius: 38,
    borderTopRightRadius: 34,
    borderBottomRightRadius: 26,
    borderBottomLeftRadius: 28,
  },
  pebble: {
    width: 86,
    height: 36,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 22,
  },
  boulder: {
    width: 198,
    height: 58,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 32,
    borderBottomRightRadius: 24,
    borderBottomLeftRadius: 26,
  },
};

/**
 * 3D 돌탑 캔버스 컴포넌트 (`SCR-04`, `SCR-07`, `SCR-10`)
 * - 텍스트 라벨 대신 실제 유기적인 조약돌·받침돌 형태학(Morphology)을 구현
 * - 자연스러운 태양광 하이라이트(상단) + 앰비언트 음영(하단) + 돌탑 층별 드리움 그림자
 * - 소원 이루어짐 꽃/새싹(🌸/🌱) 및 응원 단계별 은은한 오라 발광
 */
export function StoneTowerCanvas({
  stones,
  collapsedShake = false,
  onSelectStone,
}: StoneTowerCanvasProps) {
  const nodes = buildTowerSceneGraph(stones);
  const [selectedNode, setSelectedNode] = useState<StoneRenderNode | null>(null);

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

          {/* 물리적 돌탑: 바닥부터 위로 쌓이도록 column-reverse 배치 */}
          <View style={styles.stackedStonesColumn}>
            {nodes.map((node, index) => {
              const profile =
                SHAPE_PROFILES[node.geometry.shape] ?? SHAPE_PROFILES.round;
              const isSelected = selectedNode?.id === node.id;
              const hasGlow = node.material.emissiveIntensity > 0;

              // 자연스러운 균형감의 미세한 틸트 각도 (-2° ~ +2°)
              const tiltDegree = `${((index * 7 + 2) % 5) - 2}deg`;

              return (
                <View
                  key={node.id}
                  style={[
                    styles.stoneWrapper,
                    index > 0 && styles.stoneOverlap,
                    { zIndex: index + 10 },
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

                  {/* 실제 자연석 모양 돌 컴포넌트 (텍스트 라벨 없이 순수한 돌 형태) */}
                  <Pressable
                    style={({ pressed }) => [
                      styles.stonePebble,
                      {
                        width: profile.width,
                        height: profile.height,
                        borderTopLeftRadius: profile.borderTopLeftRadius,
                        borderTopRightRadius: profile.borderTopRightRadius,
                        borderBottomRightRadius: profile.borderBottomRightRadius,
                        borderBottomLeftRadius: profile.borderBottomLeftRadius,
                        backgroundColor: node.material.baseColor,
                        transform: [
                          { rotate: tiltDegree },
                          { scale: pressed ? 0.96 : isSelected ? 1.05 : 1 },
                        ],
                      },
                      hasGlow && {
                        shadowColor: '#FFD43B',
                        shadowOpacity: 0.7,
                        shadowRadius: 14,
                        elevation: 10,
                      },
                      isSelected && styles.stoneSelectedHighlight,
                      node.material.outlineHighlighted &&
                        styles.myStoneHighlight,
                    ]}
                    onPress={() => handleStonePress(node)}
                  >
                    {/* 돌 내부 은은한 표면 하이라이트 층 */}
                    <View style={styles.stoneSurfaceHighlight} />
                  </Pressable>
                </View>
              );
            })}
          </View>

          {/* 바닥 지면 및 기초 디딤돌 그림자 */}
          <View style={styles.groundBase}>
            <View style={styles.groundShadow} />
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
              돌을 터치하여 서로의 소원을 확인해 보세요
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
    paddingVertical: 8,
  },
  collapsedShakeBorder: {
    borderWidth: 2,
    borderColor: '#FF6B6B',
    borderRadius: 16,
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
  stackedStonesColumn: {
    flexDirection: 'column-reverse',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stoneWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  stoneOverlap: {
    marginTop: -10, // 돌들이 물리적으로 포개어지도록 음수 마진 적용
  },
  stonePebble: {
    alignItems: 'center',
    justifyContent: 'center',
    // 3D 조명 하이라이트 & 앰비언트 그림자
    borderTopWidth: 2.5,
    borderTopColor: 'rgba(255, 255, 255, 0.38)',
    borderBottomWidth: 3.5,
    borderBottomColor: 'rgba(0, 0, 0, 0.45)',
    borderLeftWidth: 1.5,
    borderLeftColor: 'rgba(255, 255, 255, 0.12)',
    borderRightWidth: 1.5,
    borderRightColor: 'rgba(0, 0, 0, 0.25)',
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
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  stoneSelectedHighlight: {
    borderColor: '#3182F6',
    borderWidth: 2,
  },
  myStoneHighlight: {
    borderColor: '#FFD43B',
    borderWidth: 2,
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
    width: 190,
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
    marginTop: 12,
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
