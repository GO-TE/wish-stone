package com.stonewish.interaction.adapter;

import com.stonewish.interaction.service.CheerCommandService.CheerPersistencePort;
import com.stonewish.interaction.service.CheerCommandService.WishSummary;
import com.stonewish.interaction.service.ReportCommandService.ReportPersistencePort;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.stereotype.Repository;

/**
 * N-07: interaction-service 기본 스레드 안전 영속성 어댑터 (응원 및 신고 중복 방지 / 카운트)
 */
@Repository
public class DefaultInteractionPersistenceAdapter
    implements CheerPersistencePort, ReportPersistencePort {

    private final Map<String, WishSummary> wishSummaries = new ConcurrentHashMap<>();
    private final Set<String> cheerKeys = ConcurrentHashMap.newKeySet();
    private final Set<String> reportKeys = ConcurrentHashMap.newKeySet();
    private final Map<String, AtomicInteger> reportCounts = new ConcurrentHashMap<>();

    public void registerWishSummary(String wishId, String authorId, int currentCheerCount) {
        wishSummaries.put(wishId, new WishSummary(wishId, authorId, currentCheerCount));
    }

    @Override
    public WishSummary fetchWishSummary(String wishId) {
        return wishId != null ? wishSummaries.get(wishId) : null;
    }

    @Override
    public boolean existsCheer(String wishId, String userId) {
        return cheerKeys.contains(wishId + ":" + userId);
    }

    @Override
    public void saveCheer(String wishId, String userId) {
        cheerKeys.add(wishId + ":" + userId);
        wishSummaries.computeIfPresent(
            wishId,
            (k, prev) -> new WishSummary(prev.wishId(), prev.authorId(), prev.currentCheerCount() + 1)
        );
    }

    @Override
    public boolean existsReport(String wishId, String reporterUserId) {
        return reportKeys.contains(wishId + ":" + reporterUserId);
    }

    @Override
    public int saveReportAndCount(String wishId, String reporterUserId, String reason) {
        reportKeys.add(wishId + ":" + reporterUserId);
        return reportCounts.computeIfAbsent(wishId, k -> new AtomicInteger(0)).incrementAndGet();
    }
}
