# PROJECT_CONTEXT

> 새 세션을 시작하는 AI는 이 파일 → `TASKS.md` → `DECISIONS.md` 순서로 읽는다(`AGENTS.md` 규칙).
> 최종 갱신: 2026-11-03

## 1. 프로젝트 개요

- **서비스명:** StoneWish (폴더명 "위시 스톤")
- **한 줄 소개:** 디지털 돌을 쌓으며 소원을 기록하고, 다른 사람의 소원을 익명으로 만나 "응원 🔥"하는 모바일·웹 앱
- **핵심 가치:** 익명성, 공감(좋아요 대신 응원), 축적(하나의 공동 돌탑), 희망(이루어진 소원에 꽃/새싹/이끼가 피어남)
- **대상:** 10~40대(취준생, 직장인, 학생, 수험생 등)
- **현재 단계:** **설계 단계.** 소스 코드는 아직 없음(아래 3장 참고). 작업 범위는 "일반 사용자용 메인 대시보드(홈)"와 관련 흐름이다.

## 2. 폴더 구조 (2026-11-03 기준, 전체 파일 확인 완료)

```
wish_stone/                  # 로컬 작업 폴더 (Git 저장소 아님)
└─ 위시 스톤/                # ★ Git 저장소 루트 (origin: https://github.com/GO-TE/wish-stone.git, 브랜치 main)
   ├─ README.md
   ├─ AGENTS.md              # AI 작업 규칙 (시작·종료 시 할 일)
   ├─ PROJECT_CONTEXT.md     # 이 파일: 프로젝트 전체 맥락
   ├─ TASKS.md               # 진행 상황, 미해결 문제, 다음 작업
   ├─ DECISIONS.md           # 기술·기획 결정 기록 (ADR 형식)
   └─ dash_board/            # 대시보드 설계 문서 (구 폴더명 "대시 보드")
      ├─ PRD v1.0.md         # 제품 요구사항 (노션 연동)
      ├─ 요구 사항 정의서.md   # 요구사항 30개 DB-001~030 (노션 연동)
      ├─ 기술 스택.md          # 스택 결정, AR 구현 구조, 리스크, PoC 항목
      ├─ 아키텍처 설계.md      # 객체지향 클라이언트 구조 (계층, 포트/어댑터, 클래스 다이어그램)
      ├─ 데이터 모델.md        # ERD, 돌탑 정의, 제약 조건, RLS
      ├─ API 명세서.md         # API-01~18 (Supabase RPC 중심)
      ├─ 화면 설계서.md        # SCR-01~18, 화면 흐름, 대시보드·AR 와이어프레임
      └─ MSA.md              # 사용자가 작성한 MSA 분리 방법 일반 참고 노트 (설계: 시작 전, 이 프로젝트에 적용 결정 없음)
```

> [!NOTE]
> - `.md` 파일 상단의 `notion-id` / `설계:` frontmatter는 노션 동기화용이다. AI가 새로 만든 문서(기술 스택, 아키텍처 설계, 데이터 모델, API 명세서, 화면 설계서)에는 notion-id가 없다.
> - 커밋 메시지 규칙: `type: 한국어 제목` (feat, fix, docs, chore, refactor, test, style). 커밋은 `위시 스톤/` 안에서 한다.

## 3. 기술 스택 (확정, 코드 미착수)

| 영역 | 선택 |
| --- | --- |
| 앱·웹 | Expo(React Native) + expo-router + react-native-web, TypeScript |
| 3D / 물리 | React Three Fiber + drei / cannon-es |
| AR | 모바일: ViroReact(ARKit/ARCore) · 웹: WebXR(`@react-three/xr`) · 웹 미지원 환경: 카메라 + 3D 겹치기(간이 AR) |
| 백엔드 | Supabase (Postgres, Auth, RLS, RPC, Edge Functions) |
| 인증 | Apple / Kakao / Google / 게스트(Anonymous). 게스트는 `linkIdentity`로 계정 전환 |
| 상태 관리 | Zustand + TanStack Query |
| 배포 | EAS Build/Submit, 웹은 Vercel 또는 Netlify |

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

