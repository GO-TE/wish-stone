package com.stonewish.wishtower.controller;

import com.stonewish.wishtower.service.DailyWishQuotaService;
import com.stonewish.wishtower.service.DailyWishQuotaService.QuotaState;
import com.stonewish.wishtower.service.WishCommandService;
import com.stonewish.wishtower.service.WishCommandService.CreateWishCommand;
import com.stonewish.wishtower.service.WishCommandService.WishRecord;
import java.time.LocalDate;
import java.time.ZoneId;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestController
public class WishTowerController {

    public record CreateWishRequest(
        String content,
        String categoryCode,
        String groupId,
        String stoneShape,
        String stoneColor,
        String poseJson
    ) {}

    public record UpdateCategoryRequest(String categoryCode) {}
    public record RewardQuotaRequest(int bonusAmount) {}
    public record ErrorResponse(String code, String message) {}

    private final WishCommandService wishCommandService;
    private final DailyWishQuotaService quotaService;

    public WishTowerController(
        WishCommandService wishCommandService,
        DailyWishQuotaService quotaService
    ) {
        this.wishCommandService = wishCommandService;
        this.quotaService = quotaService;
    }

    /**
     * API-05: 소원(돌) 생성 - 카테고리 미입력 시 자동 분류 & 일일 5개 쿼터 차감 (POST /api/v1/wishes)
     */
    @PostMapping("/api/v1/wishes")
    @ResponseStatus(HttpStatus.CREATED)
    public WishRecord createWish(
        @RequestHeader("X-User-Id") String userId,
        @RequestHeader(value = "X-User-Guest", defaultValue = "false") boolean isGuest,
        @RequestBody CreateWishRequest req
    ) {
        return wishCommandService.createWish(
            new CreateWishCommand(
                userId,
                isGuest,
                req.content(),
                req.categoryCode(),
                req.groupId(),
                req.stoneShape(),
                req.stoneColor(),
                req.poseJson()
            )
        );
    }

    /**
     * D-016: 자동 분류된 소원 카테고리를 사용자가 사후 수정 (PATCH /api/v1/wishes/{wishId}/category)
     */
    @PatchMapping("/api/v1/wishes/{wishId}/category")
    public WishRecord updateCategory(
        @PathVariable("wishId") String wishId,
        @RequestHeader("X-User-Id") String userId,
        @RequestBody UpdateCategoryRequest req
    ) {
        return wishCommandService.updateCategory(wishId, userId, req.categoryCode());
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

    @RestControllerAdvice(assignableTypes = WishTowerController.class)
    public static class WishTowerExceptionHandler {

        @ExceptionHandler(IllegalArgumentException.class)
        public ResponseEntity<ErrorResponse> handleBadRequest(IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ErrorResponse(ex.getMessage(), ex.getMessage()));
        }

        @ExceptionHandler(IllegalStateException.class)
        public ResponseEntity<ErrorResponse> handleStateError(IllegalStateException ex) {
            HttpStatus status = switch (ex.getMessage()) {
                case "GUEST_GROUP_FORBIDDEN", "NOT_OWNER" -> HttpStatus.FORBIDDEN;
                case "DAILY_QUOTA_EXCEEDED" -> HttpStatus.TOO_MANY_REQUESTS;
                default -> HttpStatus.CONFLICT;
            };
            return ResponseEntity.status(status)
                .body(new ErrorResponse(ex.getMessage(), ex.getMessage()));
        }
    }
}
