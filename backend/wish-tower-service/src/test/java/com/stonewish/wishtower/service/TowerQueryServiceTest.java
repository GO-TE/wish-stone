package com.stonewish.wishtower.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.stonewish.wishtower.client.UserAuthFeignClient;
import com.stonewish.wishtower.service.TowerQueryService.AnonymousWishCard;
import com.stonewish.wishtower.service.TowerQueryService.CollapseMetadata;
import com.stonewish.wishtower.service.TowerQueryService.FulfillWishResult;
import com.stonewish.wishtower.service.TowerQueryService.MyWishView;
import com.stonewish.wishtower.service.TowerQueryService.StonePose;
import com.stonewish.wishtower.service.TowerQueryService.TowerQueryPort;
import com.stonewish.wishtower.service.TowerQueryService.TowerStatsResponse;
import com.stonewish.wishtower.service.TowerQueryService.TowerViewResponse;
import com.stonewish.wishtower.service.WishCommandService.WishRecord;
import java.lang.reflect.RecordComponent;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class TowerQueryServiceTest {

    private InMemoryTowerQueryAdapter queryPort;
    private ConfigurableFeignClient feignClient;
    private TowerQueryService service;

    @BeforeEach
    void setUp() {
        queryPort = new InMemoryTowerQueryAdapter();
        feignClient = new ConfigurableFeignClient();
        service = new TowerQueryService(queryPort, feignClient);
    }

    @Test
    @DisplayName("API-03 공개 돌탑 조회 (M-01, M-02): floorIndex 정렬, pose 객체 변환, 소문자 status, nickname=null 익명성이 보장된다")
    void getPublicTower_ordersByFloorIndexAndHidesAuthorIdentity() {
        Instant t1 = Instant.parse("2026-11-05T01:00:00Z");
        Instant t2 = Instant.parse("2026-11-05T02:00:00Z");

        queryPort.addWish(new WishRecord(
            "w-2", "user-other", null, "job", "두 번째 돌", "flat", "#FFF",
            "{\"x\":0.5,\"y\":2.25,\"z\":-0.1,\"qx\":0,\"qy\":0,\"qz\":0,\"qw\":1}", 6, "ACTIVE", t2
        ));
        queryPort.addWish(new WishRecord(
            "w-1", "user-me", null, "study", "첫 번째 돌", "round", "#000",
            "{\"x\":0,\"y\":1.0,\"z\":0,\"qx\":0,\"qy\":0,\"qz\":0,\"qw\":1}", 1, "ACTIVE", t1
        ));

        TowerViewResponse response = service.getTower("global", "user-me", 200);

        assertThat(response.towerKey()).isEqualTo("global");
        assertThat(response.stones()).hasSize(2);

        // 첫 번째 층 (floorIndex = 0)
        assertThat(response.stones().get(0).id()).isEqualTo("w-1");
        assertThat(response.stones().get(0).floorIndex()).isEqualTo(0);
        assertThat(response.stones().get(0).isMine()).isTrue();
        assertThat(response.stones().get(0).nickname()).isNull();
        assertThat(response.stones().get(0).status()).isEqualTo("active");
        assertThat(response.stones().get(0).pose()).isEqualTo(new StonePose(0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0));
        assertThat(response.stones().get(0).cheerLevel()).isEqualTo(1);

        // 두 번째 층 (floorIndex = 1)
        assertThat(response.stones().get(1).id()).isEqualTo("w-2");
        assertThat(response.stones().get(1).floorIndex()).isEqualTo(1);
        assertThat(response.stones().get(1).isMine()).isFalse();
        assertThat(response.stones().get(1).nickname()).isNull();
        assertThat(response.stones().get(1).status()).isEqualTo("active");
        assertThat(response.stones().get(1).pose().y()).isEqualTo(2.25);
        assertThat(response.stones().get(1).cheerLevel()).isEqualTo(2);
    }

    @Test
    @DisplayName("API-03 지인 그룹 돌탑 조회 (M-02): UserAuthFeignClient로 nickname('닉네임#태그')을 배치 해석하고, 장애 시 '익명의 그룹원'으로 폴백한다")
    void getGroupTower_resolvesNicknameTagAndFallsBackOnFeignFailure() {
        Instant t1 = Instant.parse("2026-11-05T01:00:00Z");
        Instant t2 = Instant.parse("2026-11-05T02:00:00Z");

        queryPort.addWish(new WishRecord("gw-1", "u-100", "grp-1", "job", "같이 합격하자", "round", "#111", "{}", 15, "ACTIVE", t1));
        queryPort.addWish(new WishRecord("gw-2", "u-200", "grp-1", "health", "모두 건강하길", "tall", "#222", "{}", 0, "ACTIVE", t2));

        // 1) 정상 응답 시 '닉네임#태그' 매핑 확인
        feignClient.nicknames.put("u-100", "소원빌기#0412");
        feignClient.nicknames.put("u-200", "돌탑장인#9981");

        TowerViewResponse normalResp = service.getTower("group:grp-1", "u-100", 200);
        assertThat(normalResp.stones()).hasSize(2);
        assertThat(normalResp.stones().get(0).nickname()).isEqualTo("소원빌기#0412");
        assertThat(normalResp.stones().get(0).cheerLevel()).isEqualTo(3);
        assertThat(normalResp.stones().get(1).nickname()).isEqualTo("돌탑장인#9981");

        // 2) user-auth-service 타임아웃/장애 시 CircuitBreaker 폴백("익명의 그룹원") 확인
        feignClient.shouldFail = true;
        TowerViewResponse fallbackResp = service.getTower("group:grp-1", "u-100", 200);
        assertThat(fallbackResp.stones()).hasSize(2);
        assertThat(fallbackResp.stones().get(0).nickname()).isEqualTo("익명의 그룹원");
        assertThat(fallbackResp.stones().get(1).nickname()).isEqualTo("익명의 그룹원");
    }

    @Test
    @DisplayName("API-06 랜덤 소원 풀 조회 (M-04): 본인·excludeIds·그룹 소원을 제외하고 pose/status 포함 및 userId/nickname 미포함 익명 카드를 반환한다")
    void getRandomWishes_excludesOwnAndExcludeIdsAndStripsUserId() {
        Instant now = Instant.now();
        queryPort.addWish(new WishRecord("w-mine", "user-me", null, "job", "내 소원", "round", "#111", "{}", 0, "ACTIVE", now));
        queryPort.addWish(new WishRecord("w-seen", "user-2", null, "study", "이미 본 소원", "round", "#222", "{}", 2, "ACTIVE", now));
        queryPort.addWish(new WishRecord("w-group", "user-3", "grp-1", "relation", "그룹 전용 소원", "round", "#333", "{}", 1, "ACTIVE", now));
        queryPort.addWish(new WishRecord("w-valid-1", "user-4", null, "health", "어머니 수술 무사히 끝나길", "flat", "#444", "{}", 5, "ACTIVE", now));
        queryPort.addWish(new WishRecord("w-valid-2", "user-5", null, "etc", "로또 당첨 기원", "tall", "#555", "{}", 0, "ACTIVE", now));

        List<AnonymousWishCard> cards = service.getRandomWishes("user-me", 10, Set.of("w-seen"));

        assertThat(cards).extracting(AnonymousWishCard::id)
            .containsExactlyInAnyOrder("w-valid-1", "w-valid-2");
        assertThat(cards.get(0).status()).isEqualTo("active");
        assertThat(cards.get(0).pose()).isNotNull();

        // AnonymousWishCard 레코드에 userId/nickname 컴포넌트가 아예 존재하지 않음을 리플렉션으로 검증
        List<String> fieldNames = Arrays.stream(AnonymousWishCard.class.getRecordComponents())
            .map(RecordComponent::getName)
            .toList();
        assertThat(fieldNames).doesNotContain("userId", "authorId", "nickname", "authorNickname");
    }

    @Test
    @DisplayName("API-04, API-09, API-10, API-11 (M-03, M-05, M-08): 성취/삭제 권한 검증, flower|sprout|moss 개화 타입, 내 소원 status 필터 및 통계 필드 검증")
    void fulfillAndDeleteWish_enforcesOwnershipAndReturnsCollapseMetadata() {
        Instant t1 = Instant.parse("2026-11-05T01:00:00Z");
        Instant t2 = Instant.parse("2026-11-05T02:00:00Z");
        Instant t3 = Instant.parse("2026-11-05T03:00:00Z");

        queryPort.addWish(new WishRecord("w-floor-0", "user-1", null, "job", "1층 소원", "round", "#111", "{}", 3, "ACTIVE", t1));
        queryPort.addWish(new WishRecord("w-floor-1", "user-owner", null, "study", "2층 내 소원", "flat", "#222", "{}", 7, "ACTIVE", t2));
        queryPort.addWish(new WishRecord("w-floor-2", "user-3", null, "health", "3층 소원", "tall", "#333", "{}", 2, "ACTIVE", t3));

        // 초기 통계 확인 (M-03: stoneCount=3, cheerCount=12, todayCount=3, fulfilledCount=0)
        TowerStatsResponse initialStats = service.getTowerStats("global");
        assertThat(initialStats.stoneCount()).isEqualTo(3L);
        assertThat(initialStats.cheerCount()).isEqualTo(12L);
        assertThat(initialStats.todayCount()).isEqualTo(3L);
        assertThat(initialStats.fulfilledCount()).isEqualTo(0L);

        // 타인이 성취/삭제 시도 시 NOT_OWNER 예외
        assertThatThrownBy(() -> service.fulfillWish("w-floor-1", "hacker-user", "flower"))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("NOT_OWNER");

        assertThatThrownBy(() -> service.deleteWish("w-floor-1", "hacker-user"))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("NOT_OWNER");

        // 작성자 본인이 소원 성취(fulfilled) 처리 (M-05: flower|sprout|moss 중 선택 또는 기본값 flower)
        FulfillWishResult fulfilled = service.fulfillWish("w-floor-1", "user-owner", null);
        assertThat(fulfilled.status()).isEqualTo("fulfilled");
        assertThat(fulfilled.bloomType()).isEqualTo("flower");

        // M-08: 내 소원 목록 조회 (?status=fulfilled 필터 및 isMine=true 검증)
        List<MyWishView> fulfilledWishes = service.getMyWishes("user-owner", "fulfilled");
        assertThat(fulfilledWishes).hasSize(1);
        assertThat(fulfilledWishes.get(0).isMine()).isTrue();
        assertThat(fulfilledWishes.get(0).status()).isEqualTo("fulfilled");
        assertThat(fulfilledWishes.get(0).bloomType()).isEqualTo("flower");
        assertThat(service.getMyWishes("user-owner", "active")).isEmpty();

        // 작성자 본인이 2층(floorIndex = 1) 소원 삭제 -> tower_collapsed 메타데이터 및 통계 차감 검증
        CollapseMetadata collapse = service.deleteWish("w-floor-1", "user-owner");
        assertThat(collapse.wishId()).isEqualTo("w-floor-1");
        assertThat(collapse.status()).isEqualTo("deleted");
        assertThat(collapse.eventType()).isEqualTo("tower_collapsed");
        assertThat(collapse.collapsedFloorIndex()).isEqualTo(1);
        assertThat(collapse.remainingStoneCount()).isEqualTo(2L);

        // 삭제 후 내 소원 목록에서 제외됨 확인
        assertThat(service.getMyWishes("user-owner")).isEmpty();
    }

    static class ConfigurableFeignClient implements UserAuthFeignClient {
        final Map<String, String> nicknames = new HashMap<>();
        boolean shouldFail = false;

        @Override
        public Map<String, String> getNicknames(NicknameBatchRequest request) {
            if (shouldFail) {
                throw new RuntimeException("user-auth-service connection timeout");
            }
            Map<String, String> result = new HashMap<>();
            for (String uid : request.userIds()) {
                if (nicknames.containsKey(uid)) {
                    result.put(uid, nicknames.get(uid));
                }
            }
            return result;
        }
    }

    static class InMemoryTowerQueryAdapter implements TowerQueryPort {
        private final Map<String, WishRecord> store = new HashMap<>();
        private final Map<String, String> bloomStore = new HashMap<>();
        private final Map<String, AtomicLong> stoneCounts = new HashMap<>();
        private final Map<String, AtomicLong> cheerCounts = new HashMap<>();
        private final Map<String, AtomicLong> todayCounts = new HashMap<>();
        private final Map<String, AtomicLong> fulfilledCounts = new HashMap<>();

        void addWish(WishRecord wish) {
            store.put(wish.id(), wish);
            String towerKey = (wish.groupId() != null && !wish.groupId().isBlank())
                ? "group:" + wish.groupId()
                : "global";
            stoneCounts.computeIfAbsent(towerKey, k -> new AtomicLong()).incrementAndGet();
            cheerCounts.computeIfAbsent(towerKey, k -> new AtomicLong()).addAndGet(wish.cheerCount());
            todayCounts.computeIfAbsent(towerKey, k -> new AtomicLong()).incrementAndGet();
            if ("FULFILLED".equalsIgnoreCase(wish.status())) {
                fulfilledCounts.computeIfAbsent(towerKey, k -> new AtomicLong()).incrementAndGet();
            }
        }

        @Override
        public List<WishRecord> findByTowerKey(String towerKey) {
            List<WishRecord> result = new ArrayList<>();
            for (WishRecord w : store.values()) {
                if ("global".equals(towerKey) && (w.groupId() == null || w.groupId().isBlank())) {
                    result.add(w);
                } else if (towerKey.startsWith("cat:") && (w.groupId() == null || w.groupId().isBlank())) {
                    String cat = towerKey.substring(4);
                    if (cat.equals(w.categoryCode())) {
                        result.add(w);
                    }
                } else if (towerKey.startsWith("group:")) {
                    String gid = towerKey.substring(6);
                    if (gid.equals(w.groupId())) {
                        result.add(w);
                    }
                }
            }
            return result;
        }

        @Override
        public List<WishRecord> findAllPublicActiveWishes() {
            return store.values().stream()
                .filter(w -> w.groupId() == null || w.groupId().isBlank())
                .filter(w -> "ACTIVE".equalsIgnoreCase(w.status()))
                .toList();
        }

        @Override
        public List<WishRecord> findByUserId(String userId) {
            return store.values().stream()
                .filter(w -> userId.equals(w.userId()))
                .toList();
        }

        @Override
        public WishRecord findById(String wishId) {
            return store.get(wishId);
        }

        @Override
        public WishRecord save(WishRecord wish) {
            store.put(wish.id(), wish);
            return wish;
        }

        @Override
        public String findBloomType(String wishId) {
            return bloomStore.get(wishId);
        }

        @Override
        public void saveBloomType(String wishId, String bloomType) {
            bloomStore.put(wishId, bloomType);
        }

        @Override
        public TowerStatsResponse getStats(String towerKey) {
            return new TowerStatsResponse(
                towerKey,
                stoneCounts.getOrDefault(towerKey, new AtomicLong(0)).get(),
                todayCounts.getOrDefault(towerKey, new AtomicLong(0)).get(),
                fulfilledCounts.getOrDefault(towerKey, new AtomicLong(0)).get(),
                cheerCounts.getOrDefault(towerKey, new AtomicLong(0)).get()
            );
        }

        @Override
        public void decrementStoneStats(String towerKey) {
            stoneCounts.computeIfAbsent(towerKey, k -> new AtomicLong(0))
                .updateAndGet(cur -> Math.max(0L, cur - 1L));
        }
    }
}
