package com.stonewish.wishtower;

import static org.assertj.core.api.Assertions.assertThat;

import com.stonewish.wishtower.adapter.DefaultWishTowerPersistenceAdapter;
import com.stonewish.wishtower.controller.WishTowerController;
import com.stonewish.wishtower.controller.WishTowerController.CreateWishRequest;
import com.stonewish.wishtower.controller.WishTowerController.FulfillWishRequest;
import com.stonewish.wishtower.controller.WishTowerController.WishResponse;
import com.stonewish.wishtower.entity.DailyWishQuotaEntity.QuotaId;
import com.stonewish.wishtower.entity.WishEntity;
import com.stonewish.wishtower.repository.DailyWishQuotaJpaRepository;
import com.stonewish.wishtower.repository.ProcessedEventJpaRepository;
import com.stonewish.wishtower.repository.WishJpaRepository;
import com.stonewish.wishtower.service.TowerQueryService.StonePose;
import com.stonewish.wishtower.service.TowerQueryService.TowerViewResponse;
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
    }
}
