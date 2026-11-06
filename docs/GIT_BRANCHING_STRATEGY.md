# StoneWish (위시 스톤) Git 브랜치 전략 및 운영 가이드
## (Git Branching & Release Strategy)

- **버전:** v1.0
- **제정일:** 2026-11-06
- **적용 대상:** 프로젝트의 모든 개발자 및 AI 에이전트

---

## 1. 개요 및 핵심 원칙: "왜 메인 직접 푸시가 위험한가?"

메인(`main`) 브랜치에 직접 푸시(Direct Push)하는 행위는 다음과 같은 심각한 위험을 초래합니다:
1. **배포 안정성 파괴**: 빌드가 깨지거나 미검증된 코드가 운영/릴리즈 기준점에 즉시 노출됩니다.
2. **이력 오염 및 롤백 난이도 급증**: 어떤 커밋이 특정 기능을 구성하는지 파악하기 어렵고, 결함 발생 시 원자적 롤백(`git revert`)이 불가능해집니다.
3. **병렬 협업 충돌**: 프론트엔드와 백엔드가 동시에 `main`을 수정할 때 심각한 코드 덮어쓰기(Overwrite) 및 머지 지옥(Merge Hell)이 발생합니다.
4. **품질 검증 게이트 무력화**: 정적 검사(`tsc`)와 단위/통합 테스트를 통과하지 않은 코드가 차단 없이 유입됩니다.

따라서 본 프로젝트는 안정성과 기민성을 모두 보장하는 **수정형 Git Flow (Trunk/Develop 기반 전략)** 를 채택합니다.

---

## 2. 브랜치 계층 토폴로지 (Branch Topology)

```
[main] ─────────────────────● (v1.0.0 Tag) ───────────────────────────● (v1.1.0 Tag)
  │                          ▲                                         ▲
  │ (초기 분기)              │ (검증 완료 릴리즈 머지)                 │
  ▼                          │                                         │
[develop] ───────────●───────┴────────────────────────●────────────────┴─────
                       ▲                                ▲
                       │ (QA 통과 머지)                 │
                       │                                │
[feature/*] ───────────┴─ (feature/fe-stone-physics)    │
                                                        │
[feature/*] ────────────────────────────────────────────┴─ (feature/be-kafka-events)
```

### 2.1 브랜치 역할 및 명명 규칙

| 브랜치명 | 기준 분기점 | 머지 대상 | 쓰기 권한 | 역할 및 목적 |
|---|---|---|---|---|
| **`main`** | - | - | **직접 푸시 절대 금지 (Protected)**<br>오직 `develop`에서 검증 후 머지만 허용 | 상시 무결성이 보장되는 **프로덕션 릴리즈 브랜치**. 항상 100% 동작 가능한 상태 유지. |
| **`develop`** | `main` | `main` | 모든 에이전트/개발자의 기능 통합 지점 | **개발 통합 브랜치 (Integration Branch)**. 개별 기능들이 머지되어 E2E 연동 테스트가 수행되는 공간. |
| **`feature/<영역>-<기능명>`** | `develop` | `develop` | 담당 작업자/에이전트 | **단위 기능 개발 브랜치**. 완료 시 테스트 검증 후 `develop`으로 병합.<br>- FE: `feature/fe-<기능>` (예: `feature/fe-physics-3d`)<br>- BE: `feature/be-<기능>` (예: `feature/be-interaction-kafka`)<br>- 공통: `feature/common-<기능>` |
| **`hotfix/<결함명>`** | `main` | `main`, `develop` | 긴급 수정 담당자 | 프로덕션 긴급 장애 수정 브랜치. |

---

## 3. 머지 전 필수 품질 게이트 (Quality Gate - 절대 수칙)

어떠한 브랜치도 다음 4대 검증을 통과하지 않고는 상위 브랜치(`develop` 또는 `main`)로 머지될 수 없습니다:

```
┌────────────────────────────────────────────────────────┐
│             Merge Quality Gate Checklist               │
├────────────────────────────────────────────────────────┤
│ [1] 타입 검증: npx tsc --noEmit 에러 0건               │
│ [2] 프론트 테스트: npm test (81개 전 항목 Green)        │
│ [3] 백엔드 테스트: ./gradlew test (5개 서비스 전원 성공)│
│ [4] 커밋 컨벤션: feat:, fix:, test:, docs: 준수        │
│ [5] 문서 동기화: TASKS.md 및 DECISIONS.md 최신화       │
└────────────────────────────────────────────────────────┘
```

---

## 4. 표준 작업 워크플로우 (Step-by-Step)

### Step 1. 작업 시작 전 최신화 및 브랜치 생성
```bash
# 1. develop 최신 상태 동기화
git checkout develop
git pull origin develop

# 2. 새로운 피처 브랜치 생성 (예: 3D 돌탑 개선)
git checkout -b feature/fe-stone-physics
```

### Step 2. 기능 구현 및 단위 커밋
```bash
# Conventional Commits 규칙 준수
git add src/...
git commit -m "feat(physics): 3D 강체 물리 충돌 및 전복 토크 시뮬레이션 구현"
```

### Step 3. 품질 게이트 자가 검증
```bash
# 1. TypeScript 컴파일 검사
npx tsc --noEmit

# 2. 테스트 스위트 실행
npm test
```

### Step 4. `develop` 브랜치로 병합 (Merge)
```bash
# develop으로 이동 및 피처 브랜치 병합 (히스토리 보존을 위해 --no-ff 사용)
git checkout develop
git merge --no-ff feature/fe-stone-physics -m "merge: feature/fe-stone-physics into develop"

# 원격 develop에 푸시
git push origin develop
```

### Step 5. 정식 릴리즈 시 `main` 머지 및 태깅 (Manager 역할)
```bash
# 전체 통합 E2E 테스트 통과 확인 후 main에 반영
git checkout main
git pull origin main
git merge --no-ff develop -m "release: v1.1.0 3D 물리 엔진 및 자연석 인터랙션 탑재"

# 릴리즈 태그 생성 및 푸시
git tag -a v1.1.0 -m "Release v1.1.0"
git push origin main --tags
```

---

## 5. 비상 대응 및 히스토리 보호 수칙
1. **Force Push 금지**: `main`, `develop` 브랜치에 대해 `git push --force`는 원천 금지합니다.
2. **원자적 단위 작업**: 한 번에 너무 많은 영역을 건드리지 않고, 커밋 단위와 브랜치 단위를 작게 유지합니다.
3. **문서 선행 확인**: 작업을 시작할 때 항상 `AGENTS.md`와 `TASKS.md`를 먼저 확인합니다.
