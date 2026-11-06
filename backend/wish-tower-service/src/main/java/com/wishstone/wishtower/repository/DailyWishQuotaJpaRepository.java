package com.wishstone.wishtower.repository;

import com.wishstone.wishtower.entity.DailyWishQuotaEntity;
import com.wishstone.wishtower.entity.DailyWishQuotaEntity.QuotaId;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DailyWishQuotaJpaRepository extends JpaRepository<DailyWishQuotaEntity, QuotaId> {
}
