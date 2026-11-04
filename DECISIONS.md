# DECISIONS

> 형식: 결정 / 배경 / 대안 / 결과. 새 결정은 아래에 `D-NNN`으로 추가한다. 결정을 뒤집을 때는 지우지 말고 상태를 "폐기"로 바꾸고 새 항목을 만든다.

| ID | 날짜 | 제목 | 상태 | 결정자 |
| --- | --- | --- | --- | --- |
| D-001 | 2026-11-03 | AR을 MVP에 포함 | 확정 | 사용자 |
| D-002 | 2026-11-03 | 모바일 + 웹 단일 코드베이스 (Expo + RN Web) | 확정 | AI 제안 → 사용자 위임 |
| D-003 | 2026-11-03 | AR은 플랫폼별 구현체 3개를 인터페이스 뒤에 둠 | 확정 | AI 제안 |
| D-004 | 2026-11-03 | 백엔드 Supabase | 폐기 (D-013으로 대체) | AI 제안 |
| D-005 | 2026-11-03 | 응원은 카운트만 저장, 연출용 돌은 저장 안 함 | 확정 | 사용자 |
| D-006 | 2026-11-03 | 응원 수는 본인만, 타인에게는 0~3단계로 공개 | 확정 | AI 제안 → 사용자 승인 |
| D-007 | 2026-11-03 | 로그인: Apple / Kakao / Google / 게스트 | 확정 | 사용자 |
| D-008 | 2026-11-03 | 닉네임 필수, 그룹 안에서만 공개 | 확정 | 사용자 |
| D-009 | 2026-11-03 | 돌탑 3종(전체/카테고리/그룹), 테이블 없이 필터로 정의 | 확정 | 사용자 + AI |
| D-010 | 2026-11-03 | 물리 결과 pose 저장 방식 | 확정 | AI 제안 |
| D-011 | 2026-11-03 | 객체지향 계층 구조 (포트/어댑터) | 확정 | 사용자 요청 |
| D-012 | 2026-11-03 | 이루어짐 연출: 랜덤 기본 + 사용자 선택 | 확정 | 사용자 |
| D-013 | 2026-11-04 | 백엔드 Spring Boot MSA + Kafka + Redis + DB 분리로 전환 | 확정 | 사용자 |
| D-014 | 2026-11-04 | 4개 에이전트 협업 체계 및 Git Worktree 브랜치 격리 구조 도입 | 확정 | 사용자 요청 + AI |

---

## D-001 AR을 MVP에 포함
- **배경:** PRD v1.0 초안에서는 AR이 MVP 제외 항목이었지만, 사용자가 핵심 기능으로 원했다.
- **결정:** AR 돌탑 보기, AR 드래그 쌓기, AR 사진 촬영을 MVP에 넣고 중요도를 "상"으로 둔다(DB-011~013). PRD 7장과 10장도 고쳤다.
- **결과:** 일정과 기술 리스크가 커진다. 착수 전에 PoC로 검증해야 한다(TASKS 참고).

## D-002 모바일 + 웹 단일 코드베이스
- **배경:** 모바일과 웹을 둘 다 지원해야 하고, AR도 필요하다.
- **대안:** Unity(웹 AR 불가), Flutter(웹 AR 거의 불가), 네이티브 + 별도 웹(비용 2배)
- **결정:** Expo(React Native) + expo-router + react-native-web, 3D는 React Three Fiber
- **결과:** 일반 화면과 3D는 코드를 공유하고, AR만 플랫폼별로 구현한다.

## D-003 AR 구현체 3개
- **결정:** `ARSession` 인터페이스 하나에 구현체 3개를 둔다. 네이티브는 ViroReact, 웹은 WebXR(`@react-three/xr`), WebXR을 지원하지 않는 브라우저(iOS Safari, PC)는 카메라 + 3D 겹치기(간이 AR). AR이 아예 안 되면 일반 3D로 대체한다.
- **주의:** ViroReact는 Expo Go에서 실행되지 않으므로 EAS Dev Build가 필요하다. 유지보수가 끊길 위험이 있어 교체할 수 있게 분리했다.

## D-004 백엔드 Supabase
- **이유:** 데이터가 관계형이고, 익명성 규칙을 RLS로 강제할 수 있다. 응원 카운트는 RPC로 원자적으로 증가시키고, Auth가 Apple/Kakao/Google/Anonymous를 기본 지원한다.
- **규칙:** 공개 소원은 `user_id`를 뺀 `public_wishes` 뷰로만 조회한다(대신 `is_mine` 제공).

## D-005 응원 데이터 경량화
- **배경:** 사용자가 DB가 너무 커지는 걸 걱정했다.
- **결정:** `wishes.cheer_count`(정수)와 중복 방지용 `cheers(wish_id, user_id)`만 저장한다. 응원 텍스트는 없다. 응원할 때 쌓이는 돌은 클라이언트 연출이다.
- **추가:** 이루어졌거나 삭제된 지 90일이 지난 소원은 `cheers` 행을 정리한다.

## D-006 응원 수 공개 범위
- **결정:** 정확한 응원 수는 작성자 본인만 본다. 다른 사람에게는 `cheer_level` 0~3단계(빛나는 정도)만 보여준다.
- **이유:** PRD의 "좋아요 경쟁 대신 응원 문화"를 지키기 위해서다. 단계 구간 값(예: 10/50/100)은 아직 정하지 않았다.

## D-007 로그인 방식
- **결정:** Apple / Kakao / Google / 게스트 4가지. 게스트는 Supabase Anonymous Sign-in으로 시작하고, `linkIdentity`로 소셜 계정에 연결하면 데이터가 그대로 남는다.
- **참고:** iOS 앱스토어 정책상 소셜 로그인을 제공하면 Apple 로그인이 필수다.

## D-008 닉네임
- **결정:** 가입할 때(게스트 포함) 닉네임을 필수로 설정한다. 닉네임은 그룹 돌탑에서만 보이고, 그 밖에서는 익명이다.

## D-009 돌탑 정의
- **결정:** `wishes.group_id IS NULL`이면 공개 돌탑(전체, 카테고리 필터 가능), 값이 있으면 그룹 돌탑이다. 통계는 `tower_stats`에 캐시한다.

## D-010 돌 위치 저장
- **결정:** Viro 물리와 cannon-es의 결과가 달라질 수 있어서, 물리는 쌓는 순간에만 쓰고 최종 pose(탑 기준 로컬 좌표)를 `wishes.pose`(jsonb)에 저장한다.
- **렌더링:** 최근 200개(AR은 50개)만 개별로 그리고, 나머지는 instancing으로 처리한다.

## D-011 객체지향 계층 구조
- **결정:** presentation → application(유스케이스) → domain(엔티티, 값 객체, 포트) ← infrastructure(어댑터). 의존성은 `container.ts`에서 주입한다. 플랫폼 분기는 `PlatformCapabilities`와 `ARSessionFactory`에서만 한다. 연출은 `EffectBus`(옵저버)로 분리한다.
- **상세:** `dash_board/아키텍처 설계.md`

## D-12 이루어짐 연출
- **결정:** 기본값은 꽃/새싹/이끼 중 서버가 랜덤으로 정하고, 사용자가 직접 고를 수도 있다.

## D-013 백엔드 Spring Boot MSA + Kafka + Redis + DB 분리로 전환 (D-004 대체)
- **배경:** 사용자의 핵심 목표 중 하나가 `dash_board/MSA.md`에 정리된 **Spring Boot 기반 MSA(API Gateway, OpenFeign, Resilience4j Circuit Breaker, JWT, Kafka 비동기 이벤트, Database-per-Service, Docker)**를 직접 학습하고 구축하는 것이었다.
- **결정:**
  1. **API Gateway (`:8080`):** Spring Cloud Gateway에서 JWT를 검증하고 `X-User-Id`를 하위 서비스에 전달한다.
  2. **마이크로서비스 4종 분리:**
     - `user-auth-service` (`:8081`, `user_db`): 소셜(Apple/Kakao/Google)·게스트 로그인, 계정 연결(`link`), 닉네임 관리
     - `wish-tower-service` (`:8082`, `wish_db` + `Redis`): 소원(돌) 생명주기, 3D pose 저장, 돌탑 조회, Redis 기반 통계(`tower:stats:*`) 및 랜덤 풀(`wish:random:pool`)
     - `interaction-service` (`:8083`, `interaction_db`): 응원(`cheers`) 1인 1회 중복 차단 및 신고(`reports`) 누적 관리
     - `group-service` (`:8084`, `group_db`): 지인 그룹 생성, 초대 코드 발급·참여, 그룹원 권한 검증
  3. **동기(OpenFeign + Circuit Breaker) vs 비동기(Kafka) 기준 적용:**
     - **즉시 결과가 필요한 작업:** 그룹 돌탑 조회 시 그룹원 권한 확인(`group-service`), 작성자 닉네임 배치 조회(`user-auth-service`, 장애 시 Resilience4j 폴백으로 `"익명의 그룹원"` 반환)
     - **최종 일관성으로 충분한 작업:** 응원 시 카운트 반영(`WISH_CHEERED`), 신고 5회 누적 시 자동 숨김(`WISH_REPORT_THRESHOLD_REACHED`), 그룹 돌 개수 증감(`WISH_CREATED`/`WISH_DELETED`)은 Kafka 토픽(`interaction.events`, `wish.events`)으로 처리한다.
- **결과:** 클라이언트는 포트/어댑터 구조(D-011) 덕분에 도메인·유스케이스 수정 없이 `src/infrastructure/api/` 및 `auth/` 어댑터(`MsaWishRepository`, `MsaTowerRepository`, `MsaGroupRepository`, `MsaAuthService`)만 추가해 게이트웨이(`:8080`)와 연결했다.
 
## D-014 4개 에이전트 협업 체계 및 Git Worktree 브랜치 격리 구조 도입
- **배경:** 단일 에이전트 개발 방식에서 탈피하여 1. Manager(전체 관리/조율), 2. Frontend(클라이언트 도메인/AR), 3. Backend(사수/시니어 멘토 역할), 4. QA(통합 검증) 4개 역할의 전문화된 멀티 에이전트 협업 체계로 전환.
- **결정:**
  1. 기존 `main` 브랜치는 직접 수정하지 않고 모든 커밋 히스토리를 100% 온전히 보존한다.
  2. `feature/frontend`와 `feature/backend` 브랜치를 생성하고 Git Worktree(`worktree_frontend`, `worktree_backend`)로 작업 디렉터리를 물리적으로 격리하여 파일 잠금 및 변경 간섭을 원천 방지한다.
  3. 백엔드 에이전트는 주니어(사용자)의 사수/멘토로서 아키텍처 의도와 실무 포인트를 명확히 설명하며 진행한다.
  4. 로컬 변경사항을 즉시 커밋 후 GitHub 원격 저장소(`origin`)에 푸시하여 실시간 투명성을 보장한다.
- **결과:** 독립적인 병렬 개발 환경 확보 및 충돌 없는 안정적인 형상 관리 달성.

