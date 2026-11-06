import { StonePhysicsBodyFactory } from '../../infrastructure/physics/StonePhysicsBodyFactory.ts';
import { type BloomType } from '../value-objects/BloomType.ts';
import { type CheerLevelValue } from '../value-objects/CheerLevel.ts';
import { type CategoryCode, TowerKey } from '../value-objects/TowerKey.ts';
import { Stone } from './Stone.ts';
import { type WishId, type WishStatus } from './Wish.ts';

export interface TowerStoneItem {
  readonly id: WishId;
  readonly content?: string;
  readonly category?: CategoryCode;
  readonly stone: Stone;
  readonly status: Extract<WishStatus, 'active' | 'fulfilled'>;
  readonly bloom: BloomType | null;
  readonly cheerLevel: CheerLevelValue;
  readonly cheerCount?: number;
  readonly isMine: boolean;
  readonly nickname: string | null;
  readonly createdAt?: Date;
}

export interface TowerStats {
  readonly stoneCount: number;
  readonly todayCount: number;
  readonly fulfilledCount: number;
  readonly cheerCount: number;
}

/**
 * 돌탑(Tower) 엔티티
 * 근거: 아키텍처 설계.md 3장, 데이터 모델.md 2장
 */
export class Tower {
  readonly key: TowerKey;
  readonly stones: readonly TowerStoneItem[];
  readonly stats: TowerStats;

  constructor(key: TowerKey, stones: TowerStoneItem[], stats: TowerStats) {
    this.key = key;
    // 공개 돌탑이면 nickname을 강제로 마스킹 (방어적 익명성 보장)
    this.stones = Object.freeze(
      stones.map((item) => ({
        ...item,
        nickname: key.showsNickname() ? item.nickname : null,
      }))
    );
    this.stats = Object.freeze({ ...stats });
  }

  /**
   * 현재 돌탑의 가장 높은 Y 좌표 반환 (새 돌 배치 기준점)
   */
  topY(): number {
    if (this.stones.length === 0) return 0;
    return Math.max(...this.stones.map((s) => s.stone.pose.position.y));
  }

  /**
   * 현재 돌탑의 실제 최상단 물리 표면 Y 좌표 반환 (관통/겹침 방지 기준점)
   * 각 돌의 중심 Y 좌표 + 형상별 물리 반높이(halfExtents.y) 중 최댓값
   * 근거: ORIGINAL_REQUEST R2, F02
   */
  topSurfaceY(): number {
    if (this.stones.length === 0) return 0;
    return Math.max(
      ...this.stones.map((item) => {
        const config = StonePhysicsBodyFactory.getShapeConfig(item.stone.shape);
        return item.stone.pose.position.y + config.halfExtents.y;
      })
    );
  }
}

