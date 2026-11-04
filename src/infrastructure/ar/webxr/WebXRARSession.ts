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
 * 웹 WebXR(immersive-ar + hit-test) AR 세션 어댑터 (Android Chrome 등)
 * 근거: 기술 스택.md 3장, 아키텍처 설계.md 5장, DB-028, D-003
 */
export class WebXRARSession implements ARSession {
  readonly kind = 'webxr' as const;
  readonly supportsPlaneDetection = true;

  private readonly physics: PhysicsWorld;
  private active = false;
  private anchor: Pose = Pose.origin();
  private hitListeners = new Set<(anchor: Pose) => void>();

  constructor(physics: PhysicsWorld) {
    this.physics = physics;
  }

  async start(): Promise<void> {
    this.active = true;
  }

  onPlaneFound(cb: (anchor: Pose) => void): Unsubscribe {
    this.hitListeners.add(cb);
    return () => {
      this.hitListeners.delete(cb);
    };
  }

  notifyHitTestPose(hitPose: Pose): void {
    this.anchor = hitPose;
    for (const cb of this.hitListeners) {
      cb(hitPose);
    }
  }

  placeTower(tower: Tower, anchor: Pose): void {
    this.anchor = anchor;
    const recentStones = tower.stones.slice(-50).map((s) => s.stone);
    this.physics.addStatic(recentStones);
  }

  beginDrag(stone: Stone): DragHandle {
    let currentWorldPose = stone.pose;
    return {
      moveTo: (worldPose: Pose) => {
        currentWorldPose = worldPose;
      },
      release: async () => {
        const localDropPose = currentWorldPose.toTowerLocal(this.anchor);
        return this.physics.drop(stone, localDropPose);
      },
      cancel: () => {
        currentWorldPose = stone.pose;
      },
    };
  }

  async capture(): Promise<CapturedImage> {
    if (!this.active) {
      throw new Error('AR_SESSION_NOT_ACTIVE');
    }
    return {
      uri: `blob:stonewish-webxr-${Date.now()}`,
      width: 1080,
      height: 1920,
      mimeType: 'image/png',
    };
  }

  async stop(): Promise<void> {
    this.active = false;
    this.hitListeners.clear();
    this.physics.dispose();
  }
}
