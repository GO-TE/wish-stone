import { type StackStoneResult } from '../../application/usecases/StackStoneUseCase.ts';
import { createMsaAppContainer } from '../../container.ts';
import { Stone, type StoneShape } from '../../domain/entities/Stone.ts';
import { Tower } from '../../domain/entities/Tower.ts';
import { type WishId } from '../../domain/entities/Wish.ts';
import {
  type ARSession,
  type CapturedImage,
} from '../../domain/ports/ARSession.ts';
import { type VisualEffectEvent } from '../../domain/ports/EffectBus.ts';
import {
  type CollapsedStonePose,
  type SimulationFrame,
} from '../../domain/ports/PhysicsWorld.ts';
import { CategoryAutoClassifier } from '../../domain/value-objects/CategoryAutoClassifier.ts';
import {
  DailyWishQuota,
  type DailyWishQuotaProps,
} from '../../domain/value-objects/DailyWishQuota.ts';
import { Pose } from '../../domain/value-objects/Pose.ts';
import {
  type CategoryCode,
  TowerKey,
} from '../../domain/value-objects/TowerKey.ts';

export type StackPlacementMode = '3d' | 'ar';

export type StackPlacementPhase =
  | 'IDLE'
  | 'PLACING'
  | 'BALANCING'
  | 'COLLAPSING'
  | 'SETTLED';

export type StackStoneListener = (state: StackStoneViewState) => void;

export interface StackStoneViewState {
  readonly phase: StackPlacementPhase;
  readonly selectedStone: Stone;
  readonly content: string;
  readonly autoCategory: CategoryCode;
  readonly manualCategory: CategoryCode | null;
  readonly effectiveCategory: CategoryCode;
  readonly scope: TowerKey;
  readonly quota: DailyWishQuota;
  readonly mode: StackPlacementMode;
  readonly arSession: ARSession | null;
  readonly attempt: number;
  readonly towerCollapsed: boolean;
  readonly lastSimulationTrajectory?: readonly SimulationFrame[];
  readonly lastAffectedStones?: readonly CollapsedStonePose[];
  readonly savedWishId: WishId | null;
  readonly capturedPhoto: CapturedImage | null;
  readonly lastEffect: VisualEffectEvent | null;
}

/**
 * 돌 선택·소원 작성·일반 3D 쌓기·AR 쌓기·사진 캡처 컨트롤러 (SCR-05 ~ SCR-09)
 * - SCR-05 돌 선택: 모양(`round`, `flat`, `pebble`, `boulder`) 및 색상 선택
 * - SCR-06 소원 작성: `CategoryAutoClassifier` 실시간 자동 분류 배지 제공 및 사용자 수동 오버라이드 (D-016)
 * - 일일 쿼터: `DailyWishQuota`(기본 5개 + 리워드 광고/결제 보너스 충전) 검사 및 차감 (D-018)
 * - SCR-07 / SCR-08: `ARSessionFactory`를 통한 AR 세션 초기화, 드래그 앤 드롭 물리 안착, 실패 시 `tower_collapsed` 연출, 3회 실패 시 자동 안착 (D-003, D-019)
 * - SCR-09: AR 사진 캡처 및 미리보기 상태 제어 (DB-013)
 */
export class StackStoneController {
  private readonly app: ReturnType<typeof createMsaAppContainer>;
  private state: StackStoneViewState;
  private readonly listeners = new Set<StackStoneListener>();
  private isPlacing = false;

  constructor(
    app = createMsaAppContainer(),
    initialQuotaProps: DailyWishQuotaProps = {
      baseQuota: 5,
      bonusQuota: 0,
      usedCount: 0,
    }
  ) {
    this.app = app;
    this.state = {
      phase: 'IDLE',
      selectedStone: new Stone({
        shape: 'round',
        color: '#A89F91',
        pose: Pose.origin(),
      }),
      content: '',
      autoCategory: 'etc',
      manualCategory: null,
      effectiveCategory: 'etc',
      scope: TowerKey.global(),
      quota: new DailyWishQuota(initialQuotaProps),
      mode: '3d',
      arSession: null,
      attempt: 0,
      towerCollapsed: false,
      lastSimulationTrajectory: undefined,
      lastAffectedStones: undefined,
      savedWishId: null,
      capturedPhoto: null,
      lastEffect: null,
    };

    this.app.effects.subscribe((event) => {
      if (event.type === 'tower_collapsed') {
        this.updateState({
          lastEffect: event,
          towerCollapsed: true,
          phase: 'COLLAPSING',
          lastSimulationTrajectory:
            event.trajectory ?? this.state.lastSimulationTrajectory,
          lastAffectedStones:
            event.affectedStones ?? this.state.lastAffectedStones,
        });
      } else if (event.type === 'stone_stacked') {
        this.updateState({
          lastEffect: event,
          towerCollapsed: false,
          phase: 'SETTLED',
          lastSimulationTrajectory:
            event.trajectory ?? this.state.lastSimulationTrajectory,
        });
      } else {
        this.updateState({ lastEffect: event });
      }
    });
  }

  subscribe(listener: StackStoneListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private updateState(partial: Partial<StackStoneViewState>): StackStoneViewState {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) {
      listener(this.state);
    }
    return this.state;
  }

  getState(): StackStoneViewState {
    return this.state;
  }

  startPlacing(): StackStoneViewState {
    if (this.state.phase === 'SETTLED' || this.state.attempt >= 3) {
      return this.updateState({ phase: 'PLACING', attempt: 0 });
    }
    return this.updateState({ phase: 'PLACING' });
  }

  resetPlacement(): StackStoneViewState {
    return this.updateState({
      phase: 'IDLE',
      towerCollapsed: false,
      lastSimulationTrajectory: undefined,
      lastAffectedStones: undefined,
    });
  }

  retry(): StackStoneViewState {
    return this.resetPlacement();
  }

  /**
   * SCR-05 돌 모양·색상 선택 (DB-008)
   */
  selectStone(shape: StoneShape, color: string): Stone {
    const nextStone = new Stone({
      shape,
      color,
      pose: Pose.origin(),
    });
    this.updateState({
      selectedStone: nextStone,
    });
    return nextStone;
  }

  /**
   * SCR-06 소원 텍스트 입력 시 실시간 자동 카테고리 분류 프리뷰 갱신 (D-016)
   */
  updateContent(content: string): StackStoneViewState {
    const autoCategory = CategoryAutoClassifier.classify(content);
    const effectiveCategory = this.state.manualCategory ?? autoCategory;
    return this.updateState({
      content,
      autoCategory,
      effectiveCategory,
    });
  }

  /**
   * SCR-06 자동 분류된 카테고리를 사용자가 수동으로 변경하거나 자동 모드로 되돌림 (D-016)
   */
  overrideCategory(category: CategoryCode | null): StackStoneViewState {
    const effectiveCategory = category ?? this.state.autoCategory;
    return this.updateState({
      manualCategory: category,
      effectiveCategory,
    });
  }

  /**
   * 올릴 돌탑 범위(전체 공개 돌탑 / 지인 그룹 돌탑) 선택 (DB-009)
   */
  selectScope(scope: TowerKey): StackStoneViewState {
    return this.updateState({
      scope,
    });
  }

  /**
   * 리워드 광고 시청 또는 결제를 통한 오늘 소원 보너스 쿼터 충전 (D-018)
   */
  grantRewardQuotaBonus(amount = 1): DailyWishQuota {
    const updatedQuota = this.state.quota.grantRewardBonus(amount);
    this.updateState({
      quota: updatedQuota,
    });
    return updatedQuota;
  }

  /**
   * SCR-08 AR 모드 진입 시도: 플랫폼 역량에 맞는 AR 세션을 생성·시작하고,
   * 미지원 환경이면 일반 3D 모드(`mode: '3d'`)로 폴백한다 (D-003, DB-027~029).
   */
  async initPlacementMode(
    preferredMode: StackPlacementMode,
    tower?: Tower,
    anchor: Pose = Pose.origin()
  ): Promise<StackStoneViewState> {
    if (preferredMode === '3d') {
      if (this.state.arSession) {
        await this.state.arSession.stop();
      }
      return this.updateState({
        mode: '3d',
        arSession: null,
      });
    }

    const session = await this.app.arSessionFactory.create(
      this.app.capabilities
    );
    if (!session) {
      return this.updateState({
        mode: '3d',
        arSession: null,
      });
    }

    await session.start();
    if (tower) {
      session.placeTower(tower, anchor);
    }

    return this.updateState({
      mode: 'ar',
      arSession: session,
    });
  }

  /**
   * SCR-07 / SCR-08 드래그 앤 드롭으로 돌 올리기 실행 (D-016, D-018, D-019)
   * - 남은 일일 쿼터가 없으면 `DAILY_QUOTA_EXCEEDED` 에러를 던진다.
   * - 안착 실패 시 `attempt`를 증가시키고 `tower_collapsed` 물리 연출 상태를 활성화한다.
   * - 안착 성공(또는 3회차 자동 안착) 시 일일 쿼터를 1 차감하고 소원을 저장한다.
   */
  async placeStone(tower: Tower, dropFrom: Pose): Promise<StackStoneResult> {
    if (!this.state.quota.canStack()) {
      throw new Error('DAILY_QUOTA_EXCEEDED');
    }

    // Controller-level re-entrancy defense against concurrent invocations
    if (this.isPlacing || this.state.phase === 'BALANCING') {
      throw new Error('PLACEMENT_IN_PROGRESS');
    }
    this.isPlacing = true;

    try {
      if (this.state.phase === 'SETTLED') {
        this.updateState({ attempt: 0 });
      }
      if (this.state.phase === 'IDLE') {
        this.updateState({ phase: 'PLACING' });
      }
      this.updateState({ phase: 'BALANCING' });

      const nextAttempt = this.state.attempt + 1;
      const result = await this.app.useCases.stackStone.execute(
        {
          content: this.state.content,
          category: this.state.effectiveCategory,
          scope: this.state.scope,
          stone: this.state.selectedStone,
        },
        tower,
        dropFrom,
        nextAttempt
      );

      if (result.status === 'retry') {
        this.updateState({
          phase: 'COLLAPSING',
          attempt: nextAttempt,
          towerCollapsed: result.collapsed,
          lastSimulationTrajectory: result.trajectory,
          lastAffectedStones: result.affectedStones,
        });
        return result;
      }

      const consumedQuota = this.state.quota.consumeOne();
      this.updateState({
        phase: 'SETTLED',
        attempt: 0, // Reset attempt counter upon settlement to prevent session leaks
        towerCollapsed: false,
        quota: consumedQuota,
        savedWishId: result.id,
        effectiveCategory: result.category,
        selectedStone: this.state.selectedStone.withPose(result.pose),
        lastSimulationTrajectory: result.trajectory,
        lastAffectedStones: undefined,
      });
      return result;
    } catch (error) {
      this.updateState({ phase: 'IDLE' });
      throw error;
    } finally {
      this.isPlacing = false;
    }
  }

  /**
   * SCR-08 / SCR-09 AR 세션 화면 사진 촬영 (DB-013)
   */
  async captureARPhoto(): Promise<CapturedImage> {
    if (!this.state.arSession) {
      throw new Error('AR_SESSION_NOT_ACTIVE');
    }
    const image = await this.state.arSession.capture();
    this.updateState({
      capturedPhoto: image,
    });
    return image;
  }

  async stopARSession(): Promise<void> {
    if (this.state.arSession) {
      await this.state.arSession.stop();
      this.updateState({
        arSession: null,
        mode: '3d',
      });
    }
  }
}
