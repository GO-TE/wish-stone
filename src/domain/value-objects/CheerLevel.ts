export type CheerLevelValue = 0 | 1 | 2 | 3;

export interface CheerThresholds {
  readonly level1: number;
  readonly level2: number;
  readonly level3: number;
}

export const DEFAULT_CHEER_THRESHOLDS: CheerThresholds = Object.freeze({
  level1: 10,
  level2: 50,
  level3: 100,
});

/**
 * 응원 수 단계 (0~3단계)
 * 정확한 응원 수는 작성자 본인에게만 공개하고 타인에게는 빛나는 단계만 노출한다 (DB-017, D-006)
 */
export class CheerLevel {
  readonly level: CheerLevelValue;

  private constructor(level: CheerLevelValue) {
    this.level = level;
  }

  static of(level: CheerLevelValue): CheerLevel {
    return new CheerLevel(level);
  }

  static fromCount(
    count: number,
    thresholds: CheerThresholds = DEFAULT_CHEER_THRESHOLDS
  ): CheerLevel {
    if (count < 0) {
      throw new Error('CHEER_COUNT_NEGATIVE');
    }
    if (count >= thresholds.level3) return new CheerLevel(3);
    if (count >= thresholds.level2) return new CheerLevel(2);
    if (count >= thresholds.level1) return new CheerLevel(1);
    return new CheerLevel(0);
  }

  isHigherThan(other: CheerLevel): boolean {
    return this.level > other.level;
  }
}
