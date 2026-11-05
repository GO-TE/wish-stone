package com.stonewish.wishtower.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.stonewish.wishtower.service.DailyWishQuotaService.DailyQuotaPort;
import com.stonewish.wishtower.service.DailyWishQuotaService.QuotaState;
import com.stonewish.wishtower.service.WishCommandService.CreateWishCommand;
import com.stonewish.wishtower.service.WishCommandService.WishPersistencePort;
import com.stonewish.wishtower.service.WishCommandService.WishRecord;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class WishCommandServiceTest {

    private InMemoryQuotaAdapter quotaPort;
    private DailyWishQuotaService quotaService;
    private WishCommandService wishService;
    private LocalDate today;

    @BeforeEach
    void setUp() {
        quotaPort = new InMemoryQuotaAdapter();
        quotaService = new DailyWishQuotaService(quotaPort, 5);
        wishService = new WishCommandService(
            new InMemoryWishAdapter(),
            new CategoryAutoClassifier(),
            quotaService
        );
        today = LocalDate.of(2026, 11, 5);
    }

    @Test
    @DisplayName("D-016 & D-019: 소원 작성 시 본문 키워드로 카테고리가 자동 분류되고, 전화번호가 포함되어도 차단되지 않으며, 사후 카테고리 수정이 가능하다")
    void autoClassifyCategoryAndAllowPhoneNumberAndSupportUserEdit() {
        CreateWishCommand cmd = new CreateWishCommand(
            "user-1",
            false,
            "올해 상반기 공채 면접 꼭 최종 합격하게 해주세요! 연락처 010-1234-5678로 합격 문자 오길",
            null,
            null,
            "round",
            "#A89F91",
            null
        );

        WishRecord created = wishService.createWish(cmd, today);
        assertEquals("job", created.categoryCode());

        // 사용자가 자동 분류 결과(job)를 study로 직접 수정
        WishRecord updated = wishService.updateCategory(created.id(), "user-1", "study");
        assertEquals("study", updated.categoryCode());
    }

    @Test
    @DisplayName("D-018: 하루 기본 무료 소원 5개를 모두 소진하면 6번째는 차단되지만, 광고/결제로 보너스 쿼터를 충전하면 추가 생성이 가능하다")
    void enforceDailyFiveQuotaAndAllowBonusQuotaFromRewardOrPayment() {
        for (int i = 1; i <= 5; i++) {
            wishService.createWish(
                new CreateWishCommand("user-1", false, "나의 소원 " + i, null, null, null, null, null),
                today
            );
        }

        // 6번째 시도는 DAILY_QUOTA_EXCEEDED
        assertThrows(
            IllegalStateException.class,
            () -> wishService.createWish(
                new CreateWishCommand("user-1", false, "6번째 소원", null, null, null, null, null),
                today
            )
        );

        // 리워드 광고 시청으로 보너스 쿼터 1개 충전 후 재시도 -> 성공!
        quotaService.grantBonusQuota("user-1", today, 1);
        WishRecord sixth = wishService.createWish(
            new CreateWishCommand("user-1", false, "광고 보고 쌓는 6번째 소원 수술 완치 기원", null, null, null, null, null),
            today
        );
        assertEquals("health", sixth.categoryCode());
    }

    @Test
    @DisplayName("D-007: 게스트 계정은 공개 돌탑에는 작성 가능하지만 지인 그룹 돌탑 작성은 차단된다")
    void guestCannotPostToGroupTower() {
        assertThrows(
            IllegalStateException.class,
            () -> wishService.createWish(
                new CreateWishCommand("guest-1", true, "그룹 소원", null, "group-123", null, null, null),
                today
            )
        );
    }

    static class InMemoryQuotaAdapter implements DailyQuotaPort {
        private final Map<String, QuotaState> store = new HashMap<>();

        @Override
        public QuotaState findOrInit(String userId, LocalDate date, int defaultBaseQuota) {
            String key = userId + ":" + date;
            return store.computeIfAbsent(
                key,
                k -> new QuotaState(userId, date, defaultBaseQuota, 0, 0)
            );
        }

        @Override
        public QuotaState save(QuotaState state) {
            store.put(state.userId() + ":" + state.date(), state);
            return state;
        }
    }

    static class InMemoryWishAdapter implements WishPersistencePort {
        private final Map<String, WishRecord> store = new HashMap<>();

        @Override
        public WishRecord save(WishRecord wish) {
            store.put(wish.id(), wish);
            return wish;
        }

        @Override
        public WishRecord findById(String wishId) {
            return store.get(wishId);
        }
    }
}
