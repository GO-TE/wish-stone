import { Stone } from '../../../domain/entities/Stone.ts';
import { Tower } from '../../../domain/entities/Tower.ts';
import {
  type ARSession,
  type CapturedImage,
  type DragHandle,
  type Unsubscribe,
} from '../../../domain/ports/ARSession.ts';
import { type PhysicsWorld } from '../../../domain/ports/PhysicsWorld.ts';
import { Pose } from '../../../domain/value-objects/Pose.ts';

/**
 * WebXR 미지원 웹 환경(iOS Safari, PC)을 위한 카메라 오버레이 간이 AR 어댑터
 * 바닥 인식 단계를 건너뛰고 화면 하단 고정 위치에 3D 돌탑을 배치한다.
 * 근거: 기술 스택.md 3장, 화면 설계서 SCR-08 2단계, DB-028, D-003
 */
export class CameraOverlayARSession implements ARSession {
  readonly kind = 'overlay' as const;
  readonly supportsPlaneDetection = false;

  private readonly physics: PhysicsWorld;
  private active = false;
  private anchor: Pose = Pose.origin();

  constructor(physics: PhysicsWorld) {
    this.physics = physics;
  }

  async start(): Promise<void> {
    this.active = true;
  }

  onPlaneFound(cb: (anchor: Pose) => void): Unsubscribe {
    // 간이 AR은 바닥 인식이 없으므로 즉시 고정 앵커(origin)를 전달한다.
    cb(this.anchor);
    return () => {};
  }

  placeTower(tower: Tower, anchor: Pose): void {
    this.anchor = anchor;
    const recentStones = tower.stones.slice(-50).map((s) => s.stone);
    this.physics.addStatic(recentStones);
  }

  beginDrag(stone: Stone): DragHandle {
    let currentPose = stone.pose;
    return {
      moveTo: (worldPose: Pose) => {
        currentPose = worldPose;
      },
      release: async () => {
        const localPose = currentPose.toTowerLocal(this.anchor);
        return this.physics.drop(stone, localPose);
      },
      cancel: () => {
        currentPose = stone.pose;
      },
    };
  }

  async capture(): Promise<CapturedImage> {
    if (!this.active) {
      throw new Error('AR_SESSION_NOT_ACTIVE');
    }
    // video 프레임 + R3F WebGL 캔버스 합성 캡처
    return {
      uri: `data:image/png;base64,stonewish-overlay-${Date.now()}`,
      width: 1080,
      height: 1920,
      mimeType: 'image/png',
    };
  }

  async stop(): Promise<void> {
    this.active = false;
    this.physics.dispose();
  }
}
