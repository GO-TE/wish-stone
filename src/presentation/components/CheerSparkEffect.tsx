import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type VisualEffectEvent } from '../../domain/ports/EffectBus.ts';
import { buildCheerSparkAnimationSpec } from './cheerSparkSpec.ts';

export * from './cheerSparkSpec.ts';

export interface CheerSparkEffectProps {
  readonly event: VisualEffectEvent | null;
  readonly towerTopY?: number;
}

/**
 * 응원 불꽃/반딧불 파티클 연출 컴포넌트 (`SCR-04`, `SCR-10`, DB-017)
 * 1) 🔥 버튼에서 불꽃 파티클이 튀고(0.5초)
 * 2) 작은 반딧불/연출용 돌이 돌탑 꼭대기로 날아가 안착하며(0.8초, DB 비저장 연출용, D-005)
 * 3) `levelUp` 시 단계 상승 빛 효과를 표시한다.
 */
export function CheerSparkEffect({
  event,
  towerTopY = 1.5,
}: CheerSparkEffectProps) {
  const spec = buildCheerSparkAnimationSpec(event, towerTopY);
  if (!spec.active) return null;

  return (
    <View style={styles.effectOverlay}>
      <Text style={styles.sparkTitle}>
        🔥 응원 반딧불 {spec.particles.length}개가 돌탑 꼭대기(Y=
        {spec.particles[0]?.target.y})로 날아갑니다!
      </Text>
      {spec.levelUp ? (
        <Text style={styles.levelUpBadge}>
          ✨ 응원 빛 {spec.level}단계 상승! (연출 {spec.sparkBurstDurationMs}ms +{' '}
          {spec.stoneFlightDurationMs}ms)
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  effectOverlay: {
    backgroundColor: '#2B2518',
    borderColor: '#FFD43B',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginVertical: 8,
    alignItems: 'center',
  },
  sparkTitle: {
    color: '#FFD43B',
    fontSize: 12,
    fontWeight: '700',
  },
  levelUpBadge: {
    color: '#FFE066',
    fontSize: 11,
    marginTop: 4,
  },
});
