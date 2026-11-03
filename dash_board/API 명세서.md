---
설계: 진행 중
---
# API 명세서

> 근거: [[요구 사항 정의서]], [[데이터 모델]]
> 방식: Supabase. 단순 조회는 뷰 + RLS로, 상태를 바꾸는 작업은 Postgres RPC(`supabase.rpc`)로 처리한다. 외부 연동이 필요한 경우만 Edge Function을 쓴다.
> 공통: 모든 요청에 로그인 세션(JWT)이 필요하다. 에러는 `{ code, message }` 형식으로 반환한다.

## 1. 목록

| ID | 이름 | 종류 | 관련 요구사항 |
| --- | --- | --- | --- |
| API-01 | 닉네임 설정 | RPC `set_nickname` | DB-001 |
| API-02 | 내 프로필 조회 | SELECT `users` | DB-001 |
| API-03 | 돌탑 조회 | RPC `get_tower` | DB-002, 003, 004, 005 |
| API-04 | 돌탑 통계 조회 | SELECT `tower_stats` | DB-006 |
| API-05 | 소원 등록 (돌 올리기) | RPC `create_wish` | DB-008~012 |
| API-06 | 랜덤 소원 조회 | RPC `get_random_wishes` | DB-014, 015 |
| API-07 | 응원 | RPC `cheer_wish` | DB-016, 017 |
| API-08 | 신고 | RPC `report_wish` | DB-018 |
| API-09 | 내 소원 목록 | RPC `get_my_wishes` | DB-019, 022 |
| API-10 | 소원 이루어짐 | RPC `fulfill_wish` | DB-020 |
| API-11 | 소원 삭제 | RPC `delete_wish` | DB-021 |
| API-12 | 그룹 생성 | RPC `create_group` | DB-005 |
| API-13 | 그룹 참여 | RPC `join_group` | DB-005 |
| API-14 | 내 그룹 목록 | RPC `get_my_groups` | DB-003, 005 |
| API-15 | 그룹 나가기 | RPC `leave_group` | DB-005 |
| API-16 | 카테고리 목록 | SELECT `categories` | DB-004 |

## 2. 상세

### API-01 `set_nickname(nickname text)`
- 2~12자, 금칙어 필터를 적용한다. 중복 허용 여부는 협의 사항이다.
- 에러: `NICKNAME_INVALID`, `NICKNAME_TAKEN`

### API-03 `get_tower(tower_key text, limit int default 200, before timestamptz default null)`
- `tower_key`: `global` | `cat:{code}` | `group:{uuid}`
- 응답:
```json
{
  "tower_key": "global",
  "stones": [
    { "id": "uuid", "stone_shape": "round", "stone_color": "#A89F91",
      "pose": { "x": 0, "y": 1.2, "z": 0, "qx": 0, "qy": 0, "qz": 0, "qw": 1 },
      "status": "active", "bloom_type": null, "cheer_level": 2,
      "is_mine": false, "nickname": null }
  ],
  "has_more": true
}
```
- `nickname`은 그룹 돌탑일 때만 채운다. 소원 본문은 내려주지 않는다(돌을 탭하면 API-06의 단건 조회 모드로 가져옴).
- `cheer_level`: 응원 수 구간(0~3)이다. 정확한 응원 수는 작성자 본인에게만 보여준다.
- 에러: `TOWER_FORBIDDEN`(그룹원이 아님)

### API-05 `create_wish(content, category_code, group_id, stone_shape, stone_color, pose)`
- 검증: 글자 수, 금칙어·개인정보 패턴(DB-030), 그룹원 여부
- 처리: `wishes` INSERT → `tower_stats` 증가(global, cat, group)
- 응답: `{ "id": "uuid", "created_at": "..." }`
- 에러: `CONTENT_TOO_LONG`, `CONTENT_BLOCKED`, `GROUP_FORBIDDEN`, `RATE_LIMITED`(하루 등록 한도는 협의 사항)

### API-06 `get_random_wishes(count int default 5, exclude_ids uuid[], wish_id uuid default null)`
- 조건: 공개 소원, `status in (active, fulfilled)`, 본인 소원·본인이 신고한 소원·`exclude_ids` 제외
- `wish_id`를 주면 해당 소원 하나만 반환한다(돌탑에서 돌을 탭했을 때). 그룹 소원은 그룹원에게만 반환한다.
- 응답 항목: `{ id, content, category_code, stone_shape, stone_color, status, bloom_type, cheer_level, cheered_by_me }`
- 구현 메모: 처음에는 `ORDER BY random()` 대신 `id >= gen_random_uuid()` 같은 랜덤 시작점 방식을 쓰고, 데이터가 많아지면 TABLESAMPLE을 쓴다.

### API-07 `cheer_wish(wish_id uuid)`
- 처리(하나의 트랜잭션): `cheers` INSERT → 충돌(이미 응원함)이면 `ALREADY_CHEERED` → `wishes.cheer_count + 1` → `tower_stats.cheer_count + 1`
- 응답: `{ "cheer_level": 2, "level_up": true }`. `level_up`이 true면 클라이언트가 돌이 빛나는 단계 상승 연출을 추가로 보여준다.
- 에러: `ALREADY_CHEERED`, `CANNOT_CHEER_OWN`, `WISH_NOT_FOUND`

### API-08 `report_wish(wish_id uuid, reason text)`
- `reason`: `abuse` | `hate` | `sexual` | `personal_info` | `spam` | `etc`
- 처리: `reports` INSERT → `report_count + 1` → 기준값 이상이면 `status = hidden`
- 에러: `ALREADY_REPORTED`

### API-09 `get_my_wishes(status text default null, cursor timestamptz default null)`
- 응답 항목: `{ id, content, category_code, group_id, group_name, stone_shape, stone_color, status, bloom_type, cheer_count, new_cheer_count, created_at, fulfilled_at }`
- `new_cheer_count`: 마지막으로 확인한 뒤 새로 받은 응원 수다. `users.last_checked_at`을 기준으로 `cheers.created_at`을 센다. 조회하면 `last_checked_at`을 갱신한다.

### API-10 `fulfill_wish(wish_id uuid, bloom_type text default null)`
- `bloom_type`이 null이면 서버가 `flower` / `sprout` / `moss` 중 랜덤으로 정한다.
- 처리: `status = fulfilled`, `fulfilled_at = now()`, `tower_stats.fulfilled_count + 1`
- 응답: `{ "bloom_type": "sprout" }`
- 에러: `NOT_OWNER`, `ALREADY_FULFILLED`

### API-11 `delete_wish(wish_id uuid)`
- soft delete를 하고 `tower_stats.stone_count - 1`

### API-12 `create_group(name text)` / API-13 `join_group(invite_code text)`
- 생성하면 8자리 초대 코드를 발급하고, 생성자는 owner가 된다.
- 참여 에러: `INVITE_INVALID`, `GROUP_FULL`, `ALREADY_MEMBER`
- 초대 링크: `stonewish://join/{invite_code}`와 `https://{도메인}/join/{invite_code}` (expo-router 딥링크)

## 3. 레이트 리밋 (초안)

| 대상 | 한도 |
| --- | --- |
| create_wish | 하루 10회 |
| cheer_wish | 분당 30회 |
| report_wish | 하루 20회 |
| get_random_wishes | 분당 60회 |

