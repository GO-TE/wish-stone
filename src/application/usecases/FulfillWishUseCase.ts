import { Wish } from '../../domain/entities/Wish.ts';
import { EffectBus } from '../../domain/ports/EffectBus.ts';
import { type WishRepository } from '../../domain/ports/repositories.ts';
import { type BloomType } from '../../domain/value-objects/BloomType.ts';

/**
 * 내 소원 이루어짐 처리 유스케이스
 * 꽃/새싹/이끼 중 사용자 선택 또는 랜덤으로 피어나는 상태를 저장하고 연출 이벤트를 발행한다.
 * 근거: DB-020, API-10, D-012
 */
export class FulfillWishUseCase {
  private readonly wishes: WishRepository;
  private readonly effects: EffectBus;

  constructor(wishes: WishRepository, effects: EffectBus) {
    this.wishes = wishes;
    this.effects = effects;
  }

  async execute(wish: Wish, preferredBloom?: BloomType): Promise<BloomType> {
    const localBloom = wish.fulfill(preferredBloom);
    const savedBloom = await this.wishes.fulfill(
      wish.id,
      preferredBloom ?? localBloom
    );

    this.effects.emit({
      type: 'fulfilled',
      wishId: wish.id,
      bloom: savedBloom,
    });

    return savedBloom;
  }
}
