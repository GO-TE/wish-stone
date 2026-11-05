package com.stonewish.group;

import static org.assertj.core.api.Assertions.assertThat;

import com.stonewish.group.controller.GroupController;
import com.stonewish.group.controller.GroupController.CreateGroupRequest;
import com.stonewish.group.service.GroupCommandService.GroupRecord;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class GroupServiceApplicationTest {

    @Autowired
    private GroupController groupController;

    @Test
    @DisplayName("N-07: group-service Spring Boot 애플리케이션 컨텍스트 기동 및 기본 어댑터 기반 그룹 생성 스모크 테스트")
    void contextLoadsAndCreateGroupWorks() {
        GroupRecord created = groupController.createGroup(
            "boot-owner-1",
            false,
            new CreateGroupRequest("우리들의 소원 돌탑")
        );
        assertThat(created.id()).isNotBlank();
        assertThat(created.inviteCode()).hasSize(8);
    }
}
