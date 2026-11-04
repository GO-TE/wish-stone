# TASKS

> 최종 갱신: 2026-11-04 / 현재 단계: 코어 도메인·AR 추상화 및 DB 스키마 구현 착수
> 상태: ✅ 완료 · 🔄 진행 중 · ⏳ 대기 · ❓ 결정 필요

## 1. 완료

### 2026-11-04 세션
- ✅ **멀티 에이전트 협업 체계 전환 및 Git Worktree 환경 구축 완료 (M1~M3):**
  - 4개 역할(Manager, Frontend, Backend 사수/시니어 멘토, QA) 협업 구조 및 커뮤니케이션 가이드라인(`AGENT_COLLABORATION_GUIDELINES.md`, `MULTI_AGENT_TRANSITION_PLAN.md`) 수립
  - 사수/시니어 멘토 백엔드 아키텍처 가이드(`BACKEND_SENIOR_MENTOR_GUIDE.md`) 작성
  - Git 브랜치 분리(`feature/frontend`, `feature/backend`) 및 Git Worktree(`worktree_frontend`, `worktree_backend`) 구성 완료 (기존 main 100% 보존)
  - 백엔드 Gradle 멀티모듈 누락 디렉터리(`user-auth-service`, `group-service`) 스캐폴딩 및 빌드/테스트 전건 정렬 (`BUILD SUCCESSFUL`, 단위 테스트 통과)
  - 프론트엔드 도메인·AR 단위 테스트 6건 통과 검증 (`node --test`, pass 6, fail 0)
  - GitHub 원격 저장소(`origin`) 브랜치 동기화 및 종합 검증 리포트(`TEST_READY.md`) 작성 완료
- ✅ **백엔드 아키텍처를 Supabase에서 Spring Boot MSA + Kafka + Redis + DB 분리로 전면 전환 (D-013):**
  - `dash_board/기술 스택.md`, `데이터 모델.md`, `API 명세서.md`, `아키텍처 설계.md`, `DECISIONS.md` MSA 기준으로 개편
- ✅ **클라이언트 코어 및 MSA 게이트웨이 어댑터 구현 (`src/`):**
  - 도메인 계층(`src/domain/`), 유스케이스(`src/application/`), AR 3중 어댑터(`src/infrastructure/ar/`), 물리(`SimpleTowerPhysicsWorld`)
  - Spring Cloud Gateway(`:8080`) 연동 어댑터(`MsaHttpClient`, `MsaWishRepository`, `MsaTowerRepository`, `MsaGroupRepository`, `MsaAuthService`), `DashboardController`
  - 단위·통합 테스트 6건 작성 및 통과 (`node --test src/__tests__/domain-and-ar.test.ts` → **pass 6, fail 0**)
- ✅ **Spring Boot MSA 백엔드 멀티모듈 및 인프라 구축 (`backend/`):**
  - `backend/docker-compose.yml` (MySQL 8.0 + Redis 7 + Apache Kafka KRaft 모드)
  - `backend/sql/init-databases.sql` (`user_db`, `wish_db`, `interaction_db`, `group_db` 4개 DB 분리 초기화)
  - 멀티모듈 Gradle 설정 및 핵심 패턴 구현 (`gateway-service` 라우팅, `UserAuthFeignClient` + Resilience4j `@CircuitBreaker` 폴백, `CheerCommandService` Kafka 이벤트 발행, `InteractionEventConsumer` 멱등성 컨슈머)
- ✅ 프론트엔드 프로젝트 설정 파일 생성 (`package.json`, `tsconfig.json`, `app.json`)

### 2026-11-03 세션
- ✅ PRD v1.0 수정: AR을 MVP에 포함하고, 향후 확장에서 "AR 돌탑" 삭제
- ✅ 요구 사항 정의서 작성: DB-001~030 (기능 22, 비기능 8)
- ✅ 기술 스택 결정서 작성 (`dash_board/기술 스택.md`)
- ✅ 데이터 모델(ERD, RLS) 작성 (`dash_board/데이터 모델.md`)
- ✅ API 명세서 작성: API-01~18 (`dash_board/API 명세서.md`)
- ✅ 화면 설계서 작성: SCR-01~18 (`dash_board/화면 설계서.md`)
- ✅ 객체지향 아키텍처 설계 작성 (`dash_board/아키텍처 설계.md`)
- ✅ 루트 문서 정비: PROJECT_CONTEXT / TASKS / DECISIONS (저장소 루트로 이동)
- ✅ 커밋·푸시 (origin/main)

## 2. 다음 작업 (우선순위 순)

1. ⏳ **Spring Boot MSA 각 서비스 JPA 엔티티·컨트롤러 상세 구현 (`backend/`):**
   - `user-auth-service` (`:8081`): JWT 발급/검증, OAuth2/게스트 로그인, `/internal/users/nicknames`
   - `wish-tower-service` (`:8082`): 돌탑 조회(`GET /api/v1/towers/{key}`), 소원 생성, Redis `tower:stats` & `SRANDMEMBER` 랜덤 풀 연동
   - `interaction-service` (`:8083`): 응원/신고 REST 컨트롤러 및 JPA 리포지토리 연결
   - `group-service` (`:8084`): 그룹 생성·초대 코드 참여 및 `/internal/groups/{id}/members/{userId}/exists`
2. ⏳ **클라이언트 Expo 화면(`src/app/`) 및 3D/AR 뷰(`src/presentation/`) 구현:**
   - `npm install` 후 SCR-01~SCR-08(대시보드 3D 돌탑 캔버스, 랜덤 소원 카드, AR 쌓기 화면) 연결
3. ⏳ **로컬 Docker Compose(`mysql`, `redis`, `kafka`) 구동 및 End-to-End 연동 테스트**

## 3. 결정 필요 (사용자에게 물어볼 것)

| 우선순위 | 항목 | 관련 |
| --- | --- | --- |
| ❓ 중 | 게스트 기능 제한 여부 (예: 그룹 생성 불가) | DB-001, D-007 |
| ❓ 중 | 닉네임 중복 허용 여부 | DB-001 |
| ❓ 중 | 소원 최대 글자 수, 금칙어 정책, 자동 필터와 수동 검수 중 선택 | DB-009, 030 |
| ❓ 중 | 카테고리 목록 (초안: 취업, 학업, 건강, 관계, 기타) | DB-004 |
| ❓ 중 | 자동 숨김 신고 횟수 (초안 5회) | DB-018 |
| ❓ 중 | 그룹 최대 인원 | DB-005 |
| ❓ 하 | 응원 단계 구간 (예: 10 / 50 / 100) | DB-017, D-006 |
| ❓ 하 | 이루어짐 되돌리기, 삭제 시 돌탑에서 돌을 실제로 뺄지 | DB-020, 021 |
| ❓ 하 | AR 사진 공유 시 소원 글 노출, 워터마크 (사용자: "나중에 천천히") | DB-013 |
| ❓ 하 | 하루 소원 등록 한도 (초안 10회), 레이트 리밋 수치 | API 명세서 3장 |

## 4. 해결하지 못한 문제와 주의사항

- ✅ **(해결됨) AI 터미널 도구 고장:** 원인은 사용자 PC의 PATH 오타(`C:\WINDOWSSystem32\...`)와 Git 경로 누락이었다. 사용자가 고친 뒤 정상 동작한다. 다른 PC에서도 `run_command`가 `powershell not found`로 실패하면 PATH에 `%SystemRoot%\System32\WindowsPowerShell\v1.0\`과 `C:\Program Files\Git\cmd`가 있는지 확인할 것.
- ⚠️ **Git 저장소 위치:** 저장소 루트는 `wish_stone/`이 아니라 `wish_stone/위시 스톤/`이다. 원래 `wish_stone/`에 있던 PROJECT_CONTEXT / TASKS / DECISIONS를 저장소 안으로 옮겼다(다른 PC에서 받을 수 있게).
- ⚠️ **노션 연동:** 새로 만든 문서 5개(기술 스택, 아키텍처 설계, 데이터 모델, API 명세서, 화면 설계서)에는 `notion-id`가 없다. 노션과 동기화하려면 노션에서 페이지를 만든 뒤 연결해야 한다.
- ⚠️ **기술 리스크:** ViroReact 유지보수 지속성, iOS Safari에 WebXR 없음, Viro와 cannon-es 물리 결과 차이. 대응 방법은 `기술 스택.md` 4장에 있다.
- ⚠️ **AGENTs.md 규칙:** 라이브러리를 임의로 추가하지 않는다. 기술 스택 문서에 있는 것 외의 라이브러리를 쓰려면 사용자에게 먼저 확인한다.

