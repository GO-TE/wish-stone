package com.stonewish.gateway.filter;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * [사수 멘토링 포인트 - Spring Cloud Gateway 글로벌 보안 필터]
 * 1) 왜 Gateway는 일반 Servlet(HttpServletRequest)이 아니라 ServerWebExchange(WebFlux/Netty)를 쓸까요?
 *    - API Gateway는 모든 마이크로서비스(:8081~:8084) 앞단에서 수만 개의 요청을 토스해야 합니다.
 *    - 일반 Tomcat(Thread-per-request)을 쓰면 하위 서비스 응답을 기다리는 동안 스레드가 다 묶여서 Gateway가 먼저 뻗습니다.
 *    - 그래서 Spring Cloud Gateway는 비동기 이벤트 루프(Netty) 기반인 WebFlux 위에서만 동작합니다.
 *
 * 2) 왜 클라이언트가 보낸 X-User-Id 헤더를 무조건 먼저 지워야(remove) 할까요? (Header Spoofing 방어)
 *    - 내부 서비스(wish-tower 등)는 "Gateway가 이미 검증했겠지" 하고 X-User-Id 헤더만 믿고 글을 쓰고 삭제합니다.
 *    - 만약 해커가 요청할 때 직접 `X-User-Id: 다른사람UUID` 헤더를 넣어서 보내면, Gateway가 이를 안 지웠을 때
 *      남의 계정으로 소원이 삭제되는 대형 보안 사고가 터집니다!
 */
@Component
public class JwtHeaderSanitizeFilter implements GlobalFilter, Ordered {

    public static final String HEADER_USER_ID = "X-User-Id";
    public static final String HEADER_USER_GUEST = "X-User-Guest";

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        // 1단계: 외부 클라이언트가 임의로 주입한 내부 신뢰 헤더(X-User-*)를 무조건 제거(Strip)한다.
        ServerHttpRequest.Builder requestBuilder = exchange.getRequest().mutate()
            .headers(httpHeaders -> {
                httpHeaders.remove(HEADER_USER_ID);
                httpHeaders.remove(HEADER_USER_GUEST);
            });

        // 2단계: Authorization Bearer 토큰에서 검증된 클레임만 추출해 내부 헤더로 다시 세팅한다.
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
     * 토큰 파싱 훅 (실제 JWT 서명 검증기 연동 지점, 테스트/개발 시 "uid:{id}:guest:{bool}" 포맷도 허용)
     */
    protected ParsedTokenClaims parseVerifiedClaims(String token) {
        if (token.isEmpty()) return null;
        if (token.startsWith("uid:")) {
            String[] parts = token.split(":");
            String uid = parts.length > 1 ? parts[1] : "anonymous";
            boolean guest = parts.length > 3 && Boolean.parseBoolean(parts[3]);
            return new ParsedTokenClaims(uid, guest);
        }
        return new ParsedTokenClaims("verified-user", false);
    }
}
