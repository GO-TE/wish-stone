package com.stonewish.wishtower;

import static org.assertj.core.api.Assertions.assertThat;

import com.stonewish.wishtower.controller.WishTowerController;
import com.stonewish.wishtower.controller.WishTowerController.CreateWishRequest;
import com.stonewish.wishtower.controller.WishTowerController.WishResponse;
import com.stonewish.wishtower.service.TowerQueryService.StonePose;
import com.stonewish.wishtower.service.TowerQueryService.TowerViewResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class WishTowerServiceApplicationTest {

    @Autowired
    private WishTowerController wishTowerController;

    @Test
    @DisplayName("N-07: wish-tower-service Spring Boot 애플리케이션 컨텍스트 기동 및 기본 어댑터 기반 소원 생성·조회 스모크 테스트")
    void contextLoadsAndWishLifecycleWorks() {
        WishResponse created = wishTowerController.createWish(
            "boot-user-1",
            false,
            new CreateWishRequest("올해 상반기 채용 꼭 합격하자!", null, null, "round", "#A89F91", StonePose.DEFAULT)
        );
        assertThat(created.id()).isNotBlank();
        assertThat(created.categoryCode()).isEqualTo("job");
        assertThat(created.status()).isEqualTo("active");

        TowerViewResponse tower = wishTowerController.getTower("global", "boot-user-1", 200);
        assertThat(tower.stones()).isNotEmpty();
    }
}
