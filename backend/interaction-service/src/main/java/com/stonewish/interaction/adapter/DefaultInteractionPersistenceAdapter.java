package com.stonewish.interaction.adapter;

import com.stonewish.interaction.entity.CheerEntity;
import com.stonewish.interaction.entity.ReportEntity;
import com.stonewish.interaction.repository.CheerJpaRepository;
import com.stonewish.interaction.repository.ReportJpaRepository;
import com.stonewish.interaction.service.CheerCommandService.CheerPersistencePort;
import com.stonewish.interaction.service.CheerCommandService.WishSummary;
import com.stonewish.interaction.service.ReportCommandService.ReportPersistencePort;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/**
 * Sprint 5: interaction-service Spring Data JPA 기반 영속성 어댑터 (cheers / reports 테이블 연동)
 */
@Repository
@Transactional
public class DefaultInteractionPersistenceAdapter
    implements CheerPersistencePort, ReportPersistencePort {

    private final CheerJpaRepository cheerRepository;
    private final ReportJpaRepository reportRepository;
    private final Map<String, WishSummary> wishSummaries = new ConcurrentHashMap<>();

    @Autowired
    public DefaultInteractionPersistenceAdapter(
        CheerJpaRepository cheerRepository,
        ReportJpaRepository reportRepository
    ) {
        this.cheerRepository = cheerRepository;
        this.reportRepository = reportRepository;
    }

    public void registerWishSummary(String wishId, String authorId, int currentCheerCount) {
        wishSummaries.put(wishId, new WishSummary(wishId, authorId, currentCheerCount));
    }

    @Override
    @Transactional(readOnly = true)
    public WishSummary fetchWishSummary(String wishId) {
        return wishId != null ? wishSummaries.get(wishId) : null;
    }

    @Override
    @Transactional(readOnly = true)
    public boolean existsCheer(String wishId, String userId) {
        return cheerRepository.existsByWishIdAndUserId(wishId, userId);
    }

    @Override
    public void saveCheer(String wishId, String userId) {
        cheerRepository.save(new CheerEntity(wishId, userId, Instant.now()));
        wishSummaries.computeIfPresent(
            wishId,
            (k, prev) -> new WishSummary(prev.wishId(), prev.authorId(), prev.currentCheerCount() + 1)
        );
    }

    @Override
    @Transactional(readOnly = true)
    public boolean existsReport(String wishId, String reporterUserId) {
        return reportRepository.existsByWishIdAndReporterId(wishId, reporterUserId);
    }

    @Override
    public int saveReportAndCount(String wishId, String reporterUserId, String reason) {
        String normalizedReason = reason != null && reason.length() > 30
            ? reason.substring(0, 30)
            : reason;
        reportRepository.save(new ReportEntity(wishId, reporterUserId, normalizedReason, Instant.now()));
        return (int) reportRepository.countByWishId(wishId);
    }
}
