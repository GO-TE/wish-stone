import { Stone } from '../../domain/entities/Stone.ts';
import { Tower, type TowerStoneItem } from '../../domain/entities/Tower.ts';
import { Wish, type WishId } from '../../domain/entities/Wish.ts';
import { EffectBus } from '../../domain/ports/EffectBus.ts';
import {
  type NewWishInput,
  type WishRepository,
} from '../../domain/ports/repositories.ts';
import {
  CheerLevel,
  type CheerLevelValue,
} from '../../domain/value-objects/CheerLevel.ts';
import { Pose } from '../../domain/value-objects/Pose.ts';
import { ToastStore } from '../../presentation/components/toastStore.ts';

export interface OptimisticCheerResult {
  readonly wishId: WishId;
  readonly optimisticLevel: CheerLevel;
  readonly confirmedLevel: CheerLevel;
  readonly levelUp: boolean;
  readonly rolledBack: boolean;
}

export interface OptimisticPlaceStoneResult {
  readonly tempId: WishId;
  readonly savedId: WishId | null;
  readonly optimisticTower: Tower;
  readonly finalTower: Tower;
  readonly rolledBack: boolean;
}

/**
 * 오프라인 대응 & 낙관적 업데이트(Optimistic UI) 매니저 (`SCR-04`, `SCR-07`, `SCR-08`, `SCR-10`)
 * - 응원하기(`cheerWish`) 및 돌 올리기(`placeStone`) 호출 시 네트워크 왕복을 기다리지 않고
 *   화면(돌탑 씬 그래프 및 응원 빛 단계)에 즉시 로컬 반영한다.
 * - 서버 요청 성공 시 확정 ID/단계로 커밋하며 감성 토스트를 띄우고,
 *   네트워크/서버 실패 시 스냅샷으로 즉시 롤백한 뒤 부드러운 안내 토스트를 표시한다.
 */
export class OptimisticMutationManager {
  private readonly wishes: WishRepository;
  private readonly effects?: EffectBus;
  private readonly toastStore?: ToastStore;
  private tempSeq = 0;

  constructor(
    wishes: WishRepository,
    effects?: EffectBus,
    toastStore?: ToastStore
  ) {
    this.wishes = wishes;
    this.effects = effects;
    this.toastStore = toastStore;
  }

  /**
   * 낙관적 응원하기 (`cheerWish`)
   * 1) 네트워크 응답 전에 즉시 로컬 응원 상태(`applyCheer`)와 `cheer_spark` 불꽃 연출을 발행한다.
   * 2) 서버 성공 시 확정 `CheerLevel`을 반환하고 감성 응원 토스트("누군가의 마음에 불꽃이 닿았습니다 🔥")를 띄운다.
   * 3) 서버 실패 시 이전 소원 스냅샷으로 롤백하고 네트워크 에러 토스트를 띄운다.
   */
  async cheerWishOptimistically(
    wish: Wish,
    onOptimisticUpdate?: (optimisticWish: Wish) => void,
    onRollback?: (restoredWish: Wish) => void
  ): Promise<OptimisticCheerResult> {
    if (!wish.canBeCheeredBy()) {
      throw new Error(wish.isMine ? 'CANNOT_CHEER_OWN' : 'ALREADY_CHEERED');
    }

    // 롤백용 원본 스냅샷 생성
    const snapshot = new Wish({
      id: wish.id,
      authorId: wish.authorId,
      authorNickname: wish.displayNickname,
      isMine: wish.isMine,
      content: wish.content,
      category: wish.category,
      scope: wish.scope,
      stone: wish.stone,
      status: wish.status,
      bloom: wish.bloom,
      cheerCount: wish.visibleCheerCount ?? undefined,
      cheerLevel: wish.cheerLevel(),
      cheeredByMe: wish.cheeredByMe,
      createdAt: wish.createdAt,
      fulfilledAt: wish.fulfilledAt,
    });

    // 1. 낙관적 즉시 반영
    const localCheer = wish.applyCheer();
    onOptimisticUpdate?.(wish);
    this.effects?.emit({
      type: 'cheer_spark',
      wishId: wish.id,
      level: localCheer.level.level,
      levelUp: localCheer.levelUp,
    });

    try {
      // 2. 서버 API 호출
      const serverRes = await this.wishes.cheer(wish.id);
      this.toastStore?.showCheerSuccess();
      return {
        wishId: wish.id,
        optimisticLevel: localCheer.level,
        confirmedLevel: serverRes.level,
        levelUp: serverRes.levelUp,
        rolledBack: false,
      };
    } catch (err) {
      // 3. 실패 시 롤백
      onRollback?.(snapshot);
      this.toastStore?.showNetworkError();
      throw err;
    }
  }

  /**
   * 낙관적 돌 올리기 (`placeStone`)
   * 1) 네트워크 왕복 전 돌탑(`Tower`) 꼭대기에 임시 돌(`optimistic-stone-*`)과 통계(+1)를 즉시 추가해 렌더링한다.
   * 2) 서버 `wishes.create` 성공 시 실제 발급된 `savedId`로 교체 확정한다.
   * 3) 서버 실패 시 원래 `Tower` 스냅샷으로 즉시 롤백하고 부드러운 네트워크 안내 토스트를 표시한다.
   */
  async placeStoneOptimistically(
    tower: Tower,
    input: NewWishInput,
    settledPose: Pose,
    onOptimisticTower?: (optimisticTower: Tower) => void,
    onRollbackTower?: (restoredTower: Tower) => void
  ): Promise<OptimisticPlaceStoneResult> {
    const tempId = `optimistic-stone-${++this.tempSeq}`;
    const stoneWithPose: Stone = input.stone.withPose(settledPose);

    const optimisticItem: TowerStoneItem = {
      id: tempId,
      stone: stoneWithPose,
      status: 'active',
      bloom: null,
      cheerLevel: 0 as CheerLevelValue,
      isMine: true,
      nickname: null,
    };

    const optimisticTower = new Tower(
      tower.key,
      [...tower.stones, optimisticItem],
      {
        ...tower.stats,
        stoneCount: tower.stats.stoneCount + 1,
        todayCount: tower.stats.todayCount + 1,
      }
    );

    // 1. 낙관적 돌탑 즉시 반영
    onOptimisticTower?.(optimisticTower);

    try {
      // 2. 백엔드 저장 호출
      const savedId = await this.wishes.create({
        ...input,
        stone: stoneWithPose,
      });

      const confirmedItem: TowerStoneItem = {
        ...optimisticItem,
        id: savedId,
      };

      const finalTower = new Tower(
        tower.key,
        [...tower.stones, confirmedItem],
        optimisticTower.stats
      );

      this.effects?.emit({
        type: 'stone_stacked',
        wishId: savedId,
        pose: settledPose,
        autoPlaced: false,
      });

      return {
        tempId,
        savedId,
        optimisticTower,
        finalTower,
        rolledBack: false,
      };
    } catch (err) {
      // 3. 실패 시 원본 돌탑으로 롤백
      onRollbackTower?.(tower);
      this.toastStore?.showNetworkError();
      throw err;
    }
  }
}
