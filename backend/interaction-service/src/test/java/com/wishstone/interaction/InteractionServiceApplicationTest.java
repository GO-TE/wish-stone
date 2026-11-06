package com.wishstone.interaction;

import static org.assertj.core.api.Assertions.assertThat;

import com.wishstone.interaction.adapter.DefaultInteractionPersistenceAdapter;
import com.wishstone.interaction.controller.InteractionController;
import com.wishstone.interaction.entity.CheerEntity.CheerId;
import com.wishstone.interaction.repository.CheerJpaRepository;
import com.wishstone.interaction.repository.ReportJpaRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class InteractionServiceApplicationTest {

    @Autowired
    private InteractionController interactionController;

    @Autowired
    private DefaultInteractionPersistenceAdapter adapter;

    @Autowired
    private CheerJpaRepository cheerJpaRepository;

    @Autowired
    private ReportJpaRepository reportJpaRepository;

    @Test
    @DisplayName("N-07 & Sprint 5: interaction-service JPA 엔티티(cheers, reports 테이블) 영속화 및 중복 검사 검증")
    void contextLoadsAndJpaPersistenceWorks() {
        assertThat(interactionController).isNotNull();

        adapter.registerWishSummary("wish-jpa-1", "author-1", 0);
        adapter.saveCheer("wish-jpa-1", "cheerer-1");
        assertThat(cheerJpaRepository.existsById(new CheerId("wish-jpa-1", "cheerer-1"))).isTrue();
        assertThat(adapter.existsCheer("wish-jpa-1", "cheerer-1")).isTrue();

        int reportCount = adapter.saveReportAndCount("wish-jpa-1", "reporter-1", "spam");
        assertThat(reportCount).isEqualTo(1);
        assertThat(reportJpaRepository.existsByWishIdAndReporterId("wish-jpa-1", "reporter-1")).isTrue();
    }
}
