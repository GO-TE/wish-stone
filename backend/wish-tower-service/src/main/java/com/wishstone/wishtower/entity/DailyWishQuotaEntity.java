package com.wishstone.wishtower.entity;

import com.wishstone.wishtower.service.DailyWishQuotaService.QuotaState;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Objects;

/**
 * Sprint 5: wish_db.daily_wish_quotas 테이블 매핑 JPA 엔티티 (복합 PK: user_id, quota_date)
 */
@Entity
@Table(name = "daily_wish_quotas")
@IdClass(DailyWishQuotaEntity.QuotaId.class)
public class DailyWishQuotaEntity {

    public static class QuotaId implements Serializable {
        private String userId;
        private LocalDate quotaDate;

        public QuotaId() {
        }

        public QuotaId(String userId, LocalDate quotaDate) {
            this.userId = userId;
            this.quotaDate = quotaDate;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof QuotaId that)) return false;
            return Objects.equals(userId, that.userId) && Objects.equals(quotaDate, that.quotaDate);
        }

        @Override
        public int hashCode() {
            return Objects.hash(userId, quotaDate);
        }
    }

    @Id
    @Column(name = "user_id", length = 36, nullable = false)
    private String userId;

    @Id
    @Column(name = "quota_date", nullable = false)
    private LocalDate quotaDate;

    @Column(name = "base_quota", nullable = false)
    private int baseQuota;

    @Column(name = "bonus_quota", nullable = false)
    private int bonusQuota;

    @Column(name = "used_count", nullable = false)
    private int usedCount;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected DailyWishQuotaEntity() {
    }

    public DailyWishQuotaEntity(
        String userId,
        LocalDate quotaDate,
        int baseQuota,
        int bonusQuota,
        int usedCount,
        Instant updatedAt
    ) {
        this.userId = userId;
        this.quotaDate = quotaDate;
        this.baseQuota = baseQuota;
        this.bonusQuota = bonusQuota;
        this.usedCount = usedCount;
        this.updatedAt = updatedAt != null ? updatedAt : Instant.now();
    }

    public static DailyWishQuotaEntity fromDomain(QuotaState state) {
        return new DailyWishQuotaEntity(
            state.userId(),
            state.date(),
            state.baseQuota(),
            state.bonusQuota(),
            state.usedCount(),
            Instant.now()
        );
    }

    public QuotaState toDomain() {
        return new QuotaState(userId, quotaDate, baseQuota, bonusQuota, usedCount);
    }
}
