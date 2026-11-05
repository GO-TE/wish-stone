package com.stonewish.wishtower.client;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class UserAuthFeignClientTest {

    private final UserAuthFeignClient feignClient = new UserAuthFeignClient() {
        @Override
        public Map<String, String> getNicknames(NicknameBatchRequest request) {
            throw new RuntimeException("Simulated connection timeout");
        }
    };

    @Test
    @DisplayName("user-auth-service 장애 시 CircuitBreaker fallback으로 '익명의 그룹원' 반환 검증")
    void fallbackNicknames_returnsDefaultAnonymous() {
        UserAuthFeignClient.NicknameBatchRequest request =
            new UserAuthFeignClient.NicknameBatchRequest(List.of("u1", "u2", "u1"));

        Map<String, String> fallbackResult = feignClient.fallbackNicknames(
            request,
            new RuntimeException("Connection refused")
        );

        assertThat(fallbackResult).hasSize(2);
        assertThat(fallbackResult.get("u1")).isEqualTo("익명의 그룹원");
        assertThat(fallbackResult.get("u2")).isEqualTo("익명의 그룹원");
    }
}
