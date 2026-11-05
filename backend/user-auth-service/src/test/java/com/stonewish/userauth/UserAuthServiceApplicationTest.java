package com.stonewish.userauth;

import static org.assertj.core.api.Assertions.assertThat;

import com.stonewish.userauth.controller.UserAuthController;
import com.stonewish.userauth.controller.UserAuthController.LoginRequest;
import com.stonewish.userauth.controller.UserAuthController.NicknameUpdateRequest;
import com.stonewish.userauth.entity.UserAccountEntity;
import com.stonewish.userauth.repository.UserAccountJpaRepository;
import com.stonewish.userauth.service.UserAccountService.AuthTokenResult;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class UserAuthServiceApplicationTest {

    @Autowired
    private UserAuthController userAuthController;

    @Autowired
    private UserAccountJpaRepository userAccountJpaRepository;

    @Test
    @DisplayName("N-07 & Sprint 5: user-auth-service JPA 엔티티(users 테이블, uk_nickname_tag) 영속화 및 조회 검증")
    void contextLoadsAndJpaPersistenceWorks() {
        AuthTokenResult result = userAuthController.login(new LoginRequest("guest"));
        String userId = result.user().id();
        assertThat(result.accessToken()).isNotBlank();

        userAuthController.updateNickname(userId, new NicknameUpdateRequest("돌탑지기#7777"));

        Optional<UserAccountEntity> entityOpt = userAccountJpaRepository.findById(userId);
        assertThat(entityOpt).isPresent();
        assertThat(entityOpt.get().getNickname()).isEqualTo("돌탑지기");
        assertThat(entityOpt.get().getTag()).isEqualTo("7777");
        assertThat(userAccountJpaRepository.existsByNicknameAndTagAndIdNot("돌탑지기", "7777", "other-id")).isTrue();
    }
}
