import { Bloom, type BloomType } from '../value-objects/BloomType.ts';
import { CategoryAutoClassifier } from '../value-objects/CategoryAutoClassifier.ts';
import { CheerLevel } from '../value-objects/CheerLevel.ts';
import { type CategoryCode, TowerKey } from '../value-objects/TowerKey.ts';
import { Stone } from './Stone.ts';

export type WishId = string;
export type UserId = string;
export type WishStatus = 'active' | 'fulfilled' | 'hidden' | 'deleted';

const MAX_WISH_LENGTH = 200;
export const DEFAULT_FORBIDDEN_WISH_WORDS: readonly string[] = Object.freeze([
  '시발',
  '씨발',
  '병신',
  '개새끼',
  '불법도박',
  '바카라',
  '카지노',
  '조건만남',
]);

export interface WishProps {
  readonly id: WishId;
  readonly authorId?: UserId | null;
  readonly authorNickname?: string | null;
  readonly isMine: boolean;
  readonly content: string;
  readonly category?: CategoryCode;
  readonly scope: TowerKey;
  readonly stone: Stone;
  readonly status: WishStatus;
  readonly bloom: BloomType | null;
  readonly cheerCount?: number;
  readonly cheerLevel?: CheerLevel;
  readonly cheeredByMe?: boolean;
  readonly createdAt: Date;
  readonly fulfilledAt?: Date | null;
}

/**
 * 소원(Wish) 도메인 엔티티
 * 근거: 아키텍처 설계.md 3장, D-016(카테고리 자동 분류 + 사후 수정), D-017(응원 단계), D-019(전화번호 제한 해제)
 */
export class Wish {
  readonly id: WishId;
  readonly authorId: UserId | null;
  private readonly rawNickname: string | null;
  readonly isMine: boolean;
  readonly content: string;
  private _category: CategoryCode;
  readonly scope: TowerKey;
  readonly stone: Stone;
  private _status: WishStatus;
  private _bloom: BloomType | null;
  private _cheerCount: number;
  private _cheerLevel: CheerLevel;
  private _cheeredByMe: boolean;
  readonly createdAt: Date;
  private _fulfilledAt: Date | null;

  constructor(props: WishProps) {
    Wish.validateContent(props.content);
    this.id = props.id;
    this.authorId = props.authorId ?? null;
    this.rawNickname = props.authorNickname ?? null;
    this.isMine = props.isMine;
    this.content = props.content.trim();
    this._category =
      props.category ?? CategoryAutoClassifier.classify(this.content);
    this.scope = props.scope;
    this.stone = props.stone;
    this._status = props.status;
    this._bloom = props.bloom;
    this._cheerCount = props.cheerCount ?? 0;
    this._cheerLevel =
      props.cheerLevel ?? CheerLevel.fromCount(this._cheerCount);
    this._cheeredByMe = props.cheeredByMe ?? false;
    this.createdAt = props.createdAt;
    this._fulfilledAt = props.fulfilledAt ?? null;
  }

  static validateContent(
    content: string,
    forbiddenWords: readonly string[] = DEFAULT_FORBIDDEN_WISH_WORDS
  ): void {
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      throw new Error('CONTENT_EMPTY');
    }
    if (trimmed.length > MAX_WISH_LENGTH) {
      throw new Error('CONTENT_TOO_LONG');
    }
    if (forbiddenWords.some((word) => trimmed.includes(word))) {
      throw new Error('CONTENT_BLOCKED');
    }
  }

  get category(): CategoryCode {
    return this._category;
  }

  get status(): WishStatus {
    return this._status;
  }

  get bloom(): BloomType | null {
    return this._bloom;
  }

  get fulfilledAt(): Date | null {
    return this._fulfilledAt;
  }

  get cheeredByMe(): boolean {
    return this._cheeredByMe;
  }

  /**
   * 자동 분류된 카테고리를 작성자가 직접 변경한다 (D-016)
   */
  changeCategory(newCategory: CategoryCode): void {
    if (!this.isMine) {
      throw new Error('NOT_OWNER');
    }
    this._category = newCategory;
  }

  /**
   * 그룹 돌탑일 때만 작성자 닉네임(닉네임#태그)을 반환하고, 공개 돌탑에서는 항상 null을 반환한다 (DB-005, DB-023)
   */
  get displayNickname(): string | null {
    return this.scope.showsNickname() ? this.rawNickname : null;
  }

  /**
   * 정확한 응원 수는 작성자 본인에게만 노출한다 (DB-017, D-006)
   */
  get visibleCheerCount(): number | null {
    return this.isMine ? this._cheerCount : null;
  }

  cheerLevel(): CheerLevel {
    return this._cheerLevel;
  }

  canBeCheeredBy(userId?: UserId): boolean {
    if (this.isMine) return false;
    if (userId && this.authorId && userId === this.authorId) return false;
    if (this._cheeredByMe) return false;
    if (this._status === 'hidden' || this._status === 'deleted') return false;
    return true;
  }

  applyCheer(): { level: CheerLevel; levelUp: boolean } {
    if (!this.canBeCheeredBy()) {
      throw new Error(this.isMine ? 'CANNOT_CHEER_OWN' : 'ALREADY_CHEERED');
    }
    const prevLevel = this._cheerLevel;
    this._cheerCount += 1;
    this._cheerLevel = CheerLevel.fromCount(this._cheerCount);
    this._cheeredByMe = true;
    return {
      level: this._cheerLevel,
      levelUp: this._cheerLevel.isHigherThan(prevLevel),
    };
  }

  fulfill(bloom?: BloomType, randomFn?: () => number): BloomType {
    if (!this.isMine) {
      throw new Error('NOT_OWNER');
    }
    if (this._status === 'fulfilled') {
      throw new Error('ALREADY_FULFILLED');
    }
    if (this._status !== 'active') {
      throw new Error('WISH_NOT_ACTIVE');
    }
    const chosen = bloom ?? Bloom.random(randomFn);
    this._status = 'fulfilled';
    this._bloom = chosen;
    this._fulfilledAt = new Date();
    return chosen;
  }

  markDeleted(): void {
    if (!this.isMine) {
      throw new Error('NOT_OWNER');
    }
    this._status = 'deleted';
  }
}
