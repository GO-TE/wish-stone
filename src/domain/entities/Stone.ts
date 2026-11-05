import { Pose } from '../value-objects/Pose.ts';

export type StoneShape = 'round' | 'flat' | 'pebble' | 'boulder' | 'tall';

export interface StoneProps {
  readonly shape: StoneShape;
  readonly color: string;
  readonly pose: Pose;
}

/**
 * 돌(Stone) 엔티티/값 객체
 * 근거: 아키텍처 설계.md 3장, DB-008
 */
export class Stone {
  readonly shape: StoneShape;
  readonly color: string;
  readonly pose: Pose;

  constructor(props: StoneProps) {
    if (!props.color.startsWith('#')) {
      throw new Error('INVALID_STONE_COLOR');
    }
    this.shape = props.shape;
    this.color = props.color;
    this.pose = props.pose;
  }

  withPose(pose: Pose): Stone {
    return new Stone({
      shape: this.shape,
      color: this.color,
      pose,
    });
  }
}
