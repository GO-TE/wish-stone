package com.wishstone.group.controller;

import com.wishstone.group.service.GroupCommandService;
import com.wishstone.group.service.GroupCommandService.GroupRecord;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 지인 그룹 생성·참여·조회·탈퇴 및 내부 Feign 권한 확인 컨트롤러 (group-service :8084)
 */
@RestController
public class GroupController {

    public record CreateGroupRequest(String name) {}
    public record JoinGroupRequest(String inviteCode) {}
    public record ErrorResponse(String code, String message) {}

    private final GroupCommandService groupCommandService;

    public GroupController(GroupCommandService groupCommandService) {
        this.groupCommandService = groupCommandService;
    }

    /**
     * API-12: 지인 그룹 생성 (POST /api/v1/groups)
     */
    @PostMapping("/api/v1/groups")
    @ResponseStatus(HttpStatus.CREATED)
    public GroupRecord createGroup(
        @RequestHeader("X-User-Id") String userId,
        @RequestHeader(value = "X-User-Guest", defaultValue = "false") boolean isGuest,
        @RequestBody CreateGroupRequest request
    ) {
        return groupCommandService.createGroup(userId, isGuest, request != null ? request.name() : null);
    }

    /**
     * API-13: 초대 코드로 지인 그룹 참여 (POST /api/v1/groups/join)
     */
    @PostMapping("/api/v1/groups/join")
    public GroupRecord joinGroup(
        @RequestHeader("X-User-Id") String userId,
        @RequestHeader(value = "X-User-Guest", defaultValue = "false") boolean isGuest,
        @RequestBody JoinGroupRequest request
    ) {
        return groupCommandService.joinGroup(userId, isGuest, request != null ? request.inviteCode() : null);
    }

    /**
     * API-14: 내가 속한 그룹 목록 조회 (GET /api/v1/groups/me)
     */
    @GetMapping("/api/v1/groups/me")
    public List<GroupRecord> getMyGroups(@RequestHeader("X-User-Id") String userId) {
        return groupCommandService.getMyGroups(userId);
    }

    /**
     * API-15: 그룹 나가기 (DELETE /api/v1/groups/{id}/members/me)
     */
    @DeleteMapping("/api/v1/groups/{id}/members/me")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void leaveGroup(
        @PathVariable("id") String groupId,
        @RequestHeader("X-User-Id") String userId
    ) {
        groupCommandService.leaveGroup(groupId, userId);
    }

    /**
     * 내부 Feign 전용 API: 그룹원 여부 확인 (GET /internal/groups/{id}/members/{userId}/exists)
     */
    @GetMapping("/internal/groups/{id}/members/{userId}/exists")
    public Map<String, Boolean> existsMember(
        @PathVariable("id") String groupId,
        @PathVariable("userId") String userId
    ) {
        boolean exists = groupCommandService.existsMember(groupId, userId);
        return Map.of("exists", exists);
    }

    @RestControllerAdvice(assignableTypes = GroupController.class)
    public static class GroupExceptionHandler {

        @ExceptionHandler(MissingRequestHeaderException.class)
        public ResponseEntity<ErrorResponse> handleMissingHeader(MissingRequestHeaderException ex) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(new ErrorResponse("UNAUTHORIZED", "인증 헤더가 누락되었습니다: " + ex.getHeaderName()));
        }

        @ExceptionHandler(IllegalArgumentException.class)
        public ResponseEntity<ErrorResponse> handleBadRequest(IllegalArgumentException ex) {
            HttpStatus status = switch (ex.getMessage()) {
                case "GROUP_NOT_FOUND", "INVITE_INVALID" -> HttpStatus.NOT_FOUND;
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
                case "GUEST_GROUP_FORBIDDEN", "NOT_GROUP_MEMBER" -> HttpStatus.FORBIDDEN;
                case "ALREADY_MEMBER", "GROUP_FULL" -> HttpStatus.CONFLICT;
                default -> HttpStatus.CONFLICT;
            };
            return ResponseEntity.status(status)
                .body(new ErrorResponse(ex.getMessage(), ex.getMessage()));
        }
    }
}
