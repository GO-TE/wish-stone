package com.stonewish.wishtower.service;

import java.time.LocalDate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * [사수 멘토링 포인트 - 일일 소원 쿼터 & 수익화(BM) 확장 설계 (D-018)]
 * 단순히 "if (todayCount >= 5) throw ..." 처럼 상수로 막아버리면,
 * 나중에 '광고 보고 돌 1개 더 쌓기'나 '소원석 패키지 결제'를 붙일 때 코드를 다 뜯어고쳐야 합니다.
 *
 * 처음부터 [기본 무료 제공량(baseQuota) + 보너스 충전량(bonusQuota) - 오늘 사용량(usedCount)] 공식의
 * 지갑(Quota) 구조로 분리해 두면, 추후 광고/결제 보상 API는 grantBonusQuota()만 호출하면 끝납니다!
 */
@Service
public class DailyWishQuotaService {

    public record QuotaState(
        String userId,
        LocalDate date,
        int baseQuota,
        int bonusQuota,
        int usedCount
    ) {
        public int remaining() {
            return Math.max(0, (baseQuota + bonusQuota) - usedCount);
        }

        public boolean canConsume() {
            return remaining() > 0;
        }
    }

    public interface DailyQuotaPort {
        QuotaState findOrInit(String userId, LocalDate date, int defaultBaseQuota);
        QuotaState save(QuotaState state);
    }

    private final DailyQuotaPort quotaPort;
    private final int defaultBaseQuota;

    public DailyWishQuotaService(
        DailyQuotaPort quotaPort,
        @Value("${stonewish.quota.daily-base:5}") int defaultBaseQuota
    ) {
        this.quotaPort = quotaPort;
        this.defaultBaseQuota = defaultBaseQuota;
    }

    public QuotaState getQuota(String userId, LocalDate today) {
        return quotaPort.findOrInit(userId, today, defaultBaseQuota);
    }

    /**
     * 소원 1건 등록 시 일일 쿼터를 1 차감한다. 남은 쿼터가 없으면 DAILY_QUOTA_EXCEEDED 예외를 던진다.
     */
    public QuotaState consumeOne(String userId, LocalDate today) {
        QuotaState current = quotaPort.findOrInit(userId, today, defaultBaseQuota);
        if (!current.canConsume()) {
            throw new IllegalStateException("DAILY_QUOTA_EXCEEDED");
        }

        QuotaState updated = new QuotaState(
            current.userId(),
            current.date(),
            current.baseQuota(),
            current.bonusQuota(),
            current.usedCount() + 1
        );
        return quotaPort.save(updated);
    }

    /**
     * 리워드 광고 시청 또는 인앱 결제 완료 시 당일 보너스 소원 쿼터를 충전한다.
     */
    public QuotaState grantBonusQuota(String userId, LocalDate today, int bonusAmount) {
        if (bonusAmount <= 0) {
            throw new IllegalArgumentException("INVALID_BONUS_AMOUNT");
        }
        QuotaState current = quotaPort.findOrInit(userId, today, defaultBaseQuota);
        QuotaState updated = new QuotaState(
            current.userId(),
            current.date(),
            current.baseQuota(),
            current.bonusQuota() + bonusAmount,
            current.usedCount()
        );
        return quotaPort.save(updated);
    }
}
