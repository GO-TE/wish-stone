package com.stonewish.wishtower.repository;

import com.stonewish.wishtower.entity.DailyWishQuotaEntity;
import com.stonewish.wishtower.entity.DailyWishQuotaEntity.QuotaId;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DailyWishQuotaJpaRepository extends JpaRepository<DailyWishQuotaEntity, QuotaId> {
}
