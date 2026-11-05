import { createMsaAppContainer } from '../../container.ts';
import {
  Wish,
  type WishId,
  type WishStatus,
} from '../../domain/entities/Wish.ts';
import { type VisualEffectEvent } from '../../domain/ports/EffectBus.ts';
import { type BloomType } from '../../domain/value-objects/BloomType.ts';
import { type CategoryCode } from '../../domain/value-objects/TowerKey.ts';

export type MyWishesFilter = 'all' | Extract<WishStatus, 'active' | 'fulfilled'>;

export interface MyWishesViewState {
  readonly filter: MyWishesFilter;
  readonly wishes: readonly Wish[];
  readonly selectedWish: Wish | null;
  readonly lastEffect: VisualEffectEvent | null;
}

/**
 * 내 소원 관리 화면 컨트롤러 (SCR-12 ~ SCR-14)
 * - SCR-12 내 소원 목록: 필터(전체 / 진행 중 / 이루어짐), 본인에게만 정확한 응원 수(`visibleCheerCount`) 노출 (DB-019, 022, D-006)
 * - SCR-13 내 소원 상세: 자동 분류된 카테고리 사후 수정(`changeCategory`, D-016), 내 소원 삭제(`remove` + `tower_collapsed` 물리 연출 발행, DB-021, D-019)
 * - SCR-14 이루어짐 연출 선택: 꽃(`flower`) / 새싹(`sprout`) / 이끼(`moss`) 중 직접 선택 또는 랜덤 피어남 연출 발행 (`FulfillWishUseCase`, DB-020, D-012)
 */
export class MyWishesController {
  private readonly app: ReturnType<typeof createMsaAppContainer>;
  private state: MyWishesViewState = {
    filter: 'all',
    wishes: [],
    selectedWish: null,
    lastEffect: null,
  };

  constructor(app = createMsaAppContainer()) {
    this.app = app;
    this.app.effects.subscribe((event) => {
      this.state = {
        ...this.state,
        lastEffect: event,
      };
    });
  }

  getState(): MyWishesViewState {
    return this.state;
  }

  /**
   * SCR-12 내 소원 목록 조회 (API-09, DB-019)
   */
  async loadMyWishes(filter: MyWishesFilter = 'all'): Promise<MyWishesViewState> {
    const statusParam = filter === 'all' ? undefined : filter;
    const wishes = await this.app.repositories.wishes.mine(statusParam);
    this.state = {
      ...this.state,
      filter,
      wishes,
    };
    return this.state;
  }

  selectWish(wishId: WishId): Wish | null {
    const found = this.state.wishes.find((w) => w.id === wishId) ?? null;
    this.state = {
      ...this.state,
      selectedWish: found,
    };
    return found;
  }

  /**
   * SCR-13 내 소원 카테고리 사후 직접 변경 (D-016)
   */
  async changeWishCategory(
    wish: Wish,
    newCategory: CategoryCode
  ): Promise<Wish> {
    wish.changeCategory(newCategory);
    if (this.app.repositories.wishes.updateCategory) {
      await this.app.repositories.wishes.updateCategory(wish.id, newCategory);
    }
    this.state = {
      ...this.state,
      wishes: [...this.state.wishes],
      selectedWish:
        this.state.selectedWish?.id === wish.id
          ? wish
          : this.state.selectedWish,
    };
    return wish;
  }

  /**
   * SCR-14 내 소원 이루어짐 처리 및 피어남(꽃/새싹/이끼) 연출 발행 (API-10, DB-020, D-012)
   */
  async fulfillWish(wish: Wish, preferredBloom?: BloomType): Promise<BloomType> {
    const bloom = await this.app.useCases.fulfillWish.execute(
      wish,
      preferredBloom
    );
    this.state = {
      ...this.state,
      wishes: [...this.state.wishes],
      selectedWish:
        this.state.selectedWish?.id === wish.id
          ? wish
          : this.state.selectedWish,
    };
    return bloom;
  }

  /**
   * SCR-13 내 소원 삭제 (Soft delete) 및 돌탑 재정렬 물리 연출(`tower_collapsed`) 발행 (API-11, DB-021, D-019)
   */
  async deleteWish(wish: Wish): Promise<MyWishesViewState> {
    wish.markDeleted();
    await this.app.repositories.wishes.remove(wish.id);
    this.app.effects.emit({
      type: 'tower_collapsed',
      reason: 'wish_deleted',
      affectedStoneCount: 3,
    });

    const remaining = this.state.wishes.filter((w) => w.id !== wish.id);
    this.state = {
      ...this.state,
      wishes: remaining,
      selectedWish:
        this.state.selectedWish?.id === wish.id
          ? null
          : this.state.selectedWish,
    };
    return this.state;
  }
}
