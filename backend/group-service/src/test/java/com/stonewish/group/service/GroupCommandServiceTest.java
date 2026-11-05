package com.stonewish.group.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.stonewish.group.service.GroupCommandService.GroupPersistencePort;
import com.stonewish.group.service.GroupCommandService.GroupRecord;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class GroupCommandServiceTest {

    private InMemoryGroupAdapter adapter;
    private GroupCommandService service;

    @BeforeEach
    void setUp() {
        adapter = new InMemoryGroupAdapter();
        service = new GroupCommandService(adapter, 2); // 최대 2명 제한으로 설정 주입 검증
    }

    @Test
    @DisplayName("DB-005 & D-007: 정식 회원은 그룹 생성 및 초대 코드 참여가 가능하고, 최대 인원 초과나 게스트 참여는 차단된다")
    void createAndJoinGroupAndEnforceMaxMembersAndGuestRestriction() {
        assertThrows(
            IllegalStateException.class,
            () -> service.createGroup("guest-1", true, "우리반 돌탑")
        );

        GroupRecord created = service.createGroup("user-1", false, "취업 스터디 돌탑");
        assertEquals(1, created.memberCount());
        assertEquals(2, created.maxMembers());

        GroupRecord joined = service.joinGroup("user-2", false, created.inviteCode());
        assertEquals(2, joined.memberCount());

        // 정원(2명)이 찼으므로 3번째 멤버 참여 시 GROUP_FULL 예외 발생
        assertThrows(
            IllegalStateException.class,
            () -> service.joinGroup("user-3", false, created.inviteCode())
        );
    }

    static class InMemoryGroupAdapter implements GroupPersistencePort {
        private final Map<String, GroupRecord> groups = new HashMap<>();
        private final Set<String> memberships = new HashSet<>();

        @Override
        public GroupRecord saveGroup(GroupRecord group) {
            groups.put(group.id(), group);
            return group;
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
    }
}
