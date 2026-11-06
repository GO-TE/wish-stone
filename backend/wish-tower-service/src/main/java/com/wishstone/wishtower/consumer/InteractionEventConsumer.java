package com.wishstone.wishtower.consumer;

import com.wishstone.events.WishStoneEvents;
import com.wishstone.events.WishStoneEvents.WishCheeredEvent;
import com.wishstone.events.WishStoneEvents.WishReportThresholdReachedEvent;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * interaction-service가 발행한 응원·신고 이벤트를 비동기 수신하여
 * 소원 응원 카운트(wishes.cheer_count), 상태(HIDDEN), Redis 돌탑 통계를 갱신하는 Kafka 컨슈머.
 *
 * 근거: dash_board/MSA.md 3·4장 (Kafka 비동기 이벤트), dash_board/API 명세서.md 3장
 */
@Component
public class InteractionEventConsumer {

    public static final String TOPIC_WISH_REPORT_EVENTS = "wishstone.wish.events";

    public interface WishEventProjectionHandler {
        boolean isAlreadyProcessed(String eventId);
        void markProcessed(String eventId, String eventType);
        void incrementCheerCountAndStats(String wishId);
        void hideWishByReportThreshold(String wishId);
    }

    private final WishEventProjectionHandler projectionHandler;

    public InteractionEventConsumer(WishEventProjectionHandler projectionHandler) {
        this.projectionHandler = projectionHandler;
    }

    @KafkaListener(
        topics = WishStoneEvents.TOPIC_INTERACTION_EVENTS,
        groupId = "wish-tower-service-group"
    )
    @Transactional
    public void onWishCheered(WishCheeredEvent event) {
        if (event == null || event.eventId() == null || projectionHandler.isAlreadyProcessed(event.eventId())) {
            return; // 멱등성(Idempotency) 보장: 중복 수신 이벤트 무시
        }
        projectionHandler.incrementCheerCountAndStats(event.wishId());
        projectionHandler.markProcessed(event.eventId(), "WISH_CHEERED");
    }

    @KafkaListener(
        topics = { WishStoneEvents.TOPIC_INTERACTION_EVENTS, TOPIC_WISH_REPORT_EVENTS },
        groupId = "wish-tower-service-report-group"
    )
    @Transactional
    public void onReportThresholdReached(WishReportThresholdReachedEvent event) {
        if (event == null || event.eventId() == null || projectionHandler.isAlreadyProcessed(event.eventId())) {
            return; // 멱등성(Idempotency) 보장: 동일 eventId 재수신 시 무시
        }
        projectionHandler.hideWishByReportThreshold(event.wishId());
        projectionHandler.markProcessed(event.eventId(), "WISH_REPORT_THRESHOLD_REACHED");
    }
}
