package com.stonewish.interaction.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.stonewish.events.StoneWishEvents;
import com.stonewish.interaction.service.CheerCommandService.CheerThresholds;
import java.util.concurrent.CompletableFuture;
import org.apache.kafka.clients.producer.Producer;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;
import org.springframework.kafka.support.SendResult;

class CheerCommandServiceTest {

    static class FakePersistencePort implements CheerCommandService.CheerPersistencePort {
        CheerCommandService.WishSummary summary;
        boolean exists;
        String savedWishId;
        String savedUserId;

        @Override
        public CheerCommandService.WishSummary fetchWishSummary(String wishId) {
            return summary;
        }

        @Override
        public boolean existsCheer(String wishId, String userId) {
            return exists;
        }

        @Override
        public void saveCheer(String wishId, String userId) {
            this.savedWishId = wishId;
            this.savedUserId = userId;
        }
    }

    static class FakeKafkaTemplate extends KafkaTemplate<String, Object> {
        String lastTopic;
        String lastKey;
        Object lastEvent;

        public FakeKafkaTemplate() {
            super(new DummyProducerFactory());
        }

        @Override
        public CompletableFuture<SendResult<String, Object>> send(String topic, String key, Object data) {
            this.lastTopic = topic;
            this.lastKey = key;
            this.lastEvent = data;
            return CompletableFuture.completedFuture(null);
        }
    }

    static class DummyProducerFactory implements ProducerFactory<String, Object> {
        @Override
        public Producer<String, Object> createProducer() {
            return null;
        }
    }

    @Test
    @DisplayName("D-017: 초기 단계(1/5/15)에서 첫 응원(0 -> 1) 성공 시 즉시 1단계 빛 상승(levelUp=true) 및 Kafka 이벤트가 발행된다")
    void cheerWish_initialStageFirstCheerLevelUp() {
        FakePersistencePort persistencePort = new FakePersistencePort();
        persistencePort.summary = new CheerCommandService.WishSummary("wish-101", "author-1", 0);
        persistencePort.exists = false;

        FakeKafkaTemplate kafkaTemplate = new FakeKafkaTemplate();
        CheerCommandService service = new CheerCommandService(persistencePort, kafkaTemplate);

        CheerCommandService.CheerResult result = service.cheerWish("wish-101", "cheerer-2");

        assertThat(result.cheerLevel()).isEqualTo(1);
        assertThat(result.levelUp()).isTrue();
        assertThat(persistencePort.savedWishId).isEqualTo("wish-101");
        assertThat(persistencePort.savedUserId).isEqualTo("cheerer-2");

        assertThat(kafkaTemplate.lastTopic).isEqualTo(StoneWishEvents.TOPIC_INTERACTION_EVENTS);
        assertThat(kafkaTemplate.lastKey).isEqualTo("wish-101");
        assertThat(kafkaTemplate.lastEvent).isInstanceOf(StoneWishEvents.WishCheeredEvent.class);
    }

    @Test
    @DisplayName("본인 소원 응원 시 CANNOT_CHEER_OWN 예외 발생 검증")
    void cheerWish_cannotCheerOwnWish() {
        FakePersistencePort persistencePort = new FakePersistencePort();
        persistencePort.summary = new CheerCommandService.WishSummary("wish-101", "user-me", 5);

        FakeKafkaTemplate kafkaTemplate = new FakeKafkaTemplate();
        CheerCommandService service = new CheerCommandService(persistencePort, kafkaTemplate);

        assertThatThrownBy(() -> service.cheerWish("wish-101", "user-me"))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("CANNOT_CHEER_OWN");
    }

    @Test
    @DisplayName("중복 응원 시 ALREADY_CHEERED 예외 발생 검증")
    void cheerWish_alreadyCheered() {
        FakePersistencePort persistencePort = new FakePersistencePort();
        persistencePort.summary = new CheerCommandService.WishSummary("wish-101", "author-1", 5);
        persistencePort.exists = true;

        FakeKafkaTemplate kafkaTemplate = new FakeKafkaTemplate();
        CheerCommandService service = new CheerCommandService(persistencePort, kafkaTemplate);

        assertThatThrownBy(() -> service.cheerWish("wish-101", "user-2"))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("ALREADY_CHEERED");
    }

    @Test
    @DisplayName("D-017: 초기 기본 구간(1/5/15) 및 실 유저 증가 후 동적 상향 구간(10/50/100) 모두 정확히 계산된다")
    void calcCheerLevel_dynamicThresholds() {
        // 1) 초기 허들 완화 기준 (1 / 5 / 15)
        assertThat(CheerCommandService.calcCheerLevel(0)).isEqualTo(0);
        assertThat(CheerCommandService.calcCheerLevel(1)).isEqualTo(1);
        assertThat(CheerCommandService.calcCheerLevel(4)).isEqualTo(1);
        assertThat(CheerCommandService.calcCheerLevel(5)).isEqualTo(2);
        assertThat(CheerCommandService.calcCheerLevel(14)).isEqualTo(2);
        assertThat(CheerCommandService.calcCheerLevel(15)).isEqualTo(3);

        // 2) 실 유저 증가 후 설정값 상향 시 (10 / 50 / 100)
        CheerThresholds scaled = new CheerThresholds(10, 50, 100);
        assertThat(CheerCommandService.calcCheerLevel(9, scaled)).isEqualTo(0);
        assertThat(CheerCommandService.calcCheerLevel(10, scaled)).isEqualTo(1);
        assertThat(CheerCommandService.calcCheerLevel(50, scaled)).isEqualTo(2);
        assertThat(CheerCommandService.calcCheerLevel(100, scaled)).isEqualTo(3);
    }
}
