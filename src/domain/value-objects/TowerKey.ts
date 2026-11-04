export type CategoryCode = 'job' | 'study' | 'health' | 'relation' | 'etc';
export type TowerScopeType = 'global' | 'category' | 'group';

/**
 * 돌탑 식별 키 (`global` | `cat:{code}` | `group:{uuid}`)
 * 근거: 데이터 모델.md 2장, D-008, D-009
 */
export class TowerKey {
  readonly type: TowerScopeType;
  readonly value: string;

  private constructor(type: TowerScopeType, value: string) {
    this.type = type;
    this.value = value;
  }

  static global(): TowerKey {
    return new TowerKey('global', 'global');
  }

  static category(code: CategoryCode): TowerKey {
    return new TowerKey('category', code);
  }

  static group(groupId: string): TowerKey {
    if (!groupId || groupId.trim().length === 0) {
      throw new Error('GROUP_ID_REQUIRED');
    }
    return new TowerKey('group', groupId.trim());
  }

  static parse(raw: string): TowerKey {
    if (raw === 'global') return TowerKey.global();
    if (raw.startsWith('cat:')) {
      return TowerKey.category(raw.slice(4) as CategoryCode);
    }
    if (raw.startsWith('group:')) {
      return TowerKey.group(raw.slice(6));
    }
    throw new Error(`INVALID_TOWER_KEY: ${raw}`);
  }

  /**
   * 그룹 돌탑에서만 작성자 닉네임을 표시하고, 전체·카테고리 돌탑에서는 익명으로 표시한다 (DB-005, DB-023, D-008)
   */
  showsNickname(): boolean {
    return this.type === 'group';
  }

  toString(): string {
    if (this.type === 'global') return 'global';
    if (this.type === 'category') return `cat:${this.value}`;
    return `group:${this.value}`;
  }
}
