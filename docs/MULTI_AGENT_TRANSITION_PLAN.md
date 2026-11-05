# StoneWish(위시 스톤) 멀티 에이전트 전환 계획서
## (Zero-Loss Migration & Multi-Agent Transition Plan)

- **문서 버전:** v1.0
- **작성 일자:** 2026-11-04
- **대상 프로젝트:** StoneWish (위시 스톤)
- **저장소 위치:** `c:\Users\sybon\Desktop\workspace\code\wish_stone\위시 스톤`
- **상위 작업 공간:** `c:\Users\sybon\Desktop\workspace\code\wish_stone`
- **관리 주체:** Multi-Agent Engineering Group (Manager, Frontend, Backend/사수, QA)

---

## 1. 개요 및 전환 목적

StoneWish("위시 스톤") 프로젝트는 익명성을 기반으로 사용자들이 3D 및 AR 환경에서 소원 돌탑을 쌓고 서로의 소원을 따뜻하게 응원하는 모바일/웹 크로스 플랫폼 서비스입니다.

본 문서는 단일 개발자 체제로 진행되던 기존 프로젝트를 **4개 전문 에이전트(Manager, Frontend, Backend/시니어 사수, QA)** 가 협업하는 체제로 안전하게 전환하기 위한 공식 실행 계획서입니다.

### 전환 3대 핵심 원칙
1. **기존 자산 100% 무손실 보존 (Zero-Loss Preservation):**
   - 현재 `main` 브랜치의 모든 11개 커밋 히스토리, 설계 문서(`dash_board/`), 아키텍처 결정 기록(`DECISIONS.md`), 프론트엔드 도메인·AR 코드(`src/`), 백엔드 MSA 인프라 코드(`backend/`)를 단 한 줄의 유실이나 초기화 없이 그대로 보존합니다.
2. **명확한 격리 및 책임 분리 (Separation of Concerns & Isolation):**
   - Git Worktree 및 독립 브랜치(`feature/frontend`, `feature/backend`)를 운용하여 에이전트 간 코드 충돌과 파일 잠금(Lock)을 방지합니다.
3. **학습 및 멘토링 중심 백엔드 고도화 (Senior Mentorship):**
   - 사용자가 목표로 하는 Spring Boot MSA, Apache Kafka, OpenFeign, Resilience4j, Database-per-Service 실무 아키텍처를 체득할 수 있도록 백엔드 에이전트가 시니어 멘토(사수)로서 가이드와 개발을 병행합니다.

---

## 2. 프로젝트 환경 및 현황 분석

### 2.1 디렉터리 및 워크스페이스 토폴로지

프로젝트의 전체 물리 구조는 상위 작업 공간(`wish_stone`)과 Git 저장소 루트(`위시 스톤`)로 엄격히 구분됩니다.

```
c:\Users\sybon\Desktop\workspace\code\wish_stone\
├── .agents/
│   └── teamwork/                      # 에이전트 협업 메타데이터 (Git 관리 외)
│       ├── BRIEFING.md
│       ├── ORIGINAL_REQUEST.md
│       ├── PROJECT.md
│       ├── orchestrator/
│       ├── explorer_survey_1/
│       ├── explorer_survey_2/
│       ├── explorer_survey_3/
│       └── worker_m1/
│
└── 위시 스톤/                         # [Git 저장소 루트 (origin/main)]
    ├── .git/                          # Git 메타데이터 (HEAD: ceccc10)
    ├── AGENTS.md                      # 에이전트 기본 작업 수칙 (Conventional Commits 등)
    ├── PROJECT_CONTEXT.md             # 프로젝트 개요 및 아키텍처 컨텍스트
    ├── TASKS.md                       # 구현 진행 현황 및 태스크 백로그
    ├── DECISIONS.md                   # 아키텍처 결정 기록 (ADR D-001 ~ D-013)
    ├── README.md                      # 저장소 기본 안내문
    ├── package.json                   # 프론트엔드 의존성 및 스크립트 정의
    ├── tsconfig.json                  # TypeScript 설정 (Bundler 해상도, @/* 경로 별칭)
    ├── app.json                       # Expo 애플리케이션 설정
    │
    ├── dash_board/                    # 8종 상세 설계 사양서
    │   ├── PRD v1.0.md                # 제품 요구사항 정의서
    │   ├── 요구 사항 정의서.md       # 기능/비기능 요구사항 (DB-001 ~ DB-030)
    │   ├── 화면 설계서.md             # 화면별 UI/인터랙션 명세 (SCR-01 ~ SCR-18)
    │   ├── 기술 스택.md               # 전사 기술 스택 및 라이브러리 버전
    │   ├── 아키텍처 설계.md           # 클라이언트 계층형 아키텍처 및 AR 인터페이스
    │   ├── 데이터 모델.md             # 물리 DB 스키마 및 Redis 키 설계
    │   ├── API 명세서.md              # REST 엔드포인트 명세 (API-01 ~ API-18)
    │   └── MSA.md                     # Spring Boot MSA 상세 아키텍처 가이드
    │
    ├── src/                           # 프론트엔드 TypeScript 소스 코드
    │   ├── domain/                    # 핵심 비즈니스 엔티티 및 Value Objects, Ports
    │   ├── application/               # 유스케이스 (Browse, Cheer, Fulfill, Stack)
    │   ├── infrastructure/            # MSA 게이트웨이 어댑터, 3중 AR 어댑터, 물리엔진
    │   ├── presentation/              # 대시보드 MVC 컨트롤러
    │   ├── container.ts               # 의존성 주입(DI) 컨테이너
    │   └── __tests__/                 # 단위 테스트 (domain-and-ar.test.ts: 6/6 통과)
    │
    ├── backend/                       # 백엔드 Spring Boot MSA 프로젝트
    │   ├── build.gradle.kts           # 멀티모듈 루트 빌드 스크립트 (Spring Boot 3.3.5)
    │   ├── settings.gradle.kts        # 루트 프로젝트명 및 서브모듈 인클루드 정의
    │   ├── docker-compose.yml         # 로컬 인프라 (MySQL 8.0 4개 DB, Redis 7, Kafka KRaft)
    │   ├── sql/
    │   │   └── init-databases.sql     # 4개 전용 DB 생성 및 테이블 DDL 스크립트
    │   ├── common-events/             # 공통 Kafka 이벤트 Record 클래스 (StoneWishEvents.java)
    │   ├── gateway-service/           # Spring Cloud Gateway 라우팅 및 보안 설정 (:8080)
    │   ├── interaction-service/       # 응원/신고 비즈니스 로직 및 Kafka 프로듀서 (:8083)
    │   └── wish-tower-service/        # 소원/돌탑 Feign 클라이언트 및 Kafka 컨슈머 (:8082)
    │
    └── test/                          # 루트 빈 디렉터리 (활성 테스트는 src/__tests__에 위치)
```

### 2.2 기술 스택 현황

| 도메인 | 기술 및 라이브러리 | 버전 | 담당 역할 및 특이사항 |
|---|---|---|---|
| **Frontend Framework** | Expo, React Native, react-native-web | Expo ~52.0.0, RN 0.76.3 | 단일 TS 코드베이스로 iOS, Android, Web 동시 지원 (D-002) |
| **3D & AR** | Three.js, React Three Fiber, Cannon-es, ViroReact, WebXR | Three ^0.169.0, R3F ^8.17.10, cannon-es ^0.20.0 | 3-way AR 어댑터 (Native Viro / WebXR / CameraOverlay 간이 AR) (D-003) |
| **State & Query** | Zustand, TanStack React Query | Zustand ^5.0.1, Query ^5.59.0 | 클라이언트 상태 및 서버 비동기 캐싱 분리 |
| **Language & Test** | TypeScript, Node.js Test Runner | TS ^5.6.3, Node v24.22.1 | `node --test src/__tests__/domain-and-ar.test.ts` 네이티브 6개 테스트 통과 |
| **Backend Framework** | Spring Boot, Spring Cloud | Spring Boot 3.3.5, Cloud 2023.0.3 | 멀티모듈 MSA 아키텍처 (D-013) |
| **Target Runtime** | Java OpenJDK | Java 21 (환경 내 Java 25 호환) | Spring Boot 3.3.5 기준 Java 21 바이트코드 호환 |
| **API Gateway** | Spring Cloud Gateway | 2023.0.3 | 포트 `8080`. JWT 검증, 헤더 주입, CORS, 서비스 라우팅 |
| **Service Inter-comm** | Spring Cloud OpenFeign + Resilience4j | 2023.0.3, Resilience4j 2.2.0 | 동기 호출 및 서킷 브레이커 장애 격리 (FallbackNicknames) |
| **Event Streaming** | Apache Kafka (KRaft 모드) | Kafka 3.8.0 (컨테이너) | 비동기 이벤트 스트리밍 (`interaction.events`, `wish.events`), 멱등성 보장 |
| **Database** | MySQL (Database-per-Service) | MySQL 8.0 (컨테이너) | 4개 DB 분리 (`user_db`, `wish_db`, `interaction_db`, `group_db`), Cross-DB FK 원천 배제 |
| **In-Memory Cache** | Redis | Redis 7 (컨테이너) | O(1) 랜덤 소원 풀링 (`wish:random:pool`), 돌탑 통계 해시 (`tower:stats:*`), Rate Limiting |

### 2.3 기존 인수인계 문서 및 설계 문서 분석

1. **`AGENTS.md`**:
   - 커밋 메시지 규칙: Conventional Commits 준수 (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `style:`).
   - 작업 전후 무결성 검증, 불필요한 리팩토링 금지 원칙.
2. **`PROJECT_CONTEXT.md`**:
   - 아키텍처 핵심 요약, D-013(MSA 전환) 반영, 계층 구조 및 도메인 규칙 명시.
3. **`TASKS.md`**:
   - **완료 영역:** 클라이언트 도메인/유스케이스/AR어댑터/MSA어댑터 구현, 백엔드 멀티모듈 스켈레톤 및 Docker/SQL 작성.
   - **대기/진행 중 영역:** `user-auth-service` 및 `group-service` 디렉터리 스캐폴딩 및 JPA 엔티티·컨트롤러 구현, 프론트엔드 UI 화면 컴포넌트 연동, Docker Compose 로컬 검증.
   - **사용자 협의 필요 미결정 항목 (3장):** 게스트 그룹 생성/참여 허용 여부, 닉네임 유일성, 소원 금칙어/글자수, 신고 자동 숨김 임계치(5회), 그룹 최대인원(50명), 응원 단계 구간, 소원 삭제 시 3D 모델 표시 정책, AR 워터마크 표시 여부, 일일 등록 한도(10회).
4. **`DECISIONS.md`**:
   - D-001 (아키텍처 계층 구조), D-002 (Expo + RN Web 단일 코드베이스), D-003 (3중 AR 세션 추상화), D-004 (초기 Supabase 도입), D-005 (데이터 경량화 - 응원 텍스트 미저장), D-006 (익명성 정책), D-011 (DIP 계층 분리), D-012 (커밋 세분화), **D-013 (Spring Boot MSA 전면 전환)**.
5. **`dash_board/` 8종 사양서**:
   - PRD부터 30개 기능/비기능 요구사항(DB-001~030), 18개 화면(SCR-01~18), 18개 REST API(API-01~18), Kafka 이벤트 스펙까지 시스템 전반의 명세가 완전하게 정의되어 있음.

---

## 3. 멀티 에이전트 환경 기능 및 제약 조건 분석

### 3.1 Windows OS 환경 제약 및 대응 방안

| 환경 제약 요소 | 상세 설명 및 잠재 위험 | 완화 및 대응 전략 |
|---|---|---|
| **NTFS 파일 잠금 (File Locking)** | Gradle 데몬 프로세스, Metro Bundler, Node.js 프로세스가 파일 핸들을 물고 있을 경우 디렉터리 삭제 또는 브랜치 전환 시 `EBUSY`, `EPERM` 발생 | 1. 빌드/검증 완료 후 백그라운드 프로세스 즉시 정리 (`gradle --stop`).<br>2. Worktree 디렉터리 삭제 필요 시 데몬 종료 확인 후 수행. |
| **한글/공백 경로 인코딩** | 프로젝트 경로 `.../wish_stone/위시 스톤/`에 한글과 공백이 포함되어 있어 쉘에 따라 CP949 인코딩 왜곡 가능성 존재 | 1. Git 명령 시 UTF-8 인용 부호(`"..."`) 필수 사용.<br>2. Worktree는 상위 `wish_stone` 하위에 영문 디렉터리(`worktree_frontend`, `worktree_backend`)로 생성하여 도구 체인 오류 원천 차단. |
| **Windows MAX_PATH (260자)** | 심층 디렉터리 및 `node_modules` 중첩 시 260자 경로 초과 가능성 | 상위 디렉터리 직하에 간결한 명칭으로 Worktree를 배치하여 경로 깊이 최소화. |
| **심볼릭 링크 권한** | Windows는 관리자 권한/개발자 모드 없이 symlink 생성이 제한됨 (`core.symlinks=false`) | 의존성 공유에 심볼릭 링크를 사용하지 않고, 각 작업 공간에서 독립적인 물리 파일 격리 적용. |

### 3.2 런타임 및 도구 체인 현황

1. **Git 버전:** `git version 2.56.0.windows.2` — Worktree, sparse-checkout 등 최신 Git 협업 기능 완벽 지원.
2. **Node.js:** `v24.22.1` — `node --test` 내장 테스트 러너를 통해 외부 의존성(Jest 등) 설치 없이도 6개 단위 테스트 150ms 내 고속 실행 확인.
3. **Java:** OpenJDK 25.0.4.1 Temurin LTS (`C:\Users\sybon\.vscode\extensions\redhat.java-1.58.0-win32-x64\jre\25.0.4.1-win32-x86_64`) 탐색 완료.
4. **Gradle:** Gradle 9.8.1 (`C:\Users\sybon\.gradle\wrapper\dists\gradle-9.8.1-bin\a2l6ltp3k1vth6lwipzm5p2jp\gradle-9.8.1\bin\gradle.bat`) 탐색 완료.
5. **백엔드 빌드 시 주의사항:**
   - `backend/settings.gradle.kts`에 `user-auth-service`, `group-service`가 선언되어 있으나 물리 폴더가 미생성 상태이므로 Gradle 9.x 설정 단계 에러 발생.
   - Backend Agent 투입 시 첫 단계로 해당 모듈 디렉터리 스캐폴딩 및 `gradle wrapper` 생성 작업이 요구됨.

### 3.3 Git Worktree 실측 검증 결과 및 격리 전략

Windows 한글 경로 환경에서 Git Worktree의 실제 동작성을 사전에 검증하였습니다:
- **실측 검증:** `git worktree add --detach "..\test_worktree_korean_한글테스트" HEAD` 실행 결과 오류 없이 성공(Exit Code 0)하였으며, `git worktree remove`로 잔여물 없이 청정 정리됨을 실증함.
- **배치 아키텍처:**
  ```
  c:\Users\sybon\Desktop\workspace\code\wish_stone\
  ├── 위시 스톤/                 # 메인 저장소 (main 브랜치, HEAD: ceccc10 유지)
  ├── worktree_frontend/         # Frontend Agent 작업 디렉터리 (feature/frontend 브랜치)
  └── worktree_backend/          # Backend Agent 작업 디렉터리 (feature/backend 브랜치)
  ```
- **격리 폴백(Fallback) 모드:**
  - 만약 사용자 PC의 디스크 용량 제약이나 백그라운드 프로세스 파일 잠금으로 Worktree 운용이 어려울 경우, 단일 저장소(`위시 스톤`) 내에서 Manager의 스케줄링 하에 브랜치를 순차 전환(`git switch feature/frontend` ↔ `git switch feature/backend`)하는 폴백 프로토콜을 즉시 가동합니다.

---

## 4. 100% 무손실 보존 전략 (Zero-Loss Migration Strategy)

### 4.1 기존 커밋 히스토리 전수 감사 (11 Commits Baseline)

현재 `main` 브랜치에 기록된 11개의 모든 커밋은 손실이나 덮어쓰기 없이 100% 보존됩니다.

```
ceccc10 (HEAD -> main, origin/main) docs: MSA 전환 결정(D-013) 기록 및 단위별 커밋 원칙 반영
d543675 test: 클라이언트 설정 파일 및 도메인·AR·MSA 어댑터 단위 테스트 추가
a88fcbe feat: Spring Boot MSA 백엔드 멀티모듈 및 Docker/DB 분리 인프라 구축
a6143e3 feat: Spring Cloud Gateway 연동 어댑터 및 대시보드 컨트롤러 구현
8ccd121 feat: 클라이언트 도메인 계층, 유스케이스 및 AR 3중 어댑터 구현
2bd4b9a docs: 백엔드 아키텍처를 Spring Boot MSA 구조로 전환
e16fdbb docs: 프로젝트 컨텍스트, 작업 진행 상황, 기술 결정 기록 문서 추가
748f1bc docs: 대시보드 설계 문서 보완 및 객체지향 아키텍처 설계서 추가
87ea07b chore: agent 환경 구성 폴더명 변경 : 대시보드 -> dash_board
e38d379 (origin/master) docs: 프로젝트 문서 작성
286a358 Initial commit
```

### 4.2 커밋 상세 내역 및 보존 가치 매트릭스

| 번호 | 커밋 해시 (Short) | 커밋 메시지 | 핵심 자산 및 보존 이유 |
|---|---|---|---|
| 11 | `ceccc10` | docs: MSA 전환 결정(D-013) 기록 및 단위별 커밋 원칙 반영 | 최신 작업 기준점. `DECISIONS.md` D-013 아키텍처 의사결정의 공식 소스 |
| 10 | `d543675` | test: 클라이언트 설정 파일 및 도메인·AR·MSA 어댑터 단위 테스트 추가 | 6개 단위 테스트 스위트. 향후 프론트엔드 작업 시 무결성을 담보하는 핵심 잣대 |
| 9 | `a88fcbe` | feat: Spring Boot MSA 백엔드 멀티모듈 및 Docker/DB 분리 인프라 구축 | Docker Compose 인프라, 4개 DB DDL 스크립트, Kafka 이벤트 레코드, 게이트웨이 라우팅 |
| 8 | `a6143e3` | feat: Spring Cloud Gateway 연동 어댑터 및 대시보드 컨트롤러 구현 | Gateway 통신용 `MsaHttpClient`, 저장소 어댑터 4종, 대시보드 MVC 컨트롤러 |
| 7 | `8ccd121` | feat: 클라이언트 도메인 계층, 유스케이스 및 AR 3중 어댑터 구현 | 객체지향 도메인 엔티티 4종, 핵심 유스케이스 4종, 3-tier AR 세션 추상화 계층 |
| 6 | `2bd4b9a` | docs: 백엔드 아키텍처를 Spring Boot MSA 구조로 전환 | `dash_board/` 8종 설계서의 MSA 전면 개편 내용 |
| 5 | `e16fdbb` | docs: 프로젝트 컨텍스트, 작업 진행 상황, 기술 결정 기록 문서 추가 | 초기 아키텍처 결정 기록(D-001~D-012) 및 프로젝트 컨텍스트 수립 |
| 4 | `748f1bc` | docs: 대시보드 설계 문서 보완 및 객체지향 아키텍처 설계서 추가 | 객체지향 계층 분리 및 포트/어댑터 패턴 명세 |
| 3 | `87ea07b` | chore: agent 환경 구성 폴더명 변경 : 대시보드 -> dash_board | 폴더명 정규화 및 `AGENTS.md` 운영 수칙 수립 |
| 2 | `e38d379` | docs: 프로젝트 문서 작성 | 초기 PRD 및 요구사항 정의서 |
| 1 | `286a358` | Initial commit | 저장소 초기화 커밋 (`README.md`) |

### 4.3 `main` 브랜치 불변 정책 및 브랜치 경계

1. **`main` 브랜치 직접 수정 금지:**
   - 어떠한 에이전트도 `main` 브랜치에 직접 커밋하거나 푸시할 수 없습니다.
   - `main` 브랜치는 오직 QA 검증을 통과한 PR에 대해 Manager Agent가 머지하는 용도로만 사용됩니다.
2. **명확한 브랜치 경계:**
   - **`feature/frontend`**: `src/`, `package.json`, `tsconfig.json`, `app.json` 영역의 화면 컴포넌트, 훅, 뷰 개발 전담.
   - **`feature/backend`**: `backend/`, `docker-compose.yml`, `sql/` 영역의 Spring Boot 마이크로서비스, JPA, Kafka, Gateway 개발 전담.
3. **히스토리 재작성(Force Push / Rebase) 금지:**
   - 모든 병합은 이전 기록을 온전히 보존하는 명시적 머지 커밋(Merge Commit) 방식으로 수행합니다.

---

## 5. 단계별 전환 로드맵 (Phased Transition Roadmap)

```
[Phase 1: 전환 계획 및 문서화 (현재 단계 - M1)]
  - 환경 분석, 100% 무손실 계획 수립 (MULTI_AGENT_TRANSITION_PLAN.md)
  - 4개 에이전트 협업 지침 및 프로토콜 제정 (AGENT_COLLABORATION_GUIDELINES.md)
  - 시니어 멘토 백엔드 아키텍처 가이드 작성 (BACKEND_SENIOR_MENTOR_GUIDE.md)
                      │
                      ▼
[Phase 2: Git 브랜치 및 작업 격리 환경 구성 (M2)]
  - main 브랜치 기준으로 feature/frontend, feature/backend 브랜치 분기
  - Git Worktree 생성 (worktree_frontend, worktree_backend)
  - .gitignore 표준안 적용 (공통 파일 관리 절차 준수)
                      │
                      ▼
[Phase 3: 병렬 개발 스프린트 (M3)]
  - Frontend Agent: SCR-04 대시보드, 3D 돌탑 렌더링, AR 화면 UI 컴포넌트 구현
  - Backend Agent (시니어 사수): user-auth, wish-tower 모듈 구현 및 주니어 멘토링
  - FE ↔ BE 직접 메시지 기반 API 스펙 및 DTO 실시간 동기화
                      │
                      ▼
[Phase 4: 통합 테스트 및 품질 검증 (M4 - QA Agent)]
  - 프론트엔드 단위 테스트 (node --test) 및 백엔드 JUnit 5 테스트 실행
  - 익명성 보장(DB-023) 데이터 누출 감사
  - Kafka 이벤트 멱등성 및 Circuit Breaker 장애 격리 E2E 검증
                      │
                      ▼
[Phase 5: Manager 최종 통합 및 릴리즈]
  - 검증 완료 보고서 확인 후 main 브랜치로 순차 머지
  - TASKS.md 및 DECISIONS.md 최종 최신화
```

---

## 6. 결론 및 보증 선언

본 계획에 명시된 전략에 따라 StoneWish 프로젝트의 전환을 수행할 경우:
1. 기존 11개 커밋과 작성된 모든 도메인/인프라/설계 자산의 **손실률은 0%** 입니다.
2. 프론트엔드와 백엔드가 물리적으로 분리된 Worktree에서 독립적으로 빌드하고 테스트하므로 **환경 간 충돌 및 파일 잠금이 원천 방지**됩니다.
3. 백엔드 에이전트의 시니어 멘토링을 통해 **사용자가 목표로 하는 Spring Boot MSA 실무 역량이 완벽히 전달**됩니다.
