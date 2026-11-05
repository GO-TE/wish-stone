import { BrowseRandomWishesUseCase } from '../../application/usecases/BrowseRandomWishesUseCase.ts';
import { CheerWishUseCase } from '../../application/usecases/CheerWishUseCase.ts';
import { FulfillWishUseCase } from '../../application/usecases/FulfillWishUseCase.ts';
import { StackStoneUseCase } from '../../application/usecases/StackStoneUseCase.ts';
import { InMemoryEffectBus } from '../../domain/ports/EffectBus.ts';
import { type PhysicsWorld } from '../../domain/ports/PhysicsWorld.ts';
import { type DailyWishQuotaProps } from '../../domain/value-objects/DailyWishQuota.ts';
import { ToastStore } from '../../presentation/components/toastStore.ts';
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
import { OptimisticMutationManager } from '../cache/OptimisticMutationManager.ts';
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
 * StoneWish ?꾨줎?몄뿏??Composition Root (DI 而⑦뀒?대꼫)
 * - `MsaHttpClient`, `MsaAuthService` (JWT ?좏겙 ?먮룞 ?숆린??, 由ы룷吏?좊━ 3醫?`MsaWishRepository`, `MsaTowerRepository`, `MsaGroupRepository`),
 *   `BoundedSeenWishStore`, `SimpleTowerPhysicsWorld`, `InMemoryEffectBus`, `ARSessionFactory`瑜??⑥씪 ?몄뒪?댁뒪 洹몃옒?꾨줈 議곕┰?쒕떎.
 * - 7媛??붾㈃ 而⑦듃濡ㅻ윭(`OnboardingController`, `DashboardController`, `StackStoneController`, `ExploreWishesController`,
 *   `MyWishesController`, `GroupController`, `SettingsController`)媛 ?숈씪???몄쬆 ?몄뀡쨌?댄럺??踰꾩뒪쨌由ы룷吏?좊━ 而⑦뀓?ㅽ듃瑜?怨듭쑀?섎룄濡??곌껐?쒕떎.
 * 洹쇨굅: ?꾪궎?띿쿂 ?ㅺ퀎.md 1쨌2?? D-011, D-013
 */
export function createAppContainer(config: AppContainerConfig = {}) {
  const baseUrl = config.baseUrl ?? 'http://localhost:8080';
  const rawFetch = config.fetchImpl ?? globalThis.fetch;
  const fetchFn: FetchLike = (input, init) => (rawFetch as unknown as FetchLike).call(globalThis, input, init);
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
  const toastStore = new ToastStore();
  const optimisticManager = new OptimisticMutationManager(
    wishes,
    effects,
    toastStore
  );
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
    toastStore,
    optimisticManager,
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
 * Expo Router ?붾㈃(`src/app/**`)?ㅼ씠 ?숈씪???몄뀡쨌?곹깭 而⑦뀒?대꼫瑜?怨듭쑀?섎룄濡?諛섑솚?섎뒗 ?깃????묎렐??
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
