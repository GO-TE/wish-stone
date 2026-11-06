package com.wishstone.interaction.service;

import com.wishstone.events.WishStoneEvents;
import com.wishstone.events.WishStoneEvents.WishCheeredEvent;
import java.time.Instant;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 응원하기 명령 처리 서비스 (interaction-service :8083)
 * 1) wish-tower-service 내부 API(또는 캐시)로 자기 소원 여부 및 현재 응원 수 확인
 * 2) interaction_db.cheers 테이블에 (wish_id, user_id) 저장하여 1인 1회 중복 응원 즉시 차단
 * 3) Kafka `interaction.events` 토픽으로 WishCheeredEvent 비동기 발행
 * 4) [D-017 반영] 초기 서비스 허들을 낮추기 위해 응원 빛 단계 기본 구간을 1 / 5 / 15로 설정하되,
 *    실 유저 증가 시 코드 수정 없이 설정값으로 상향할 수 있도록 외부 주입 구조를 지원한다.
 */
@Service
public class CheerCommandService {

    public record WishSummary(String wishId, String authorId, int currentCheerCount) {}

    public record CheerResult(int cheerLevel, boolean levelUp) {}

    public record CheerThresholds(int level1, int level2, int level3) {
        public static final CheerThresholds INITIAL_STAGE_DEFAULT = new CheerThresholds(1, 5, 15);
    }

    public interface CheerPersistencePort {
        WishSummary fetchWishSummary(String wishId);
        boolean existsCheer(String wishId, String userId);
        void saveCheer(String wishId, String userId);
    }

    private final CheerPersistencePort persistencePort;
    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final CheerThresholds thresholds;

    public CheerCommandService(
        CheerPersistencePort persistencePort,
        KafkaTemplate<String, Object> kafkaTemplate
    ) {
        this(persistencePort, kafkaTemplate, CheerThresholds.INITIAL_STAGE_DEFAULT);
    }

    @Autowired
    public CheerCommandService(
        CheerPersistencePort persistencePort,
        KafkaTemplate<String, Object> kafkaTemplate,
        @Value("${wishstone.cheer.threshold.level1:1}") int level1,
        @Value("${wishstone.cheer.threshold.level2:5}") int level2,
        @Value("${wishstone.cheer.threshold.level3:15}") int level3
    ) {
        this(persistencePort, kafkaTemplate, new CheerThresholds(level1, level2, level3));
    }

    public CheerCommandService(
        CheerPersistencePort persistencePort,
        KafkaTemplate<String, Object> kafkaTemplate,
        CheerThresholds thresholds
    ) {
        this.persistencePort = persistencePort;
        this.kafkaTemplate = kafkaTemplate;
        this.thresholds = thresholds;
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

        int prevLevel = calcCheerLevel(summary.currentCheerCount(), thresholds);
        int nextLevel = calcCheerLevel(summary.currentCheerCount() + 1, thresholds);

        WishCheeredEvent event = new WishCheeredEvent(
            UUID.randomUUID().toString(),
            wishId,
            userId,
            Instant.now()
        );
        kafkaTemplate.send(WishStoneEvents.TOPIC_INTERACTION_EVENTS, wishId, event);

        return new CheerResult(nextLevel, nextLevel > prevLevel);
    }

    public static int calcCheerLevel(int count) {
        return calcCheerLevel(count, CheerThresholds.INITIAL_STAGE_DEFAULT);
    }

    public static int calcCheerLevel(int count, CheerThresholds thresholds) {
        if (count >= thresholds.level3()) return 3;
        if (count >= thresholds.level2()) return 2;
        if (count >= thresholds.level1()) return 1;
        return 0;
    }
}
