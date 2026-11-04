import { Group, type GroupId } from '../entities/Group.ts';
import { Stone } from '../entities/Stone.ts';
import { Tower } from '../entities/Tower.ts';
import { Wish, type WishId, type WishStatus } from '../entities/Wish.ts';
import { type BloomType } from '../value-objects/BloomType.ts';
import { CheerLevel } from '../value-objects/CheerLevel.ts';
import { type CategoryCode, TowerKey } from '../value-objects/TowerKey.ts';

export type ReportReason =
  | 'abuse'
  | 'hate'
  | 'sexual'
  | 'personal_info'
  | 'spam'
  | 'etc';

export interface NewWishInput {
  readonly content: string;
  readonly category: CategoryCode;
  readonly scope: TowerKey;
  readonly stone: Stone;
}

/**
 * 소원 저장소 포트 (Supabase 또는 추후 Spring Boot MSA 어댑터로 교체 가능)
 * 근거: 아키텍처 설계.md 4장, API 명세서.md
 */
export interface WishRepository {
  create(input: NewWishInput): Promise<WishId>;
  random(count: number, excludeIds: readonly WishId[]): Promise<Wish[]>;
  getById(id: WishId): Promise<Wish | null>;
  mine(filter?: WishStatus): Promise<Wish[]>;
  cheer(id: WishId): Promise<{ level: CheerLevel; levelUp: boolean }>;
  report(id: WishId, reason: ReportReason): Promise<void>;
  fulfill(id: WishId, bloom?: BloomType): Promise<BloomType>;
  remove(id: WishId): Promise<void>;
}

export interface TowerRepository {
  get(key: TowerKey, limit?: number): Promise<Tower>;
}

export interface GroupRepository {
  create(name: string): Promise<Group>;
  join(inviteCode: string): Promise<Group>;
  mine(): Promise<Group[]>;
  leave(id: GroupId): Promise<void>;
}

/**
 * 최근 본 랜덤 소원 ID 로컬 저장소 (최근 100개 보관, 서버 DB 부하 절감)
 * 근거: 데이터 모델.md 3장, 아키텍처 설계.md 4장
 */
export interface SeenWishStore {
  recent(): WishId[];
  add(ids: readonly WishId[]): void;
}
