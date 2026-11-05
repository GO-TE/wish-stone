package com.stonewish.wishtower.adapter;

import com.stonewish.wishtower.consumer.InteractionEventConsumer.WishEventProjectionHandler;
import com.stonewish.wishtower.service.DailyWishQuotaService.DailyQuotaPort;
import com.stonewish.wishtower.service.DailyWishQuotaService.QuotaState;
import com.stonewish.wishtower.service.TowerQueryService.TowerQueryPort;
import com.stonewish.wishtower.service.TowerQueryService.TowerStatsResponse;
import com.stonewish.wishtower.service.WishCommandService.WishPersistencePort;
import com.stonewish.wishtower.service.WishCommandService.WishRecord;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.stereotype.Repository;

/**
 * N-07: wish-tower-service 기본 스레드 안전 영속성 및 통계/쿼터/이벤트 프로젝션 통합 어댑터
 */
@Repository
public class DefaultWishTowerPersistenceAdapter
    implements WishPersistencePort, TowerQueryPort, DailyQuotaPort, WishEventProjectionHandler {

    private final Map<String, WishRecord> wishes = new ConcurrentHashMap<>();
    private final Map<String, String> bloomTypes = new ConcurrentHashMap<>();
    private final Map<String, QuotaState> quotas = new ConcurrentHashMap<>();
    private final Set<String> processedEventIds = ConcurrentHashMap.newKeySet();

    private final Map<String, AtomicLong> stoneCounts = new ConcurrentHashMap<>();
    private final Map<String, AtomicLong> todayCounts = new ConcurrentHashMap<>();
    private final Map<String, AtomicLong> fulfilledCounts = new ConcurrentHashMap<>();
    private final Map<String, AtomicLong> cheerCounts = new ConcurrentHashMap<>();

    @Override
    public WishRecord save(WishRecord wish) {
        WishRecord prev = wishes.put(wish.id(), wish);
        String towerKey = resolveTowerKey(wish);
        if (prev == null) {
            stoneCounts.computeIfAbsent(towerKey, k -> new AtomicLong()).incrementAndGet();
            todayCounts.computeIfAbsent(towerKey, k -> new AtomicLong()).incrementAndGet();
            cheerCounts.computeIfAbsent(towerKey, k -> new AtomicLong()).addAndGet(wish.cheerCount());
        } else if (!"FULFILLED".equalsIgnoreCase(prev.status()) && "FULFILLED".equalsIgnoreCase(wish.status())) {
            fulfilledCounts.computeIfAbsent(towerKey, k -> new AtomicLong()).incrementAndGet();
        }
        return wish;
    }

    @Override
    public WishRecord findById(String wishId) {
        return wishId != null ? wishes.get(wishId) : null;
    }

    @Override
    public List<WishRecord> findByTowerKey(String towerKey) {
        List<WishRecord> result = new ArrayList<>();
        for (WishRecord w : wishes.values()) {
            if ("global".equals(towerKey) && (w.groupId() == null || w.groupId().isBlank())) {
                result.add(w);
            } else if (towerKey != null && towerKey.startsWith("cat:") && (w.groupId() == null || w.groupId().isBlank())) {
                String cat = towerKey.substring(4);
                if (cat.equals(w.categoryCode())) {
                    result.add(w);
                }
            } else if (towerKey != null && towerKey.startsWith("group:")) {
                String gid = towerKey.substring(6);
                if (gid.equals(w.groupId())) {
                    result.add(w);
                }
            }
        }
        return result;
    }

    @Override
    public List<WishRecord> findAllPublicActiveWishes() {
        return wishes.values().stream()
            .filter(w -> w.groupId() == null || w.groupId().isBlank())
            .filter(w -> "ACTIVE".equalsIgnoreCase(w.status()))
            .toList();
    }

    @Override
    public List<WishRecord> findByUserId(String userId) {
        return wishes.values().stream()
            .filter(w -> userId.equals(w.userId()))
            .toList();
    }

    @Override
    public String findBloomType(String wishId) {
        return bloomTypes.get(wishId);
    }

    @Override
    public void saveBloomType(String wishId, String bloomType) {
        bloomTypes.put(wishId, bloomType);
    }

    @Override
    public TowerStatsResponse getStats(String towerKey) {
        return new TowerStatsResponse(
            towerKey,
            stoneCounts.getOrDefault(towerKey, new AtomicLong(0)).get(),
            todayCounts.getOrDefault(towerKey, new AtomicLong(0)).get(),
            fulfilledCounts.getOrDefault(towerKey, new AtomicLong(0)).get(),
            cheerCounts.getOrDefault(towerKey, new AtomicLong(0)).get()
        );
    }

    @Override
    public void decrementStoneStats(String towerKey) {
        stoneCounts.computeIfAbsent(towerKey, k -> new AtomicLong(0))
            .updateAndGet(cur -> Math.max(0L, cur - 1L));
    }

    @Override
    public QuotaState findOrInit(String userId, LocalDate date, int defaultBaseQuota) {
        String key = userId + ":" + date;
        return quotas.computeIfAbsent(
            key,
            k -> new QuotaState(userId, date, defaultBaseQuota, 0, 0)
        );
    }

    @Override
    public QuotaState save(QuotaState state) {
        quotas.put(state.userId() + ":" + state.date(), state);
        return state;
    }

    @Override
    public boolean isAlreadyProcessed(String eventId) {
        return eventId != null && processedEventIds.contains(eventId);
    }

    @Override
    public void markProcessed(String eventId, String eventType) {
        if (eventId != null) {
            processedEventIds.add(eventId);
        }
    }

    @Override
    public void incrementCheerCountAndStats(String wishId) {
        WishRecord existing = wishes.get(wishId);
        if (existing != null) {
            WishRecord updated = new WishRecord(
                existing.id(),
                existing.userId(),
                existing.groupId(),
                existing.categoryCode(),
                existing.content(),
                existing.stoneShape(),
                existing.stoneColor(),
                existing.poseJson(),
                existing.cheerCount() + 1,
                existing.status(),
                existing.createdAt()
            );
            wishes.put(wishId, updated);
            String towerKey = resolveTowerKey(existing);
            cheerCounts.computeIfAbsent(towerKey, k -> new AtomicLong()).incrementAndGet();
        }
    }

    @Override
    public void hideWishByReportThreshold(String wishId) {
        WishRecord existing = wishes.get(wishId);
        if (existing != null) {
            WishRecord hidden = new WishRecord(
                existing.id(),
                existing.userId(),
                existing.groupId(),
                existing.categoryCode(),
                existing.content(),
                existing.stoneShape(),
                existing.stoneColor(),
                existing.poseJson(),
                existing.cheerCount(),
                "HIDDEN",
                existing.createdAt()
            );
            wishes.put(wishId, hidden);
        }
    }

    private static String resolveTowerKey(WishRecord wish) {
        return (wish.groupId() != null && !wish.groupId().isBlank())
            ? "group:" + wish.groupId()
            : "global";
    }
}
