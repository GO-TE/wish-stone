import { Tower } from '../../domain/entities/Tower.ts';
import { Wish } from '../../domain/entities/Wish.ts';
import { type VisualEffectEvent } from '../../domain/ports/EffectBus.ts';
import { TowerKey } from '../../domain/value-objects/TowerKey.ts';
import { createMsaAppContainer } from '../../container.ts';

export interface DashboardViewState {
  readonly currentTowerKey: TowerKey;
  readonly tower: Tower | null;
  readonly randomCards: readonly Wish[];
  readonly lastEffect: VisualEffectEvent | null;
}

/**
 * 대시보드(홈: SCR-04) 프레젠테이션 컨트롤러
 * UI 컴포넌트가 백엔드(Spring Boot MSA)나 플랫폼 세부 구현을 직접 알지 않고
 * 돌탑 전환(DB-003), 랜덤 소원 카드 스와이프(DB-014, 015), 응원하기(DB-016, 017)를 수행하도록 연결한다.
 */
export class DashboardController {
  private readonly app: ReturnType<typeof createMsaAppContainer>;
  private state: DashboardViewState = {
    currentTowerKey: TowerKey.global(),
    tower: null,
    randomCards: [],
    lastEffect: null,
  };

  constructor(app = createMsaAppContainer()) {
    this.app = app;
    this.app.effects.subscribe((event) => {
      this.state = { ...this.state, lastEffect: event };
    });
  }

  getState(): DashboardViewState {
    return this.state;
  }

  async loadDashboard(towerKey: TowerKey = TowerKey.global()): Promise<DashboardViewState> {
    const [tower, randomCards] = await Promise.all([
      this.app.repositories.towers.get(towerKey, 200),
      this.app.useCases.browseRandomWishes.execute(5),
    ]);

    this.state = {
      ...this.state,
      currentTowerKey: towerKey,
      tower,
      randomCards,
    };
    return this.state;
  }

  async switchTower(towerKey: TowerKey): Promise<Tower> {
    const tower = await this.app.repositories.towers.get(towerKey, 200);
    this.state = {
      ...this.state,
      currentTowerKey: towerKey,
      tower,
    };
    return tower;
  }

  async cheerWish(wish: Wish) {
    return this.app.useCases.cheerWish.execute(wish);
  }
}
