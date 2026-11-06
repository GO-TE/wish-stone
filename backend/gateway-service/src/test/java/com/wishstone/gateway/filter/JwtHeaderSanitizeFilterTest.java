package com.wishstone.gateway.filter;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
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
    @DisplayName("N-05 Header Spoofing 방어 & HMAC-SHA256 서명 검증: 위조된 X-User-Id는 제거되고 유효한 서명 JWT의 클레임으로 교체된다")
    void stripsSpoofedHeadersAndInjectsVerifiedSignedJwtClaims() {
        String validSignedJwt = JwtHeaderSanitizeFilter.createSignedJwt(
            "real-caller-uuid",
            true,
            JwtHeaderSanitizeFilter.DEFAULT_JWT_SECRET,
            3600L
        );

        MockServerHttpRequest spoofedRequest = MockServerHttpRequest
            .delete("/api/v1/wishes/wish-999")
            .header(JwtHeaderSanitizeFilter.HEADER_USER_ID, "victim-owner-uuid")
            .header(JwtHeaderSanitizeFilter.HEADER_USER_GUEST, "false")
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + validSignedJwt)
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
    @DisplayName("N-05 서명 위조·페이로드 변조·만료·미서명 토큰 거부: 변조된 토큰이 들어오면 X-User-Id를 절대 주입하지 않는다")
    void rejectsTamperedExpiredOrUnsignedTokens() {
        String validSignedJwt = JwtHeaderSanitizeFilter.createSignedJwt(
            "user-100",
            false,
            JwtHeaderSanitizeFilter.DEFAULT_JWT_SECRET,
            3600L
        );
        String[] parts = validSignedJwt.split("\\.");
        String forgedPayload = Base64.getUrlEncoder().withoutPadding().encodeToString(
            "{\"sub\":\"admin-root\",\"guest\":false,\"iat\":1700000000,\"exp\":9999999999}"
                .getBytes(StandardCharsets.UTF_8)
        );
        String tamperedJwt = parts[0] + "." + forgedPayload + "." + parts[2];

        String wrongSecretJwt = JwtHeaderSanitizeFilter.createSignedJwt(
            "hacker-uuid",
            false,
            "attacker-wrong-secret-key",
            3600L
        );

        String expiredJwt = JwtHeaderSanitizeFilter.createSignedJwt(
            "expired-user",
            false,
            JwtHeaderSanitizeFilter.DEFAULT_JWT_SECRET,
            -60L
        );

        for (String invalidToken : new String[] { tamperedJwt, wrongSecretJwt, expiredJwt, "uid:legacy-unsigned:guest:false" }) {
            MockServerHttpRequest req = MockServerHttpRequest
                .post("/api/v1/wishes")
                .header(JwtHeaderSanitizeFilter.HEADER_USER_ID, "spoofed-header-id")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + invalidToken)
                .build();

            MockServerWebExchange exchange = MockServerWebExchange.from(req);
            AtomicReference<ServerWebExchange> forwarded = new AtomicReference<>();
            filter.filter(exchange, ex -> {
                forwarded.set(ex);
                return Mono.empty();
            }).block();

            HttpHeaders headers = forwarded.get().getRequest().getHeaders();
            assertThat(headers.containsKey(JwtHeaderSanitizeFilter.HEADER_USER_ID)).isFalse();
            assertThat(headers.containsKey(JwtHeaderSanitizeFilter.HEADER_USER_GUEST)).isFalse();
        }
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
