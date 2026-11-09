# Wish Stone (위시 스톤) 프로젝트 태스크 현황

> 최종 갱신: 2026-11-09

## 1. 완료된 작업 (Sprint 1 ~ 11 All Complete ✅)

- [x] **Sprint 1: 기반 아키텍처 및 멀티 에이전트 워크트리 구축**
  - Git Worktree 분리 및 `main` 베이스라인 보존
  - Docker Compose 인프라 (MySQL 8.0 4개 DB 분리, Redis 7, Apache Kafka KRaft)
  - 헥사고날 클린 아키텍처 도메인 엔티티 & 포트 인터페이스 정의
- [x] **Sprint 2: 핵심 비즈니스 로직 & 화면 구현**
  - Backend: `gateway-service` 헤더 위조 방어 필터, `user-auth-service` 배틀태그(`닉네임#태그`), `wish-tower-service` 자동 카테고리 분류 및 일일 쿼터, `interaction-service` 응원(1/5/15) 및 신고, `group-service` 8자리 초대코드 그룹
  - Frontend: SCR-01 ~ SCR-09, SCR-12 ~ SCR-16 화면 라우트 및 컨트롤러 (3중 AR 세션 팩토리, 물리 엔진)
- [x] **Sprint 3: 부가 화면 & QA 계약 정합성 전수 감사**
  - Frontend: SCR-10 ~ SCR-11 (랜덤 소원 둘러보기, 응원, 신고 모달), SCR-17 ~ SCR-18 (설정, 계정 연동, 탈퇴)
  - QA 계약 감사 패치: M-01 ~ M-08, N-01 ~ N-09 (Pose JSON 직렬화, 소문자 status, 태그 자동발급, 그룹 서킷브레이커 fail-closed 403)
- [x] **Sprint 4: 보안 서명 JWT & MSA 애플리케이션 기동 부트스트랩**
  - Backend: HMAC-SHA256 암호화 서명·만료 검증 JWT(N-05), 5개 마이크로서비스 `@SpringBootApplication` 메인 클래스 및 `@SpringBootTest` 스모크 테스트 통과(N-07)
  - Frontend: Composition Root DI 컨테이너 (`container.ts`) 및 14개 E2E 통합 유저 여정 테스트(`e2e-user-journey.test.ts`)
- [x] **Sprint 5: 3D 돌탑 캔버스 & Database-per-Service JPA 영속성 계층**
  - Frontend: Three.js 3D 돌탑 절차적 지오메트리 & 매트 셰이더(`StoneTowerCanvas`), 2차 베지어 곡선 응원 반딧불 파티클(`CheerSparkEffect`)
  - Backend: MySQL 8.0 4개 DB 스키마 1:1 매핑 Spring Data JPA Entity & Repository 구현
- [x] **Sprint 6: 감성 토스트 & 낙관적 UI & 내부 Feign/카테고리 조회**
  - Frontend: 감성 토스트 알림 시스템, 응원/돌올리기 즉시 화면 반영 및 실패 시 롤백(`OptimisticMutationManager`)
  - Backend: 카테고리 DB 조회(API-16 `GET /api/v1/categories`) 및 내부 마이크로서비스 요약 조회 Feign IPC 엔드포인트
- [x] **Sprint 7: 3D 강체 물리 엔진(cannon-es) & 동적 전복/비산 붕괴 & Git 브랜치 전략 수립**
  - Frontend/Physics: `SimpleTowerPhysicsWorld.ts`, `StabilityEvaluator.ts` (Andrew's Monotone Chain 2D 볼록 껍질 지지 다각형), 60Hz LERP/SLERP Three.js 궤적 보간
  - Git/Governance: `main` 직접 푸시 금지, `develop` 및 `feature/*` 브랜치 전략 명문화 (`D-021`)
- [x] **Sprint 8: 돌 겹침 방지 비간섭 기하 정합성 & 굴러떨어진 돌 안착 UX (`D-022`)**
  - Zero Overlap 2D/3D: 음수 마진 제거, 3D 기초단(-0.34m, +0.34m) 완전 비간섭 tangent contact 구현
  - Fallen Stone Choice UX: 미끄러져 떨어진 돌에 대해 `[이 자리에 그대로 두기]` vs `[다시 올려보기]` 선택지 제공 및 바닥 안착 영속화
- [x] **Sprint 9: 카메라 아지무스 기준 3D 드래그 투영, 클러스터 호버 디바운싱, 세션 영속화 & 프로젝트 리브랜딩 (`D-023`)**
  - 180° 회전 시에도 카메라 시점 기준으로 직관적으로 움직이는 3D 드래그 좌표계 투영 및 호버 채터링 방지
  - 프로젝트 전체 `Wish Stone (위시 스톤)` 리브랜딩(`com.wishstone.*`), 로컬스토리지 세션 자동 복구(`wishstone_*`), 표준 디렉토리 구조(`src/`, `backend/`, `docs/`, `scripts/`) 정돈
  - 중심에서 벗어났을 때 위협적인 빨간 경고 대신 평화로운 자유 배치를 유도하는 젠(Zen) UX 적용
- [x] **Sprint 10: 선(Zen)의 정원 맵 확장(R=28m) & 6-DoF 자유 카메라 탐험 (`D-024`)**
  - 반경 28m 선의 정원 지형, 9개 카레산스이 모래 물결 링, 6개 자연 디딤돌, 밤하늘 지수 안개(`fogExp2`), 24개 인스턴스드 반딧불 파티클 구현
  - OrbitControls 자유 패닝(Pan)·줌(1.2m~24.0m), 반경 15m 실린더 안전 경계 클램핑, 돌 클릭 시 0.5초 포커스 글라이드, `[ 🎯 돌탑으로 복귀 ]` 플로팅 HUD 구현
  - 쌓기 화면(`/stack/place`)에서 돌 드래그 조작과 카메라 시점 이동 간 상호 배타적 포인터 락 분리
- [x] **Sprint 11: 무게중심 마이크로 워블·경사면 슬립 물리 고도화 (`D-025`) & 강자갈(River Pebble) 정제·리롤 UI (`D-026`)**
  - 볼록 껍질 지지면 편심비($\eta$) 기반 3대 물리 안정성 존(안정 $\eta < 0.40$, 긴장 워블 $0.40 \le \eta \le 0.90$, 전복 $\eta > 0.90$) 및 언더댐핑 감쇠 조화 진동($\theta(t) = \theta_0 e^{-\zeta \omega_n t}\cos(\omega_d t)$) 구현
  - 임계 정지마찰각($\approx 26.6^\circ$) 초과 시 쿨롱 마찰 경사면 미끄러짐(Friction Slip) 궤적 통합
  - 각진 다면체 제거 및 구면 조화 기반 자연 강자갈(`pebbleGeometrySpec.ts`, 하단 평탄화 + Smooth Normals) 및 12종 천연 광물 팔레트 구축
  - 돌 선택(`/stack/stone`) 및 쌓기(`/stack/place`) 화면에 `[ 🎲 다른 돌 찾아보기 ]` 랜덤 리롤 UI 및 `StackStoneController.rerollStone()` 통합

---

## 2. 테스트 검증 완료 상태

- **Frontend (`npm test`)**: **495 / 495 tests 100% PASS (0 fail, 0 skip)**
  - 도메인·유스케이스·컨트롤러·캔버스 단위/통합 테스트: 410개 PASS
  - v2 신규 기능 Opaque-box E2E 테스트 (`e2e-v2-features.test.ts`): 41개 PASS
  - Tier 5 적대적 화이트박스 스트레스 테스트 (`tier5-adversarial-physics-pebble.test.ts` 외): 44개 PASS
- **TypeScript 정적 검사 (`npm run typecheck`)**: **0 Diagnostic Errors**
- **Backend (`gradle test` & `bootJar`)**: **6개 서브프로젝트 전원 BUILD SUCCESSFUL (100% PASS)**

---

## 3. 향후 로드맵 (v3 백로그 — 보류 항목)

- [ ] **v3 Pillar 1 (스페이셜 오픈필드 바이옴 월드)**: 산사(`sansatemple.com`) 벤치마킹 기반 다중 소원 성소(솔바람 돌탑 둔덕, 달빛 연못, 은하수 천문 언덕, 고목 소원 나무) 공간 확장
- [ ] **v3 Pillar 2 (멀티 리추얼 인터랙션)**: 돌 쌓기 외에 연못에 동전 던지기(탄도학 & 수면 파문 셰이더), 밤하늘에 별똥별 쏘아 올리기, 풍등 띄우기 등 소원 의식 다변화
