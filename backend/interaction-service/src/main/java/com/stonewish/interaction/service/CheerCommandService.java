package com.stonewish.interaction.service;

import com.stonewish.events.StoneWishEvents;
import com.stonewish.events.StoneWishEvents.WishCheeredEvent;
import java.time.Instant;
import java.util.UUID;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 응원하기 명령 처리 서비스 (interaction-service :8083)
 * 1) wish-tower-service 내부 API(또는 캐시)로 자기 소원 여부 및 현재 응원 수 확인
 * 2) interaction_db.cheers 테이블에 (wish_id, user_id) 저장하여 1인 1회 중복 응원 즉시 차단
 * 3) Kafka `interaction.events` 토픽으로 WishCheeredEvent 비동기 발행
 *
 * 근거: dash_board/API 명세서.md API-07, D-005, D-006
 */
@Service
public class CheerCommandService {

    public record WishSummary(String wishId, String authorId, int currentCheerCount) {}

    public record CheerResult(int cheerLevel, boolean levelUp) {}

    public interface CheerPersistencePort {
        WishSummary fetchWishSummary(String wishId);
        boolean existsCheer(String wishId, String userId);
        void saveCheer(String wishId, String userId);
    }

    private final CheerPersistencePort persistencePort;
    private final KafkaTemplate<String, Object> kafkaTemplate;

    public CheerCommandService(
        CheerPersistencePort persistencePort,
        KafkaTemplate<String, Object> kafkaTemplate
    ) {
        this.persistencePort = persistencePort;
        this.kafkaTemplate = kafkaTemplate;
    }

    @Transactional
    public CheerResult cheerWish(String wishId, String userId) {
        WishSummary summary = persistencePort.fetchWishSummary(wishId);
        if (summary == null) {
            throw new IllegalArgumentException("WISH_NOT_FOUND");
        }
        if (summary.authorId().equals(userId)) {
            throw new IllegalStateException("CANNOT_CHEER_OWN");
        }
        if (persistencePort.existsCheer(wishId, userId)) {
            throw new IllegalStateException("ALREADY_CHEERED");
        }

        persistencePort.saveCheer(wishId, userId);

        int prevLevel = calcCheerLevel(summary.currentCheerCount());
        int nextLevel = calcCheerLevel(summary.currentCheerCount() + 1);

        WishCheeredEvent event = new WishCheeredEvent(
            UUID.randomUUID().toString(),
            wishId,
            userId,
            Instant.now()
        );
        kafkaTemplate.send(StoneWishEvents.TOPIC_INTERACTION_EVENTS, wishId, event);

        return new CheerResult(nextLevel, nextLevel > prevLevel);
    }

    public static int calcCheerLevel(int count) {
        if (count >= 100) return 3;
        if (count >= 50) return 2;
        if (count >= 10) return 1;
        return 0;
    }
}
