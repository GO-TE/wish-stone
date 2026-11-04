import { Stone } from '../../domain/entities/Stone.ts';
import { Tower } from '../../domain/entities/Tower.ts';
import { Wish, type WishId } from '../../domain/entities/Wish.ts';
import { EffectBus } from '../../domain/ports/EffectBus.ts';
import { type PhysicsWorld } from '../../domain/ports/PhysicsWorld.ts';
import { type WishRepository } from '../../domain/ports/repositories.ts';
import { Pose } from '../../domain/value-objects/Pose.ts';
import { type CategoryCode, TowerKey } from '../../domain/value-objects/TowerKey.ts';

export interface WishDraft {
  readonly content: string;
  readonly category: CategoryCode;
  readonly scope: TowerKey;
  readonly stone: Stone;
}

export type StackStoneResult =
  | { readonly status: 'retry'; readonly attempt: number }
  | {
      readonly status: 'saved';
      readonly id: WishId;
      readonly pose: Pose;
      readonly autoPlaced: boolean;
    };

const MAX_ATTEMPTS = 3;

/**
 * 돌 쌓기 유스케이스 (일반 3D 및 AR 공용)
 * 물리 안착에 실패하면 최대 3회까지 재시도할 수 있고, 3회 실패 시 탑 꼭대기에 자동 안착시킨다.
 * 근거: 아키텍처 설계.md 6장, 화면 설계서 SCR-08 4단계, D-010
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

    const dropResult = await this.physics.drop(draft.stone, dropFrom);
    if (!dropResult.settled && attempt < MAX_ATTEMPTS) {
      return { status: 'retry', attempt };
    }

    const autoPlaced = !dropResult.settled;
    const finalPose = dropResult.settled
      ? dropResult.pose
      : Pose.onTopOf(tower.topY());

    const stoneWithPose = draft.stone.withPose(finalPose);
    const id = await this.wishes.create({
      content: draft.content.trim(),
      category: draft.category,
      scope: draft.scope,
      stone: stoneWithPose,
    });

    this.effects?.emit({
      type: 'stone_stacked',
      wishId: id,
      pose: finalPose,
      autoPlaced,
    });

    return {
      status: 'saved',
      id,
      pose: finalPose,
      autoPlaced,
    };
  }
}
