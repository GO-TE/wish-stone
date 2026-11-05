package com.stonewish.group.controller;

import static org.assertj.core.api.Assertions.assertThat;

import com.stonewish.group.controller.GroupController.CreateGroupRequest;
import com.stonewish.group.controller.GroupController.ErrorResponse;
import com.stonewish.group.controller.GroupController.GroupExceptionHandler;
import com.stonewish.group.controller.GroupController.JoinGroupRequest;
import com.stonewish.group.service.GroupCommandService;
import com.stonewish.group.service.GroupCommandService.GroupPersistencePort;
import com.stonewish.group.service.GroupCommandService.GroupRecord;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class GroupControllerTest {

    private InMemoryGroupPort groupPort;
    private GroupCommandService groupService;
    private GroupController controller;

    @BeforeEach
    void setUp() {
        groupPort = new InMemoryGroupPort();
        groupService = new GroupCommandService(groupPort, 50);
        controller = new GroupController(groupService);
    }

    @Test
    @DisplayName("API-12 ~ API-15 & 내부 Feign: 그룹 생성, 초대 참여, 내 그룹 조회, 내부 소속 확인, 그룹 탈퇴가 정상 동작한다")
    void groupLifecycleAndInternalExistsEndpoint() {
        // 1) 그룹 생성
        GroupRecord created = controller.createGroup("user-owner", false, new CreateGroupRequest("수능 대박 기원반"));
        assertThat(created.inviteCode()).hasSize(8);
        assertThat(created.memberCount()).isEqualTo(1);

        // 2) 초대 코드로 참여
        GroupRecord joined = controller.joinGroup("user-member", false, new JoinGroupRequest(created.inviteCode()));
        assertThat(joined.memberCount()).isEqualTo(2);

        // 3) 내 그룹 조회 (GET /api/v1/groups/me)
        List<GroupRecord> myGroups = controller.getMyGroups("user-member");
        assertThat(myGroups).hasSize(1);
        assertThat(myGroups.get(0).id()).isEqualTo(created.id());

        // 4) 내부 Feign 엔드포인트 (GET /internal/groups/{id}/members/{userId}/exists)
        Map<String, Boolean> existsBeforeLeave = controller.existsMember(created.id(), "user-member");
        assertThat(existsBeforeLeave.get("exists")).isTrue();

        // 5) 그룹 탈퇴 (DELETE /api/v1/groups/{id}/members/me)
        controller.leaveGroup(created.id(), "user-member");

        Map<String, Boolean> existsAfterLeave = controller.existsMember(created.id(), "user-member");
        assertThat(existsAfterLeave.get("exists")).isFalse();
        assertThat(controller.getMyGroups("user-member")).isEmpty();
    }

    @Test
    @DisplayName("GroupExceptionHandler: GUEST_GROUP_FORBIDDEN(403), GROUP_FULL(409) 에러 응답 변환 검증")
    void groupExceptionHandler_mapsStatusCodes() {
        GroupExceptionHandler handler = new GroupExceptionHandler();

        ResponseEntity<ErrorResponse> guestResp = handler.handleStateError(
            new IllegalStateException("GUEST_GROUP_FORBIDDEN")
        );
        assertThat(guestResp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(guestResp.getBody().code()).isEqualTo("GUEST_GROUP_FORBIDDEN");

        ResponseEntity<ErrorResponse> fullResp = handler.handleStateError(
            new IllegalStateException("GROUP_FULL")
        );
        assertThat(fullResp.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(fullResp.getBody().code()).isEqualTo("GROUP_FULL");
    }

    static class InMemoryGroupPort implements GroupPersistencePort {
        private final Map<String, GroupRecord> groups = new HashMap<>();
        private final Set<String> memberships = new HashSet<>();

        @Override
        public GroupRecord saveGroup(GroupRecord group) {
            groups.put(group.id(), group);
            return group;
        }

        @Override
        public GroupRecord findById(String groupId) {
            return groups.get(groupId);
        }

        @Override
        public GroupRecord findByInviteCode(String inviteCode) {
            return groups.values().stream()
                .filter(g -> g.inviteCode().equals(inviteCode))
                .findFirst()
                .orElse(null);
        }

        @Override
        public boolean isMember(String groupId, String userId) {
            return memberships.contains(groupId + ":" + userId);
        }

        @Override
        public void addMember(String groupId, String userId, String role) {
            memberships.add(groupId + ":" + userId);
        }

        @Override
        public List<GroupRecord> findGroupsByUserId(String userId) {
            return groups.values().stream()
                .filter(g -> isMember(g.id(), userId))
                .toList();
        }

        @Override
        public void removeMember(String groupId, String userId) {
            memberships.remove(groupId + ":" + userId);
        }
    }
}
