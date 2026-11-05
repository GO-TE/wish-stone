import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type TowerStoneItem } from '../../domain/entities/Tower.ts';
import { type WishId } from '../../domain/entities/Wish.ts';
import {
  buildNaturalLightingRig,
  buildTowerSceneGraph,
} from './stoneTowerSpec.ts';

export * from './stoneTowerSpec.ts';

export interface StoneTowerCanvasProps {
  readonly stones: readonly TowerStoneItem[];
  readonly collapsedShake?: boolean;
  readonly onSelectStone?: (stoneId: WishId) => void;
}

/**
 * 3D 돌탑 캔버스 컴포넌트 (`SCR-04`, `SCR-07`, `SCR-10`)
 * - 절차적 돌 지오메트리(`round`, `flat`, `pebble`, `tall`, `boulder`)와 거친 매트 셰이더 재질,
 *   응원 빛 단계(0~3) 발광 및 이루어짐 데코레이션(`flower`, `sprout`, `moss`)을 렌더링한다.
 */
export function StoneTowerCanvas({
  stones,
  collapsedShake = false,
  onSelectStone,
}: StoneTowerCanvasProps) {
  const nodes = buildTowerSceneGraph(stones);
  const lighting = buildNaturalLightingRig();

  return (
    <View
      style={[
        styles.canvasContainer,
        collapsedShake && styles.collapsedShakeBorder,
      ]}
    >
      <Text style={styles.lightingMeta}>
        ☀️ 조명 리그: Sun({lighting.directionalIntensity}) · Ambient(
        {lighting.ambientIntensity})
      </Text>

      <View style={styles.towerStackArea}>
        {nodes.length === 0 ? (
          <Text style={styles.emptyHint}>첫 번째 소원 돌을 올려보세요 🪨</Text>
        ) : (
          nodes.map((node) => (
            <Pressable
              key={node.id}
              style={[
                styles.stoneNode,
                {
                  backgroundColor: node.material.baseColor,
                  borderColor: node.material.outlineHighlighted
                    ? node.material.outlineColor
                    : '#2A2D34',
                  borderWidth: node.material.outlineHighlighted ? 2 : 1,
                },
              ]}
              onPress={() => onSelectStone?.(node.id)}
            >
              <Text style={styles.stoneLabel}>
                🪨 {node.geometry.shape}
                {node.decoration ? ` ${node.decoration.emoji}` : ''}
                {node.material.emissiveIntensity > 0
                  ? ` ✨(${node.material.emissiveIntensity})`
                  : ''}
              </Text>
              {node.nicknameLabel ? (
                <Text style={styles.nicknameBadge}>{node.nicknameLabel}</Text>
              ) : null}
            </Pressable>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvasContainer: {
    backgroundColor: '#181A20',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapsedShakeBorder: {
    borderWidth: 2,
    borderColor: '#FF6B6B',
  },
  lightingMeta: {
    color: '#6C6860',
    fontSize: 11,
    marginBottom: 8,
  },
  towerStackArea: {
    width: '100%',
    alignItems: 'center',
    gap: 6,
  },
  emptyHint: {
    color: '#A89F91',
    fontSize: 13,
    paddingVertical: 16,
  },
  stoneNode: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    minWidth: 140,
    alignItems: 'center',
  },
  stoneLabel: {
    color: '#191919',
    fontSize: 12,
    fontWeight: '700',
  },
  nicknameBadge: {
    color: '#191919',
    fontSize: 10,
    marginTop: 2,
  },
});
