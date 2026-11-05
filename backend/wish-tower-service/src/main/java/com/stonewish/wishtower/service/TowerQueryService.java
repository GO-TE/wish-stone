package com.stonewish.wishtower.service;

import com.stonewish.wishtower.client.GroupMembershipFeignClient;
import com.stonewish.wishtower.client.UserAuthFeignClient;
import com.stonewish.wishtower.client.UserAuthFeignClient.NicknameBatchRequest;
import com.stonewish.wishtower.service.WishCommandService.WishRecord;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * [사수 멘토링 포인트 - 돌탑 조회(익명성 vs 지인 그룹 실명), 랜덤 소원 풀, 성취/삭제 생명주기 서비스]
 * 1) 공개 돌탑 익명성 보장(D-001): global / cat:* 돌탑과 랜덤 소원 카드에서는 작성자 userId를 응답 DTO에서 원천 제거하고,
 *    nickname도 null로 내려 완전 익명을 보장합니다.
 * 2) 지인 그룹 돌탑 권한 검증(N-06) & 닉네임#태그 해석(D-003): towerKey가 "group:"으로 시작할 때는
 *    먼저 GroupMembershipFeignClient로 그룹원 여부를 확인(비그룹원 또는 장애 시 403 NOT_GROUP_MEMBER 차단)한 뒤,
 *    UserAuthFeignClient로 배치 조회하며 user-auth-service 장애 시 서킷브레이커 폴백("익명의 그룹원")을 적용합니다.
 * 3) 소원 삭제 시 물리 붕괴 메타데이터 반환: 돌이 삭제(Soft Delete)되면 돌탑 통계 카운터를 원자적으로 차감하고,
 *    클라이언트 물리 엔진이 `tower_collapsed` 재정렬 연출을 즉시 트리거할 수 있도록 붕괴 층수(collapsedFloorIndex)를 반환합니다.
 */
@Service
public class TowerQueryService {

    private static final Set<String> ALLOWED_BLOOM_TYPES = Set.of("flower", "sprout", "moss");
    private static final Pattern NUM_FIELD_PATTERN = Pattern.compile("\"([a-zA-Z]+)\"\\s*:\\s*([-+]?\\d*\\.?\\d+)");

    /**
     * M-01: 프론트엔드 3D 물리 엔진과 주고받는 돌 위치/회전(Quaternion) 객체
     */
    public record StonePose(
        double x,
        double y,
        double z,
        double qx,
        double qy,
        double qz,
        double qw
    ) {
        public static final StonePose DEFAULT = new StonePose(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0);

        public String toJson() {
            return String.format(
                Locale.US,
                "{\"x\":%s,\"y\":%s,\"z\":%s,\"qx\":%s,\"qy\":%s,\"qz\":%s,\"qw\":%s}",
                fmt(x), fmt(y), fmt(z), fmt(qx), fmt(qy), fmt(qz), fmt(qw)
            );
        }

        public static StonePose fromJson(String json) {
            if (json == null || json.isBlank()) {
                return DEFAULT;
            }
            double x = 0.0, y = 0.0, z = 0.0, qx = 0.0, qy = 0.0, qz = 0.0, qw = 1.0;
            Matcher m = NUM_FIELD_PATTERN.matcher(json);
            while (m.find()) {
                String key = m.group(1);
                double val = Double.parseDouble(m.group(2));
                switch (key) {
                    case "x" -> x = val;
                    case "y" -> y = val;
                    case "z" -> z = val;
                    case "qx" -> qx = val;
                    case "qy" -> qy = val;
                    case "qz" -> qz = val;
                    case "qw" -> qw = val;
                    default -> {}
                }
            }
            return new StonePose(x, y, z, qx, qy, qz, qw);
        }

        private static String fmt(double d) {
            if (d == (long) d) {
                return String.valueOf((long) d);
            }
            return String.valueOf(d);
        }
    }

    /**
     * M-01 & M-02: 돌탑 돌 뷰 DTO (pose JSON 객체, nickname 필드명, 소문자 status: active|fulfilled)
     */
    public record TowerStoneView(
        String id,
        int floorIndex,
        String categoryCode,
        String stoneShape,
        String stoneColor,
        StonePose pose,
        String status,
        String bloomType,
        int cheerCount,
        int cheerLevel,
        boolean isMine,
        String nickname,
        Instant createdAt
    ) {}

    public record TowerViewResponse(
        String towerKey,
        List<TowerStoneView> stones,
        boolean hasMore
    ) {}

    /**
     * M-03: 돌탑 통계 응답 DTO ({ stoneCount, todayCount, fulfilledCount, cheerCount })
     */
    public record TowerStatsResponse(
        String towerKey,
        long stoneCount,
        long todayCount,
        long fulfilledCount,
        long cheerCount
    ) {}

    /**
     * M-04: 익명 랜덤 소원 카드 DTO - userId/nickname을 원천 배제하고 pose, stoneShape, stoneColor, cheerLevel, categoryCode, status 포함
     */
    public record AnonymousWishCard(
        String id,
        String categoryCode,
        String content,
        String stoneShape,
        String stoneColor,
        StonePose pose,
        String status,
        int cheerCount,
        int cheerLevel,
        Instant createdAt
    ) {}

    /**
     * M-01 & M-08: 내 소원 목록 항목 DTO (pose 객체, 소문자 status, isMine: true 포함)
     */
    public record MyWishView(
        String id,
        String groupId,
        String categoryCode,
        String content,
        String stoneShape,
        String stoneColor,
        StonePose pose,
        String status,
        String bloomType,
        int cheerCount,
        int cheerLevel,
        boolean isMine,
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

    public record CategoryItem(
        String code,
        String label,
        int sortOrder
    ) {}

    public record WishInternalSummary(
        String wishId,
        String authorId,
        int currentCheerCount
    ) {}

    public static final List<CategoryItem> DEFAULT_CATEGORIES = List.of(
        new CategoryItem("job", "취업", 1),
        new CategoryItem("study", "학업", 2),
        new CategoryItem("health", "건강", 3),
        new CategoryItem("relation", "관계", 4),
        new CategoryItem("etc", "기타", 5)
    );

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

        default List<CategoryItem> findAllCategories() {
            return DEFAULT_CATEGORIES;
        }
    }

    private final TowerQueryPort queryPort;
    private final UserAuthFeignClient userAuthFeignClient;
    private final GroupMembershipFeignClient groupMembershipFeignClient;

    public TowerQueryService(TowerQueryPort queryPort, UserAuthFeignClient userAuthFeignClient) {
        this(queryPort, userAuthFeignClient, null);
    }

    @Autowired
    public TowerQueryService(
        TowerQueryPort queryPort,
        UserAuthFeignClient userAuthFeignClient,
        GroupMembershipFeignClient groupMembershipFeignClient
    ) {
        this.queryPort = queryPort;
        this.userAuthFeignClient = userAuthFeignClient;
        this.groupMembershipFeignClient = groupMembershipFeignClient;
    }

    /**
     * API-03: 돌탑 돌 목록 조회 (GET /api/v1/towers/{towerKey})
     * - 생성 시각(floorIndex) 오름차순 정렬
     * - 공개 돌탑(global, cat:*): nickname = null (완전 익명)
     * - 그룹 돌탑(group:{id}):
     *   1) N-06: GroupMembershipFeignClient로 그룹원 여부 검증 (비그룹원 또는 장애 시 NOT_GROUP_MEMBER 403 예외)
     *   2) UserAuthFeignClient 배치 호출로 "닉네임#태그" 주입 (장애 시 "익명의 그룹원" 폴백)
     */
    public TowerViewResponse getTower(String towerKey, String callerUserId, int limit) {
        boolean isGroupTower = towerKey != null && towerKey.startsWith("group:");
        if (isGroupTower) {
            String groupId = towerKey.substring(6);
            verifyGroupMembership(groupId, callerUserId);
        }

        int effectiveLimit = limit > 0 ? Math.min(limit, 500) : 200;
        List<WishRecord> rawStones = queryPort.findByTowerKey(towerKey).stream()
            .filter(w -> isActiveOrFulfilled(w.status()))
            .sorted(Comparator.comparing(WishRecord::createdAt).thenComparing(WishRecord::id))
            .toList();

        boolean hasMore = rawStones.size() > effectiveLimit;
        List<WishRecord> sliced = hasMore ? rawStones.subList(0, effectiveLimit) : rawStones;

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
            String nickname = isGroupTower
                ? nicknameMap.getOrDefault(w.userId(), "익명의 그룹원")
                : null;
            String normalizedStatus = w.status().toLowerCase(Locale.ROOT);
            String bloomType = "fulfilled".equals(normalizedStatus) ? queryPort.findBloomType(w.id()) : null;

            stoneViews.add(new TowerStoneView(
                w.id(),
                i,
                w.categoryCode(),
                w.stoneShape(),
                w.stoneColor(),
                StonePose.fromJson(w.poseJson()),
                normalizedStatus,
                bloomType,
                w.cheerCount(),
                calcCheerLevel(w.cheerCount()),
                callerUserId != null && callerUserId.equals(w.userId()),
                nickname,
                w.createdAt()
            ));
        }

        return new TowerViewResponse(towerKey, stoneViews, hasMore);
    }

    private void verifyGroupMembership(String groupId, String callerUserId) {
        if (callerUserId == null || callerUserId.isBlank()) {
            throw new IllegalStateException("NOT_GROUP_MEMBER");
        }
        if (groupMembershipFeignClient == null) {
            return;
        }
        Map<String, Boolean> result;
        try {
            result = groupMembershipFeignClient.checkMembership(groupId, callerUserId);
        } catch (Throwable ex) {
            result = groupMembershipFeignClient.fallbackMembership(groupId, callerUserId, ex);
        }
        if (result == null || !Boolean.TRUE.equals(result.get("exists"))) {
            throw new IllegalStateException("NOT_GROUP_MEMBER");
        }
    }

    /**
     * API-04: 돌탑 통계 조회 (GET /api/v1/towers/{towerKey}/stats)
     * M-03: { stoneCount, todayCount, fulfilledCount, cheerCount } 반환
     */
    public TowerStatsResponse getTowerStats(String towerKey) {
        return queryPort.getStats(towerKey);
    }

    /**
     * API-06: 익명 랜덤 소원 카드 풀 조회 (GET /api/v1/wishes/random?count=10&excludeIds=...)
     * - 본인 소원 제외, excludeIds 제외, 공개 active 소원만 대상, userId/nickname 원천 제거
     */
    public List<AnonymousWishCard> getRandomWishes(String callerUserId, int count, Set<String> excludeIds) {
        int targetSize = count > 0 ? Math.min(count, 50) : 10;
        Set<String> safeExcludes = excludeIds != null ? excludeIds : Collections.emptySet();

        List<WishRecord> candidates = new ArrayList<>(
            queryPort.findAllPublicActiveWishes().stream()
                .filter(w -> "ACTIVE".equalsIgnoreCase(w.status()))
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
                StonePose.fromJson(w.poseJson()),
                w.status().toLowerCase(Locale.ROOT),
                w.cheerCount(),
                calcCheerLevel(w.cheerCount()),
                w.createdAt()
            ))
            .toList();
    }

    /**
     * API-09: 내 소원 목록 조회 (GET /api/v1/wishes/me?status=active|fulfilled)
     * M-08: 선택적 status 필터링 지원 및 isMine: true, pose 객체, 소문자 status 반환
     */
    public List<MyWishView> getMyWishes(String callerUserId, String statusFilter) {
        if (callerUserId == null || callerUserId.isBlank()) {
            throw new IllegalArgumentException("USER_ID_REQUIRED");
        }
        String normalizedFilter = (statusFilter != null && !statusFilter.isBlank())
            ? statusFilter.trim().toLowerCase(Locale.ROOT)
            : null;

        return queryPort.findByUserId(callerUserId).stream()
            .filter(w -> isActiveOrFulfilled(w.status()))
            .filter(w -> normalizedFilter == null || w.status().toLowerCase(Locale.ROOT).equals(normalizedFilter))
            .sorted(Comparator.comparing(WishRecord::createdAt).reversed())
            .map(w -> {
                String lowerStatus = w.status().toLowerCase(Locale.ROOT);
                String bloomType = "fulfilled".equals(lowerStatus) ? queryPort.findBloomType(w.id()) : null;
                return new MyWishView(
                    w.id(),
                    w.groupId(),
                    w.categoryCode(),
                    w.content(),
                    w.stoneShape(),
                    w.stoneColor(),
                    StonePose.fromJson(w.poseJson()),
                    lowerStatus,
                    bloomType,
                    w.cheerCount(),
                    calcCheerLevel(w.cheerCount()),
                    true,
                    w.createdAt()
                );
            })
            .toList();
    }

    public List<MyWishView> getMyWishes(String callerUserId) {
        return getMyWishes(callerUserId, null);
    }

    /**
     * API-10: 소원 이루어짐(성취) 처리 (PATCH /api/v1/wishes/{id}/fulfill)
     * - M-05: 기본 bloomType은 flower|sprout|moss 중 하나("flower" 기본값)
     */
    public FulfillWishResult fulfillWish(String wishId, String callerUserId, String requestedBloomType) {
        WishRecord existing = queryPort.findById(wishId);
        if (existing == null || "DELETED".equalsIgnoreCase(existing.status())) {
            throw new IllegalArgumentException("WISH_NOT_FOUND");
        }
        if (!existing.userId().equals(callerUserId)) {
            throw new IllegalStateException("NOT_OWNER");
        }
        if ("FULFILLED".equalsIgnoreCase(existing.status())) {
            throw new IllegalStateException("ALREADY_FULFILLED");
        }

        String candidateBloom = (requestedBloomType != null && !requestedBloomType.isBlank())
            ? requestedBloomType.trim().toLowerCase(Locale.ROOT)
            : "flower";
        String resolvedBloomType = ALLOWED_BLOOM_TYPES.contains(candidateBloom)
            ? candidateBloom
            : "flower";

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

        return new FulfillWishResult(wishId, "fulfilled", resolvedBloomType, Instant.now());
    }

    /**
     * API-11: 내 소원 삭제 (DELETE /api/v1/wishes/{id})
     * - 작성자 본인만 가능, Soft Delete(DELETED) 전환, 돌탑 통계 차감 및 `tower_collapsed` 물리 메타데이터 반환
     */
    public CollapseMetadata deleteWish(String wishId, String callerUserId) {
        WishRecord existing = queryPort.findById(wishId);
        if (existing == null || "DELETED".equalsIgnoreCase(existing.status())) {
            throw new IllegalArgumentException("WISH_NOT_FOUND");
        }
        if (!existing.userId().equals(callerUserId)) {
            throw new IllegalStateException("NOT_OWNER");
        }

        String towerKey = (existing.groupId() != null && !existing.groupId().isBlank())
            ? "group:" + existing.groupId()
            : "global";

        List<WishRecord> activeBeforeDelete = queryPort.findByTowerKey(towerKey).stream()
            .filter(w -> isActiveOrFulfilled(w.status()))
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
            "deleted",
            "tower_collapsed",
            collapsedFloorIndex,
            updatedStats.stoneCount()
        );
    }

    /**
     * API-16: 소원 카테고리 목록 조회 (GET /api/v1/categories)
     */
    public List<CategoryItem> getCategories() {
        List<CategoryItem> categories = queryPort.findAllCategories();
        return (categories != null && !categories.isEmpty()) ? categories : DEFAULT_CATEGORIES;
    }

    /**
     * 내부 Feign API: 응원/신고 검증용 소원 요약 조회 (GET /internal/wishes/{wishId}/summary)
     */
    public WishInternalSummary getWishSummary(String wishId) {
        WishRecord existing = queryPort.findById(wishId);
        if (existing == null || "DELETED".equalsIgnoreCase(existing.status())) {
            throw new IllegalArgumentException("WISH_NOT_FOUND");
        }
        return new WishInternalSummary(existing.id(), existing.userId(), existing.cheerCount());
    }

    private static boolean isActiveOrFulfilled(String status) {
        return "ACTIVE".equalsIgnoreCase(status) || "FULFILLED".equalsIgnoreCase(status);
    }

    private static int calcCheerLevel(int cheerCount) {
        if (cheerCount >= 15) return 3;
        if (cheerCount >= 5) return 2;
        if (cheerCount >= 1) return 1;
        return 0;
    }
}
