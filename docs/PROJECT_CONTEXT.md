# PROJECT_CONTEXT

> 새 세션을 시작하는 AI는 이 파일 → `docs/TASKS.md` → `docs/DECISIONS.md` 순서로 읽는다(`AGENTS.md` 규칙).
> 최종 갱신: 2026-11-09

## 1. 프로젝트 개요

- **서비스명:** Wish Stone (위시 스톤)
- **한 줄 소개:** 디지털 조약돌을 쌓으며 소원을 기록하고, 다른 사람의 소원을 익명으로 만나 "응원 🔥"하는 3D · AR 힐링 소원 커뮤니티 앱·웹
- **핵심 가치:** 익명성, 공감(좋아요 대신 응원), 축적(하나의 공동 돌탑), 평온함(선(Zen)의 정원 공간감 및 자연스러운 물리 손맛), 희망(이루어진 소원에 꽃/새싹/이끼가 피어남)
- **대상:** 10~40대(취준생, 직장인, 학생, 수험생 등)
- **현재 단계 (v2 Production Release 완료):**
  - 프로젝트 전체 `Wish Stone` 리브랜딩(`com.wishstone.*`) 및 표준 디렉토리 구조(`src/`, `backend/`, `docs/`, `scripts/`) 개편 완료.
  - **v2 핵심 고도화 완수**: 반경 28m 선(Zen)의 정원 지형 확장 & 6-DoF 자유 카메라(Pan/Zoom/Dolly/Focus Glide/돌탑 복귀 HUD), 무게중심(CoG) 편심비 기반 마이크로 워블(감쇠 진동) & 쿨롱 경사면 마찰 미끄러짐 물리 엔진, 구면 조화 자연 강자갈(River Pebble) 모델링 & 12종 천연 광물 팔레트 & `[ 🎲 다른 돌 찾아보기 ]` 랜덤 리롤 UI 구현 완료.
  - 클라이언트 전체 자동화 테스트 **495 / 495 PASS (100%)**, TypeScript 정적 타입 체크 **0 에러**, 백엔드 Spring Boot MSA 6개 서브프로젝트 **BUILD SUCCESSFUL** 및 `develop`·`main` 브랜치 배포 완료.

## 2. 폴더 구조 (2026-11-09 기준)

```text
wish_stone/                  # 로컬 상위 작업 폴더
└─ 위시 스톤/                # ★ Git 저장소 루트 (origin: https://github.com/GO-TE/wish-stone.git)
   ├─ README.md              # 프로젝트 메인 소개 및 실행 가이드
   ├─ AGENTS.md              # AI 에이전트 작업 규칙 (시작·종료 시 준수 사항)
   ├─ package.json           # Expo + R3F + Viro + WebXR 클라이언트 패키지 및 스크립트 설정
   ├─ tsconfig.json          # TypeScript 설정
   ├─ app.json               # Expo 앱 설정 (Wish Stone / wish-stone)
   ├─ docs/                  # 📘 프로젝트 관리 및 설계 문서
   │  ├─ PROJECT_CONTEXT.md  # 이 파일: 프로젝트 전체 맥락 요약
   │  ├─ TASKS.md            # 스프린트 진행 현황 및 495개 테스트 검증 내역
   │  ├─ DECISIONS.md        # 기술·기획 의사결정 기록 (ADR 형식, D-001 ~ D-026)
   │  ├─ TEST_READY.md       # v2 E2E 및 적대적 하드닝 검증 리포트
   │  ├─ TEST_INFRA.md       # 테스트 인프라 가이드
   │  └─ spec/               # 기획·설계 사양서
   │     ├─ PRD v1.0.md      # 제품 요구사항
   │     ├─ 요구 사항 정의서.md # 요구사항 30개 DB-001~030
   │     ├─ 기술 스택.md       # 스택 결정 (Expo + R3F + Spring Boot MSA + Kafka + Redis)
   │     ├─ 아키텍처 설계.md   # 헥사고날 클린 아키텍처 구조
   │     ├─ 데이터 모델.md     # MSA Database-per-Service (user_db, wish_db, interaction_db, group_db)
   │     ├─ API 명세서.md      # API-01~20 (Gateway REST) + 내부 Feign API + Kafka 이벤트
   │     ├─ 화면 설계서.md     # SCR-01~18 화면 흐름 및 와이어프레임
   │     └─ MSA.md           # MSA 학습 및 설계 기준 문서
   ├─ scripts/               # ⚙️ 서비스 실행 및 벤치마크 스크립트
   │  ├─ start-backend.cjs   # Spring Boot MSA 5개 서비스(:8080~:8084) 일괄 기동
   │  ├─ run-backend.ps1     # PowerShell 백엔드 실행 스크립트
   │  ├─ quickstart.bat      # 원클릭 실행 배치 파일
   │  └─ benchmarks/         # 물리 엔진 정밀 벤치마크 스위트
   ├─ src/                   # 📱 클라이언트 아키텍처 (TypeScript)
   │  ├─ app/                # expo-router 화면 라우트 (/home, /tower, /stack/stone, /stack/place 등)
   │  ├─ domain/             # 엔티티(Wish, Stone, Tower, Group), 값 객체, StabilityEvaluator(워블/슬립)
   │  ├─ application/        # 유스케이스(StackStone, CheerWish, FulfillWish, BrowseRandomWishes)
   │  ├─ infrastructure/     # MSA Gateway 어댑터(api/, auth/), AR 어댑터 3종(ar/), 물리(SimpleTowerPhysicsWorld)
   │  ├─ presentation/       # 컨트롤러(StackStoneController 등) 및 3D 컴포넌트(StoneTowerCanvas, pebbleGeometrySpec, cameraPresetSpec)
   │  ├─ __tests__/          # 단위·통합·E2E·Tier 5 적대적 테스트 스위트 (495/495 통과)
   │  └─ container.ts        # 의존성 주입(DI) 컨테이너 (createMsaAppContainer)
   └─ backend/               # ☁️ Spring Boot 3.3 (Java 21) MSA 백엔드 멀티모듈 (패키지 com.wishstone.*)
      ├─ docker-compose.yml  # MySQL 8.0 (4개 DB 분리) + Redis 7 + Apache Kafka (KRaft)
      ├─ sql/init-databases.sql # 4개 DB 스키마 초기화
      ├─ settings.gradle.kts / build.gradle.kts
      ├─ common-events/      # Kafka 공유 이벤트 Record (WishStoneEvents)
      ├─ gateway-service/    # Spring Cloud Gateway (:8080) 라우팅 및 JWT 보안 필터
      ├─ user-auth-service/  # 인증·닉네임#태그 서비스 (:8081)
      ├─ wish-tower-service/ # 소원·돌탑 서비스 (:8082, Feign + CircuitBreaker, Kafka 컨슈머)
      ├─ interaction-service/# 응원·신고 서비스 (:8083, Kafka 프로듀서)
      └─ group-service/      # 지인 그룹 서비스 (:8084)
```

## 3. 기술 스택 (확정)

| 영역 | 선택 |
| --- | --- |
| 앱·웹 | Expo(React Native) + expo-router + react-native-web, TypeScript |
| 3D / 물리 | React Three Fiber + Three.js + drei / cannon-es + 커스텀 PGS & CoG 마이크로 워블·슬립 솔버 |
| AR | 모바일: ViroReact(ARKit/ARCore) · 웹: WebXR(`@react-three/xr`) · 웹 미지원 환경: 카메라 + 3D 겹치기(간이 AR) |
| 백엔드 MSA | Spring Cloud Gateway(:8080) + Spring Boot 3.3 (Java 21) 4개 서비스(`user-auth` :8081, `wish-tower` :8082, `interaction` :8083, `group` :8084) |
| 통신·인프라 | 동기: OpenFeign + Resilience4j Circuit Breaker / 비동기: Apache Kafka / DB: MySQL 8.0 (서비스별 4개 DB 분리, 로컬 개발 시 H2 호환) + Redis |
| 인증 | Apple / Kakao / Google OAuth2 + 게스트 자동 세션 복구 + HMAC-SHA256 JWT (`user-auth-service` 발급) |

## 4. 핵심 도메인 및 3D·물리 규칙 (요약)

- **돌탑 3종:** 전체(`global`) / 카테고리(`cat:{code}`) / 그룹(`group:{uuid}`). 별도 테이블 없이 소원을 필터링해서 정의한다.
- **익명성:** 전체·카테고리 돌탑과 랜덤 소원 카드에서는 작성자를 절대 노출하지 않는다. `닉네임#태그`는 같은 그룹원에게만 보인다.
- **응원 및 공개 범위:** 텍스트 없이 카운트만 저장한다(1인 1회, 본인 소원 응원 불가). 정확한 응원 수는 작성자 본인만 보고, 타인에게는 0~3단계(`1/5/15` 기준 빛나는 정도)로만 보인다.
- **선의 정원 맵 & 6-DoF 자유 카메라:** 반경 28m 카레산스이 정원, 밤하늘 지수 안개(`fogExp2`), 24개 반딧불 파티클을 렌더링하며, 자유 패닝(반경 15m 원통 클램핑), 돌 클릭 시 0.5초 포커스 글라이드, 중심 이탈 시 `[ 🎯 돌탑으로 복귀 ]` HUD를 제공한다.
- **무게중심 마이크로 워블 & 경사면 슬립 물리:** 지지 다각형 편심비 $\eta$에 따라 안정($\eta < 0.40$), 긴장 워블($0.40 \le \eta \le 0.90$, 언더댐핑 감쇠 진동), 전복($\eta > 0.90$)을 판정하며, 접촉 경사각이 정지마찰각($\approx 26.6^\circ$) 초과 시 미끄러져 내려간다.
- **자연 강자갈(River Pebble) & 리롤:** 각진 폴리곤 없이 바닥이 평탄화된 부드러운 몽돌 지오메트리와 12종 천연 광물 색상을 사용하며, `[ 🎲 다른 돌 찾아보기 ]`로 언제든 새로운 돌을 뽑을 수 있다.

## 5. 문서 간 ID 규칙

- 요구사항 `DB-NNN` → 화면 `SCR-NN` → API `API-NN`이 `docs/spec/` 내 각 문서 표에서 서로를 참조한다.
- 결정 기록은 `docs/DECISIONS.md`의 `D-NNN`을 쓴다.
