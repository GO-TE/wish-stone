# StoneWish(위시 스톤) 백엔드 시니어 멘토 아키텍처 가이드
## (Senior Mentor Guide: Spring Boot MSA, Kafka, OpenFeign & JPA Architecture)

- **문서 버전:** v1.0
- **작성 일자:** 2026-11-04
- **작성자:** 백엔드 시니어 사수 (Backend Agent / Senior Mentor)
- **대상 독자:** 주니어 백엔드 엔지니어 (사용자)
- **대상 시스템:** StoneWish Spring Boot MSA (`backend/`)

---

## 0. "사수님, 제 사수는 언제 알려주나요?" — 사수의 첫 인사

> **"반갑습니다! 제가 바로 여러분과 함께 StoneWish 백엔드를 만들어갈 시니어 사수(Backend Mentor Agent)입니다."**

여러분이 남겨주신 질문을 잘 받았습니다. *"근데 내 사수는 언제 알려줌?"* 이라는 물음은 백엔드 개발자로서 아키텍처를 진짜 실무 수준으로 배우고 싶다는 열정의 표현이라고 생각합니다. 

### 멘토의 투입 시점 및 동행 로드맵
현재 진행 중인 **M1 단계(환경 분석 및 협업 체계 수립)** 가 완료되는 즉시, 여러분과 저는 **M2 단계(브랜치 및 인프라 구성)** 와 **M3 단계(스프린트 백엔드 개발)** 에서 1:1로 밀착하여 개발을 진행합니다.

1. **지금 (M1 완료 직후):**
   - 본 가이드를 통해 우리가 왜 이런 MSA 아키텍처를 설계했는지 전체적인 그림과 원리를 먼저 머릿속에 담습니다.
2. **M2 단계 (작업 환경 구성):**
   - `feature/backend` 브랜치에서 제가 먼저 깨져 있는 Gradle 설정을 바로잡고, Docker Compose 기반의 로컬 인프라(MySQL 4개, Redis, Kafka KRaft)를 함께 띄우며 인프라 환경 구성을 안내합니다.
3. **M3 단계 (본격 MSA 개발 스프린트):**
   - `user-auth-service`, `wish-tower-service`, `interaction-service`, `group-service`를 순서대로 구현합니다.
   - 단순히 코드를 대신 짜주는 것이 아니라, **"이 클래스는 왜 이렇게 짰는지", "실무에서 어떤 장애를 막기 위한 것인지", "JPA나 Kafka에서 어떤 함정을 조심해야 하는지"** 를 단계마다 설명하고 코드 리뷰를 제공합니다.

편안한 마음으로, 든든한 사수가 옆에 앉아서 하나씩 짚어준다고 생각하고 이 문서를 읽어 내려가 보세요!

---

## 1. 아키텍처 진화 배경: 모놀리식/Supabase에서 Spring Boot MSA로 (D-004 → D-013)

### 1.1 왜 BaaS(Supabase)에서 Spring Boot MSA로 전환했는가?
처음 프로젝트를 구상할 때는 빠른 MVP 개발을 위해 Supabase(BaaS)를 검토했습니다(`DECISIONS.md` D-004). 하지만 여러분의 가장 중요한 목표는 **"대규모 트래픽을 견디는 엔터프라이즈급 Spring Boot 실무 아키텍처를 직접 설계하고 구축해보는 것"** 이었습니다. 

실제 기업 실무에서는 외부 BaaS에만 의존할 경우 다음과 같은 치명적인 한계에 부딪힙니다:
- 복잡한 비즈니스 로직(예: 3D 물리 좌표 연산, 3단계 응원 레벨링, 멱등 이벤트 처리)을 DB 트리거나 서버리스 함수로 분산시키면 유지보수와 디버깅이 불가능해집니다.
- 장애 격리가 불가능하여 특정 기능의 부하가 전체 서비스 다운으로 이어집니다.
- 이에 따라 **Spring Boot 3.3.5 기반 마이크로서비스 아키텍처(MSA) + Apache Kafka + Redis + MySQL 4-DB 분리 구조(D-013)** 로 전면 전환을 결정했습니다.

### 1.2 왜 단일 모놀리식(Monolith)이 아닌 MSA인가?
"소규모 프로젝트인데 모놀리식이 더 쉽지 않나요?"라는 의문이 들 수 있습니다. 하지만 StoneWish의 도메인을 자세히 들여다보면 성격이 완전히 다른 4개의 세계가 공존합니다:
1. **인증/유저 도메인:** 안정성과 개인정보 보안이 최우선이며, 트래픽 변동이 적음.
2. **소원/돌탑 도메인:** 3D 좌표 데이터와 무거운 조회 쿼리가 발생하며 높은 캐시 의존도를 가짐.
3. **응원/인터랙션 도메인:** 소셜 특성상 특정 소원이 인기를 끌면 초당 수천 건의 "응원 클릭(쓰기 트래픽)"이 집중 폭발함.
4. **그룹 도메인:** 친구 간의 비공개 돌탑 접근 제어 및 멤버십 관리.

만약 모놀리식으로 합쳐두면, **응원 클릭 폭주로 인한 DB 커넥션 고갈이 사용자 로그인과 소원 등록까지 전부 마비**시키는 대참사가 일어납니다. 서비스를 쪼개두면 트래픽이 폭주하는 `interaction-service`만 컨테이너를 5개로 스케일아웃(Scale-out)하고, `user-auth-service`는 안전하게 격리할 수 있습니다.

---

## 2. 전체 시스템 토폴로지 및 서비스 경계

```
[클라이언트: Expo Mobile App (iOS/Android) & Web]
                      │
                      ▼ HTTPS (JWT Bearer Token)
      ┌────────────────────────────────────────────────────────┐
      │ Spring Cloud Gateway (:8080)                           │
      │  - Route Matching & Priority Filtering                 │
      │  - JWT Verification & Header Stripping/Injection       │
      │  - Global CORS Handler                                 │
      └──────────────────────────┬─────────────────────────────┘
                                 │
       ┌─────────────────────────┼─────────────────────────┬─────────────────────────┐
       │ :8081                   │ :8082                   │ :8083                   │ :8084
       ▼                         ▼                         ▼                         ▼
┌──────────────┐          ┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│  user-auth   │          │  wish-tower  │          │ interaction  │          │    group     │
│   service    │          │   service    │          │   service    │          │   service    │
└──────┬───────┘          └──────┬───────┘          └──────┬───────┘          └──────┬───────┘
       │                         │                         │                         │
   [user_db]                 [wish_db]             [interaction_db]              [group_db]
   (MySQL 8)                 (MySQL 8)                 (MySQL 8)                 (MySQL 8)
                                 │
                              [Redis 7]
                          (랜덤풀 / 통계캐시)
                                 ▲
                                 │
 ════════════════════════════════╪═══════════════════════════════════════════════════════════════
                 Apache Kafka KRaft (Port 9092) - 비동기 이벤트 버스
   - interaction.events: WISH_CHEERED, WISH_REPORT_THRESHOLD_REACHED
   - wish.events:        WISH_CREATED, WISH_DELETED
 ═══════════════════════════════════════════════════════════════════════════════════════════════
```

### 2.1 4개 마이크로서비스 도메인 경계 정의

| 마이크로서비스 | 포트 | 전용 데이터베이스 | 책임 도메인 및 핵심 엔티티 | 사수의 핵심 설계 포인트 |
|---|---|---|---|---|
| **`gateway-service`** | `8080` | 없음 (Stateless) | 단일 진입점, 라우팅, JWT 필터링, CORS | 클라이언트가 조작해 보낸 `X-User-Id` 헤더를 강제 제거하고 JWT에서 추출한 검증된 값만 하위 서비스에 주입 |
| **`user-auth-service`** | `8081` | `user_db` (MySQL) | `users`, `user_identities`<br>(OAuth2, 게스트 로그인, 닉네임 검증) | 게스트도 고유 UUID 발급. 닉네임은 그룹 돌탑에서만 공개되며 공개 돌탑에서는 완전 은닉 |
| **`wish-tower-service`** | `8082` | `wish_db` (MySQL) + `Redis 7` | `wishes`, `categories`, `processed_events`<br>(소원 CRUD, 3D Pose, 꽃/새싹 피어남) | 공개 돌탑 응답 시 `userId` 원천 배제. Redis `wish:random:pool`로 O(1) 랜덤 추출. Kafka 이벤트 수신 시 `processed_events`로 멱등성 보장 |
| **`interaction-service`**| `8083` | `interaction_db` (MySQL) | `cheers`, `reports`<br>(응원 등록, 신고 접수, Kafka 이벤트 발행) | 응원 텍스트 미저장(카운트만 관리). 1인 1회 중복 차단(`wish_id, user_id` 복합 PK). 응원 즉시 Kafka로 이벤트 쏘고 200 OK 반환 |
| **`group-service`** | `8084` | `group_db` (MySQL) | `groups`, `group_members`<br>(지인 그룹, 8자리 초대코드, 그룹원 권한 검증) | 그룹원만 그룹 돌탑 접근 가능하도록 Feign 권한 검증 API 제공 |

---

## 3. 핵심 아키텍처 상세 해설 (딥 다이브)

### 3.1 Spring Cloud Gateway (:8080) — 문의 경비실 역할을 하는 관문

API Gateway는 MSA에서 모든 외부 트래픽을 가장 먼저 맞이하는 대문입니다.

#### 1) 라우트 매칭 우선순위 (Order Priority)
게이트웨이에서 가장 흔히 발생하는 버그 중 하나는 **"더 구체적인 경로가 와일드카드 경로에 먹히는 현상"** 입니다.
- `/api/v1/wishes/*/cheers` (응원하기)는 `interaction-service (:8083)`로 가야 합니다.
- `/api/v1/wishes/**` (소원 조회/등록)는 `wish-tower-service (:8082)`로 가야 합니다.
- **사수의 팁:** YAML 라우트 설정에서 순서가 매우 중요합니다. 더 구체적인 `/cheers` 라우트를 반드시 상단에 배치해야만 게이트웨이가 올바른 마이크로서비스로 요청을 넘겨줍니다.

#### 2) JWT 인증 필터와 '헤더 위조 방지'
클라이언트는 로그인 후 받은 `Authorization: Bearer <JWT>`를 헤더에 담아 보냅니다.
게이트웨이 필터는:
1. JWT 서명과 만료 시간을 검증합니다.
2. 클라이언트가 악의적으로 실어 보낸 `X-User-Id` 헤더가 있다면 **강제로 삭제(Strip)** 합니다. (보안 구멍 원천 차단!)
3. 검증된 토큰의 Claims에서 `userId`와 `isGuest`를 추출하여, 신뢰할 수 있는 `X-User-Id`, `X-User-Guest` 헤더를 새로 만들어 하위 서비스로 넘겨줍니다.
4. **결과:** 하위 4개 서비스는 복잡한 JWT 검증 로직을 중복 구현할 필요 없이, 컨트롤러에서 단순히 `@RequestHeader("X-User-Id") String userId`로 현재 사용자를 바로 꺼내 쓸 수 있습니다.

---

### 3.2 서비스 간 동기 통신: OpenFeign + Resilience4j Circuit Breaker

MSA에서 서비스 간에 데이터를 주고받을 때, **"결과를 지금 당장 받아야 하는가?"**에 해당하면 OpenFeign을 씁니다.

```
[ wish-tower-service (:8082) ]
              │
              │  그룹 돌탑 렌더링 시 작성자 닉네임 일괄 조회 요청
              │  POST /internal/users/nicknames
              ▼
    ┌───────────────────────────┐
    │ Resilience4j CircuitBreaker│  ◄── "user-auth-service가 건강한가?"
    └─────────────┬─────────────┘
                  │
        ┌─────────┴─────────┐
     [ 정상 ]            [ 장애 / 타임아웃 ]
        │                   │
        ▼                   ▼
┌───────────────┐   ┌───────────────────────────────────────────────┐
│user-auth-serv │   │ Fallback: fallbackNicknames()                 │
│ (:8081)       │   │  - 실패 에러(500) 대신                         │
│실제 닉네임 반환│   │    모든 돌의 닉네임을 "익명의 그룹원"으로 반환   │
└───────────────┘   └───────────────────────────────────────────────┘
```

#### 1) 왜 Circuit Breaker(서킷 브레이커)가 필수인가?
만약 `wish-tower-service`가 `user-auth-service`를 호출하는데 `user-auth-service`가 배포 중이거나 DB 락으로 멈춰 있다면 어떻게 될까요?
서킷 브레이커가 없다면, `wish-tower`의 톰캣 스레드들이 응답을 무한정 기다리며(Connection Blocking) 연쇄적으로 고갈되어 **두 서비스가 함께 폭망(Cascading Failure)** 합니다.

#### 2) Fallback 패턴의 실무 구현
우리의 `UserAuthFeignClient`에 구현된 fallback 메서드를 보세요:
```java
@CircuitBreaker(name = "userAuthClient", fallbackMethod = "fallbackNicknames")
List<UserNicknameDto> getNicknamesBatch(@RequestBody List<String> userIds);

default List<UserNicknameDto> fallbackNicknames(List<String> userIds, Throwable t) {
    log.warn("user-auth-service 장애 발생! Fallback 동작: {}", t.getMessage());
    // 닉네임 서비스가 죽었다고 해서 그룹 돌탑 전체 조회가 터지면 안 됩니다!
    // 대신 "익명의 그룹원"이라는 기본값으로 안전하게 감싸서 돌탑을 띄워줍니다.
    return userIds.stream()
            .map(id -> new UserNicknameDto(id, "익명의 그룹원"))
            .toList();
}
```
- **사수의 팁:** FeignClient에는 반드시 짧은 타임아웃(`connectTimeout: 1000ms`, `readTimeout: 2000ms`)을 설정해야 합니다.

#### 3) Feign 호출 시의 N+1 함정 주의!
그룹 돌탑에 돌이 50개 쌓여 있다고 해서, 돌 50개를 돌면서 루프 안에서 `feignClient.getNickname(userId)`를 50번 호출하면 네트워크 왕복 시간 때문에 응답 속도가 3초를 넘깁니다. 
반드시 `POST /internal/users/nicknames`처럼 ID 목록을 한 번에 배열로 보내 한 번에 받아오는 **배치(Batch) 엔드포인트**를 사용해야 합니다.

---

### 3.3 서비스 간 비동기 통신: Apache Kafka (KRaft 모드) — 최종 일관성의 마법

**"지금 당장 동기 응답이 필요 없는 비즈니스 후속 작업"** 은 100% Kafka로 보냅니다.

#### 1) 왜 ZooKeeper가 아닌 KRaft인가?
과거 Kafka는 분산 코디네이션을 위해 ZooKeeper 프로세스를 별도로 띄워야 했습니다. 관리가 복잡하고 메모리도 많이 먹었죠.
Kafka 3.x의 KRaft(Kafka Raft Metadata Mode)는 ZooKeeper 없이 Kafka 브로커 자체에서 Raft 합의 알고리즘으로 메타데이터를 관리합니다. 훨씬 가볍고 빠르며 로컬 Docker 구동에 최적입니다.

#### 2) 응원하기(Cheering)의 비동기 흐름
1. 사용자가 소원 돌을 보고 [응원하기]를 누릅니다 (`POST /api/v1/wishes/{id}/cheers`).
2. `interaction-service`는 자기 전용 DB(`interaction_db`)에 "user A가 wish 1을 응원함"을 기록합니다.
3. 그리고 즉시 Kafka 토픽(`interaction.events`)에 `WishCheeredEvent`를 쏩니다.
4. 사용자에게는 **0.05초 만에 200 OK**를 내려줍니다. (사용자는 기다리지 않음!)
5. 뒷단에서 `wish-tower-service`의 Kafka 컨슈머(`InteractionEventConsumer`)가 이벤트를 낚아채서, `wish_db`의 소원 엔티티에 `cheer_count`를 1 올리고 Redis 통계 해시도 1 올립니다.

```
[클라이언트] ──(1) 응원 요청──► [interaction-service] ──(2) DB 저장──► [interaction_db]
     ▲                                   │
     │ 0.05초 초고속 200 OK             │ (3) 이벤트 발행
     └────────── (4) ────────────────────┤
                                         ▼
                             [Kafka: interaction.events]
                                         │
                                         ▼ (5) 백그라운드 소비
                                [wish-tower-service]
                                         │
                        ┌────────────────┴────────────────┐
                        ▼                                 ▼
                 [wish_db]                         [Redis]
                 (cheer_count + 1)                 (tower:stats:* +1)
```

#### 3) 컨슈머의 멱등성(Idempotency) 보장 — 실무의 핵심!
네트워크 순단이나 브로커 리밸런싱이 발생하면 Kafka는 동일한 메시지를 2번 보낼 수 있습니다(At-Least-Once Delivery). 
만약 아무 생각 없이 카운트 +1을 하면, 사용자는 1번 눌렀는데 응원이 2번 올라가는 버그가 생깁니다.
이를 막기 위해 우리는 **멱등성 테이블(`processed_events`) 패턴**을 씁니다:

```java
@Transactional
public void handleWishCheered(WishCheeredEvent event) {
    // 1. 이미 처리한 이벤트 ID인지 확인
    if (processedEventRepository.existsById(event.eventId())) {
        log.info("중복 수신된 이벤트 스킵: {}", event.eventId());
        return;
    }
    
    // 2. 비즈니스 로직 수행
    wishRepository.incrementCheerCount(event.wishId());
    redisTemplate.opsForHash().increment("tower:stats:" + event.towerKey(), "cheerCount", 1);
    
    // 3. 처리 기록 저장 (동일 트랜잭션 내 원자적 커밋)
    processedEventRepository.save(new ProcessedEvent(event.eventId(), LocalDateTime.now()));
}
```

---

### 3.4 데이터 계층: Database-per-Service (4 MySQL DBs)와 외래키(FK) 차단

#### 1) 왜 물리적 FK(외래키)를 절대로 맺지 않는가?
모놀리식 개발자 출신 주니어들이 가장 많이 실수하는 부분입니다.
"사수님, `wishes` 테이블에 `user_id`가 있는데, 왜 `users` 테이블에 외래키(`REFERENCES users(id)`)를 안 거나요?"
- **사수의 설명:** 
  외래키 제약조건은 **단일 데이터베이스 인스턴스 안에서만 물리적으로 동작**합니다.
  우리는 `user_db`와 `wish_db`를 물리적으로 다른 데이터베이스(컨테이너)로 분리했습니다. MySQL은 다른 DB의 테이블을 감시할 수 없습니다.
  만약 외래키를 강제로 맺으려 하거나 두 DB를 한 트랜잭션으로 묶으려 하면, MSA의 핵심인 **독립적인 스키마 변경, 독립적인 배포, 자율적인 데이터 확장**이 모두 무너집니다.

#### 2) 무결성은 어떻게 유지하는가?
- 다른 서비스의 식별자는 오직 UUID/String 형태의 **논리적 키**로만 보관합니다.
- 데이터 생성 시 존재 여부는 Gateway나 API 호출 단계에서 검증하고, 변경이나 삭제 시의 동기화는 Kafka 이벤트를 통해 **최종 일관성(Eventual Consistency)** 으로 맞춥니다.

---

### 3.5 Redis 7 캐싱 전략 — 초당 수만 건의 소원을 처리하는 비결

#### 1) '랜덤 소원 카드 스와이프'의 RDB 참사 방지
StoneWish 메인 화면의 백미는 랜덤으로 남들의 소원 카드를 넘겨보는 기능입니다(DB-014).
소원이 10만 개 쌓인 MySQL에서 랜덤 5개를 뽑으려고 `SELECT * FROM wishes WHERE status='ACTIVE' ORDER BY RAND() LIMIT 5;`를 날리면 어떻게 될까요?
MySQL은 인덱스를 전혀 타지 못하고 10만 건을 메모리에 올려 임시 테이블을 만든 뒤 정렬(Filesort)을 수행합니다. 쿼리 하나에 수 초가 걸리고 CPU가 100%를 찍으며 서버가 뻗습니다.

#### 2) Redis `Set`과 `SRANDMEMBER`의 해결책
우리는 소원이 등록될 때 활성 소원의 ID를 Redis Set에 넣어둡니다:
- Key: `wish:random:pool`
- 카드 조회 요청이 오면:
  `SRANDMEMBER wish:random:pool 15`
- **시간 복잡도:** **O(N)** (여기서 N은 요청 개수 15개이므로 사실상 **O(1)**).
- 15개를 메모리에서 단 1ms 만에 뽑은 뒤, 클라이언트가 이미 읽은 `excludeIds`를 메모리에서 필터링하고 5개를 즉시 반환합니다. DB 디스크에는 부하가 전혀 가지 않습니다!

#### 3) 돌탑 통계 해시 (`tower:stats:{towerKey}`)
대시보드 상단의 [누적 돌 개수, 오늘 쌓인 돌, 이루어진 소원, 총 응원 수]는 실시간성이 생명입니다.
MySQL에서 매번 `COUNT(*)` 집계 쿼리를 날리면 테이블 풀스캔이 발생하므로, Redis Hash에 `HINCRBY tower:stats:global stoneCount 1`을 사용하여 락 경합 없이 원자적으로 통계를 서빙합니다.

---

## 4. 사수의 실무 꿀팁 및 트랩 방지 가이드 (Practical Pitfalls)

| 구분 | 흔히 빠지는 주니어의 함정 (Pitfall) | 사수의 실무 해결 팁 (Best Practice) |
|---|---|---|
| **분산 트랜잭션** | 여러 서비스의 DB를 하나의 `@Transactional`로 묶으려 하거나 2PC 분산 락을 걸려고 함 | 2PC는 성능 저하와 데드락의 주범입니다. **Saga 패턴(보상 트랜잭션)이나 Kafka 비동기 이벤트 기반의 최종 일관성**으로 설계하세요. |
| **JPA N+1 쿼리** | 돌탑의 돌 목록을 조회할 때 돌과 연관된 카테고리를 루프 돌며 조회하여 쿼리가 100번 나감 | JPA 연관관계 조회 시 반드시 `JOIN FETCH` 또는 `@EntityGraph`를 적용하고, 대량 조회 시에는 필요한 필드만 뽑는 **DTO Direct Projection**을 쓰세요. |
| **Connection Pool 고갈** | 트래픽이 조금만 몰려도 HikariCP Connection Timeout 발생 | HikariCP 커넥션 풀 크기는 무작정 늘린다고 좋은 게 아닙니다. 공식 공식인 `connections = ((CPU코어수 * 2) + 디스크스핀들수)`를 따르고, 외부 API 호출(Feign)은 `@Transactional` 밖에서 수행하여 DB 커넥션 보유 시간을 최소화하세요. |
| **로컬 메모리 고갈** | MSA 4개 서비스 + Gateway + DB 4개 + Kafka + Redis를 로컬에서 다 띄우다 PC 다운 | 각 Spring Boot 앱의 `JAVA_TOOL_OPTIONS`에 `-Xms128m -Xmx256m` 힙 메모리 상한을 명시적으로 부여하세요. 256MB로도 로컬 개발에는 충분합니다. |
| **Soft Delete 쿼리 누락** | 사용자가 삭제한 소원(`status = 'DELETED'`)이 공개 돌탑 렌더링에 계속 노출됨 | 엔티티 클래스 상단에 `@SQLRestriction("status != 'DELETED'")` 또는 `@Where(clause = "status != 'DELETED'")`를 붙여 소프트 딜리트된 데이터가 기본 조회에서 자동으로 빠지도록 강제하세요. |

---

## 5. 백엔드 구현 로드맵 및 멘토링 진행 순서

다음 단계(M2, M3)에서 우리가 함께 손발을 맞춰 구현해 나갈 실무 작업 순서입니다:

```
[Step 1: 빌드 환경 및 인프라 정상화 (M2)]
  ├── Gradle 9.x 설정 정비: user-auth-service, group-service 디렉터리 스캐폴딩
  ├── 서브모듈별 build.gradle.kts 의존성 주입 (Web, JPA, Kafka, Feign, Redis)
  └── docker-compose.yml로 MySQL 4개 DB, Redis, Kafka KRaft 원클릭 기동 검증
                                 │
                                 ▼
[Step 2: user-auth-service (:8081) 구현]
  ├── User, UserIdentity 엔티티 및 Repository 구현
  ├── 게스트 로그인 UUID 발급 및 닉네임 유효성 검증 (2~12자) 로직
  └── Gateway JWT 토큰 연동 및 내부 배치 닉네임 조회 API (/internal/users/nicknames)
                                 │
                                 ▼
[Step 3: wish-tower-service (:8082) & Redis 구현]
  ├── Wish, Category 엔티티 및 3D Pose JSON 직렬화/역직렬화
  ├── Redis Set 기반 O(1) 랜덤 소원 풀링 알고리즘 구현
  ├── OpenFeign 클라이언트 + Resilience4j 폴백 구현
  └── 공개 돌탑 DTO에서 userId 원천 배제 (익명성 DB-023 보장)
                                 │
                                 ▼
[Step 4: interaction-service (:8083) & Kafka 스트리밍 구현]
  ├── Cheer, Report 엔티티 및 복합키 기반 1인 1회 중복 방지
  ├── CheerCommandService에서 Kafka 토픽(interaction.events)으로 이벤트 발행
  └── wish-tower-service의 InteractionEventConsumer에서 processed_events 멱등 소비
                                 │
                                 ▼
[Step 5: group-service (:8084) 및 프론트엔드 통합 연동]
  ├── Group, GroupMember 엔티티 및 8자리 초대코드 발급/참여
  ├── Frontend Agent와 Gateway (:8080) 엔드포인트 실시간 연동
  └── QA Agent의 자동화 테스트 검증 (단위 테스트, 익명성 누출 감사, E2E 시나리오)
```

---

## 6. 사수의 맺음말

> **"어려워 보이는 아키텍처도 원리를 알고 하나씩 벽돌을 쌓다 보면 어느새 견고한 시스템이 됩니다."**

우리가 만드는 StoneWish는 단순한 토이 프로젝트가 아닙니다.
게이트웨이 보안, 서킷 브레이커 장애 격리, 카프카 비동기 멱등 처리, 레디스 캐싱, DB 물리 격리까지 **국내 유수의 IT 기업 백엔드 시스템과 동일한 엔터프라이즈 아키텍처**를 그대로 담고 있습니다.

혼자 고민하지 마시고, 작업 중 막히는 부분이 생기거나 의문이 들면 언제든지 `send_message`로 질문해 주세요. 제가 항상 옆에서 명확하고 든든하게 길을 열어드리겠습니다.

자, 이제 브랜치를 나누고 진짜 백엔드의 세계로 들어가 봅시다!
