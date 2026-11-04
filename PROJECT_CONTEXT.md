# PROJECT_CONTEXT

> 새 세션을 시작하는 AI는 이 파일 → `TASKS.md` → `DECISIONS.md` 순서로 읽는다(`AGENTS.md` 규칙).
> 최종 갱신: 2026-11-04

## 1. 프로젝트 개요

- **서비스명:** StoneWish (폴더명 "위시 스톤")
- **한 줄 소개:** 디지털 돌을 쌓으며 소원을 기록하고, 다른 사람의 소원을 익명으로 만나 "응원 🔥"하는 모바일·웹 앱
- **핵심 가치:** 익명성, 공감(좋아요 대신 응원), 축적(하나의 공동 돌탑), 희망(이루어진 소원에 꽃/새싹/이끼가 피어남)
- **대상:** 10~40대(취준생, 직장인, 학생, 수험생 등)
- **현재 단계:** **클라이언트 코어/MSA 어댑터 및 Spring Boot MSA 백엔드 골격 구현 단계.** (`src/` 클라이언트 도메인·유스케이스·AR·MSA 어댑터 및 `backend/` Spring Boot 멀티모듈·Docker Compose·4개 분리 DB 스키마 작성 완료)

## 2. 폴더 구조 (2026-11-04 기준)

```
wish_stone/                  # 로컬 작업 폴더 (Git 저장소 아님)
└─ 위시 스톤/                # ★ Git 저장소 루트 (origin: https://github.com/GO-TE/wish-stone.git, 브랜치 main)
   ├─ README.md
   ├─ AGENTS.md              # AI 작업 규칙 (시작·종료 시 할 일)
   ├─ PROJECT_CONTEXT.md     # 이 파일: 프로젝트 전체 맥락
   ├─ TASKS.md               # 진행 상황, 미해결 문제, 다음 작업
   ├─ DECISIONS.md           # 기술·기획 결정 기록 (ADR 형식, D-001~D-013)
   ├─ package.json           # Expo + R3F + Viro + WebXR 클라이언트 패키지 설정
   ├─ tsconfig.json          # TypeScript 설정
   ├─ app.json               # Expo 앱 설정
   ├─ dash_board/            # 대시보드 설계 문서
   │  ├─ PRD v1.0.md         # 제품 요구사항 (노션 연동)
   │  ├─ 요구 사항 정의서.md   # 요구사항 30개 DB-001~030 (노션 연동)
   │  ├─ 기술 스택.md          # 스택 결정 (Expo + R3F + Spring Boot MSA + Kafka + Redis)
   │  ├─ 아키텍처 설계.md      # 객체지향 클라이언트 구조 (계층, 포트/어댑터, 클래스 다이어그램)
   │  ├─ 데이터 모델.md        # MSA Database-per-Service (user_db, wish_db, interaction_db, group_db + Redis)
   │  ├─ API 명세서.md         # API-01~18 (Gateway REST) + 내부 Feign API + Kafka 이벤트 명세
   │  ├─ 화면 설계서.md        # SCR-01~18, 화면 흐름, 대시보드·AR 와이어프레임
   │  └─ MSA.md              # MSA 학습 및 설계 기준 문서
   ├─ src/                   # 클라이언트 아키텍처 (TypeScript)
   │  ├─ domain/             # 엔티티(Wish, Stone, Tower, Group), 값 객체(Pose, CheerLevel 등), 포트
   │  ├─ application/        # 유스케이스(StackStone, CheerWish, FulfillWish, BrowseRandomWishes)
   │  ├─ infrastructure/     # MSA Gateway 어댑터(api/, auth/), AR 어댑터 3종(ar/), 물리(physics/)
   │  ├─ presentation/       # 화면 컨트롤러(DashboardController) 및 컴포넌트
   │  ├─ __tests__/          # 도메인·유스케이스·AR·MSA 게이트웨이 단위 테스트 (node --test 6/6 통과)
   │  └─ container.ts        # 의존성 주입(DI) 컨테이너 (createMsaAppContainer)
   └─ backend/               # Spring Boot 3.x (Java 21) MSA 백엔드 멀티모듈
      ├─ docker-compose.yml  # MySQL 8.0 (4개 DB 분리) + Redis 7 + Apache Kafka (KRaft)
      ├─ sql/
      │  └─ init-databases.sql # user_db / wish_db / interaction_db / group_db 테이블 초기화
      ├─ settings.gradle.kts / build.gradle.kts
      ├─ common-events/      # Kafka 공유 이벤트 Record (WishCreated, WishCheered, WishReportThresholdReached)
      ├─ gateway-service/    # Spring Cloud Gateway (:8080) 라우팅 설정
      ├─ user-auth-service/  # 인증·닉네임 서비스 (:8081)
      ├─ wish-tower-service/ # 소원·돌탑 서비스 (:8082, UserAuthFeignClient + CircuitBreaker, Kafka 컨슈머)
      ├─ interaction-service/# 응원·신고 서비스 (:8083, CheerCommandService + Kafka 프로듀서)
      └─ group-service/      # 지인 그룹 서비스 (:8084)
```

> [!NOTE]
> - `.md` 파일 상단의 `notion-id` / `설계:` frontmatter는 노션 동기화용이다.
> - 커밋 메시지 규칙: `type: 한국어 제목` (feat, fix, docs, chore, refactor, test, style). 커밋은 `위시 스톤/` 안에서 한다.

## 3. 기술 스택 (확정)

| 영역 | 선택 |
| --- | --- |
| 앱·웹 | Expo(React Native) + expo-router + react-native-web, TypeScript |
| 3D / 물리 | React Three Fiber + drei / cannon-es |
| AR | 모바일: ViroReact(ARKit/ARCore) · 웹: WebXR(`@react-three/xr`) · 웹 미지원 환경: 카메라 + 3D 겹치기(간이 AR) |
| 백엔드 MSA | Spring Cloud Gateway(:8080) + Spring Boot 3.x (Java 21) 4개 서비스(`user-auth` :8081, `wish-tower` :8082, `interaction` :8083, `group` :8084) |
| 통신·인프라 | 동기: OpenFeign + Resilience4j Circuit Breaker / 비동기: Apache Kafka / DB: MySQL 8.0 (서비스별 4개 DB 분리) + Redis |
| 인증 | Apple / Kakao / Google OAuth2 + 게스트 토큰 + JWT (`user-auth-service` 발급) |
| 상태 관리 | Zustand + TanStack Query |

자세한 내용은 `dash_board/기술 스택.md`, 구조는 `dash_board/아키텍처 설계.md`에 있다.

## 4. 핵심 도메인 규칙 (요약)

- **돌탑 3종:** 전체(`global`) / 카테고리(`cat:{code}`) / 그룹(`group:{uuid}`). 별도 테이블 없이 소원을 필터링해서 정의한다.
- **익명성:** 전체·카테고리 돌탑과 랜덤 소원 카드에서는 작성자를 절대 노출하지 않는다. 닉네임(가입 시 필수)은 같은 그룹원에게만 보인다.
- **응원:** 텍스트 없이 카운트만 저장한다. 한 소원에 1인 1회, 자기 소원은 응원할 수 없다. 응원할 때 쌓이는 돌은 연출로만 보여주고 DB에 저장하지 않는다.
- **응원 수 공개:** 정확한 수는 작성자 본인만 본다. 다른 사람에게는 0~3단계(돌이 빛나는 정도)로만 보인다.
- **이루어짐:** 꽃/새싹/이끼 중 랜덤이 기본이고, 사용자가 고를 수도 있다.
- **돌 위치(pose):** 물리는 쌓는 순간에만 쓰고 최종 위치를 저장한다. 모든 환경에서 같은 pose로 렌더링한다.
- **AR 쌓기 실패:** 3번 떨어지면 자동으로 꼭대기에 올린다.

## 5. 문서 간 ID 규칙

- 요구사항 `DB-NNN` → 화면 `SCR-NN` → API `API-NN`이 각 문서 표에서 서로를 참조한다.
- 결정 기록은 `DECISIONS.md`의 `D-NNN`을 쓴다.

