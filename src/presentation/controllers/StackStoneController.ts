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

export interface StackStoneViewState {
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
      savedWishId: null,
      capturedPhoto: null,
      lastEffect: null,
    };

    this.app.effects.subscribe((event) => {
      this.state = {
        ...this.state,
        lastEffect: event,
        towerCollapsed:
          event.type === 'tower_collapsed' ? true : this.state.towerCollapsed,
      };
    });
  }

  getState(): StackStoneViewState {
    return this.state;
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
    this.state = {
      ...this.state,
      selectedStone: nextStone,
    };
    return nextStone;
  }

  /**
   * SCR-06 소원 텍스트 입력 시 실시간 자동 카테고리 분류 프리뷰 갱신 (D-016)
   */
  updateContent(content: string): StackStoneViewState {
    const autoCategory = CategoryAutoClassifier.classify(content);
    const effectiveCategory = this.state.manualCategory ?? autoCategory;
    this.state = {
      ...this.state,
      content,
      autoCategory,
      effectiveCategory,
    };
    return this.state;
  }

  /**
   * SCR-06 자동 분류된 카테고리를 사용자가 수동으로 변경하거나 자동 모드로 되돌림 (D-016)
   */
  overrideCategory(category: CategoryCode | null): StackStoneViewState {
    const effectiveCategory = category ?? this.state.autoCategory;
    this.state = {
      ...this.state,
      manualCategory: category,
      effectiveCategory,
    };
    return this.state;
  }

  /**
   * 올릴 돌탑 범위(전체 공개 돌탑 / 지인 그룹 돌탑) 선택 (DB-009)
   */
  selectScope(scope: TowerKey): StackStoneViewState {
    this.state = {
      ...this.state,
      scope,
    };
    return this.state;
  }

  /**
   * 리워드 광고 시청 또는 결제를 통한 오늘 소원 보너스 쿼터 충전 (D-018)
   */
  grantRewardQuotaBonus(amount = 1): DailyWishQuota {
    const updatedQuota = this.state.quota.grantRewardBonus(amount);
    this.state = {
      ...this.state,
      quota: updatedQuota,
    };
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
      this.state = {
        ...this.state,
        mode: '3d',
        arSession: null,
      };
      return this.state;
    }

    const session = await this.app.arSessionFactory.create(
      this.app.capabilities
    );
    if (!session) {
      this.state = {
        ...this.state,
        mode: '3d',
        arSession: null,
      };
      return this.state;
    }

    await session.start();
    if (tower) {
      session.placeTower(tower, anchor);
    }

    this.state = {
      ...this.state,
      mode: 'ar',
      arSession: session,
    };
    return this.state;
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
      this.state = {
        ...this.state,
        attempt: nextAttempt,
        towerCollapsed: result.collapsed,
      };
      return result;
    }

    const consumedQuota = this.state.quota.consumeOne();
    this.state = {
      ...this.state,
      attempt: nextAttempt,
      towerCollapsed: false,
      quota: consumedQuota,
      savedWishId: result.id,
      effectiveCategory: result.category,
      selectedStone: this.state.selectedStone.withPose(result.pose),
    };
    return result;
  }

  /**
   * SCR-08 / SCR-09 AR 세션 화면 사진 촬영 (DB-013)
   */
  async captureARPhoto(): Promise<CapturedImage> {
    if (!this.state.arSession) {
      throw new Error('AR_SESSION_NOT_ACTIVE');
    }
    const image = await this.state.arSession.capture();
    this.state = {
      ...this.state,
      capturedPhoto: image,
    };
    return image;
  }

  async stopARSession(): Promise<void> {
    if (this.state.arSession) {
      await this.state.arSession.stop();
      this.state = {
        ...this.state,
        arSession: null,
        mode: '3d',
      };
    }
  }
}
