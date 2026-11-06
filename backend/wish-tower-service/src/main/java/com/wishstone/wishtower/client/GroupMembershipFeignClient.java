package com.wishstone.wishtower.client;

import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import java.util.Map;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

/**
 * [사수 멘토링 포인트 - N-06 지인 그룹 돌탑 접근 권한 확인 Feign 클라이언트]
 * 닉네임 조회(UserAuthFeignClient)는 장애 시 "익명의 그룹원"으로 완화(Fail-Open)해도 되지만,
 * 지인 그룹 멤버십 권한 확인(GroupMembershipFeignClient)은 보안 경계이므로
 * group-service 장애 시 반드시 접근을 거부(Fail-Closed: exists=false)해야 비인가 노출을 막을 수 있습니다.
 *
 * 근거: dash_board/API 명세서.md 2장 (`GET /internal/groups/{groupId}/members/{userId}/exists`)
 */
@FeignClient(name = "group-service", url = "${services.group.url:http://localhost:8084}")
public interface GroupMembershipFeignClient {

    @GetMapping("/internal/groups/{groupId}/members/{userId}/exists")
    @CircuitBreaker(name = "groupServiceCircuitBreaker", fallbackMethod = "fallbackMembership")
    Map<String, Boolean> checkMembership(
        @PathVariable("groupId") String groupId,
        @PathVariable("userId") String userId
    );

    default Map<String, Boolean> fallbackMembership(String groupId, String userId, Throwable throwable) {
        // 보안상 권한 확인 장애 시 Fail-Closed(접근 거부) 반환
        return Map.of("exists", false);
    }
}
