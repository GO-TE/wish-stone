package com.stonewish.interaction;

import static org.assertj.core.api.Assertions.assertThat;

import com.stonewish.interaction.adapter.DefaultInteractionPersistenceAdapter;
import com.stonewish.interaction.controller.InteractionController;
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

    @Test
    @DisplayName("N-07: interaction-service Spring Boot 애플리케이션 컨텍스트 기동 및 기본 어댑터 주입 스모크 테스트")
    void contextLoads() {
        assertThat(interactionController).isNotNull();
        assertThat(adapter).isNotNull();
    }
}
