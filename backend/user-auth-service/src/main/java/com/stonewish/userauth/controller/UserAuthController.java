package com.stonewish.userauth.controller;

import com.stonewish.userauth.service.UserAccountService;
import com.stonewish.userauth.service.UserAccountService.UserAccount;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * [사수 멘토링 포인트 - 왜 컨트롤러마다 try-catch를 안 쓰고 @RestControllerAdvice를 쓸까요?]
 * Django DRF에서 custom_exception_handler를 등록해 모든 예외를 일관된 JSON으로 바꾸듯,
 * Spring에서는 @RestControllerAdvice + @ExceptionHandler를 두면 서비스 계층에서 던진 예외를
 * 가로채서 프론트엔드와 약속한 표준 에러 포맷 `{ "code": "...", "message": "..." }`으로 한 곳에서 변환합니다.
 */
@RestController
public class UserAuthController {

    public record NicknameUpdateRequest(String nickname) {}
    public record LinkSocialRequest(String provider) {}
    public record NicknameBatchRequest(List<String> userIds) {}
    public record ErrorResponse(String code, String message) {}

    private final UserAccountService accountService;

    public UserAuthController(UserAccountService accountService) {
        this.accountService = accountService;
    }

    /**
     * API-01: 닉네임#태그 설정 및 변경 (PUT /api/v1/users/me/nickname)
     */
    @PutMapping("/api/v1/users/me/nickname")
    public UserAccount updateNickname(
        @RequestHeader("X-User-Id") String userId,
        @RequestBody NicknameUpdateRequest request
    ) {
        return accountService.updateNicknameAndTag(userId, request.nickname());
    }

    /**
     * API-18: 게스트 계정을 소셜 계정으로 연결 (POST /api/v1/auth/link)
     */
    @PostMapping("/api/v1/auth/link")
    public UserAccount linkSocial(
        @RequestHeader("X-User-Id") String userId,
        @RequestBody LinkSocialRequest request
    ) {
        return accountService.linkGuestToSocial(userId, request.provider());
    }

    /**
     * 내부 Feign 전용 API: 그룹 돌탑 작성자 "닉네임#태그" 배치 조회 (POST /internal/users/nicknames)
     */
    @PostMapping("/internal/users/nicknames")
    public Map<String, String> getBatchNicknames(@RequestBody NicknameBatchRequest request) {
        return accountService.getBatchDisplayNames(request.userIds());
    }

    @RestControllerAdvice(assignableTypes = UserAuthController.class)
    public static class UserAuthExceptionHandler {

        @ExceptionHandler(IllegalArgumentException.class)
        public ResponseEntity<ErrorResponse> handleBadRequest(IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ErrorResponse(ex.getMessage(), "잘못된 요청 파라미터입니다: " + ex.getMessage()));
        }

        @ExceptionHandler(IllegalStateException.class)
        public ResponseEntity<ErrorResponse> handleConflict(IllegalStateException ex) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(new ErrorResponse(ex.getMessage(), "요청 상태 충돌이 발생했습니다: " + ex.getMessage()));
        }
    }
}
