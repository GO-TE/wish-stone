import { Stone } from '../../domain/entities/Stone.ts';
import { Tower } from '../../domain/entities/Tower.ts';
import { Wish, type WishId } from '../../domain/entities/Wish.ts';
import { EffectBus } from '../../domain/ports/EffectBus.ts';
import {
  type CollapsedStonePose,
  type DropResult,
  type PhysicsWorld,
  type SimulationFrame,
} from '../../domain/ports/PhysicsWorld.ts';
import { type WishRepository } from '../../domain/ports/repositories.ts';
import { CategoryAutoClassifier } from '../../domain/value-objects/CategoryAutoClassifier.ts';
import { Pose } from '../../domain/value-objects/Pose.ts';
import { type CategoryCode, TowerKey } from '../../domain/value-objects/TowerKey.ts';

export interface WishDraft {
  readonly content: string;
  readonly category?: CategoryCode;
  readonly scope: TowerKey;
  readonly stone: Stone;
}

export type StackStoneResult =
  | {
      readonly status: 'retry';
      readonly attempt: number;
      readonly collapsed: boolean;
      readonly trajectory?: readonly SimulationFrame[];
      readonly affectedStones?: readonly CollapsedStonePose[];
      readonly dropResult?: DropResult;
    }
  | {
      readonly status: 'saved';
      readonly id: WishId;
      readonly category: CategoryCode;
      readonly pose: Pose;
      readonly autoPlaced: boolean;
      readonly trajectory?: readonly SimulationFrame[];
      readonly affectedStones?: readonly CollapsedStonePose[];
      readonly dropResult?: DropResult;
    };

const MAX_ATTEMPTS = 3;

/**
 * 돌 쌓기 유스케이스 (일반 3D 및 AR 공용)
 * - 카테고리 미지정 시 본문 기반으로 자동 분류한다 (D-016).
 * - 무게중심을 벗어나 물리 안착에 실패하면 돌탑이 흔들리거나 무너지는 물리 연출(tower_collapsed)을 발행한다 (D-019).
 * - 최대 3회까지 재시도할 수 있고, 3회 실패 시 탑 꼭대기에 자동 안착시킨다.
 */
export class StackStoneUseCase {
  private readonly wishes: WishRepository;
  private readonly physics: PhysicsWorld;
  private readonly effects?: EffectBus;

  constructor(
    wishes: WishRepository,
    physics: PhysicsWorld,
    effects?: EffectBus
  ) {
    this.wishes = wishes;
    this.physics = physics;
    this.effects = effects;
  }

  async execute(
    draft: WishDraft,
    tower: Tower,
    dropFrom: Pose,
    attempt: number
  ): Promise<StackStoneResult> {
    Wish.validateContent(draft.content);
    const trimmedContent = draft.content.trim();
    const resolvedCategory =
      draft.category ?? CategoryAutoClassifier.classify(trimmedContent);

    if (tower.stones.length > 0) {
      this.physics.addStatic(
        tower.stones.map((item, index) => {
          const s = item.stone;
          (s as unknown as { id?: string }).id = item.id || `tower-stone-${index}`;
          return s;
        })
      );
    }

    const dropResult = await this.physics.drop(draft.stone, dropFrom);
    const affectedCount =
      dropResult.affectedStones && dropResult.affectedStones.length > 0
        ? dropResult.affectedStones.length
        : Math.min(Math.max(1, tower.stones.length), 5);

    if (!dropResult.settled && attempt < MAX_ATTEMPTS) {
      this.effects?.emit({
        type: 'tower_collapsed',
        reason: 'drop_failed',
        affectedStoneCount: affectedCount,
        affectedStones: dropResult.affectedStones,
        trajectory: dropResult.trajectory,
      });
      return {
        status: 'retry',
        attempt,
        collapsed: true,
        trajectory: dropResult.trajectory,
        affectedStones: dropResult.affectedStones,
        dropResult,
      };
    }

    const autoPlaced = !dropResult.settled;
    const finalPose = dropResult.settled
      ? dropResult.pose
      : Pose.onTopOf(tower.topY());

    const stoneWithPose = draft.stone.withPose(finalPose);
    const id = await this.wishes.create({
      content: trimmedContent,
      category: resolvedCategory,
      scope: draft.scope,
      stone: stoneWithPose,
    });

    this.effects?.emit({
      type: 'stone_stacked',
      wishId: id,
      pose: finalPose,
      autoPlaced,
      trajectory: dropResult.trajectory,
    });

    return {
      status: 'saved',
      id,
      category: resolvedCategory,
      pose: finalPose,
      autoPlaced,
      trajectory: dropResult.trajectory,
      affectedStones: dropResult.affectedStones,
      dropResult,
    };
  }
}
