package com.stonewish.group;

import static org.assertj.core.api.Assertions.assertThat;

import com.stonewish.group.controller.GroupController;
import com.stonewish.group.controller.GroupController.CreateGroupRequest;
import com.stonewish.group.controller.GroupController.JoinGroupRequest;
import com.stonewish.group.entity.GroupMemberEntity.GroupMemberId;
import com.stonewish.group.repository.GroupJpaRepository;
import com.stonewish.group.repository.GroupMemberJpaRepository;
import com.stonewish.group.service.GroupCommandService.GroupRecord;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class GroupServiceApplicationTest {

    @Autowired
    private GroupController groupController;

    @Autowired
    private GroupJpaRepository groupJpaRepository;

    @Autowired
    private GroupMemberJpaRepository groupMemberJpaRepository;

    @Test
    @DisplayName("N-07 & Sprint 5: group-service JPA 엔티티(groups, group_members 테이블) 영속화 및 조회 검증")
    void contextLoadsAndCreateGroupWorks() {
        GroupRecord created = groupController.createGroup(
            "boot-owner-1",
            false,
            new CreateGroupRequest("우리들의 소원 돌탑")
        );
        assertThat(created.id()).isNotBlank();
        assertThat(created.inviteCode()).hasSize(8);

        assertThat(groupJpaRepository.findById(created.id())).isPresent();
        assertThat(groupMemberJpaRepository.existsById(new GroupMemberId(created.id(), "boot-owner-1"))).isTrue();

        groupController.joinGroup("boot-member-2", false, new JoinGroupRequest(created.inviteCode()));
        assertThat(groupMemberJpaRepository.existsById(new GroupMemberId(created.id(), "boot-member-2"))).isTrue();
        assertThat(groupController.getMyGroups("boot-member-2")).hasSize(1);
    }
}
