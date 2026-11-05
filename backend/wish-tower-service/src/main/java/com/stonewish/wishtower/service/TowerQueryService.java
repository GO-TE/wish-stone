package com.stonewish.wishtower.service;

import com.stonewish.wishtower.client.UserAuthFeignClient;
import com.stonewish.wishtower.client.UserAuthFeignClient.NicknameBatchRequest;
import com.stonewish.wishtower.service.WishCommandService.WishRecord;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;

/**
 * [사수 멘토링 포인트 - 돌탑 조회(익명성 vs 지인 그룹 실명), 랜덤 소원 풀, 성취/삭제 생명주기 서비스]
 * 1) 공개 돌탑 익명성 보장(D-001): global / cat:* 돌탑과 랜덤 소원 카드에서는 작성자 userId를 응답 DTO에서 원천 제거하고,
 *    authorNickname도 null로 내려 완전 익명을 보장합니다.
 * 2) 지인 그룹 돌탑 닉네임#태그 해석(D-003): towerKey가 "group:"으로 시작할 때만 UserAuthFeignClient로 배치 조회하며,
 *    user-auth-service 장애 시 서킷브레이커 폴백("익명의 그룹원")으로 돌탑 렌더링 중단을 방지합니다.
 * 3) 소원 삭제 시 물리 붕괴 메타데이터 반환: 돌이 삭제(Soft Delete)되면 돌탑 통계 카운터를 원자적으로 차감하고,
 *    클라이언트 물리 엔진이 `tower_collapsed` 재정렬 연출을 즉시 트리거할 수 있도록 붕괴 층수(collapsedFloorIndex)를 반환합니다.
 */
@Service
public class TowerQueryService {

    public record TowerStoneView(
        String id,
        int floorIndex,
        String categoryCode,
        String stoneShape,
        String stoneColor,
        String poseJson,
        String status,
        String bloomType,
        int cheerCount,
        int cheerLevel,
        boolean isMine,
        String authorNickname,
        Instant createdAt
    ) {}

    public record TowerViewResponse(
        String towerKey,
        List<TowerStoneView> stones,
        boolean hasMore
    ) {}

    public record TowerStatsResponse(
        String towerKey,
        long totalStoneCount,
        long totalCheerCount,
        long todayWishCount
    ) {}

    /**
     * 익명 랜덤 소원 카드 DTO - 작성자 추적 방지를 위해 userId 필드를 원천 배제한다.
     */
    public record AnonymousWishCard(
        String id,
        String categoryCode,
        String content,
        String stoneShape,
        String stoneColor,
        int cheerCount,
        int cheerLevel,
        Instant createdAt
    ) {}

    public record FulfillWishResult(
        String id,
        String status,
        String bloomType,
        Instant fulfilledAt
    ) {}

    public record CollapseMetadata(
        String wishId,
        String towerKey,
        String status,
        String eventType,
        int collapsedFloorIndex,
        long remainingStoneCount
    ) {}

    public interface TowerQueryPort {
        List<WishRecord> findByTowerKey(String towerKey);
        List<WishRecord> findAllPublicActiveWishes();
        List<WishRecord> findByUserId(String userId);
        WishRecord findById(String wishId);
        WishRecord save(WishRecord wish);
        String findBloomType(String wishId);
        void saveBloomType(String wishId, String bloomType);
        TowerStatsResponse getStats(String towerKey);
        void decrementStoneStats(String towerKey);
    }

    private final TowerQueryPort queryPort;
    private final UserAuthFeignClient userAuthFeignClient;

    public TowerQueryService(TowerQueryPort queryPort, UserAuthFeignClient userAuthFeignClient) {
        this.queryPort = queryPort;
        this.userAuthFeignClient = userAuthFeignClient;
    }

    /**
     * API-03: 돌탑 돌 목록 조회 (GET /api/v1/towers/{towerKey})
     * - 생성 시각(floorIndex) 오름차순 정렬
     * - 공개 돌탑(global, cat:*): authorNickname = null (완전 익명)
     * - 그룹 돌탑(group:{id}): UserAuthFeignClient 배치 호출로 "닉네임#태그" 주입 (장애 시 "익명의 그룹원" 폴백)
     */
    public TowerViewResponse getTower(String towerKey, String callerUserId, int limit) {
        int effectiveLimit = limit > 0 ? Math.min(limit, 500) : 200;
        List<WishRecord> rawStones = queryPort.findByTowerKey(towerKey).stream()
            .filter(w -> "ACTIVE".equals(w.status()) || "FULFILLED".equals(w.status()))
            .sorted(Comparator.comparing(WishRecord::createdAt).thenComparing(WishRecord::id))
            .toList();

        boolean hasMore = rawStones.size() > effectiveLimit;
        List<WishRecord> sliced = hasMore ? rawStones.subList(0, effectiveLimit) : rawStones;

        boolean isGroupTower = towerKey != null && towerKey.startsWith("group:");
        Map<String, String> nicknameMap = Collections.emptyMap();
        if (isGroupTower && !sliced.isEmpty()) {
            List<String> distinctUserIds = sliced.stream()
                .map(WishRecord::userId)
                .distinct()
                .toList();
            NicknameBatchRequest batchRequest = new NicknameBatchRequest(distinctUserIds);
            try {
                Map<String, String> fetched = userAuthFeignClient.getNicknames(batchRequest);
                nicknameMap = fetched != null ? fetched : Collections.emptyMap();
            } catch (Throwable ex) {
                nicknameMap = userAuthFeignClient.fallbackNicknames(batchRequest, ex);
            }
        }

        List<TowerStoneView> stoneViews = new ArrayList<>(sliced.size());
        for (int i = 0; i < sliced.size(); i++) {
            WishRecord w = sliced.get(i);
            String authorNickname = isGroupTower
                ? nicknameMap.getOrDefault(w.userId(), "익명의 그룹원")
                : null;
            String bloomType = "FULFILLED".equals(w.status()) ? queryPort.findBloomType(w.id()) : null;

            stoneViews.add(new TowerStoneView(
                w.id(),
                i,
                w.categoryCode(),
                w.stoneShape(),
                w.stoneColor(),
                w.poseJson(),
                w.status(),
                bloomType,
                w.cheerCount(),
                calcCheerLevel(w.cheerCount()),
                callerUserId != null && callerUserId.equals(w.userId()),
                authorNickname,
                w.createdAt()
            ));
        }

        return new TowerViewResponse(towerKey, stoneViews, hasMore);
    }

    /**
     * API-04: 돌탑 통계 조회 (GET /api/v1/towers/{towerKey}/stats)
     * Redis Hash 원자적 카운터(totalStoneCount, totalCheerCount, todayWishCount) 반환
     */
    public TowerStatsResponse getTowerStats(String towerKey) {
        return queryPort.getStats(towerKey);
    }

    /**
     * API-06: 익명 랜덤 소원 카드 풀 조회 (GET /api/v1/wishes/random?size=10&excludeIds=...)
     * - 본인 소원 제외, excludeIds 제외, 공개 ACTIVE 소원만 대상, userId 원천 제거
     */
    public List<AnonymousWishCard> getRandomWishes(String callerUserId, int size, Set<String> excludeIds) {
        int targetSize = size > 0 ? Math.min(size, 50) : 10;
        Set<String> safeExcludes = excludeIds != null ? excludeIds : Collections.emptySet();

        List<WishRecord> candidates = new ArrayList<>(
            queryPort.findAllPublicActiveWishes().stream()
                .filter(w -> "ACTIVE".equals(w.status()))
                .filter(w -> w.groupId() == null || w.groupId().isBlank())
                .filter(w -> callerUserId == null || !callerUserId.equals(w.userId()))
                .filter(w -> !safeExcludes.contains(w.id()))
                .toList()
        );

        Collections.shuffle(candidates);

        return candidates.stream()
            .limit(targetSize)
            .map(w -> new AnonymousWishCard(
                w.id(),
                w.categoryCode(),
                w.content(),
                w.stoneShape(),
                w.stoneColor(),
                w.cheerCount(),
                calcCheerLevel(w.cheerCount()),
                w.createdAt()
            ))
            .toList();
    }

    /**
     * API-09: 내 소원 목록 조회 (GET /api/v1/wishes/me)
     * - ACTIVE 및 FULFILLED 상태의 내 소원을 최신순 반환
     */
    public List<WishRecord> getMyWishes(String callerUserId) {
        if (callerUserId == null || callerUserId.isBlank()) {
            throw new IllegalArgumentException("USER_ID_REQUIRED");
        }
        return queryPort.findByUserId(callerUserId).stream()
            .filter(w -> "ACTIVE".equals(w.status()) || "FULFILLED".equals(w.status()))
            .sorted(Comparator.comparing(WishRecord::createdAt).reversed())
            .toList();
    }

    /**
     * API-10: 소원 이루어짐(성취) 처리 (PATCH /api/v1/wishes/{id}/fulfill)
     * - 작성자 본인만 가능, 상태를 FULFILLED로 전환하고 개화 연출 타입(bloomType) 저장
     */
    public FulfillWishResult fulfillWish(String wishId, String callerUserId, String requestedBloomType) {
        WishRecord existing = queryPort.findById(wishId);
        if (existing == null || "DELETED".equals(existing.status())) {
            throw new IllegalArgumentException("WISH_NOT_FOUND");
        }
        if (!existing.userId().equals(callerUserId)) {
            throw new IllegalStateException("NOT_OWNER");
        }
        if ("FULFILLED".equals(existing.status())) {
            throw new IllegalStateException("ALREADY_FULFILLED");
        }

        String resolvedBloomType = (requestedBloomType != null && !requestedBloomType.isBlank())
            ? requestedBloomType
            : "wildflower";

        WishRecord updated = new WishRecord(
            existing.id(),
            existing.userId(),
            existing.groupId(),
            existing.categoryCode(),
            existing.content(),
            existing.stoneShape(),
            existing.stoneColor(),
            existing.poseJson(),
            existing.cheerCount(),
            "FULFILLED",
            existing.createdAt()
        );
        queryPort.save(updated);
        queryPort.saveBloomType(wishId, resolvedBloomType);

        return new FulfillWishResult(wishId, "FULFILLED", resolvedBloomType, Instant.now());
    }

    /**
     * API-11: 내 소원 삭제 (DELETE /api/v1/wishes/{id})
     * - 작성자 본인만 가능, Soft Delete(DELETED) 전환, 돌탑 통계 차감 및 `tower_collapsed` 물리 메타데이터 반환
     */
    public CollapseMetadata deleteWish(String wishId, String callerUserId) {
        WishRecord existing = queryPort.findById(wishId);
        if (existing == null || "DELETED".equals(existing.status())) {
            throw new IllegalArgumentException("WISH_NOT_FOUND");
        }
        if (!existing.userId().equals(callerUserId)) {
            throw new IllegalStateException("NOT_OWNER");
        }

        String towerKey = (existing.groupId() != null && !existing.groupId().isBlank())
            ? "group:" + existing.groupId()
            : "global";

        List<WishRecord> activeBeforeDelete = queryPort.findByTowerKey(towerKey).stream()
            .filter(w -> "ACTIVE".equals(w.status()) || "FULFILLED".equals(w.status()))
            .sorted(Comparator.comparing(WishRecord::createdAt).thenComparing(WishRecord::id))
            .toList();

        int collapsedFloorIndex = 0;
        for (int i = 0; i < activeBeforeDelete.size(); i++) {
            if (activeBeforeDelete.get(i).id().equals(wishId)) {
                collapsedFloorIndex = i;
                break;
            }
        }

        WishRecord deleted = new WishRecord(
            existing.id(),
            existing.userId(),
            existing.groupId(),
            existing.categoryCode(),
            existing.content(),
            existing.stoneShape(),
            existing.stoneColor(),
            existing.poseJson(),
            existing.cheerCount(),
            "DELETED",
            existing.createdAt()
        );
        queryPort.save(deleted);
        queryPort.decrementStoneStats(towerKey);

        TowerStatsResponse updatedStats = queryPort.getStats(towerKey);
        return new CollapseMetadata(
            wishId,
            towerKey,
            "DELETED",
            "tower_collapsed",
            collapsedFloorIndex,
            updatedStats.totalStoneCount()
        );
    }

    private static int calcCheerLevel(int cheerCount) {
        if (cheerCount >= 15) return 3;
        if (cheerCount >= 5) return 2;
        if (cheerCount >= 1) return 1;
        return 0;
    }
}
