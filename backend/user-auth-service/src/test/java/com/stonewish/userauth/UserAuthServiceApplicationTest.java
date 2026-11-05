package com.stonewish.userauth;

import static org.assertj.core.api.Assertions.assertThat;

import com.stonewish.userauth.controller.UserAuthController;
import com.stonewish.userauth.controller.UserAuthController.LoginRequest;
import com.stonewish.userauth.service.UserAccountService.AuthTokenResult;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class UserAuthServiceApplicationTest {

    @Autowired
    private UserAuthController userAuthController;

    @Test
    @DisplayName("N-07: user-auth-service Spring Boot 애플리케이션 컨텍스트 기동 및 기본 어댑터 기반 로그인 스모크 테스트")
    void contextLoadsAndLoginWorks() {
        AuthTokenResult result = userAuthController.login(new LoginRequest("guest"));
        assertThat(result.accessToken()).isNotBlank();
        assertThat(result.user().id()).isNotBlank();
    }
}
