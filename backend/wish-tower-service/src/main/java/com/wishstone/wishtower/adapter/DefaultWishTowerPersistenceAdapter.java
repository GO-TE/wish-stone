package com.wishstone.wishtower.adapter;

import com.wishstone.wishtower.consumer.InteractionEventConsumer.WishEventProjectionHandler;
import com.wishstone.wishtower.entity.CategoryEntity;
import com.wishstone.wishtower.entity.DailyWishQuotaEntity;
import com.wishstone.wishtower.entity.DailyWishQuotaEntity.QuotaId;
import com.wishstone.wishtower.entity.ProcessedEventEntity;
import com.wishstone.wishtower.entity.WishEntity;
import com.wishstone.wishtower.repository.CategoryJpaRepository;
import com.wishstone.wishtower.repository.DailyWishQuotaJpaRepository;
import com.wishstone.wishtower.repository.ProcessedEventJpaRepository;
import com.wishstone.wishtower.repository.WishJpaRepository;
import com.wishstone.wishtower.service.DailyWishQuotaService.DailyQuotaPort;
import com.wishstone.wishtower.service.DailyWishQuotaService.QuotaState;
import com.wishstone.wishtower.service.TowerQueryService;
import com.wishstone.wishtower.service.TowerQueryService.CategoryItem;
import com.wishstone.wishtower.service.TowerQueryService.TowerQueryPort;
import com.wishstone.wishtower.service.TowerQueryService.TowerStatsResponse;
import com.wishstone.wishtower.service.WishCommandService.WishPersistencePort;
import com.wishstone.wishtower.service.WishCommandService.WishRecord;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/**
 * Sprint 5: wish-tower-service Spring Data JPA 기반 영속성 및 통계/쿼터/이벤트 프로젝션 통합 어댑터
 */
@Repository
@Transactional
public class DefaultWishTowerPersistenceAdapter
    implements WishPersistencePort, TowerQueryPort, DailyQuotaPort, WishEventProjectionHandler {

    private final WishJpaRepository wishRepository;
    private final DailyWishQuotaJpaRepository quotaRepository;
    private final ProcessedEventJpaRepository processedEventRepository;
    private final CategoryJpaRepository categoryRepository;

    private final Map<String, AtomicLong> stoneCounts = new ConcurrentHashMap<>();
    private final Map<String, AtomicLong> todayCounts = new ConcurrentHashMap<>();
    private final Map<String, AtomicLong> fulfilledCounts = new ConcurrentHashMap<>();
    private final Map<String, AtomicLong> cheerCounts = new ConcurrentHashMap<>();

    public DefaultWishTowerPersistenceAdapter(
        WishJpaRepository wishRepository,
        DailyWishQuotaJpaRepository quotaRepository,
        ProcessedEventJpaRepository processedEventRepository
    ) {
        this(wishRepository, quotaRepository, processedEventRepository, null);
    }

    @Autowired
    public DefaultWishTowerPersistenceAdapter(
        WishJpaRepository wishRepository,
        DailyWishQuotaJpaRepository quotaRepository,
        ProcessedEventJpaRepository processedEventRepository,
        CategoryJpaRepository categoryRepository
    ) {
        this.wishRepository = wishRepository;
        this.quotaRepository = quotaRepository;
        this.processedEventRepository = processedEventRepository;
        this.categoryRepository = categoryRepository;
    }

    @Override
    public WishRecord save(WishRecord wish) {
        Optional<WishEntity> prevOpt = wishRepository.findById(wish.id());
        String existingBloom = prevOpt.map(WishEntity::getBloomType).orElse(null);
        Instant fulfilledAt = "FULFILLED".equalsIgnoreCase(wish.status())
            ? prevOpt.map(WishEntity::getFulfilledAt).orElse(Instant.now())
            : null;

        WishEntity saved = wishRepository.save(WishEntity.fromRecord(wish, existingBloom, fulfilledAt));
        String towerKey = resolveTowerKey(wish);

        if (prevOpt.isEmpty()) {
            stoneCounts.computeIfAbsent(towerKey, k -> new AtomicLong()).incrementAndGet();
            todayCounts.computeIfAbsent(towerKey, k -> new AtomicLong()).incrementAndGet();
            cheerCounts.computeIfAbsent(towerKey, k -> new AtomicLong()).addAndGet(wish.cheerCount());
        } else if (!"FULFILLED".equalsIgnoreCase(prevOpt.get().getStatus())
            && "FULFILLED".equalsIgnoreCase(wish.status())) {
            fulfilledCounts.computeIfAbsent(towerKey, k -> new AtomicLong()).incrementAndGet();
        }
        return saved.toRecord();
    }

    @Override
    @Transactional(readOnly = true)
    public WishRecord findById(String wishId) {
        if (wishId == null) {
            return null;
        }
        return wishRepository.findById(wishId)
            .map(WishEntity::toRecord)
            .orElse(null);
    }

    @Override
    @Transactional(readOnly = true)
    public List<WishRecord> findByTowerKey(String towerKey) {
        if ("global".equals(towerKey)) {
            return wishRepository.findByGroupIdIsNull().stream()
                .map(WishEntity::toRecord)
                .toList();
        }
        if (towerKey != null && towerKey.startsWith("cat:")) {
            String cat = towerKey.substring(4);
            return wishRepository.findByGroupIdIsNullAndCategoryCode(cat).stream()
                .map(WishEntity::toRecord)
                .toList();
        }
        if (towerKey != null && towerKey.startsWith("group:")) {
            String gid = towerKey.substring(6);
            return wishRepository.findByGroupId(gid).stream()
                .map(WishEntity::toRecord)
                .toList();
        }
        return Collections.emptyList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<WishRecord> findAllPublicActiveWishes() {
        return wishRepository.findByGroupIdIsNullAndStatus("ACTIVE").stream()
            .map(WishEntity::toRecord)
            .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<WishRecord> findByUserId(String userId) {
        return wishRepository.findByUserId(userId).stream()
            .map(WishEntity::toRecord)
            .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public String findBloomType(String wishId) {
        return wishRepository.findById(wishId)
            .map(WishEntity::getBloomType)
            .orElse(null);
    }

    @Override
    public void saveBloomType(String wishId, String bloomType) {
        wishRepository.findById(wishId).ifPresent(entity -> {
            entity.setBloomType(bloomType);
            if (entity.getFulfilledAt() == null) {
                entity.setFulfilledAt(Instant.now());
            }
            wishRepository.save(entity);
        });
    }

    @Override
    @Transactional(readOnly = true)
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
    public List<CategoryItem> findAllCategories() {
        if (categoryRepository == null) {
            return TowerQueryService.DEFAULT_CATEGORIES;
        }
        List<CategoryEntity> existing = categoryRepository.findAllByOrderBySortOrderAsc();
        if (existing.isEmpty()) {
            List<CategoryEntity> defaults = TowerQueryService.DEFAULT_CATEGORIES.stream()
                .map(c -> new CategoryEntity(c.code(), c.label(), c.sortOrder()))
                .toList();
            existing = categoryRepository.saveAll(defaults);
        }
        return existing.stream()
            .map(e -> new CategoryItem(e.getCode(), e.getLabel(), e.getSortOrder()))
            .toList();
    }

    @Override
    public QuotaState findOrInit(String userId, LocalDate date, int defaultBaseQuota) {
        QuotaId id = new QuotaId(userId, date);
        return quotaRepository.findById(id)
            .map(DailyWishQuotaEntity::toDomain)
            .orElseGet(() -> {
                QuotaState initialized = new QuotaState(userId, date, defaultBaseQuota, 0, 0);
                quotaRepository.save(DailyWishQuotaEntity.fromDomain(initialized));
                return initialized;
            });
    }

    @Override
    public QuotaState save(QuotaState state) {
        DailyWishQuotaEntity saved = quotaRepository.save(DailyWishQuotaEntity.fromDomain(state));
        return saved.toDomain();
    }

    @Override
    @Transactional(readOnly = true)
    public boolean isAlreadyProcessed(String eventId) {
        return eventId != null && processedEventRepository.existsById(eventId);
    }

    @Override
    public void markProcessed(String eventId, String eventType) {
        if (eventId != null) {
            processedEventRepository.save(new ProcessedEventEntity(eventId, eventType, Instant.now()));
        }
    }

    @Override
    public void incrementCheerCountAndStats(String wishId) {
        wishRepository.findById(wishId).ifPresent(entity -> {
            entity.incrementCheerCount();
            wishRepository.save(entity);
            String towerKey = resolveTowerKey(entity.toRecord());
            cheerCounts.computeIfAbsent(towerKey, k -> new AtomicLong()).incrementAndGet();
        });
    }

    @Override
    public void hideWishByReportThreshold(String wishId) {
        wishRepository.findById(wishId).ifPresent(entity -> {
            entity.setStatus("HIDDEN");
            wishRepository.save(entity);
        });
    }

    private static String resolveTowerKey(WishRecord wish) {
        return (wish.groupId() != null && !wish.groupId().isBlank())
            ? "group:" + wish.groupId()
            : "global";
    }
}
