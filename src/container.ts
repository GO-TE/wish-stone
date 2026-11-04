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
 * 애플리케이션 의존성 주입(DI) 컨테이너
 * 백엔드 어댑터(Supabase 또는 Spring Boot MSA)와 플랫폼 어댑터(Viro/WebXR/Overlay)를 조립한다.
 * 근거: 아키텍처 설계.md 1·2장, D-011
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
 * Spring Cloud Gateway (:8080) 백엔드와 연결된 기본 MSA 컨테이너 생성기
 */
export function createMsaAppContainer(
  gatewayBaseUrl = 'http://localhost:8080',
  fetchFn?: FetchLike,
  capabilities?: PlatformCapabilities
) {
  const http = new MsaHttpClient(gatewayBaseUrl, fetchFn);
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
