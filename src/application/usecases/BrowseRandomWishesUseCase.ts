import { Wish } from '../../domain/entities/Wish.ts';
import {
  type SeenWishStore,
  type WishRepository,
} from '../../domain/ports/repositories.ts';

/**
 * 랜덤 소원 조회 유스케이스
 * 최근 본 소원 ID(최대 100개)를 로컬 저장소에서 읽어 중복 노출을 방지한다.
 * 근거: DB-014, DB-015, API-06, 데이터 모델.md 3장
 */
export class BrowseRandomWishesUseCase {
  private readonly wishes: WishRepository;
  private readonly seenStore: SeenWishStore;

  constructor(wishes: WishRepository, seenStore: SeenWishStore) {
    this.wishes = wishes;
    this.seenStore = seenStore;
  }

  async execute(count = 5): Promise<Wish[]> {
    const excludeIds = this.seenStore.recent();
    const fetched = await this.wishes.random(count, excludeIds);
    if (fetched.length > 0) {
      this.seenStore.add(fetched.map((w) => w.id));
    }
    return fetched;
  }
}
