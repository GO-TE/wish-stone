import { BrowseRandomWishesUseCase } from './application/usecases/BrowseRandomWishesUseCase.ts';
import { CheerWishUseCase } from './application/usecases/CheerWishUseCase.ts';
import { FulfillWishUseCase } from './application/usecases/FulfillWishUseCase.ts';
import { StackStoneUseCase } from './application/usecases/StackStoneUseCase.ts';
import { EffectBus } from './domain/ports/EffectBus.ts';
import { type PhysicsWorld } from './domain/ports/PhysicsWorld.ts';
import {
  type GroupRepository,
  type SeenWishStore,
  type TowerRepository,
  type WishRepository,
} from './domain/ports/repositories.ts';
import { ARSessionFactory } from './infrastructure/ar/ARSessionFactory.ts';
import {
  type FetchLike,
  MsaHttpClient,
} from './infrastructure/api/MsaHttpClient.ts';
import { MsaGroupRepository } from './infrastructure/api/MsaGroupRepository.ts';
import { MsaTowerRepository } from './infrastructure/api/MsaTowerRepository.ts';
import { MsaWishRepository } from './infrastructure/api/MsaWishRepository.ts';
import { MsaAuthService } from './infrastructure/auth/MsaAuthService.ts';
import { SimpleTowerPhysicsWorld } from './infrastructure/physics/SimpleTowerPhysicsWorld.ts';
import {
  BrowserAndNativeCapabilities,
  type PlatformCapabilities,
} from './infrastructure/platform/PlatformCapabilities.ts';
import { BoundedSeenWishStore } from './infrastructure/storage/BoundedSeenWishStore.ts';

export interface AppDependencies {
  readonly wishes: WishRepository;
  readonly towers: TowerRepository;
  readonly groups: GroupRepository;
  readonly seenStore: SeenWishStore;
  readonly physicsFactory?: () => PhysicsWorld;
  readonly capabilities?: PlatformCapabilities;
}

/**
 * ?좏뵆由ъ??댁뀡 ?섏〈??二쇱엯(DI) 而⑦뀒?대꼫
 * 諛깆뿏???대뙌??Supabase ?먮뒗 Spring Boot MSA)? ?뚮옯???대뙌??Viro/WebXR/Overlay)瑜?議곕┰?쒕떎.
 * 洹쇨굅: ?꾪궎?띿쿂 ?ㅺ퀎.md 1쨌2?? D-011
 */
export function createAppContainer(deps: AppDependencies) {
  const effects = new EffectBus();
  const physicsFactory =
    deps.physicsFactory ?? (() => new SimpleTowerPhysicsWorld());
  const capabilities =
    deps.capabilities ?? new BrowserAndNativeCapabilities(false);
  const arSessionFactory = new ARSessionFactory(physicsFactory);

  return {
    effects,
    capabilities,
    arSessionFactory,
    useCases: {
      stackStone: new StackStoneUseCase(
        deps.wishes,
        physicsFactory(),
        effects
      ),
      cheerWish: new CheerWishUseCase(deps.wishes, effects),
      fulfillWish: new FulfillWishUseCase(deps.wishes, effects),
      browseRandomWishes: new BrowseRandomWishesUseCase(
        deps.wishes,
        deps.seenStore
      ),
    },
  };
}

/**
 * Spring Cloud Gateway (:8080) 諛깆뿏?쒖? ?곌껐??湲곕낯 MSA 而⑦뀒?대꼫 ?앹꽦湲? */
export function createMsaAppContainer(
  gatewayBaseUrl = 'http://localhost:8080',
  fetchFn?: FetchLike,
  capabilities?: PlatformCapabilities
) {
  const safeFetch: FetchLike = (input, init) => ((fetchFn || globalThis.fetch) as unknown as FetchLike).call(globalThis, input, init);
  const http = new MsaHttpClient(gatewayBaseUrl, safeFetch);
  const auth = new MsaAuthService(http);
  const wishes = new MsaWishRepository(http);
  const towers = new MsaTowerRepository(http);
  const groups = new MsaGroupRepository(http);
  const seenStore = new BoundedSeenWishStore(100);

  return {
    http,
    auth,
    repositories: { wishes, towers, groups, seenStore },
    ...createAppContainer({
      wishes,
      towers,
      groups,
      seenStore,
      capabilities,
    }),
  };
}
