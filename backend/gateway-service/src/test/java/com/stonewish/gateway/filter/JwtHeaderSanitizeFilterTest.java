package com.stonewish.gateway.filter;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

class JwtHeaderSanitizeFilterTest {

    private final JwtHeaderSanitizeFilter filter = new JwtHeaderSanitizeFilter();

    @Test
    @DisplayName("Header Spoofing 방어: 외부 클라이언트가 위조한 X-User-Id 헤더는 무조건 제거되고, 검증된 Bearer 토큰의 클레임으로 교체된다")
    void stripsSpoofedHeadersAndInjectsVerifiedClaims() {
        MockServerHttpRequest spoofedRequest = MockServerHttpRequest
            .delete("/api/v1/wishes/wish-999")
            .header(JwtHeaderSanitizeFilter.HEADER_USER_ID, "victim-owner-uuid")
            .header(JwtHeaderSanitizeFilter.HEADER_USER_GUEST, "false")
            .header(HttpHeaders.AUTHORIZATION, "Bearer uid:real-caller-uuid:guest:true")
            .build();

        MockServerWebExchange exchange = MockServerWebExchange.from(spoofedRequest);
        AtomicReference<ServerWebExchange> forwardedExchange = new AtomicReference<>();

        GatewayFilterChain chain = ex -> {
            forwardedExchange.set(ex);
            return Mono.empty();
        };

        filter.filter(exchange, chain).block();

        HttpHeaders downstreamHeaders = forwardedExchange.get().getRequest().getHeaders();
        assertThat(downstreamHeaders.getFirst(JwtHeaderSanitizeFilter.HEADER_USER_ID))
            .isEqualTo("real-caller-uuid");
        assertThat(downstreamHeaders.getFirst(JwtHeaderSanitizeFilter.HEADER_USER_GUEST))
            .isEqualTo("true");
    }

    @Test
    @DisplayName("Authorization 헤더가 없는 익명 요청에서도 위조된 X-User-Id 및 X-User-Guest 헤더는 완전히 제거된다")
    void stripsSpoofedHeadersWhenNoAuthorizationPresent() {
        MockServerHttpRequest anonymousSpoofedRequest = MockServerHttpRequest
            .get("/api/v1/towers/global")
            .header(JwtHeaderSanitizeFilter.HEADER_USER_ID, "spoofed-admin-id")
            .header(JwtHeaderSanitizeFilter.HEADER_USER_GUEST, "false")
            .build();

        MockServerWebExchange exchange = MockServerWebExchange.from(anonymousSpoofedRequest);
        AtomicReference<ServerWebExchange> forwardedExchange = new AtomicReference<>();

        GatewayFilterChain chain = ex -> {
            forwardedExchange.set(ex);
            return Mono.empty();
        };

        filter.filter(exchange, chain).block();

        HttpHeaders downstreamHeaders = forwardedExchange.get().getRequest().getHeaders();
        assertThat(downstreamHeaders.containsKey(JwtHeaderSanitizeFilter.HEADER_USER_ID)).isFalse();
        assertThat(downstreamHeaders.containsKey(JwtHeaderSanitizeFilter.HEADER_USER_GUEST)).isFalse();
    }
}
