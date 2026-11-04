import { type WishId } from '../../domain/entities/Wish.ts';
import { type SeenWishStore } from '../../domain/ports/repositories.ts';

/**
 * 최근 본 랜덤 소원 ID 로컬 캐시 (최근 100개 FIFO 유지)
 * 근거: 데이터 모델.md, 아키텍처 설계.md 4장
 */
export class BoundedSeenWishStore implements SeenWishStore {
  private readonly maxItems: number;
  private readonly items: WishId[] = [];

  constructor(maxItems = 100) {
    this.maxItems = maxItems;
  }

  recent(): WishId[] {
    return [...this.items];
  }

  add(ids: readonly WishId[]): void {
    for (const id of ids) {
      const existingIdx = this.items.indexOf(id);
      if (existingIdx !== -1) {
        this.items.splice(existingIdx, 1);
      }
      this.items.push(id);
      if (this.items.length > this.maxItems) {
        this.items.shift();
      }
    }
  }
}
