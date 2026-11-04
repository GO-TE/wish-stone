import { type WishId } from '../entities/Wish.ts';
import { type BloomType } from '../value-objects/BloomType.ts';
import { type CheerLevelValue } from '../value-objects/CheerLevel.ts';
import { Pose } from '../value-objects/Pose.ts';

export type VisualEffectEvent =
  | {
      readonly type: 'stone_stacked';
      readonly wishId: WishId;
      readonly pose: Pose;
      readonly autoPlaced: boolean;
    }
  | {
      readonly type: 'tower_collapsed';
      readonly reason: 'drop_failed' | 'wish_deleted';
      readonly affectedStoneCount: number;
    }
  | {
      readonly type: 'cheered';
      readonly wishId: WishId;
      readonly level: CheerLevelValue;
      readonly levelUp: boolean;
    }
  | {
      readonly type: 'fulfilled';
      readonly wishId: WishId;
      readonly bloom: BloomType;
    };

export type EffectListener = (event: VisualEffectEvent) => void;

/**
 * 시각 연출 이벤트 버스 (옵저버 패턴)
 * 유스케이스와 3D 렌더링 연출(응원 불꽃, 연출용 돌, 단계 상승 빛, 피어남, 돌탑 무너짐)을 분리한다.
 * 근거: 아키텍처 설계.md 7장, DB-010, DB-017, DB-020, D-019
 */
export class EffectBus {
  private readonly listeners = new Set<EffectListener>();

  subscribe(listener: EffectListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: VisualEffectEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
