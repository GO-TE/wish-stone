import { type UserId } from './Wish.ts';

export type GroupId = string;

export interface GroupProps {
  readonly id: GroupId;
  readonly name: string;
  readonly inviteCode: string;
  readonly ownerId: UserId;
  readonly maxMembers: number;
  readonly memberCount: number;
  readonly stoneCount: number;
}

/**
 * 지인 그룹 돌탑 엔티티
 * 근거: 데이터 모델.md 1장, API-12~15, DB-005
 */
export class Group {
  readonly id: GroupId;
  readonly name: string;
  readonly inviteCode: string;
  readonly ownerId: UserId;
  readonly maxMembers: number;
  readonly memberCount: number;
  readonly stoneCount: number;

  constructor(props: GroupProps) {
    if (props.name.trim().length < 2 || props.name.trim().length > 20) {
      throw new Error('GROUP_NAME_INVALID');
    }
    this.id = props.id;
    this.name = props.name.trim();
    this.inviteCode = props.inviteCode;
    this.ownerId = props.ownerId;
    this.maxMembers = props.maxMembers;
    this.memberCount = props.memberCount;
    this.stoneCount = props.stoneCount;
  }

  isFull(): boolean {
    return this.memberCount >= this.maxMembers;
  }
}
