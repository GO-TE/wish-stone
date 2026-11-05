import { Stone } from '../entities/Stone.ts';
import { Pose } from '../value-objects/Pose.ts';

export interface CollapsedStonePose {
  readonly id: string;
  readonly pose: Pose;
}

export interface SimulationFrame {
  readonly step: number;
  readonly time: number;
  readonly poses: ReadonlyMap<string, Pose>;
}

export interface DropResult {
  readonly settled: boolean;
  readonly pose: Pose;
  readonly collapsed?: boolean;
  readonly affectedStones?: readonly CollapsedStonePose[];
  readonly trajectory?: readonly SimulationFrame[];
}

/**
 * 물리 엔진 포트 (cannon-es 3D 강체 물리 시뮬레이션 추상화)
 * 근거: 아키텍처 설계.md 4장, DECISIONS.md (D-010, D-019), ORIGINAL_REQUEST R1, R2, R3
 */
export interface PhysicsWorld {
  addStatic(stones: readonly Stone[]): void;
  drop(stone: Stone, from: Pose): Promise<DropResult>;
  step?(dt?: number): void;
  dispose(): void;
}
