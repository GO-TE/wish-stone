package com.stonewish.interaction.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.stonewish.events.StoneWishEvents.WishReportThresholdReachedEvent;
import com.stonewish.interaction.controller.InteractionController;
import com.stonewish.interaction.controller.InteractionController.ErrorResponse;
import com.stonewish.interaction.controller.InteractionController.InteractionExceptionHandler;
import com.stonewish.interaction.controller.InteractionController.ReportWishRequest;
import com.stonewish.interaction.service.CheerCommandService.WishSummary;
import com.stonewish.interaction.service.ReportCommandService.ReportPersistencePort;
import com.stonewish.interaction.service.ReportCommandService.ReportResult;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import org.apache.kafka.clients.producer.Producer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;
import org.springframework.kafka.support.SendResult;
import org.springframework.web.bind.MissingRequestHeaderException;

class ReportCommandServiceTest {

    private InMemoryReportPort reportPort;
    private CapturingKafkaTemplate kafkaTemplate;
    private ReportCommandService reportService;

    @BeforeEach
    void setUp() {
        reportPort = new InMemoryReportPort();
        reportPort.summaries.put("wish-500", new WishSummary("wish-500", "author-1", 0));
        kafkaTemplate = new CapturingKafkaTemplate();
        reportService = new ReportCommandService(reportPort, kafkaTemplate, 5);
    }

    @Test
    @DisplayName("DB-018 & N-02: 본인 소원 신고 시 SELF_REPORT_FORBIDDEN 예외가 발생하고, 동일 유저의 중복 신고 시 ALREADY_REPORTED 예외가 발생한다")
    void reportWish_preventsSelfReportAndDuplicateReport() {
        // 1) 본인 소원 신고 차단
        assertThatThrownBy(() -> reportService.reportWish("wish-500", "author-1", "스팸"))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("SELF_REPORT_FORBIDDEN");

        // 2) 타인의 첫 신고 성공
        ReportResult first = reportService.reportWish("wish-500", "reporter-1", "부적절한 내용");
        assertThat(first.cumulativeReportCount()).isEqualTo(1);
        assertThat(first.blindTriggered()).isFalse();
        assertThat(kafkaTemplate.lastEvent).isNull();

        // 3) 동일 타인의 중복 신고 차단 (N-02: ALREADY_REPORTED)
        assertThatThrownBy(() -> reportService.reportWish("wish-500", "reporter-1", "또 신고"))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("ALREADY_REPORTED");
    }

    @Test
    @DisplayName("DB-018: 서로 다른 유저 5명이 신고하여 누적 5회에 도달하면 stonewish.wish.events 토픽으로 WishReportThresholdReachedEvent가 발행된다")
    void reportWish_publishesThresholdEventAtFiveReports() {
        for (int i = 1; i <= 4; i++) {
            ReportResult r = reportService.reportWish("wish-500", "reporter-" + i, "욕설/비방");
            assertThat(r.blindTriggered()).isFalse();
            assertThat(kafkaTemplate.lastEvent).isNull();
        }

        // 5번째 신고 도달!
        ReportResult fifth = reportService.reportWish("wish-500", "reporter-5", "도배/광고");
        assertThat(fifth.cumulativeReportCount()).isEqualTo(5);
        assertThat(fifth.blindTriggered()).isTrue();

        assertThat(kafkaTemplate.lastTopic).isEqualTo("stonewish.wish.events");
        assertThat(kafkaTemplate.lastKey).isEqualTo("wish-500");
        assertThat(kafkaTemplate.lastEvent).isInstanceOf(WishReportThresholdReachedEvent.class);

        WishReportThresholdReachedEvent payload = (WishReportThresholdReachedEvent) kafkaTemplate.lastEvent;
        assertThat(payload.wishId()).isEqualTo("wish-500");
        assertThat(payload.reportCount()).isEqualTo(5);
    }

    @Test
    @DisplayName("N-02 & N-04: InteractionExceptionHandler에서 CANNOT_CHEER_OWN(403), ALREADY_REPORTED(409), UNAUTHORIZED(401) 매핑 검증")
    void interactionController_mapsErrorsCorrectly() throws Exception {
        CheerCommandServiceTest.FakePersistencePort cheerPort = new CheerCommandServiceTest.FakePersistencePort();
        cheerPort.summary = new WishSummary("wish-500", "author-1", 0);
        CheerCommandService cheerService = new CheerCommandService(cheerPort, kafkaTemplate);

        InteractionController controller = new InteractionController(cheerService, reportService);
        InteractionExceptionHandler advice = new InteractionExceptionHandler();

        // 정상 신고 컨트롤러 호출
        ReportResult result = controller.reportWish("wish-500", "user-2", new ReportWishRequest("불쾌한 표현"));
        assertThat(result.cumulativeReportCount()).isEqualTo(1);

        // N-02: 본인 소원 응원 시 CANNOT_CHEER_OWN (403) 매핑 검증
        ResponseEntity<ErrorResponse> selfCheerResp = advice.handleStateConflict(
            new IllegalStateException("CANNOT_CHEER_OWN")
        );
        assertThat(selfCheerResp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(selfCheerResp.getBody().code()).isEqualTo("CANNOT_CHEER_OWN");

        // N-02: 중복 신고 ALREADY_REPORTED (409) 매핑 검증
        ResponseEntity<ErrorResponse> dupReportResp = advice.handleStateConflict(
            new IllegalStateException("ALREADY_REPORTED")
        );
        assertThat(dupReportResp.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(dupReportResp.getBody().code()).isEqualTo("ALREADY_REPORTED");

        // N-04: X-User-Id 헤더 누락 시 401 UNAUTHORIZED 매핑 검증
        MethodParameter param = new MethodParameter(
            InteractionController.class.getMethod("cheerWish", String.class, String.class), 1
        );
        ResponseEntity<ErrorResponse> unauthResp = advice.handleMissingHeader(
            new MissingRequestHeaderException("X-User-Id", param)
        );
        assertThat(unauthResp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(unauthResp.getBody().code()).isEqualTo("UNAUTHORIZED");
    }

    static class InMemoryReportPort implements ReportPersistencePort {
        final Map<String, WishSummary> summaries = new HashMap<>();
        final Set<String> reportKeys = new HashSet<>();
        final Map<String, Integer> counts = new HashMap<>();

        @Override
        public WishSummary fetchWishSummary(String wishId) {
            return summaries.get(wishId);
        }

        @Override
        public boolean existsReport(String wishId, String reporterUserId) {
            return reportKeys.contains(wishId + ":" + reporterUserId);
        }

        @Override
        public int saveReportAndCount(String wishId, String reporterUserId, String reason) {
            reportKeys.add(wishId + ":" + reporterUserId);
            int next = counts.getOrDefault(wishId, 0) + 1;
            counts.put(wishId, next);
            return next;
        }
    }

    static class CapturingKafkaTemplate extends KafkaTemplate<String, Object> {
        String lastTopic;
        String lastKey;
        Object lastEvent;

        CapturingKafkaTemplate() {
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
}
