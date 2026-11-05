import { type VisualEffectEvent } from '../../domain/ports/EffectBus.ts';
import { type CheerLevelValue } from '../../domain/value-objects/CheerLevel.ts';
import { type Vec3 } from '../../domain/value-objects/Pose.ts';

export interface FireflyParticleTrajectory {
  readonly id: string;
  readonly start: Vec3;
  readonly control: Vec3;
  readonly target: Vec3;
  readonly durationMs: number;
  readonly color: string;
  readonly size: number;
}

export interface CheerSparkAnimationSpec {
  readonly active: boolean;
  readonly wishId: string | null;
  readonly level: CheerLevelValue;
  readonly levelUp: boolean;
  readonly sparkBurstDurationMs: number;
  readonly stoneFlightDurationMs: number;
  readonly particles: readonly FireflyParticleTrajectory[];
}

const SPARK_COLORS: Record<CheerLevelValue, string> = {
  0: '#FFE066',
  1: '#FFE066',
  2: '#FFD43B',
  3: '#FF922B',
};

/**
 * 베지어 곡선(Quadratic Bezier) 위의 시간 비율 `t` (`0.0 ~ 1.0`) 좌표를 계산한다.
 * 응원 반딧불/연출용 돌이 카드에서 돌탑 꼭대기로 포물선을 그리며 날아가는 궤적에 사용된다 (화면 설계서 3장 DB-017).
 */
export function evaluateQuadraticBezier(
  start: Vec3,
  control: Vec3,
  target: Vec3,
  t: number
): Vec3 {
  const clamped = Math.max(0, Math.min(1, t));
  const inv = 1 - clamped;
  return {
    x: Number(
      (
        inv * inv * start.x +
        2 * inv * clamped * control.x +
        clamped * clamped * target.x
      ).toFixed(4)
    ),
    y: Number(
      (
        inv * inv * start.y +
        2 * inv * clamped * control.y +
        clamped * clamped * target.y
      ).toFixed(4)
    ),
    z: Number(
      (
        inv * inv * start.z +
        2 * inv * clamped * control.z +
        clamped * clamped * target.z
      ).toFixed(4)
    ),
  };
}

/**
 * `cheer_spark` 또는 `cheered` 이벤트로부터 돌탑 꼭대기(`towerTopY`)를 향해 날아가는
 * 반딧불/불꽃 파티클 궤적과 연출 타이밍(불꽃 500ms + 돌 비행 800ms, DB-017) 스펙을 생성한다.
 */
export function buildCheerSparkAnimationSpec(
  event: VisualEffectEvent | null,
  towerTopY = 1.5
): CheerSparkAnimationSpec {
  if (!event || (event.type !== 'cheer_spark' && event.type !== 'cheered')) {
    return {
      active: false,
      wishId: null,
      level: 0,
      levelUp: false,
      sparkBurstDurationMs: 500,
      stoneFlightDurationMs: 800,
      particles: [],
    };
  }

  const baseCount = event.levelUp ? 12 : 6;
  const color = SPARK_COLORS[event.level] ?? '#FFD43B';
  const target: Vec3 = { x: 0, y: Number((towerTopY + 0.25).toFixed(3)), z: 0 };

  const particles: FireflyParticleTrajectory[] = Array.from(
    { length: baseCount },
    (_, idx) => {
      const angle = (idx / baseCount) * Math.PI * 2;
      const spread = 0.35 + (idx % 3) * 0.12;
      const start: Vec3 = {
        x: Number((Math.cos(angle) * 0.15).toFixed(3)),
        y: -0.8,
        z: Number((Math.sin(angle) * 0.15).toFixed(3)),
      };
      const control: Vec3 = {
        x: Number((Math.cos(angle) * spread).toFixed(3)),
        y: Number(((start.y + target.y) * 0.5 + 0.9).toFixed(3)),
        z: Number((Math.sin(angle) * spread).toFixed(3)),
      };
      return {
        id: `spark-${event.wishId}-${idx}`,
        start,
        control,
        target,
        durationMs: 800 + (idx % 4) * 90,
        color,
        size: event.levelUp ? 6 : 4,
      };
    }
  );

  return {
    active: true,
    wishId: event.wishId,
    level: event.level,
    levelUp: event.levelUp,
    sparkBurstDurationMs: 500,
    stoneFlightDurationMs: 800,
    particles,
  };
}
