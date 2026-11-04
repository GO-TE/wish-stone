import { Stone } from '../../domain/entities/Stone.ts';
import {
  type DropResult,
  type PhysicsWorld,
} from '../../domain/ports/PhysicsWorld.ts';
import { Pose } from '../../domain/value-objects/Pose.ts';

/**
 * 돌탑 쌓기 물리 시뮬레이터 기본 구현체 (cannon-es 연동 전/폴백 및 PoC 검증용)
 * 탑 중심축(XZ 평면)에서 허용 반경 이내로 드롭되면 가장 가까운 지지 돌 위에 안착하고,
 * 반경을 벗어나면 바닥으로 굴러떨어진(`settled: false`) 것으로 판정한다.
 * 근거: 아키텍처 설계.md 4장, 화면 설계서 SCR-08 4단계, D-010
 */
export class SimpleTowerPhysicsWorld implements PhysicsWorld {
  private staticStones: Stone[] = [];
  private readonly stabilityRadius: number;
  private readonly stoneHeight: number;

  constructor(stabilityRadius = 0.45, stoneHeight = 0.25) {
    this.stabilityRadius = stabilityRadius;
    this.stoneHeight = stoneHeight;
  }

  addStatic(stones: readonly Stone[]): void {
    this.staticStones = [...stones];
  }

  async drop(_stone: Stone, from: Pose): Promise<DropResult> {
    const topY =
      this.staticStones.length === 0
        ? 0
        : Math.max(...this.staticStones.map((s) => s.pose.position.y));

    const radialDistance = Math.hypot(from.position.x, from.position.z);
    if (radialDistance > this.stabilityRadius || from.position.y < topY) {
      return {
        settled: false,
        pose: new Pose(
          { x: from.position.x, y: 0, z: from.position.z },
          from.rotation
        ),
      };
    }

    const settledPose = new Pose(
      {
        x: Number((from.position.x * 0.35).toFixed(4)),
        y: Number((topY + this.stoneHeight).toFixed(4)),
        z: Number((from.position.z * 0.35).toFixed(4)),
      },
      from.rotation
    );

    return {
      settled: true,
      pose: settledPose,
    };
  }

  dispose(): void {
    this.staticStones = [];
  }
}
