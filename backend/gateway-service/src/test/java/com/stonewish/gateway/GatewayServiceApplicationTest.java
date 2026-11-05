package com.stonewish.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import com.stonewish.gateway.filter.JwtHeaderSanitizeFilter;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class GatewayServiceApplicationTest {

    @Autowired
    private JwtHeaderSanitizeFilter jwtHeaderSanitizeFilter;

    @Test
    @DisplayName("N-07: gateway-service Spring Boot 애플리케이션 컨텍스트 기동 및 필터 빈 주입 스모크 테스트")
    void contextLoads() {
        assertThat(jwtHeaderSanitizeFilter).isNotNull();
    }
}
