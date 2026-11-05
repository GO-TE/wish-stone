# StoneWish(위시 스톤) 멀티 에이전트 협업 지침서
## (Agent Collaboration & Interaction Guidelines)

- **문서 버전:** v1.0
- **작성 일자:** 2026-11-04
- **대상 프로젝트:** StoneWish (위시 스톤)
- **적용 대상:** Manager Agent, Frontend Agent, Backend Agent (Senior Mentor), QA Agent

---

## 1. 목적 및 기본 원칙

본 지침서는 StoneWish 프로젝트를 구성하는 4개 전문 에이전트 간의 역할 분담, 직접 소통 프로토콜, 공통 파일 변경 절차, 품질 보증 검증 체크포인트를 명문화하여 협업의 투명성과 개발 효율을 극대화하기 위해 제정되었습니다.

### 협업 3대 원칙
1. **수평적 직접 소통 (Direct Communication):**
   - API 명세, DTO 규격, 데이터 동기화 등 프론트엔드-백엔드 간의 기술적 협의는 Manager를 경유하지 않고 직접 메시지를 교환하여 병목 현상을 방지합니다.
2. **사전 공유 기반 공통 자산 관리 (Pre-approval for Shared Files):**
   - 공통 설계 문서(`dash_board/`) 및 프로젝트 관리 파일(`DECISIONS.md`, `TASKS.md`)의 수정은 반드시 사전 공유 및 Manager 승인 후 단일 커밋으로 반영합니다.
3. **지속적 무결성 검증 (Continuous Verification):**
   - 모든 기능 단위 구현 후에는 QA 에이전트의 자동화 검증을 통과해야만 브랜치 병합을 진행할 수 있습니다.

---

## 2. 4-Agent 역할 및 책임 매트릭스 (RACI Matrix)

```
                  ┌────────────────────────────────────────┐
                  │             Manager Agent              │
                  │   (전체 프로젝트 관리 / 태스크 분배 / 병합 승인)   │
                  └───────────────────┬────────────────────┘
                                      │
              ┌───────────────────────┴───────────────────────┐
              ▼                                               ▼
┌───────────────────────────┐   API 규격 및 DTO 직접 동기화   ┌───────────────────────────┐
│      Frontend Agent       │ ◄──────────────────────────►  │    Backend Agent (사수)    │
│  (Expo / R3F / AR 화면 구현)  │   Mock 데이터 및 에러 코드 조율   │ (Spring Boot MSA / Kafka) │
└─────────────┬─────────────┘                               └─────────────┬─────────────┘
              │                                                           │
              └─────────────────────────────┬─────────────────────────────┘
                                            ▼
                              ┌───────────────────────────┐
                              │         QA Agent          │
                              │  (통합 테스트 / 무결성 및 보안 검증)  │
                              └───────────────────────────┘
```

### 2.1 상세 역할 정의

| 역할 (Role) | 전담 영역 및 디렉터리 | 주요 책임 및 업무 범위 | 산출물 및 커밋 범위 |
|---|---|---|---|
| **Manager Agent** | 프로젝트 총괄, `TASKS.md`, `DECISIONS.md` | - 스프린트 관리 및 작업 분배 (`TASKS.md` 기반)<br>- 사용자 미결정 사항 조율 및 의사결정 기록<br>- 공통 문서 변경 최종 승인<br>- `feature/frontend`, `feature/backend` 검증 후 `main` 병합 | 프로젝트 진척 보고서, `DECISIONS.md` 신규 ADR, 병합 커밋 |
| **Frontend Agent** | `src/`, `package.json`, `tsconfig.json`, `app.json` | - Expo 기반 모바일/웹 UI 및 네비게이션 구현 (`SCR-01 ~ SCR-18`)<br>- React Three Fiber 기반 3D 돌탑 렌더링 및 물리 안착<br>- AR 3-way 세션 어댑터 화면 바인딩 (`D-003`)<br>- Zustand 스토어 및 TanStack Query 훅 개발<br>- 백엔드 개발 중 `mockGatewayFetch` 기반 선행 UI 개발 | `src/` 산하 화면, 훅, 컴포넌트, 프론트엔드 커밋 |
| **Backend Agent<br>(Senior Mentor)** | `backend/`, `docker-compose.yml`, `sql/` | - Spring Boot 3.3.5 멀티모듈 MSA 아키텍처 구현<br>- Spring Cloud Gateway (:8080) 라우팅 및 JWT 필터<br>- 4개 마이크로서비스 (:8081~:8084) 도메인 로직 구현<br>- Kafka KRaft 이벤트 스트리밍 및 컨슈머 멱등성 보장<br>- Database-per-Service (4 MySQL DB) 및 Redis 캐시 구축<br>★ **사용자의 사수(시니어 멘토)로서 아키텍처 의도, 설계 이유, 실무 노하우 실시간 멘토링** | `backend/` 소스 코드, Gradle 설정, Docker/SQL 파일, 백엔드 커밋 |
| **QA Agent** | `src/__tests__/`, `backend/**/src/test/` | - 프론트엔드 단위 테스트 (`node --test`) 상시 검증<br>- 백엔드 JUnit 5 단위/통합 테스트 작성 및 실행<br>- 익명성 보장(DB-023: 외부 응답 유저 식별자 누출 차단) 보안 감사<br>- Kafka 이벤트 중복 발행 시 멱등성 검증<br>- Resilience4j Circuit Breaker 폴백 시나리오 검증<br>- Git 커밋 히스토리 무결성 감사 | 테스트 코드, 결함 보고서, 무결성 검증 증빙서 |

---

## 3. 에이전트 간 메시지 교환 표준 (Message Protocol)

모든 에이전트는 협업 효율과 기록의 명확성을 위해 아래의 정형화된 3단 메시지 형식을 준수하여 통신합니다.

### 3.1 표준 메시지 템플릿

```markdown
**Context**: [현재 작업 배경 및 대상 모듈 (예: API 명세 동기화, 브랜치 커밋 보고, 블로커 발생 등)]
**Content**: [전달하고자 하는 기술적 세부 내용, 근거, 변경된 파일 경로 및 코드 스니펫]
**Action**: [수신 에이전트가 즉각 수행해야 할 행동 (예: 검토 요청, 승인 요청, DTO 반영 요청 등)]
```

### 3.2 통신 채널 원칙
- **장문 보고서 및 설계서:** 파일(`.agents/teamwork/...` 또는 `위시 스톤/dash_board/...`)에 작성하고 메시지에는 파일 경로와 핵심 요약만 기재합니다.
- **실시간 알림 및 피드백:** 메시지 교환을 통해 즉각 통보합니다.
- **활동 생존 보고 (Heartbeat):** 장시간 실행되는 작업(빌드, 대규모 테스트 등) 중에는 각 에이전트의 `progress.md`에 매 5분마다 `Last visited: [timestamp]`를 갱신하여 교착 상태가 아님을 증명합니다.

---

## 4. Frontend ↔ Backend 직접 소통 프로토콜 (Direct Sync)

Manager를 거치지 않고 프론트엔드와 백엔드가 실시간으로 상호작용하는 구체적인 절차입니다.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                           FE ↔ BE 상호작용 타임라인                              │
└──────────────────────────────────────────────────────────────────────────────────┘
   Frontend Agent                                            Backend Agent (사수)
         │                                                            │
         │  1. [질의] 특정 API 요청/응답 DTO 및 쿼리 파라미터 확인     │
         ├───────────────────────────────────────────────────────────►│
         │                                                            │  2. [답변/가이드]
         │                                                            │  MSA 설계 의도 설명,
         │  3. [응답] DTO 스펙 확정, 에러 포맷 및 에러 코드 공유       │  캐싱/비동기 특성 안내
         │◄───────────────────────────────────────────────────────────┤
         │                                                            │
         │  4. [선행 개발] Mock 데이터로 화면 UI 및 인터랙션 구현     │  5. [백엔드 구현]
         │     (mockGatewayFetch / container.ts 활용)                 │     컨트롤러, 서비스,
         │                                                            │     Kafka 이벤트 작성
         │  6. [알림] 프론트엔드 API 연동 준비 완료                   │
         ├───────────────────────────────────────────────────────────►│
         │                                                            │  7. [배포/엔드포인트 오픈]
         │  8. [통합] 실제 Gateway 엔드포인트 연동 테스트             │     로컬 Gateway (:8080)
         │◄───────────────────────────────────────────────────────────┤     실제 응답 제공
         │                                                            │
```

### 4.1 API 계약 동기화 워크플로우 (`dash_board/API 명세서.md` 기반)

1. **API 스펙 문의 및 검토:**
   - 프론트엔드는 화면 설계서(`SCR-01 ~ SCR-18`) 구현 중 필요한 데이터 항목이 `API 명세서.md`와 상이하거나 추가 필드가 필요할 때 백엔드에 직접 검토를 요청합니다.
2. **공통 에러 응답 표준 규격 준수:**
   모든 마이크로서비스는 Gateway를 통과할 때 일관된 에러 포맷을 반환합니다:
   ```json
   {
     "success": false,
     "error": {
       "code": "CANNOT_CHEER_OWN",
       "message": "자신의 소원에는 응원할 수 없습니다.",
       "status": 400,
       "timestamp": "2026-11-04T12:00:00Z"
     }
   }
   ```
3. **핵심 도메인 에러 코드 사전 합의:**
   - `CANNOT_CHEER_OWN`: 본인 소원 응원 시도 (HTTP 400)
   - `ALREADY_CHEERED`: 1인 1회 응원 초과 (HTTP 409)
   - `NICKNAME_INVALID`: 2~12자 미준수 또는 금칙어/admin 포함 (HTTP 400)
   - `WISH_NOT_FOUND`: 소원이 존재하지 않거나 삭제됨 (HTTP 404)
   - `GROUP_ACCESS_DENIED`: 그룹원이 아닌 사용자의 그룹 돌탑 접근 (HTTP 403)
   - `RATE_LIMIT_EXCEEDED`: 일일 소원 등록 한도(10회) 또는 응원 빈도 초과 (HTTP 429)

### 4.2 Mock / Stub 데이터 조율 방안
- 백엔드 구현이 진행되는 동안 프론트엔드 개발이 중단되지 않도록, `src/infrastructure/api/MsaHttpClient.ts`의 `mockGatewayFetch`를 적극 활용합니다.
- 백엔드 에이전트는 컨트롤러 스캐폴딩 단계에서 샘플 JSON 페이로드를 메시지로 즉시 제공하여 프론트엔드의 Mock 데이터와 실제 백엔드 DTO 간의 오차를 `0%`로 유지합니다.

### 4.3 비동기 이벤트(Kafka)와 UI 낙관적 업데이트(Optimistic Update) 조율
- **사수의 가이드 포인트:** 응원하기(API-07) 호출 시 백엔드는 DB에 동기식으로 응원 수를 갱신하지 않고 `interaction.events` Kafka 토픽으로 이벤트를 발행한 뒤 즉시 200 OK를 반환합니다. 따라서 `wish-tower-service`의 카운트가 실제로 +1 되기까지 수십~수백 ms의 지연이 발생할 수 있습니다.
- **프론트엔드 대응 지침:** 프론트엔드 에이전트는 이를 감안하여 UI에서 **낙관적 업데이트(Optimistic Update)** 를 적용하여, 사용자가 응원 버튼을 누르는 즉시 파티클 연출과 함께 카운트를 로컬에서 먼저 증가시키고 실패 시 롤백하는 UX를 구현합니다.

---

## 5. 공통 파일 수정 및 형상 관리 프로토콜

### 5.1 파일 소유권 및 접근 권한 매트릭스

| 대상 경로 | 전담 소유 에이전트 | 열람/참조 권한 | 수정 승인 절차 |
|---|---|---|---|
| `src/` (전체 TS 소스) | **Frontend Agent** | 전체 | Frontend 독점 수정 |
| `backend/` (전체 MSA 소스) | **Backend Agent** | 전체 | Backend 독점 수정 |
| `dash_board/API 명세서.md` | Frontend & Backend 공동 | 전체 | **FE ↔ BE 상호 합의 후 Manager 사전 승인** |
| `DECISIONS.md`, `TASKS.md` | **Manager Agent** | 전체 | 에이전트 제안 → Manager 검토 후 단독 갱신 |
| `package.json`, `app.json` | **Frontend Agent** | 전체 | 신규 라이브러리 추가 시 Manager 사전 공유 |
| `docker-compose.yml`, `sql/` | **Backend Agent** | 전체 | 포트나 컨테이너 구성 변경 시 Manager 사전 공유 |
| `.gitignore` | Manager 주관 | 전체 | 공통 합의 후 반영 |

### 5.2 공통 파일 수정 절차 (Manager 사전 공유 워크플로우)

```
[제안 에이전트 (FE 또는 BE)]
  │
  ├─► 1. 상대 에이전트에게 제안 메시지 발송
  │      - 변경 사유, 수정 대상 라인, 제안 코드 diff 명시
  │
[상대 에이전트]
  │
  ├─► 2. 영향도 검토 후 동의 메시지 반환
  │
[Manager Agent]
  │
  ├─► 3. 아키텍처 및 요구사항 정합성 검토 후 최종 승인 ("Approved")
  │
[제안 에이전트]
  │
  ├─► 4. 파일 수정 실행 및 독립 커밋 생성 (`docs: ...`)
  │
  └─► 5. 커밋 해시 및 변경 결과를 팀 전체에 회신
```

### 5.3 커밋 보고 표준 포맷

모든 에이전트는 기능 단위 커밋 직후 팀 채널에 다음 규격으로 보고합니다:

```markdown
**Context**: [브랜치 커밋 보고]
**Content**:
- 브랜치: `feature/backend`
- 커밋 해시: `a1b2c3d`
- 커밋 메시지: `feat(wish-tower): 소원 생성 API 구현 및 3D 로컬 Pose 저장 (DB-010, API-05)`
- 변경 파일: `WishTowerController.java`, `WishEntity.java`, `WishService.java`
- 단위 테스트 결과: 3/3 통과
**Action**: Frontend Agent는 DTO 연동 참고, QA Agent는 검증 대기
```

---

## 6. QA 에이전트 검증 트리거 및 체크포인트

QA Agent는 품질 게이트키퍼(Quality Gatekeeper)로서 다음과 같은 상황에서 즉시 검증을 가동합니다.

### 6.1 검증 트리거 (Verification Triggers)
1. **기능 커밋 완료 시 (Post-Commit Trigger):** Frontend 또는 Backend 에이전트가 주요 유스케이스 커밋을 보고했을 때.
2. **PR 생성 및 머지 요청 시 (Pre-Merge Trigger):** Manager가 `feature/*` 브랜치를 `main`에 병합하기 직전.
3. **API 명세 변경 시 (Contract Change Trigger):** `dash_board/API 명세서.md` 변경이 발생했을 때.

### 6.2 품질 검증 체크리스트 (Quality Gate Checklist)

| 검증 영역 | 검증 명령어 및 방법 | 합격 기준 (Pass Criteria) |
|---|---|---|
| **프론트엔드 도메인/AR 무결성** | `cd "위시 스톤"; node --test src/__tests__/domain-and-ar.test.ts` | **6 tests, 6 pass, 0 fail (100% Green)** |
| **백엔드 빌드 및 단위 테스트** | `cd "위시 스톤/backend"; ./gradlew test` (래퍼 생성 후) | 컴파일 에러 없음, 모든 JUnit 5 테스트 통과 |
| **익명성 보장 보안 감사 (DB-023)** | 공개 돌탑 API(`API-03`), 랜덤 소원(`API-06`) 응답 DTO JSON 스키마 정적/동적 검사 | 응답 필드에 `userId`, `authorId`, `email` 등 작성자 식별자 원천 배제, 오직 `isMine`(boolean)만 허용 |
| **소원 응원 멱등성 검사 (DB-016)** | 동일 `eventId`로 Kafka 이벤트 2회 연속 소비 시뮬레이션 | `processed_events`에 의해 2회차 이벤트는 무시되고 응원 카운트는 정확히 1만 증가 |
| **Circuit Breaker 장애 격리** | `user-auth-service`를 다운시킨 상태에서 그룹 돌탑 조회 요청 | 500 에러 대신 Fallback이 동작하여 닉네임이 `"익명의 그룹원"`으로 안전하게 반환 |
| **Git 히스토리 보존성** | `git log --oneline -n 11 main` 실행 | 기존 11개 베이스라인 커밋(`ceccc10` ~ `286a358`)이 손실 없이 온전히 존재 |

---

## 7. 충돌 방지 및 비상 해결 절차 (Conflict Resolution)

1. **사전 충돌 방지:**
   - Frontend는 `src/`만, Backend는 `backend/`만 수정하는 엄격한 디렉터리 배타적 소유권을 행사하므로 코드 충돌 가능성은 0%에 수렴합니다.
2. **의존성 설정 충돌 시 (`package.json`, `build.gradle.kts`):**
   - 두 개 이상의 에이전트가 동시에 패키지를 추가해야 할 경우, Manager가 중재하여 병합 순서를 지정합니다.
3. **머지 충돌 발생 시 비상 대응:**
   - 충돌이 발생한 브랜치의 담당 에이전트와 Manager가 3자 협의를 진행하며, 어떤 경우에도 `git push --force`나 히스토리 삭제를 금지합니다.
