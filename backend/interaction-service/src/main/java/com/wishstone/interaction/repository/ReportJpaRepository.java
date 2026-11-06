package com.wishstone.interaction.repository;

import com.wishstone.interaction.entity.ReportEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReportJpaRepository extends JpaRepository<ReportEntity, Long> {

    boolean existsByWishIdAndReporterId(String wishId, String reporterId);

    long countByWishId(String wishId);
}
