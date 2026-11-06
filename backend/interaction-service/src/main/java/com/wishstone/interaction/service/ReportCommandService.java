package com.wishstone.interaction.service;

import com.wishstone.events.WishStoneEvents.WishReportThresholdReachedEvent;
import com.wishstone.interaction.service.CheerCommandService.WishSummary;
import java.time.Instant;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * [사수 멘토링 포인트 - 소원 신고 누적 및 5회 도달 시 자동 블라인드 이벤트 발행 서비스 (DB-018)]
 * 1) 1인 1회 신고 제한: 동일 유저가 악의적으로 한 소원을 5번 연속 신고해 블라인드시키는 어뷰징을 막기 위해
 *    (wishId, reporterUserId) 복합 유니크 제약을 검사합니다 (`ALREADY_REPORTED`).
 * 2) 본인 소원 신고 방지: 작성자 본인이 자신의 소원을 신고하는 비정상 요청을 차단합니다 (`SELF_REPORT_FORBIDDEN`).
 * 3) 누적 5회 도달 시 비동기 격리: 신고 횟수가 임계치(기본 5회)에 도달하면 Kafka `wishstone.wish.events` 토픽으로
 *    `WishReportThresholdReachedEvent`를 발행하여 `wish-tower-service`가 소원 상태를 `HIDDEN`으로 자동 전환하게 합니다.
 */
@Service
public class ReportCommandService {

    public static final String TOPIC_WISH_REPORT_EVENTS = "wishstone.wish.events";

    public record ReportResult(
        String wishId,
        int cumulativeReportCount,
        boolean blindTriggered
    ) {}

    public interface ReportPersistencePort {
        WishSummary fetchWishSummary(String wishId);
        boolean existsReport(String wishId, String reporterUserId);
        int saveReportAndCount(String wishId, String reporterUserId, String reason);
    }

    private final ReportPersistencePort persistencePort;
    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final int autoHideThreshold;

    public ReportCommandService(
        ReportPersistencePort persistencePort,
        KafkaTemplate<String, Object> kafkaTemplate
    ) {
        this(persistencePort, kafkaTemplate, 5);
    }

    @Autowired
    public ReportCommandService(
        ReportPersistencePort persistencePort,
        KafkaTemplate<String, Object> kafkaTemplate,
        @Value("${wishstone.report.auto-hide-threshold:5}") int autoHideThreshold
    ) {
        this.persistencePort = persistencePort;
        this.kafkaTemplate = kafkaTemplate;
        this.autoHideThreshold = autoHideThreshold;
    }

    @Transactional
    public ReportResult reportWish(String wishId, String reporterUserId, String reason) {
        if (reason == null || reason.isBlank()) {
            throw new IllegalArgumentException("REPORT_REASON_EMPTY");
        }

        WishSummary summary = persistencePort.fetchWishSummary(wishId);
        if (summary == null) {
            throw new IllegalArgumentException("WISH_NOT_FOUND");
        }
        if (summary.authorId().equals(reporterUserId)) {
            throw new IllegalStateException("SELF_REPORT_FORBIDDEN");
        }
        if (persistencePort.existsReport(wishId, reporterUserId)) {
            throw new IllegalStateException("ALREADY_REPORTED");
        }

        int cumulativeCount = persistencePort.saveReportAndCount(wishId, reporterUserId, reason.trim());
        boolean blindTriggered = cumulativeCount >= autoHideThreshold;

        if (cumulativeCount == autoHideThreshold) {
            WishReportThresholdReachedEvent event = new WishReportThresholdReachedEvent(
                UUID.randomUUID().toString(),
                wishId,
                cumulativeCount,
                Instant.now()
            );
            kafkaTemplate.send(TOPIC_WISH_REPORT_EVENTS, wishId, event);
        }

        return new ReportResult(wishId, cumulativeCount, blindTriggered);
    }
}
