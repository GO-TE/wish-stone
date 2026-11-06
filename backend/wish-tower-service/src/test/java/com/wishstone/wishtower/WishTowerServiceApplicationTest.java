package com.wishstone.wishtower;

import static org.assertj.core.api.Assertions.assertThat;

import com.wishstone.wishtower.adapter.DefaultWishTowerPersistenceAdapter;
import com.wishstone.wishtower.controller.WishTowerController;
import com.wishstone.wishtower.controller.WishTowerController.CreateWishRequest;
import com.wishstone.wishtower.controller.WishTowerController.FulfillWishRequest;
import com.wishstone.wishtower.controller.WishTowerController.WishResponse;
import com.wishstone.wishtower.entity.DailyWishQuotaEntity.QuotaId;
import com.wishstone.wishtower.entity.WishEntity;
import com.wishstone.wishtower.repository.DailyWishQuotaJpaRepository;
import com.wishstone.wishtower.repository.ProcessedEventJpaRepository;
import com.wishstone.wishtower.repository.WishJpaRepository;
import com.wishstone.wishtower.service.TowerQueryService.StonePose;
import com.wishstone.wishtower.service.TowerQueryService.TowerViewResponse;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class WishTowerServiceApplicationTest {

    @Autowired
    private WishTowerController wishTowerController;

    @Autowired
    private WishJpaRepository wishJpaRepository;

    @Autowired
    private DailyWishQuotaJpaRepository quotaJpaRepository;

    @Autowired
    private ProcessedEventJpaRepository processedEventJpaRepository;

    @Autowired
    private DefaultWishTowerPersistenceAdapter persistenceAdapter;

    @Test
    @DisplayName("N-07 & Sprint 5: wish-tower-service JPA 엔티티(wishes, daily_wish_quotas, processed_events) 영속화 검증")
    void contextLoadsAndJpaPersistenceWorks() {
        WishResponse created = wishTowerController.createWish(
            "boot-user-1",
            false,
            new CreateWishRequest("올해 상반기 채용 꼭 합격하자!", null, null, "round", "#A89F91", StonePose.DEFAULT)
        );
        assertThat(created.id()).isNotBlank();
        assertThat(created.categoryCode()).isEqualTo("job");
        assertThat(created.status()).isEqualTo("active");

        // 1) wishes 테이블 JPA 저장 확인
        Optional<WishEntity> wishEntity = wishJpaRepository.findById(created.id());
        assertThat(wishEntity).isPresent();
        assertThat(wishEntity.get().getCategoryCode()).isEqualTo("job");

        // 2) daily_wish_quotas 테이블 JPA 차감 확인
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Seoul"));
        assertThat(quotaJpaRepository.findById(new QuotaId("boot-user-1", today)))
            .isPresent()
            .get()
            .satisfies(q -> assertThat(q.toDomain().usedCount()).isEqualTo(1));

        // 3) 소원 성취(fulfill) 및 bloom_type 컬럼 저장 확인
        wishTowerController.fulfillWish(created.id(), "boot-user-1", new FulfillWishRequest("sprout"));
        assertThat(wishJpaRepository.findById(created.id()).orElseThrow().getBloomType()).isEqualTo("sprout");

        // 4) processed_events 테이블 멱등 기록 확인
        persistenceAdapter.markProcessed("evt-jpa-1", "WISH_CHEERED");
        assertThat(processedEventJpaRepository.existsById("evt-jpa-1")).isTrue();

        TowerViewResponse tower = wishTowerController.getTower("global", "boot-user-1", 200);
        assertThat(tower.stones()).isNotEmpty();

        // 5) API-16 카테고리 목록 조회 (categories 테이블 시딩 확인)
        assertThat(wishTowerController.getCategories()).hasSize(5);

        // 6) 내부 Feign 요약 조회 (GET /internal/wishes/{wishId}/summary) 확인
        assertThat(wishTowerController.getWishSummary(created.id()).authorId()).isEqualTo("boot-user-1");
    }
}
