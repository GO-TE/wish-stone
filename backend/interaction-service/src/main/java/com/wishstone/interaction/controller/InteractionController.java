package com.wishstone.interaction.controller;

import com.wishstone.interaction.service.CheerCommandService;
import com.wishstone.interaction.service.CheerCommandService.CheerResult;
import com.wishstone.interaction.service.ReportCommandService;
import com.wishstone.interaction.service.ReportCommandService.ReportResult;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 응원하기(API-07) 및 신고하기(API-08) REST 컨트롤러 (interaction-service :8083)
 */
@RestController
public class InteractionController {

    public record ReportWishRequest(String reason) {}
    public record ErrorResponse(String code, String message) {}

    private final CheerCommandService cheerCommandService;
    private final ReportCommandService reportCommandService;

    public InteractionController(
        CheerCommandService cheerCommandService,
        ReportCommandService reportCommandService
    ) {
        this.cheerCommandService = cheerCommandService;
        this.reportCommandService = reportCommandService;
    }

    /**
     * API-07: 소원 응원하기 (POST /api/v1/wishes/{id}/cheers)
     */
    @PostMapping("/api/v1/wishes/{id}/cheers")
    public CheerResult cheerWish(
        @PathVariable("id") String wishId,
        @RequestHeader("X-User-Id") String userId
    ) {
        return cheerCommandService.cheerWish(wishId, userId);
    }

    /**
     * API-08: 소원 신고하기 (POST /api/v1/wishes/{id}/reports)
     */
    @PostMapping("/api/v1/wishes/{id}/reports")
    public ReportResult reportWish(
        @PathVariable("id") String wishId,
        @RequestHeader("X-User-Id") String userId,
        @RequestBody ReportWishRequest request
    ) {
        String reason = request != null ? request.reason() : null;
        return reportCommandService.reportWish(wishId, userId, reason);
    }

    @RestControllerAdvice(assignableTypes = InteractionController.class)
    public static class InteractionExceptionHandler {

        @ExceptionHandler(MissingRequestHeaderException.class)
        public ResponseEntity<ErrorResponse> handleMissingHeader(MissingRequestHeaderException ex) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(new ErrorResponse("UNAUTHORIZED", "인증 헤더가 누락되었습니다: " + ex.getHeaderName()));
        }

        @ExceptionHandler(IllegalArgumentException.class)
        public ResponseEntity<ErrorResponse> handleBadRequest(IllegalArgumentException ex) {
            HttpStatus status = "WISH_NOT_FOUND".equals(ex.getMessage())
                ? HttpStatus.NOT_FOUND
                : HttpStatus.BAD_REQUEST;
            return ResponseEntity.status(status)
                .body(new ErrorResponse(ex.getMessage(), ex.getMessage()));
        }

        @ExceptionHandler(IllegalStateException.class)
        public ResponseEntity<ErrorResponse> handleStateConflict(IllegalStateException ex) {
            String code = ex.getMessage();
            HttpStatus status = switch (code) {
                case "CANNOT_CHEER_OWN", "SELF_REPORT_FORBIDDEN" -> HttpStatus.FORBIDDEN;
                case "ALREADY_CHEERED", "ALREADY_REPORTED" -> HttpStatus.CONFLICT;
                default -> HttpStatus.CONFLICT;
            };
            return ResponseEntity.status(status)
                .body(new ErrorResponse(code, code));
        }
    }
}
