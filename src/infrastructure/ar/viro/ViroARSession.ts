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
 * 모바일 네이티브 AR 세션 어댑터 (ViroReact: ARKit / ARCore)
 * 근거: 기술 스택.md 3장, 아키텍처 설계.md 5장, D-003
 */
export class ViroARSession implements ARSession {
  readonly kind = 'viro' as const;
  readonly supportsPlaneDetection = true;

  private readonly physics: PhysicsWorld;
  private active = false;
  private anchor: Pose = Pose.origin();
  private planeListeners = new Set<(anchor: Pose) => void>();

  constructor(physics: PhysicsWorld) {
    this.physics = physics;
  }

  async start(): Promise<void> {
    this.active = true;
  }

  onPlaneFound(cb: (anchor: Pose) => void): Unsubscribe {
    this.planeListeners.add(cb);
    return () => {
      this.planeListeners.delete(cb);
    };
  }

  /**
   * ViroARPlaneSelector에서 바닥 평면이 감지되었을 때 호출
   */
  notifyPlaneDetected(planeAnchor: Pose): void {
    this.anchor = planeAnchor;
    for (const cb of this.planeListeners) {
      cb(planeAnchor);
    }
  }

  placeTower(tower: Tower, anchor: Pose): void {
    this.anchor = anchor;
    // AR 성능을 위해 최근 50개 돌만 물리 정적 바디로 등록 (화면 설계서 SCR-08 2단계)
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
      uri: `file:///cache/stonewish-ar-${Date.now()}.jpg`,
      width: 1080,
      height: 1920,
      mimeType: 'image/jpeg',
    };
  }

  async stop(): Promise<void> {
    this.active = false;
    this.planeListeners.clear();
    this.physics.dispose();
  }
}
