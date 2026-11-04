package com.stonewish.events;

import java.time.Instant;

/**
 * 서비스 간 Kafka 비동기 이벤트 페이로드 정의 (Java 21 Record)
 * 근거: dash_board/API 명세서.md 3장, dash_board/MSA.md 3·4장
 */
public final class StoneWishEvents {

    public static final String TOPIC_WISH_EVENTS = "wish.events";
    public static final String TOPIC_INTERACTION_EVENTS = "interaction.events";

    private StoneWishEvents() {}

    /**
     * 소원(돌) 생성 이벤트 (wish-tower-service 발행 -> group-service 구독하여 돌 개수 증가)
     */
    public record WishCreatedEvent(
        String eventId,
        String wishId,
        String groupId,
        String categoryCode,
        Instant createdAt
    ) {}

    /**
     * 응원 발생 이벤트 (interaction-service 발행 -> wish-tower-service 구독하여 cheer_count 및 Redis 통계 증가)
     */
    public record WishCheeredEvent(
        String eventId,
        String wishId,
        String cheererId,
        Instant createdAt
    ) {}

    /**
     * 신고 누적 임계치(5회) 도달 이벤트 (interaction-service 발행 -> wish-tower-service 구독하여 status = HIDDEN 전환)
     */
    public record WishReportThresholdReachedEvent(
        String eventId,
        String wishId,
        int reportCount,
        Instant occurredAt
    ) {}
}
