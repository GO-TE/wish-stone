package com.wishstone.wishtower.service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * [사수 멘토링 포인트 - 소원(돌) 생성 및 사후 카테고리 수정 서비스 (D-007, D-016, D-018, D-019)]
 * 1) 전화번호 제한 해제(D-019): 사용자가 소원에 날짜나 연락처를 적는 자유를 보장하고,
 *    외부 주입 가능한 금칙어 목록(욕설·불법 도박 스팸)만 차단합니다.
 * 2) 게스트 권한 분리(D-007): 게스트(isGuest=true)는 전체/카테고리 공개 돌탑에는 자유롭게 돌을 쌓되,
 *    지인 그룹 돌탑(groupId != null)에 쌓으려 하면 소셜 계정 연동을 유도(GUEST_GROUP_FORBIDDEN)합니다.
 * 3) 자동 카테고리 분류 + 사후 수정(D-016): 생성 시 CategoryAutoClassifier가 즉시 분류하고,
 *    유저가 원하면 updateCategory()로 언제든 수정할 수 있습니다.
 */
@Service
public class WishCommandService {

    private static final Set<String> VALID_CATEGORIES = Set.of("job", "study", "health", "relation", "etc");
    private static final List<String> DEFAULT_FORBIDDEN_WORDS = List.of(
        "시발", "씨발", "병신", "개새끼", "불법도박", "바카라", "카지노", "조건만남"
    );

    public record CreateWishCommand(
        String userId,
        boolean isGuest,
        String content,
        String preferredCategoryCode,
        String groupId,
        String stoneShape,
        String stoneColor,
        String poseJson
    ) {}

    public record WishRecord(
        String id,
        String userId,
        String groupId,
        String categoryCode,
        String content,
        String stoneShape,
        String stoneColor,
        String poseJson,
        int cheerCount,
        String status,
        Instant createdAt
    ) {}

    public interface WishPersistencePort {
        WishRecord save(WishRecord wish);
        WishRecord findById(String wishId);
    }

    private final WishPersistencePort persistencePort;
    private final CategoryAutoClassifier autoClassifier;
    private final DailyWishQuotaService quotaService;
    private final List<String> forbiddenWords;

    @Autowired
    public WishCommandService(
        WishPersistencePort persistencePort,
        CategoryAutoClassifier autoClassifier,
        DailyWishQuotaService quotaService
    ) {
        this(persistencePort, autoClassifier, quotaService, DEFAULT_FORBIDDEN_WORDS);
    }

    public WishCommandService(
        WishPersistencePort persistencePort,
        CategoryAutoClassifier autoClassifier,
        DailyWishQuotaService quotaService,
        List<String> forbiddenWords
    ) {
        this.persistencePort = persistencePort;
        this.autoClassifier = autoClassifier;
        this.quotaService = quotaService;
        this.forbiddenWords = forbiddenWords;
    }

    public WishRecord createWish(CreateWishCommand cmd, LocalDate today) {
        if (cmd.content() == null || cmd.content().isBlank()) {
            throw new IllegalArgumentException("CONTENT_EMPTY");
        }
        String trimmed = cmd.content().trim();
        if (trimmed.length() > 200) {
            throw new IllegalArgumentException("CONTENT_TOO_LONG");
        }

        for (String badWord : forbiddenWords) {
            if (trimmed.contains(badWord)) {
                throw new IllegalArgumentException("CONTENT_BLOCKED");
            }
        }

        // 게스트는 지인 그룹 돌탑 이용 불가 (소셜 연동 필요: D-007)
        if (cmd.isGuest() && cmd.groupId() != null && !cmd.groupId().isBlank()) {
            throw new IllegalStateException("GUEST_GROUP_FORBIDDEN");
        }

        // 일일 쿼터(기본 5개 + 광고/결제 보너스) 차감 (D-018)
        quotaService.consumeOne(cmd.userId(), today);

        // 유저가 카테고리를 지정하지 않았으면 본문 기반 자동 분류 (D-016)
        String resolvedCategory = (cmd.preferredCategoryCode() != null && VALID_CATEGORIES.contains(cmd.preferredCategoryCode()))
            ? cmd.preferredCategoryCode()
            : autoClassifier.classify(trimmed);

        WishRecord created = new WishRecord(
            UUID.randomUUID().toString(),
            cmd.userId(),
            cmd.groupId(),
            resolvedCategory,
            trimmed,
            cmd.stoneShape() != null ? cmd.stoneShape() : "round",
            cmd.stoneColor() != null ? cmd.stoneColor() : "#A89F91",
            cmd.poseJson() != null ? cmd.poseJson() : "{\"x\":0,\"y\":0,\"z\":0,\"qx\":0,\"qy\":0,\"qz\":0,\"qw\":1}",
            0,
            "ACTIVE",
            Instant.now()
        );
        return persistencePort.save(created);
    }

    public WishRecord createWish(CreateWishCommand cmd) {
        return createWish(cmd, LocalDate.now(ZoneId.of("Asia/Seoul")));
    }

    /**
     * 자동 분류된 카테고리가 마음에 들지 않을 때 작성자가 사후 수정한다 (PATCH /api/v1/wishes/{id}/category, D-016)
     */
    public WishRecord updateCategory(String wishId, String userId, String newCategoryCode) {
        if (newCategoryCode == null || !VALID_CATEGORIES.contains(newCategoryCode)) {
            throw new IllegalArgumentException("INVALID_CATEGORY");
        }
        WishRecord existing = persistencePort.findById(wishId);
        if (existing == null) {
            throw new IllegalArgumentException("WISH_NOT_FOUND");
        }
        if (!existing.userId().equals(userId)) {
            throw new IllegalStateException("NOT_OWNER");
        }

        WishRecord updated = new WishRecord(
            existing.id(),
            existing.userId(),
            existing.groupId(),
            newCategoryCode,
            existing.content(),
            existing.stoneShape(),
            existing.stoneColor(),
            existing.poseJson(),
            existing.cheerCount(),
            existing.status(),
            existing.createdAt()
        );
        return persistencePort.save(updated);
    }
}
