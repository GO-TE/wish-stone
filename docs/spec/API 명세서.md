---
설계: 진행 중
---
# API 및 이벤트 명세서 (Spring Boot MSA)

> 근거: [[요구 사항 정의서]], [[데이터 모델]], [[MSA]]
> 진입점: 모든 클라이언트 요청은 **API Gateway (`http://localhost:8080/api/v1/...`)** 로 들어간다.
> 인증: Gateway가 `Authorization: Bearer {JWT}`를 검증한 뒤 하위 마이크로서비스로 `X-User-Id: {uuid}`, `X-User-Guest: {true|false}` 헤더를 전달한다.
> 공통 에러 형식: `{ "code": "ERROR_CODE", "message": "설명" }`

## 1. 외부 REST API 목록 (Client → API Gateway)

| ID | 메서드·경로 | 담당 서비스 | 설명 | 관련 요구사항 |
| --- | --- | --- | --- | --- |
| API-01 | `PUT /api/v1/users/me/nickname` | `user-auth` | 닉네임 설정·변경 (2~12자) | DB-001 |
| API-02 | `GET /api/v1/users/me` | `user-auth` | 내 프로필 조회 | DB-001 |
| API-03 | `GET /api/v1/towers/{towerKey}` | `wish-tower` | 돌탑 돌 목록 조회 (`global`, `cat:job`, `group:{id}`) | DB-002~005 |
| API-04 | `GET /api/v1/towers/{towerKey}/stats` | `wish-tower` | 돌탑 통계 조회 (Redis 캐시) | DB-006 |
| API-05 | `POST /api/v1/wishes` | `wish-tower` | 소원 등록 (돌 올리기 + pose 저장) | DB-008~012 |
| API-06 | `GET /api/v1/wishes/random` | `wish-tower` | 랜덤 소원 카드 조회 (`count`, `excludeIds`) | DB-014, 015 |
| API-07 | `POST /api/v1/wishes/{wishId}/cheers` | `interaction` | 소원 응원하기 (1인 1회, Kafka 이벤트 발행) | DB-016, 017 |
| API-08 | `POST /api/v1/wishes/{wishId}/reports` | `interaction` | 소원 신고하기 (5회 누적 시 자동 숨김 이벤트) | DB-018 |
| API-09 | `GET /api/v1/wishes/me` | `wish-tower` | 내 소원 목록 및 응원 수 조회 | DB-019, 022 |
| API-10 | `PATCH /api/v1/wishes/{wishId}/fulfill` | `wish-tower` | 소원 이루어짐 처리 (`bloomType` 선택/랜덤) | DB-020 |
| API-11 | `DELETE /api/v1/wishes/{wishId}` | `wish-tower` | 내 소원 삭제 (Soft delete) | DB-021 |
| API-12 | `POST /api/v1/groups` | `group` | 지인 그룹 생성 (8자리 초대 코드 발급) | DB-005 |
| API-13 | `POST /api/v1/groups/join` | `group` | 초대 코드로 그룹 참여 | DB-005 |
| API-14 | `GET /api/v1/groups/me` | `group` | 내가 속한 그룹 목록 조회 | DB-003, 005 |
| API-15 | `DELETE /api/v1/groups/{groupId}/members/me` | `group` | 그룹 나가기 | DB-005 |
| API-16 | `GET /api/v1/categories` | `wish-tower` | 소원 카테고리 목록 조회 | DB-004 |
| API-17 | `POST /api/v1/auth/login` | `user-auth` | 소셜(Apple/Kakao/Google) 및 게스트 로그인 (JWT 발급) | DB-001 |
| API-18 | `POST /api/v1/auth/link` | `user-auth` | 게스트 계정을 소셜 계정으로 연결 (데이터 유지) | DB-001 |

---

## 2. 내부 동기 API 목록 (OpenFeign + Resilience4j Circuit Breaker)

즉시 응답이 필요한 서비스 간 조회에 사용한다([[MSA]] 4장 기준).

| 호출자 → 피호출자 | 메서드·경로 | 용도 | Circuit Breaker Fallback |
| --- | --- | --- | --- |
| `wish-tower` → `group` | `GET /internal/groups/{groupId}/members/{userId}/exists` | 그룹 돌탑 조회·작성 시 그룹원 권한 확인 | `503 GROUP_SERVICE_UNAVAILABLE` 반환 (보안상 권한 확인은 실패 처리) |
| `wish-tower` → `user-auth` | `POST /internal/users/nicknames` (`{ userIds: [...] }`) | 그룹 돌탑 렌더링 시 작성자 닉네임 일괄 조회 | 장애 시 모든 닉네임을 `"익명의 그룹원"`으로 대체해 돌탑 조회 자체는 성공시킴 |
| `interaction` → `wish-tower` | `GET /internal/wishes/{wishId}/summary` | 응원 검증(본인 소원 여부, 현재 응원 수) | 로컬 캐시 확인 또는 `503` 반환 |

---

## 3. 비동기 Kafka 이벤트 명세 (Event-Driven)

즉시 응답을 기다릴 필요 없는 후속 작업은 Kafka 토픽으로 분리한다([[MSA]] 3·4장 기준).

| 토픽 | 이벤트 타입 (`eventType`) | 발행 서비스 | 구독 서비스 | 페이로드 예시 및 처리 내용 |
| --- | --- | --- | --- | --- |
| `wish.events` | `WISH_CREATED` | `wish-tower` | `group` | `{ eventId, wishId, groupId, categoryCode, createdAt }` → 그룹 돌 개수(`stone_count`) +1 |
| `wish.events` | `WISH_FULFILLED` | `wish-tower` | (추후 알림/통계) | `{ eventId, wishId, bloomType, fulfilledAt }` |
| `wish.events` | `WISH_DELETED` | `wish-tower` | `group` | `{ eventId, wishId, groupId }` → 그룹 돌 개수 -1 |
| `interaction.events` | `WISH_CHEERED` | `interaction` | `wish-tower` | `{ eventId, wishId, cheererId, createdAt }` → `wishes.cheer_count` +1 및 Redis `tower:stats` 응원 수 +1 |
| `interaction.events` | `WISH_REPORT_THRESHOLD_REACHED` | `interaction` | `wish-tower` | `{ eventId, wishId, reportCount: 5 }` → `wishes.status = 'HIDDEN'` 변경 및 랜덤 풀에서 제거 |

---

## 4. 주요 API 요청/응답 상세

### API-03 `GET /api/v1/towers/{towerKey}?limit=200`
- `towerKey`: `global` | `cat:job` | `group:{uuid}`
- 응답 `200 OK`:
```json
{
  "towerKey": "global",
  "stones": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "stoneShape": "round",
      "stoneColor": "#A89F91",
      "pose": { "x": 0, "y": 1.25, "z": 0, "qx": 0, "qy": 0, "qz": 0, "qw": 1 },
      "status": "active",
      "bloomType": null,
      "cheerLevel": 2,
      "isMine": false,
      "nickname": null
    }
  ],
  "hasMore": false
}
```

### API-05 `POST /api/v1/wishes`
- 요청:
```json
{
  "content": "올해는 꼭 원하는 곳에 합격하게 해주세요",
  "categoryCode": "job",
  "groupId": null,
  "stoneShape": "round",
  "stoneColor": "#A89F91",
  "pose": { "x": 0.05, "y": 1.5, "z": -0.02, "qx": 0, "qy": 0, "qz": 0, "qw": 1 }
}
```
- 응답 `201 Created`: `{ "id": "uuid", "createdAt": "2026-11-04T15:30:00Z" }`
- 에러: `CONTENT_TOO_LONG`, `CONTENT_BLOCKED`, `GROUP_FORBIDDEN`, `RATE_LIMITED`

### API-07 `POST /api/v1/wishes/{wishId}/cheers`
- 처리:
  1. `interaction-service`가 `interaction_db.cheers(wish_id, user_id)` INSERT (중복이면 `409 ALREADY_CHEERED`).
  2. 현재 응원 수 기준으로 `cheerLevel`(0~3)과 `levelUp` 여부를 계산해 즉시 응답.
  3. Kafka `interaction.events` 토픽으로 `WISH_CHEERED` 이벤트 발행.
- 응답 `200 OK`: `{ "cheerLevel": 1, "levelUp": true }`
- 에러: `ALREADY_CHEERED`, `CANNOT_CHEER_OWN`, `WISH_NOT_FOUND`
