package com.wishstone.wishtower.controller;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.wishstone.wishtower.service.TowerQueryService.AnonymousWishCard;
import com.wishstone.wishtower.service.TowerQueryService.MyWishView;
import com.wishstone.wishtower.service.TowerQueryService.StonePose;
import com.wishstone.wishtower.service.TowerQueryService.TowerStatsResponse;
import com.wishstone.wishtower.service.TowerQueryService.TowerStoneView;
import java.time.Instant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * N-09: Jackson JSON 직렬화 시 프론트엔드 계약 키(isMine, pose, nickname, 소문자 status, stoneCount 등)가
 * 정확히 출력되는지 검증하는 단위 테스트
 */
class ContractJsonSerializationTest {

    private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());

    @Test
    @DisplayName("N-09: TowerStoneView 및 MyWishView 직렬화 시 isMine, pose({x,y,z,qx,qy,qz,qw}), nickname, 소문자 status 키가 정확히 생성된다")
    void serializeTowerStoneAndMyWish_matchesFrontendContractKeys() throws Exception {
        TowerStoneView stone = new TowerStoneView(
            "stone-1",
            0,
            "job",
            "round",
            "#A89F91",
            new StonePose(0.1, 1.25, -0.05, 0.0, 0.0, 0.0, 1.0),
            "active",
            null,
            5,
            2,
            true,
            "돌탑지기#0412",
            Instant.parse("2026-11-05T00:00:00Z")
        );

        JsonNode stoneJson = objectMapper.readTree(objectMapper.writeValueAsString(stone));
        assertThat(stoneJson.has("isMine")).isTrue();
        assertThat(stoneJson.get("isMine").asBoolean()).isTrue();
        assertThat(stoneJson.has("nickname")).isTrue();
        assertThat(stoneJson.get("nickname").asText()).isEqualTo("돌탑지기#0412");
        assertThat(stoneJson.get("status").asText()).isEqualTo("active");
        assertThat(stoneJson.get("pose").isObject()).isTrue();
        assertThat(stoneJson.get("pose").get("y").asDouble()).isEqualTo(1.25);
        assertThat(stoneJson.get("pose").get("qw").asDouble()).isEqualTo(1.0);
        assertThat(stoneJson.has("poseJson")).isFalse();
        assertThat(stoneJson.has("authorNickname")).isFalse();

        MyWishView myWish = new MyWishView(
            "stone-1",
            null,
            "job",
            "합격 기원",
            "round",
            "#A89F91",
            StonePose.DEFAULT,
            "fulfilled",
            "flower",
            15,
            3,
            true,
            Instant.parse("2026-11-05T00:00:00Z")
        );
        JsonNode myWishJson = objectMapper.readTree(objectMapper.writeValueAsString(myWish));
        assertThat(myWishJson.get("isMine").asBoolean()).isTrue();
        assertThat(myWishJson.get("status").asText()).isEqualTo("fulfilled");
        assertThat(myWishJson.get("bloomType").asText()).isEqualTo("flower");
        assertThat(myWishJson.get("pose").isObject()).isTrue();
    }

    @Test
    @DisplayName("N-09: AnonymousWishCard 및 TowerStatsResponse 직렬화 시 userId/nickname이 노출되지 않고 통계 키가 일치한다")
    void serializeAnonymousCardAndStats_matchesContract() throws Exception {
        AnonymousWishCard card = new AnonymousWishCard(
            "card-1",
            "health",
            "가족 건강 기원",
            "flat",
            "#FFFFFF",
            StonePose.DEFAULT,
            "active",
            3,
            1,
            Instant.parse("2026-11-05T00:00:00Z")
        );
        JsonNode cardJson = objectMapper.readTree(objectMapper.writeValueAsString(card));
        assertThat(cardJson.has("userId")).isFalse();
        assertThat(cardJson.has("nickname")).isFalse();
        assertThat(cardJson.get("status").asText()).isEqualTo("active");
        assertThat(cardJson.get("pose").isObject()).isTrue();

        TowerStatsResponse stats = new TowerStatsResponse("global", 120L, 14L, 8L, 350L);
        JsonNode statsJson = objectMapper.readTree(objectMapper.writeValueAsString(stats));
        assertThat(statsJson.get("stoneCount").asLong()).isEqualTo(120L);
        assertThat(statsJson.get("todayCount").asLong()).isEqualTo(14L);
        assertThat(statsJson.get("fulfilledCount").asLong()).isEqualTo(8L);
        assertThat(statsJson.get("cheerCount").asLong()).isEqualTo(350L);
    }
}
