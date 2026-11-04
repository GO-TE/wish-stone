package com.stonewish.wishtower.client;

import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

/**
 * user-auth-service(:8081)와 동기 HTTP 통신을 수행하는 OpenFeign 클라이언트
 * 그룹 돌탑 조회 시 작성자 닉네임이 즉시 필요하므로 동기 호출하되,
 * user-auth-service 장애가 돌탑 조회 전체 장애로 번지지 않도록 Resilience4j CircuitBreaker 폴백을 적용한다.
 *
 * 근거: dash_board/MSA.md 6장 (Circuit Breaker), dash_board/API 명세서.md 2장
 */
@FeignClient(name = "user-auth-service", url = "${services.user-auth.url:http://localhost:8081}")
public interface UserAuthFeignClient {

    record NicknameBatchRequest(List<String> userIds) {}

    @PostMapping("/internal/users/nicknames")
    @CircuitBreaker(name = "userAuthCircuitBreaker", fallbackMethod = "fallbackNicknames")
    Map<String, String> getNicknames(@RequestBody NicknameBatchRequest request);

    default Map<String, String> fallbackNicknames(NicknameBatchRequest request, Throwable throwable) {
        return request.userIds().stream()
            .distinct()
            .collect(Collectors.toMap(id -> id, id -> "익명의 그룹원"));
    }
}
