# 🪨 StoneWish (위시 스톤)

> **"작은 돌 하나에 담긴 소원이 세상과 연결되는 공간"**  
> 디지털 돌을 쌓으며 소원을 기록하고, 타인의 소원을 익명으로 만나 **응원(🔥)**하며 함께 돌탑을 만들어가는 **3D · AR 소원 커뮤니티 (App & Web)**

![Platform](https://img.shields.io/badge/Platform-iOS%20%7C%20Android%20%7C%20Web-000020?style=flat-square&logo=expo)
![Frontend](https://img.shields.io/badge/Frontend-Expo%20%7C%20TypeScript%20%7C%20Three.js-3178C6?style=flat-square&logo=typescript)
![Backend](https://img.shields.io/badge/Backend-Spring%20Boot%203.3%20MSA%20%7C%20Java%2021-6DB33F?style=flat-square&logo=springboot)
![Infra](https://img.shields.io/badge/Infra-Kafka%20%7C%20Redis%20%7C%20MySQL%208.0-2496ED?style=flat-square&logo=docker)

---

## ✨ 핵심 기능

- **🤫 익명 돌탑 & 지인 그룹 돌탑**
  - **공개·카테고리 돌탑:** 작성자 정보를 완전히 숨겨 누구든 편하게 소원을 남깁니다.
  - **지인 그룹 돌탑:** 8자리 초대 코드로 모인 그룹원에게만 **`닉네임#태그`** (예: `제미나이#real`)가 보입니다.
- **🪨 3D & AR 드래그 돌 쌓기**
  - 기기 환경에 맞춰 **네이티브 AR(Viro) · 웹 AR(WebXR) · 간이 AR(카메라 오버레이) · 일반 3D**로 자동 전환됩니다.
  - 소원 본문을 분석해 **카테고리(`취업`/`학업`/`건강`/`관계`/`기타`)를 자동 분류**하며, 돌이 빗나가면 돌탑이 무너지는 물리 연출(`tower_collapsed`)이 재생됩니다.
- **🔥 숫자 경쟁 없는 응원**
  - 댓글 대신 **응원 🔥**만 보낼 수 있습니다. 정확한 응원 수는 본인에게만 보이고, 타인에게는 **돌이 빛나는 단계(0~3단계)** 로만 표시됩니다.
- **🌸 소원 이루어짐 (개화 연출)**
  - 소원이 이루어지면 돌 위에 **꽃 · 새싹 · 이끼**가 피어나 돌탑에 희망을 더합니다.

---

## 🏗️ 아키텍처 한눈에 보기

```mermaid
flowchart LR
    Client["📱 Expo App & Web\n(Clean Architecture + 3D/AR)"]
    GW["🚪 API Gateway (:8080)\n(JWT 검증 & 헤더 위조 방지)"]

    subgraph Services["☁️ Spring Boot 3.3 MSA"]
        Auth["🔐 user-auth (:8081)\n인증 · 닉네임#태그"]
        Tower["🪨 wish-tower (:8082)\n돌탑 · 소원 · 쿼터"]
        Inter["🔥 interaction (:8083)\n응원 · 신고 누적"]
        Group["👥 group (:8084)\n지인 그룹 · 초대코드"]
    end

    Kafka[["📨 Kafka / Redis / MySQL(x4)"]]

    Client -->|REST| GW --> Services
    Tower <-->|OpenFeign + CircuitBreaker| Auth & Group
    Inter -->|Async Event| Kafka --> Tower
```

- **Frontend:** `presentation(UI/Controller)` → `application(UseCase)` → `domain(Entity/Port)` ← `infrastructure(MSA API / 3-Way AR / Physics)`
- **Backend:** 서비스별 **4개 DB 분리(`user_db`, `wish_db`, `interaction_db`, `group_db`)** + **OpenFeign(서킷브레이커 폴백)** + **Kafka(비동기 멱등 컨슈머)**

---

## 📂 디렉토리 구조

```text
위시 스톤/
├─ src/                     # 📱 클라이언트 (Expo + TypeScript)
│  ├─ app/                  # 화면 라우트 (SCR-01 ~ SCR-18)
│  ├─ presentation/         # 화면 컨트롤러 및 3D/이펙트 컴포넌트
│  ├─ application/          # 유스케이스 (돌 쌓기, 응원, 성취, 랜덤 탐색)
│  ├─ domain/               # 도메인 엔티티, 값 객체(Nickname#Tag 등), 포트
│  └─ infrastructure/       # MSA 게이트웨이 어댑터, AR 3종 세션, 물리 엔진
├─ backend/                 # ☁️ 백엔드 (Spring Boot 3.3 멀티모듈)
│  ├─ gateway-service/      # (:8080) API Gateway & JWT 보안 필터
│  ├─ user-auth-service/    # (:8081) 소셜·게스트 인증 및 닉네임#태그
│  ├─ wish-tower-service/   # (:8082) 돌탑 조회, 소원 생성, 자동 분류, 일일 쿼터
│  ├─ interaction-service/  # (:8083) 응원하기(1/5/15 빛 단계) 및 신고(5회 블라인드)
│  ├─ group-service/        # (:8084) 지인 그룹 생성·참여·권한 검증
│  ├─ common-events/        # Kafka 공유 이벤트 객체
│  └─ docker-compose.yml    # MySQL 8.0 · Redis 7 · Kafka 원클릭 인프라
├─ dash_board/              # 📋 기획·설계 문서 (PRD, 요구사항, 화면/API/DB 설계서)
└─ docs/                    # 📘 협업 가이드, 백엔드 멘토링 문서, QA 리포트
```

---

## 🚀 빠른 실행 (Quick Start)

### 1. 인프라 실행 (MySQL · Redis · Kafka)
```bash
cd backend
docker compose up -d
```

### 2. 백엔드 빌드 & 테스트
```bash
cd backend
gradle test
```

### 3. 프론트엔드 테스트 & 앱 실행
```bash
# 도메인 · AR · 컨트롤러 전체 테스트
node --test src/__tests__/*.test.ts

# 개발 서버 실행
npm install
npx expo start
```

---

## 📚 문서 안내

| 문서 | 설명 |
| :--- | :--- |
| **[PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md)** | 프로젝트 전체 맥락 및 핵심 도메인 규칙 요약 |
| **[TASKS.md](./TASKS.md)** | 스프린트 진행 현황 및 완료 백로그 |
| **[DECISIONS.md](./DECISIONS.md)** | 기술·기획 주요 의사결정 기록 (`D-001 ~ D-019`) |
| **[dash_board/](./dash_board/)** | PRD, 요구사항 정의서(`DB-001~030`), 화면 설계서(`SCR-01~18`), API 명세서(`API-01~20`), 데이터 모델 |
| **[docs/](./docs/)** | 협업 가이드, Spring Boot MSA 사수 멘토링 가이드, 테스트 체크리스트 |
