export interface DailyWishQuotaProps {
  readonly baseQuota?: number;
  readonly bonusQuota?: number;
  readonly usedCount?: number;
}

/**
 * 일일 소원 생성 쿼터 값 객체 (기본 무료 5개 + 리워드 광고/결제 보너스 쿼터 확장 구조)
 * 근거: D-018, API-05
 */
export class DailyWishQuota {
  readonly baseQuota: number;
  readonly bonusQuota: number;
  readonly usedCount: number;

  constructor(props: DailyWishQuotaProps = {}) {
    this.baseQuota = props.baseQuota ?? 5;
    this.bonusQuota = props.bonusQuota ?? 0;
    this.usedCount = props.usedCount ?? 0;
  }

  get remaining(): number {
    return Math.max(0, this.baseQuota + this.bonusQuota - this.usedCount);
  }

  canStack(): boolean {
    return this.remaining > 0;
  }

  consumeOne(): DailyWishQuota {
    if (!this.canStack()) {
      throw new Error('DAILY_QUOTA_EXCEEDED');
    }
    return new DailyWishQuota({
      baseQuota: this.baseQuota,
      bonusQuota: this.bonusQuota,
      usedCount: this.usedCount + 1,
    });
  }

  grantRewardBonus(amount = 1): DailyWishQuota {
    if (amount <= 0) {
      throw new Error('INVALID_BONUS_AMOUNT');
    }
    return new DailyWishQuota({
      baseQuota: this.baseQuota,
      bonusQuota: this.bonusQuota + amount,
      usedCount: this.usedCount,
    });
  }
}
