import { type StoneShape } from '../../domain/entities/Stone.ts';
import { type Pose, type Vec3, type Quat } from '../../domain/value-objects/Pose.ts';
import {
  type CollapsedStonePose,
  type SimulationFrame,
  type DropResult,
  type PhysicsWorld,
} from '../../domain/ports/PhysicsWorld.ts';

export type { CollapsedStonePose, SimulationFrame, DropResult, PhysicsWorld };

/**
 * 돌 물리 바디 설정 규격 (CANNON.Body 생성 파라미터)
 * 근거: ORIGINAL_REQUEST R1, F01, StonePhysicsBodyFactory
 */
export interface PhysicsStoneBodyConfig {
  readonly shape: StoneShape;
  readonly mass: number;
  readonly halfExtents: Vec3;
  readonly linearDamping: number;
  readonly angularDamping: number;
  readonly friction: number;
  readonly restitution: number;
}

/**
 * 2D 지지 다각형 (Support Polygon)
 * 돌탑 접촉면 또는 베이스 돌의 XZ 평면 볼록 껍질(Convex Hull)
 * 근거: ORIGINAL_REQUEST R1, F03, StabilityEvaluator
 */
export interface SupportPolygon {
  readonly vertices: readonly [number, number][];
  readonly area: number;
  readonly centroid: readonly [number, number];
}

/**
 * 정적 및 동적 안정성 판정 결과
 * 수직 무게중심(COM) 투영과 지지 다각형 경계 간의 유도 거리(signed margin) 및 전복 토크
 * 근거: ORIGINAL_REQUEST R1, R2, F03, F04
 */
export interface StabilityEvaluation {
  readonly isStable: boolean;
  readonly marginDistance: number; // >0: 안정(지지영역 내부), <0: 전복(지지영역 외부)
  readonly com2D: readonly [number, number];
  readonly nearestEdgeDistance: number;
  readonly overturningTorque?: Vec3;
}

/**
 * 물리 시뮬레이션 제어 옵션
 */
export interface SimulationOptions {
  readonly fixedDeltaTime?: number;
  readonly maxSteps?: number;
  readonly sleepSpeedLimit?: number;
  readonly sleepAngularSpeedLimit?: number;
  readonly minSettledSteps?: number;
}

/**
 * 강체 실시간 변환 상태
 */
export interface BodyTransformState {
  readonly id: string;
  readonly position: Vec3;
  readonly rotation: Quat;
  readonly velocity?: Vec3;
  readonly angularVelocity?: Vec3;
  readonly sleeping?: boolean;
}
