# StoneWish (위시 스톤) 프로젝트 태스크 현황

## 1. 완료된 작업 (Sprint 1 ~ 6 All Complete ✅)

- [x] **Sprint 1: 기반 아키텍처 및 멀티 에이전트 워크트리 구축**
  - Git Worktree 분리 (worktree_frontend, worktree_backend), main 베이스라인 보존
  - Docker Compose 인프라 (MySQL 8.0 4개 DB 분리, Redis 7, Apache Kafka KRaft)
  - 헥사고날 클린 아키텍처 도메인 엔티티 & 포트 인터페이스 정의
- [x] **Sprint 2: 핵심 비즈니스 로직 & 화면 구현**
  - Backend: gateway-service 헤더 위조 방어 필터, user-auth-service 배틀태그(닉네임#태그), wish-tower-service 자동 카테고리 분류 및 일일 쿼터, interaction-service 응원(1/5/15) 및 신고, group-service 8자리 초대코드 그룹
  - Frontend: SCR-01 ~ SCR-09, SCR-12 ~ SCR-16 화면 라우트 및 컨트롤러 (3중 AR 세션 팩토리, 물리 엔진)
- [x] **Sprint 3: 부가 화면 & QA 계약 정합성 전수 감사**
  - Frontend: SCR-10 ~ SCR-11 (랜덤 소원 둘러보기, 응원, 신고 모달), SCR-17 ~ SCR-18 (설정, 계정 연동, 탈퇴)
  - QA 계약 감사 패치: M-01 ~ M-08, N-01 ~ N-09 (Pose JSON 직렬화, 소문자 status, 태그 자동발급, 그룹 서킷브레이커 fail-closed 403)
- [x] **Sprint 4: 보안 서명 JWT & MSA 애플리케이션 기동 부트스트랩**
  - Backend: HMAC-SHA256 암호화 서명·만료 검증 JWT(N-05), 5개 마이크로서비스 @SpringBootApplication 메인 클래스 및 @SpringBootTest 스모크 테스트 통과(N-07)
  - Frontend: Composition Root DI 컨테이너 (AppContainer.ts) 및 14개 E2E 통합 유저 여정 테스트(e2e-user-journey.test.ts)
- [x] **Sprint 5: 3D 돌탑 캔버스 & Database-per-Service JPA 영속성 계층**
  - Frontend: Three.js 3D 돌탑 절차적 지오메트리 & 거친 돌 매트 셰이더(StoneTowerCanvas), 2차 베지어 곡선 응원 반딧불 파티클(CheerSparkEffect)
  - Backend: MySQL 8.0 4개 DB 스키마 1:1 매핑 Spring Data JPA Entity & Repository 구현
- [x] **Sprint 6: 감성 토스트 & 낙관적 UI & 내부 Feign/카테고리 조회**
  - Frontend: 감성 토스트 알림 시스템(StoneWishToast), 응원/돌올리기 즉시 화면 반영 및 실패 시 롤백(OptimisticMutationManager)
  - Backend: 카테고리 DB 조회(API-16 GET /api/v1/categories) 및 내부 마이크로서비스 요약 조회 Feign IPC 엔드포인트

---

## 2. 테스트 검증 완료 상태
- **Frontend (
pm test)**: **18 / 18 suites 100% PASS**
  - domain-and-ar.test.ts: PASS
  - rontend-controllers.test.ts: PASS
  - e2e-user-journey.test.ts: PASS
  - canvas-components.test.ts: PASS
  - optimistic-and-toast.test.ts: PASS
- **Backend (gradle test)**: **6개 서브프로젝트 전원 BUILD SUCCESSFUL (100% PASS)**
  - gateway-service: 라우팅 및 JWT 보안 필터 스모크/단위 테스트
  - user-auth-service: 서명 JWT 발급/검증, 배틀태그 복합 유니크 JPA 테스트
  - wish-tower-service: 소원/돌탑/쿼터 JPA 영속화, 카테고리 조회, 그룹 Feign 서킷브레이커 테스트
  - interaction-service: 응원 1/5/15 상승 판정, 중복/본인 응원 차단, 신고 5회 Kafka 이벤트 발행 JPA 테스트
  - group-service: 그룹 생성/초대코드 참여/정원 초과 방어 JPA 테스트
