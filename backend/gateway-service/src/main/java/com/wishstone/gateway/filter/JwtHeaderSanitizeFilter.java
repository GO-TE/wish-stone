package com.wishstone.gateway.filter;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * [사수 멘토링 포인트 - Spring Cloud Gateway 글로벌 보안 필터 (N-05 HMAC-SHA256 서명 검증)]
 * 1) 왜 Gateway는 일반 Servlet(HttpServletRequest)이 아니라 ServerWebExchange(WebFlux/Netty)를 쓸까요?
 *    - API Gateway는 모든 마이크로서비스(:8081~:8084) 앞단에서 수만 개의 요청을 토스해야 합니다.
 *    - 일반 Tomcat(Thread-per-request)을 쓰면 하위 서비스 응답을 기다리는 동안 스레드가 다 묶여서 Gateway가 먼저 뻗습니다.
 *    - 그래서 Spring Cloud Gateway는 비동기 이벤트 루프(Netty) 기반인 WebFlux 위에서만 동작합니다.
 *
 * 2) Header Spoofing 방어 + HMAC-SHA256 서명 및 만료(exp) 검증:
 *    - 외부 클라이언트가 주입한 `X-User-Id`, `X-User-Guest` 헤더는 무조건 먼저 제거(Strip)합니다.
 *    - `Authorization: Bearer <JWT>`에서 HMAC-SHA256 서명을 상수 시간(Constant-Time) 비교로 검증하고,
 *      서명이 위조되었거나 만료(`exp <= now`)된 토큰은 클레임 주입을 거부하여 하위 서비스를 보호합니다.
 */
@Component
public class JwtHeaderSanitizeFilter implements GlobalFilter, Ordered {

    public static final String HEADER_USER_ID = "X-User-Id";
    public static final String HEADER_USER_GUEST = "X-User-Guest";
    public static final String DEFAULT_JWT_SECRET = "wishstone-default-hmac-sha256-secret-key-2026-secure";

    private static final Pattern SUB_PATTERN = Pattern.compile("\"sub\"\\s*:\\s*\"([^\"]+)\"");
    private static final Pattern GUEST_PATTERN = Pattern.compile("\"guest\"\\s*:\\s*(true|false)");
    private static final Pattern EXP_PATTERN = Pattern.compile("\"exp\"\\s*:\\s*(\\d+)");

    private final String jwtSecret;

    public JwtHeaderSanitizeFilter() {
        this(DEFAULT_JWT_SECRET);
    }

    @Autowired
    public JwtHeaderSanitizeFilter(
        @Value("${wishstone.jwt.secret:" + DEFAULT_JWT_SECRET + "}") String jwtSecret
    ) {
        this.jwtSecret = (jwtSecret != null && !jwtSecret.isBlank()) ? jwtSecret : DEFAULT_JWT_SECRET;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        // 1단계: 외부 클라이언트가 임의로 주입한 내부 신뢰 헤더(X-User-*)를 무조건 제거(Strip)한다.
        ServerHttpRequest.Builder requestBuilder = exchange.getRequest().mutate()
            .headers(httpHeaders -> {
                httpHeaders.remove(HEADER_USER_ID);
                httpHeaders.remove(HEADER_USER_GUEST);
            });

        // 2단계: Authorization Bearer 토큰에서 HMAC-SHA256 서명 및 만료 시각이 검증된 클레임만 추출해 세팅한다.
        String authHeader = exchange.getRequest().getHeaders().getFirst("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7).trim();
            ParsedTokenClaims claims = parseVerifiedClaims(token);
            if (claims != null) {
                requestBuilder
                    .header(HEADER_USER_ID, claims.userId())
                    .header(HEADER_USER_GUEST, String.valueOf(claims.isGuest()));
            }
        }

        return chain.filter(exchange.mutate().request(requestBuilder.build()).build());
    }

    @Override
    public int getOrder() {
        return -100; // 라우팅 필터보다 가장 먼저 실행되도록 높은 우선순위 부여
    }

    public record ParsedTokenClaims(String userId, boolean isGuest) {}

    /**
     * N-05: HMAC-SHA256 서명 및 만료 시각(exp)을 검증하여 클레임을 추출한다.
     * 서명 불일치, 페이로드 변조, 만료 토큰, 평문 스텁(`uid:...`)은 모두 null을 반환해 거부한다.
     */
    protected ParsedTokenClaims parseVerifiedClaims(String token) {
        if (token == null || token.isEmpty()) {
            return null;
        }
        String[] parts = token.split("\\.");
        if (parts.length != 3) {
            return null;
        }

        String signingInput = parts[0] + "." + parts[1];
        String expectedSignature = signHmacSha256(signingInput, jwtSecret);
        if (!MessageDigest.isEqual(
            expectedSignature.getBytes(StandardCharsets.UTF_8),
            parts[2].getBytes(StandardCharsets.UTF_8)
        )) {
            return null;
        }

        try {
            String payloadJson = new String(
                Base64.getUrlDecoder().decode(parts[1]),
                StandardCharsets.UTF_8
            );
            Matcher subMatcher = SUB_PATTERN.matcher(payloadJson);
            Matcher guestMatcher = GUEST_PATTERN.matcher(payloadJson);
            Matcher expMatcher = EXP_PATTERN.matcher(payloadJson);
            if (!subMatcher.find() || !guestMatcher.find() || !expMatcher.find()) {
                return null;
            }
            String userId = subMatcher.group(1);
            boolean isGuest = Boolean.parseBoolean(guestMatcher.group(1));
            long exp = Long.parseLong(expMatcher.group(1));
            if (userId.isBlank() || exp <= Instant.now().getEpochSecond()) {
                return null;
            }
            return new ParsedTokenClaims(userId, isGuest);
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    public static String createSignedJwt(String userId, boolean isGuest, String secret, long ttlSeconds) {
        long iat = Instant.now().getEpochSecond();
        long exp = iat + ttlSeconds;
        String headerJson = "{\"alg\":\"HS256\",\"typ\":\"JWT\"}";
        String payloadJson = String.format(
            Locale.ROOT,
            "{\"sub\":\"%s\",\"guest\":%s,\"iat\":%d,\"exp\":%d}",
            userId,
            isGuest,
            iat,
            exp
        );
        Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();
        String signingInput = encoder.encodeToString(headerJson.getBytes(StandardCharsets.UTF_8))
            + "."
            + encoder.encodeToString(payloadJson.getBytes(StandardCharsets.UTF_8));
        return signingInput + "." + signHmacSha256(signingInput, secret);
    }

    private static String signHmacSha256(String signingInput, String secret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec keySpec = new SecretKeySpec(
                secret.getBytes(StandardCharsets.UTF_8),
                "HmacSHA256"
            );
            mac.init(keySpec);
            byte[] rawHmac = mac.doFinal(signingInput.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(rawHmac);
        } catch (Exception ex) {
            throw new IllegalStateException("JWT_SIGNING_FAILED", ex);
        }
    }
}
