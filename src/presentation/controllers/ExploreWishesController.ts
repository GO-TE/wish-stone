import { createMsaAppContainer } from '../../container.ts';
import { Wish, type WishId } from '../../domain/entities/Wish.ts';
import { type VisualEffectEvent } from '../../domain/ports/EffectBus.ts';
import { type ReportReason } from '../../domain/ports/repositories.ts';
import { CheerLevel } from '../../domain/value-objects/CheerLevel.ts';

function extractErrorCode(err: unknown): string {
  if (err && typeof err === 'object') {
    if ('code' in err && typeof (err as { code?: unknown }).code === 'string') {
      return (err as { code: string }).code;
    }
    if (
      'message' in err &&
      typeof (err as { message?: unknown }).message === 'string'
    ) {
      return (err as { message: string }).message;
    }
  }
  return 'UNKNOWN_ERROR';
}

export interface ExploreWishesViewState {
  readonly wishes: readonly Wish[];
  readonly currentIndex: number;
  readonly currentWish: Wish | null;
  readonly cheeredWishIds: readonly WishId[];
  readonly reportedWishIds: readonly WishId[];
  readonly reportModalOpen: boolean;
  readonly reportTargetWish: Wish | null;
  readonly reportConfirmationMessage: string | null;
  readonly lastEffect: VisualEffectEvent | null;
}

/**
 * 타인의 소원 둘러보기·익명 응원하기 및 부적절 소원 신고 모달 컨트롤러 (SCR-10 ~ SCR-11)
 * - `BrowseRandomWishesUseCase`로 최근 본 소원(`SeenWishStore`)을 제외한 랜덤 소원 카드를 불러온다 (DB-014, DB-015).
 * - `CheerWishUseCase`로 1인 1회 익명 응원을 수행하고 응원 빛 단계(`1/5/15` -> 0~3단계) 상승과 `cheer_spark` 불꽃 연출을 발행한다 (DB-016, DB-017, D-017).
 * - `MsaWishRepository.reportWish`로 부적절 소원을 신고하며, 동일 소원 중복 신고를 차단하고 깔끔한 접수 확인 안내를 제공한다 (DB-018, API-08).
 */
export class ExploreWishesController {
  private readonly app: ReturnType<typeof createMsaAppContainer>;
  private readonly cheeredSet = new Set<WishId>();
  private readonly reportedSet = new Set<WishId>();
  private state: ExploreWishesViewState = {
    wishes: [],
    currentIndex: 0,
    currentWish: null,
    cheeredWishIds: [],
    reportedWishIds: [],
    reportModalOpen: false,
    reportTargetWish: null,
    reportConfirmationMessage: null,
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

  getState(): ExploreWishesViewState {
    return this.state;
  }

  /**
   * SCR-10 랜덤 소원 카드 묶음 조회 (기본 5장, 이미 신고한 소원 제외)
   */
  async loadRandomWishes(count = 5): Promise<ExploreWishesViewState> {
    const fetched = await this.app.useCases.browseRandomWishes.execute(count);
    const visible = fetched.filter((w) => !this.reportedSet.has(w.id));
    this.state = {
      ...this.state,
      wishes: visible,
      currentIndex: 0,
      currentWish: visible[0] ?? null,
      reportConfirmationMessage: null,
    };
    return this.state;
  }

  /**
   * 다음 소원 카드로 스와이프
   */
  nextWish(): Wish | null {
    if (this.state.wishes.length === 0) return null;
    const nextIdx = (this.state.currentIndex + 1) % this.state.wishes.length;
    const nextCard = this.state.wishes[nextIdx] ?? null;
    this.state = {
      ...this.state,
      currentIndex: nextIdx,
      currentWish: nextCard,
      reportConfirmationMessage: null,
    };
    return nextCard;
  }

  /**
   * SCR-10 소원 응원하기 (`1/5/15` 빛 단계 변화 + `cheer_spark` 연출 발행)
   * 서버에서 `ALREADY_CHEERED` 에러가 반환된 경우에도 로컬 `cheeredSet`에 반영해 버튼 비활성화 상태를 동기화한다.
   */
  async cheerWish(
    wish: Wish | null = this.state.currentWish
  ): Promise<{ level: CheerLevel; levelUp: boolean }> {
    if (!wish) {
      throw new Error('WISH_NOT_FOUND');
    }
    if (this.cheeredSet.has(wish.id)) {
      throw new Error('ALREADY_CHEERED');
    }

    try {
      const res = await this.app.useCases.cheerWish.execute(wish);
      this.cheeredSet.add(wish.id);

      this.app.effects.emit({
        type: 'cheer_spark',
        wishId: wish.id,
        level: res.level.level,
        levelUp: res.levelUp,
      });

      this.state = {
        ...this.state,
        cheeredWishIds: [...this.cheeredSet],
      };
      return res;
    } catch (err) {
      const code = extractErrorCode(err);
      if (code === 'ALREADY_CHEERED') {
        this.cheeredSet.add(wish.id);
        this.state = {
          ...this.state,
          cheeredWishIds: [...this.cheeredSet],
        };
        return {
          level: wish.cheerLevel(),
          levelUp: false,
        };
      }
      throw err;
    }
  }

  /**
   * SCR-11 신고 바텀시트/모달 열기
   */
  openReportModal(
    wish: Wish | null = this.state.currentWish
  ): ExploreWishesViewState {
    this.state = {
      ...this.state,
      reportModalOpen: true,
      reportTargetWish: wish,
      reportConfirmationMessage: null,
    };
    return this.state;
  }

  closeReportModal(): ExploreWishesViewState {
    this.state = {
      ...this.state,
      reportModalOpen: false,
      reportTargetWish: null,
    };
    return this.state;
  }

  /**
   * SCR-11 부적절 소원 신고 제출 (중복 신고 방지 + 확인 메시지 및 목록 숨김 처리, DB-018, API-08)
   * 서버가 `ALREADY_REPORTED` (409) 에러를 반환하더라도 이미 신고된 소원으로 간주하여 `reportedSet`에 추가하고 카드를 숨긴다.
   */
  async submitReport(
    reason: ReportReason,
    targetWish: Wish | null = this.state.reportTargetWish ??
      this.state.currentWish
  ): Promise<ExploreWishesViewState> {
    if (!targetWish) {
      throw new Error('WISH_NOT_FOUND');
    }
    if (this.reportedSet.has(targetWish.id)) {
      throw new Error('ALREADY_REPORTED');
    }

    try {
      if (this.app.repositories.wishes.reportWish) {
        await this.app.repositories.wishes.reportWish(targetWish.id, reason);
      } else {
        await this.app.repositories.wishes.report(targetWish.id, reason);
      }
    } catch (err) {
      const code = extractErrorCode(err);
      if (code !== 'ALREADY_REPORTED') {
        throw err;
      }
    }

    this.reportedSet.add(targetWish.id);
    const remaining = this.state.wishes.filter((w) => w.id !== targetWish.id);
    const nextIdx =
      remaining.length === 0
        ? 0
        : Math.min(this.state.currentIndex, remaining.length - 1);

    this.state = {
      ...this.state,
      wishes: remaining,
      currentIndex: nextIdx,
      currentWish: remaining[nextIdx] ?? null,
      reportedWishIds: [...this.reportedSet],
      reportModalOpen: false,
      reportTargetWish: null,
      reportConfirmationMessage:
        '신고가 접수되었습니다. 쾌적한 돌탑 환경을 위해 검토 후 조치하겠습니다.',
    };
    return this.state;
  }
}
