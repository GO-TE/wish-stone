import { BrowseRandomWishesUseCase } from '../../application/usecases/BrowseRandomWishesUseCase.ts';
import { CheerWishUseCase } from '../../application/usecases/CheerWishUseCase.ts';
import { FulfillWishUseCase } from '../../application/usecases/FulfillWishUseCase.ts';
import { StackStoneUseCase } from '../../application/usecases/StackStoneUseCase.ts';
import { InMemoryEffectBus } from '../../domain/ports/EffectBus.ts';
import { type PhysicsWorld } from '../../domain/ports/PhysicsWorld.ts';
import { type DailyWishQuotaProps } from '../../domain/value-objects/DailyWishQuota.ts';
import { DashboardController } from '../../presentation/controllers/DashboardController.ts';
import { ExploreWishesController } from '../../presentation/controllers/ExploreWishesController.ts';
import { GroupController } from '../../presentation/controllers/GroupController.ts';
import { MyWishesController } from '../../presentation/controllers/MyWishesController.ts';
import { OnboardingController } from '../../presentation/controllers/OnboardingController.ts';
import { SettingsController } from '../../presentation/controllers/SettingsController.ts';
import { StackStoneController } from '../../presentation/controllers/StackStoneController.ts';
import {
  type FetchLike,
  MsaHttpClient,
} from '../api/MsaHttpClient.ts';
import { MsaGroupRepository } from '../api/MsaGroupRepository.ts';
import { MsaTowerRepository } from '../api/MsaTowerRepository.ts';
import { MsaWishRepository } from '../api/MsaWishRepository.ts';
import { ARSessionFactory } from '../ar/ARSessionFactory.ts';
import { MsaAuthService } from '../auth/MsaAuthService.ts';
import { SimpleTowerPhysicsWorld } from '../physics/SimpleTowerPhysicsWorld.ts';
import {
  BrowserAndNativeCapabilities,
  type PlatformCapabilities,
} from '../platform/PlatformCapabilities.ts';
import { BoundedSeenWishStore } from '../storage/BoundedSeenWishStore.ts';

export interface AppContainerConfig {
  readonly baseUrl?: string;
  readonly fetchImpl?: FetchLike | typeof fetch;
  readonly capabilities?: PlatformCapabilities;
  readonly physicsFactory?: () => PhysicsWorld;
  readonly initialQuotaProps?: DailyWishQuotaProps;
}

/**
 * StoneWish 프론트엔드 Composition Root (DI 컨테이너)
 * - `MsaHttpClient`, `MsaAuthService` (JWT 토큰 자동 동기화), 리포지토리 3종(`MsaWishRepository`, `MsaTowerRepository`, `MsaGroupRepository`),
 *   `BoundedSeenWishStore`, `SimpleTowerPhysicsWorld`, `InMemoryEffectBus`, `ARSessionFactory`를 단일 인스턴스 그래프로 조립한다.
 * - 7개 화면 컨트롤러(`OnboardingController`, `DashboardController`, `StackStoneController`, `ExploreWishesController`,
 *   `MyWishesController`, `GroupController`, `SettingsController`)가 동일한 인증 세션·이펙트 버스·리포지토리 컨텍스트를 공유하도록 연결한다.
 * 근거: 아키텍처 설계.md 1·2장, D-011, D-013
 */
export function createAppContainer(config: AppContainerConfig = {}) {
  const baseUrl = config.baseUrl ?? 'http://localhost:8080';
  const fetchFn = (config.fetchImpl ??
    globalThis.fetch) as unknown as FetchLike;
  const capabilities =
    config.capabilities ?? new BrowserAndNativeCapabilities(false);
  const physicsFactory =
    config.physicsFactory ?? (() => new SimpleTowerPhysicsWorld());

  const http = new MsaHttpClient(baseUrl, fetchFn);
  const auth = new MsaAuthService(http);
  const wishes = new MsaWishRepository(http);
  const towers = new MsaTowerRepository(http);
  const groups = new MsaGroupRepository(http);
  const seenStore = new BoundedSeenWishStore(100);
  const effects = new InMemoryEffectBus();
  const physics = physicsFactory();
  const arSessionFactory = new ARSessionFactory(physicsFactory);

  const useCases = {
    stackStone: new StackStoneUseCase(wishes, physics, effects),
    cheerWish: new CheerWishUseCase(wishes, effects),
    fulfillWish: new FulfillWishUseCase(wishes, effects),
    browseRandomWishes: new BrowseRandomWishesUseCase(wishes, seenStore),
  };

  const coreContext = {
    http,
    auth,
    repositories: { wishes, towers, groups, seenStore },
    effects,
    capabilities,
    arSessionFactory,
    physics,
    useCases,
  };

  const controllers = {
    onboarding: new OnboardingController(auth),
    dashboard: new DashboardController(coreContext),
    stackStone: new StackStoneController(
      coreContext,
      config.initialQuotaProps
    ),
    exploreWishes: new ExploreWishesController(coreContext),
    myWishes: new MyWishesController(coreContext),
    groups: new GroupController(coreContext),
    settings: new SettingsController(coreContext, config.initialQuotaProps),
  };

  return {
    ...coreContext,
    controllers,
  };
}

export type AppContainer = ReturnType<typeof createAppContainer>;

let sharedContainer: AppContainer | null = null;

/**
 * Expo Router 화면(`src/app/**`)들이 동일한 세션·상태 컨테이너를 공유하도록 반환하는 싱글턴 접근자
 */
export function getSharedAppContainer(): AppContainer {
  if (!sharedContainer) {
    sharedContainer = createAppContainer();
  }
  return sharedContainer;
}

export function resetSharedAppContainer(config?: AppContainerConfig): AppContainer {
  sharedContainer = createAppContainer(config);
  return sharedContainer;
}
