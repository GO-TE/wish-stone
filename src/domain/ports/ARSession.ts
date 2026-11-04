import { Stone } from '../entities/Stone.ts';
import { Tower } from '../entities/Tower.ts';
import { Pose } from '../value-objects/Pose.ts';
import { type DropResult } from './PhysicsWorld.ts';

export type ARImplementationKind = 'viro' | 'webxr' | 'overlay';
export type Unsubscribe = () => void;

export interface CapturedImage {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
  readonly mimeType: 'image/png' | 'image/jpeg';
}

export interface DragHandle {
  moveTo(worldPose: Pose): void;
  release(): Promise<DropResult>;
  cancel(): void;
}

/**
 * AR 세션 공통 인터페이스 (포트)
 * 구현체 3종(ViroReact / WebXR / CameraOverlay)을 추상화하여 화면 계층이 플랫폼 차이를 모르게 한다.
 * 근거: 기술 스택.md 3장, 아키텍처 설계.md 4·5장, D-003
 */
export interface ARSession {
  readonly kind: ARImplementationKind;
  readonly supportsPlaneDetection: boolean;

  start(): Promise<void>;
  onPlaneFound(cb: (anchor: Pose) => void): Unsubscribe;
  placeTower(tower: Tower, anchor: Pose): void;
  beginDrag(stone: Stone): DragHandle;
  capture(): Promise<CapturedImage>;
  stop(): Promise<void>;
}
