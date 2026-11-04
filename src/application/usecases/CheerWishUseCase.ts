import { Wish } from '../../domain/entities/Wish.ts';
import { EffectBus } from '../../domain/ports/EffectBus.ts';
import { type WishRepository } from '../../domain/ports/repositories.ts';
import { CheerLevel } from '../../domain/value-objects/CheerLevel.ts';

/**
 * 소원 응원하기 유스케이스
 * 자기 소원이거나 이미 응원한 소원은 거부하고, 성공 시 응원 카운트 증가 및 불꽃/연출용 돌 이벤트를 발행한다.
 * 근거: DB-016, DB-017, API-07, D-005, D-006
 */
export class CheerWishUseCase {
  private readonly wishes: WishRepository;
  private readonly effects: EffectBus;

  constructor(wishes: WishRepository, effects: EffectBus) {
    this.wishes = wishes;
    this.effects = effects;
  }

  async execute(
    wish: Wish
  ): Promise<{ level: CheerLevel; levelUp: boolean }> {
    if (!wish.canBeCheeredBy()) {
      throw new Error(wish.isMine ? 'CANNOT_CHEER_OWN' : 'ALREADY_CHEERED');
    }

    const result = await this.wishes.cheer(wish.id);
    this.effects.emit({
      type: 'cheered',
      wishId: wish.id,
      level: result.level.level,
      levelUp: result.levelUp,
    });

    return result;
  }
}
