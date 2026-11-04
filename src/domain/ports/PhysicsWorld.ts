import { Stone } from '../entities/Stone.ts';
import { Pose } from '../value-objects/Pose.ts';

export interface DropResult {
  readonly settled: boolean;
  readonly pose: Pose;
}

/**
 * 물리 엔진 포트 (cannon-es / Viro Physics 추상화)
 * 근거: 아키텍처 설계.md 4장, D-010
 */
export interface PhysicsWorld {
  addStatic(stones: readonly Stone[]): void;
  drop(stone: Stone, from: Pose): Promise<DropResult>;
  dispose(): void;
}
