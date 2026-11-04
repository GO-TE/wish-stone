import { type ARSession } from '../../domain/ports/ARSession.ts';
import { type PhysicsWorld } from '../../domain/ports/PhysicsWorld.ts';
import { type PlatformCapabilities } from '../platform/PlatformCapabilities.ts';
import { CameraOverlayARSession } from './overlay/CameraOverlayARSession.ts';
import { ViroARSession } from './viro/ViroARSession.ts';
import { WebXRARSession } from './webxr/WebXRARSession.ts';

/**
 * 플랫폼 기능에 따라 최적의 ARSession 구현체를 선택하는 팩토리 (전략 + 팩토리 패턴)
 * 우선순위:
 * 1) 모바일 네이티브 + ARKit/ARCore 지원 -> ViroARSession
 * 2) 웹 + WebXR immersive-ar 지원 -> WebXRARSession
 * 3) 카메라 사용 가능 (iOS Safari, PC 웹 등) -> CameraOverlayARSession (간이 AR)
 * 4) 그 외 -> null (일반 3D 모드로 폴백, AR 메뉴 숨김)
 *
 * 근거: 아키텍처 설계.md 5장, 기술 스택.md 3장, DB-027, DB-028, D-003
 */
export class ARSessionFactory {
  private readonly createPhysics: () => PhysicsWorld;

  constructor(createPhysics: () => PhysicsWorld) {
    this.createPhysics = createPhysics;
  }

  async create(caps: PlatformCapabilities): Promise<ARSession | null> {
    if (caps.isNative && (await caps.hasARKitOrARCore())) {
      return new ViroARSession(this.createPhysics());
    }

    if (!caps.isNative && (await caps.hasWebXRImmersiveAR())) {
      return new WebXRARSession(this.createPhysics());
    }

    if (await caps.hasCamera()) {
      return new CameraOverlayARSession(this.createPhysics());
    }

    return null;
  }
}
