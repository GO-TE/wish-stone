package com.wishstone.wishtower.controller;

import com.wishstone.wishtower.service.DailyWishQuotaService;
import com.wishstone.wishtower.service.DailyWishQuotaService.QuotaState;
import com.wishstone.wishtower.service.TowerQueryService;
import com.wishstone.wishtower.service.TowerQueryService.AnonymousWishCard;
import com.wishstone.wishtower.service.TowerQueryService.CategoryItem;
import com.wishstone.wishtower.service.TowerQueryService.CollapseMetadata;
import com.wishstone.wishtower.service.TowerQueryService.FulfillWishResult;
import com.wishstone.wishtower.service.TowerQueryService.MyWishView;
import com.wishstone.wishtower.service.TowerQueryService.StonePose;
import com.wishstone.wishtower.service.TowerQueryService.TowerStatsResponse;
import com.wishstone.wishtower.service.TowerQueryService.TowerViewResponse;
import com.wishstone.wishtower.service.TowerQueryService.WishInternalSummary;
import com.wishstone.wishtower.service.WishCommandService;
import com.wishstone.wishtower.service.WishCommandService.CreateWishCommand;
import com.wishstone.wishtower.service.WishCommandService.WishRecord;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestController
public class WishTowerController {

    /**
     * M-01: 요청 시 pose JSON 객체({x,y,z,qx,qy,qz,qw})를 기본 수신하되 하위 호환용 poseJson도 허용
     */
    public record CreateWishRequest(
        String content,
        String categoryCode,
        String groupId,
        String stoneShape,
        String stoneColor,
        StonePose pose,
        String poseJson
    ) {
        public CreateWishRequest(
            String content,
            String categoryCode,
            String groupId,
            String stoneShape,
            String stoneColor,
            StonePose pose
        ) {
            this(content, categoryCode, groupId, stoneShape, stoneColor, pose, null);
        }

        public String resolvePoseJson() {
            if (pose != null) {
                return pose.toJson();
            }
            if (poseJson != null && !poseJson.isBlank()) {
                return poseJson;
            }
            return StonePose.DEFAULT.toJson();
        }
    }

    /**
     * M-01 & M-02: 생성/카테고리 수정 응답 DTO (pose 객체 및 소문자 status)
     */
    public record WishResponse(
        String id,
        String groupId,
        String categoryCode,
        String content,
        String stoneShape,
        String stoneColor,
        StonePose pose,
        int cheerCount,
        String status,
        boolean isMine,
        Instant createdAt
    ) {
        public static WishResponse from(WishRecord record) {
            return new WishResponse(
                record.id(),
                record.groupId(),
                record.categoryCode(),
                record.content(),
                record.stoneShape(),
                record.stoneColor(),
                StonePose.fromJson(record.poseJson()),
                record.cheerCount(),
                record.status() != null ? record.status().toLowerCase(Locale.ROOT) : "active",
                true,
                record.createdAt()
            );
        }
    }

    public record UpdateCategoryRequest(String categoryCode) {}
    public record FulfillWishRequest(String bloomType) {}
    public record RewardQuotaRequest(int bonusAmount) {}
    public record ErrorResponse(String code, String message) {}

    private final WishCommandService wishCommandService;
    private final DailyWishQuotaService quotaService;
    private final TowerQueryService towerQueryService;

    public WishTowerController(
        WishCommandService wishCommandService,
        DailyWishQuotaService quotaService
    ) {
        this(wishCommandService, quotaService, null);
    }

    @Autowired
    public WishTowerController(
        WishCommandService wishCommandService,
        DailyWishQuotaService quotaService,
        TowerQueryService towerQueryService
    ) {
        this.wishCommandService = wishCommandService;
        this.quotaService = quotaService;
        this.towerQueryService = towerQueryService;
    }

    /**
     * API-03: 돌탑 돌 목록 조회 (GET /api/v1/towers/{towerKey})
     */
    @GetMapping("/api/v1/towers/{towerKey}")
    public TowerViewResponse getTower(
        @PathVariable("towerKey") String towerKey,
        @RequestHeader(value = "X-User-Id", required = false) String userId,
        @RequestParam(value = "limit", defaultValue = "200") int limit
    ) {
        return towerQueryService.getTower(towerKey, userId, limit);
    }

    /**
     * API-04: 돌탑 통계 조회 (GET /api/v1/towers/{towerKey}/stats)
     */
    @GetMapping("/api/v1/towers/{towerKey}/stats")
    public TowerStatsResponse getTowerStats(@PathVariable("towerKey") String towerKey) {
        return towerQueryService.getTowerStats(towerKey);
    }

    /**
     * API-05: 소원(돌) 생성 - 카테고리 미입력 시 자동 분류 & 일일 5개 쿼터 차감 (POST /api/v1/wishes)
     */
    @PostMapping("/api/v1/wishes")
    @ResponseStatus(HttpStatus.CREATED)
    public WishResponse createWish(
        @RequestHeader("X-User-Id") String userId,
        @RequestHeader(value = "X-User-Guest", defaultValue = "false") boolean isGuest,
        @RequestBody CreateWishRequest req
    ) {
        WishRecord created = wishCommandService.createWish(
            new CreateWishCommand(
                userId,
                isGuest,
                req.content(),
                req.categoryCode(),
                req.groupId(),
                req.stoneShape(),
                req.stoneColor(),
                req.resolvePoseJson()
            )
        );
        return WishResponse.from(created);
    }

    /**
     * API-06: 랜덤 소원 카드 풀 조회 (GET /api/v1/wishes/random?count=10&excludeIds=...)
     * M-04: count 파라미터 우선 지원 (size 파라미터 하위 호환 별칭 지원)
     */
    @GetMapping("/api/v1/wishes/random")
    public List<AnonymousWishCard> getRandomWishes(
        @RequestHeader(value = "X-User-Id", required = false) String userId,
        @RequestParam(value = "count", required = false) Integer count,
        @RequestParam(value = "size", required = false) Integer size,
        @RequestParam(value = "excludeIds", required = false) String excludeIdsRaw
    ) {
        int resolvedCount = count != null ? count : (size != null ? size : 10);
        Set<String> excludeIds = (excludeIdsRaw == null || excludeIdsRaw.isBlank())
            ? Collections.emptySet()
            : Arrays.stream(excludeIdsRaw.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toSet());
        return towerQueryService.getRandomWishes(userId, resolvedCount, excludeIds);
    }

    /**
     * API-09: 내 소원 목록 조회 (GET /api/v1/wishes/me?status=active|fulfilled)
     * M-08: 선택적 status 필터링 지원 및 isMine: true 포함
     */
    @GetMapping("/api/v1/wishes/me")
    public List<MyWishView> getMyWishes(
        @RequestHeader("X-User-Id") String userId,
        @RequestParam(value = "status", required = false) String status
    ) {
        return towerQueryService.getMyWishes(userId, status);
    }

    /**
     * API-10: 소원 이루어짐(성취) 처리 (PATCH /api/v1/wishes/{id}/fulfill)
     */
    @PatchMapping("/api/v1/wishes/{id}/fulfill")
    public FulfillWishResult fulfillWish(
        @PathVariable("id") String wishId,
        @RequestHeader("X-User-Id") String userId,
        @RequestBody(required = false) FulfillWishRequest req
    ) {
        String bloomType = req != null ? req.bloomType() : null;
        return towerQueryService.fulfillWish(wishId, userId, bloomType);
    }

    /**
     * API-11: 내 소원 삭제 및 돌탑 물리 붕괴 메타데이터 반환 (DELETE /api/v1/wishes/{id})
     */
    @DeleteMapping("/api/v1/wishes/{id}")
    public CollapseMetadata deleteWish(
        @PathVariable("id") String wishId,
        @RequestHeader("X-User-Id") String userId
    ) {
        return towerQueryService.deleteWish(wishId, userId);
    }

    /**
     * D-016: 자동 분류된 소원 카테고리를 사용자가 사후 수정 (PATCH /api/v1/wishes/{wishId}/category)
     */
    @PatchMapping("/api/v1/wishes/{wishId}/category")
    public WishResponse updateCategory(
        @PathVariable("wishId") String wishId,
        @RequestHeader("X-User-Id") String userId,
        @RequestBody UpdateCategoryRequest req
    ) {
        WishRecord updated = wishCommandService.updateCategory(wishId, userId, req.categoryCode());
        return WishResponse.from(updated);
    }

    /**
     * D-018: 리워드 광고 시청 또는 인앱 결제 완료 시 일일 보너스 소원 쿼터 충전 (POST /api/v1/wishes/quota/reward)
     */
    @PostMapping("/api/v1/wishes/quota/reward")
    public QuotaState grantRewardQuota(
        @RequestHeader("X-User-Id") String userId,
        @RequestBody RewardQuotaRequest req
    ) {
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Seoul"));
        return quotaService.grantBonusQuota(userId, today, req.bonusAmount());
    }

    /**
     * API-16: 소원 카테고리 목록 조회 (GET /api/v1/categories)
     */
    @GetMapping("/api/v1/categories")
    public List<CategoryItem> getCategories() {
        return towerQueryService.getCategories();
    }

    /**
     * 내부 Feign 전용 API: 응원/신고 검증용 소원 요약 조회 (GET /internal/wishes/{wishId}/summary)
     */
    @GetMapping("/internal/wishes/{wishId}/summary")
    public WishInternalSummary getWishSummary(@PathVariable("wishId") String wishId) {
        return towerQueryService.getWishSummary(wishId);
    }

    @RestControllerAdvice(assignableTypes = WishTowerController.class)
    public static class WishTowerExceptionHandler {

        @ExceptionHandler(MissingRequestHeaderException.class)
        public ResponseEntity<ErrorResponse> handleMissingHeader(MissingRequestHeaderException ex) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(new ErrorResponse("UNAUTHORIZED", "인증 헤더가 누락되었습니다: " + ex.getHeaderName()));
        }

        @ExceptionHandler(IllegalArgumentException.class)
        public ResponseEntity<ErrorResponse> handleBadRequest(IllegalArgumentException ex) {
            HttpStatus status = switch (ex.getMessage()) {
                case "WISH_NOT_FOUND" -> HttpStatus.NOT_FOUND;
                case "USER_ID_REQUIRED" -> HttpStatus.UNAUTHORIZED;
                default -> HttpStatus.BAD_REQUEST;
            };
            String code = "USER_ID_REQUIRED".equals(ex.getMessage()) ? "UNAUTHORIZED" : ex.getMessage();
            return ResponseEntity.status(status)
                .body(new ErrorResponse(code, ex.getMessage()));
        }

        @ExceptionHandler(IllegalStateException.class)
        public ResponseEntity<ErrorResponse> handleStateError(IllegalStateException ex) {
            HttpStatus status = switch (ex.getMessage()) {
                case "GUEST_GROUP_FORBIDDEN", "NOT_OWNER", "NOT_GROUP_MEMBER" -> HttpStatus.FORBIDDEN;
                case "DAILY_QUOTA_EXCEEDED" -> HttpStatus.TOO_MANY_REQUESTS;
                default -> HttpStatus.CONFLICT;
            };
            return ResponseEntity.status(status)
                .body(new ErrorResponse(ex.getMessage(), ex.getMessage()));
        }
    }
}
