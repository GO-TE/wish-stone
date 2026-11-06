# Test Readiness Verification Manifest (TEST_READY.md)

**Project**: Wish Stone (`위시 스톤`)  
**Milestone**: Milestone 4: E2E Testing Track (Camera Controls, Tower Exploration, SCR-10 Wish Modal & Cheering Flow)  
**Date**: 2026-11-06  
**Author**: `test_writer_e2e_m4` (Teamwork Test Writer)  
**Verification Gate**: **100% PASS** (New E2E Suite: 43 / 43 tests passed; Total Project Suite: 129 / 129 tests passed, 0 failed, 0 skipped, execution duration: ~1.5s; `npx tsc --noEmit`: 0 errors)  

---

## 1. Test Runner & Execution Commands

The test suite runs natively in headless Node.js v24 with ESM and zero external mock dependencies (no DOM/WebGL stubs required).

```powershell
Set-Location "c:\Users\sybon\Desktop\workspace\code\wish_stone\위시 스톤"

# 1. Typecheck verification gate: 0 errors
cmd /c "npx tsc --noEmit"

# 2. Run new Milestone 4 E2E test suite directly (43 tests)
node --test src/__tests__/e2e-camera-tower-exploration.test.ts

# 3. Run complete automated test suite (all 129 tests across all test suites)
cmd /c "npm test"
```

---

## 2. Test Suite Breakdown & Test Case Inventory

### Summary Matrix
| Category | File | Test Count | Pass Status | Duration |
|---|---|---|---|---|
| **Tier 1: Feature Coverage (F01–F11)** | `src/__tests__/e2e-camera-tower-exploration.test.ts` | 30 tests | 30 / 30 PASS | ~45ms |
| **Tier 2: Boundary & Corner Cases** | `src/__tests__/e2e-camera-tower-exploration.test.ts` | 5 tests | 5 / 5 PASS | ~12ms |
| **Tier 3: Cross-Feature Combinations** | `src/__tests__/e2e-camera-tower-exploration.test.ts` | 3 tests | 3 / 3 PASS | ~10ms |
| **Tier 4: Real-World User Scenarios** | `src/__tests__/e2e-camera-tower-exploration.test.ts` | 5 tests | 5 / 5 PASS | ~15ms |
| **Total Milestone 4 E2E Suite** | `src/__tests__/e2e-camera-tower-exploration.test.ts` | **43 tests** | **43 / 43 PASS** | **~82ms** |
| **Existing Baseline Project Suites** | 7 suites (`camera-presets`, `canvas`, `domain`, `physics`, `toast`, etc.) | 86 tests | 86 / 86 PASS | ~1400ms |
| **Complete System Test Suite** | **8 test suites** | **129 tests** | **129 / 129 PASS** | **~1500ms** |

---

### Detailed Test Inventory (`e2e-camera-tower-exploration.test.ts`)

#### Tier 1: Feature Coverage (F01 ~ F11, 30 tests)

##### Area 1: F01 & F02 (OrbitControls Configuration, Polar Clamping & Idle Reset Bug Fix)
- [x] **T1.1 - OrbitControls Config UX Bounds**: Verifies `dampingFactor: 0.08`, `enableDamping: true`, `minDistance: 1.5`, and `maxDistance: 7.0` keep the stone cairn in view.
- [x] **T1.2 - Polar Angle Clamping Bounds**: Verifies strict elevation boundaries $\theta \in [0.05, \pi \times 0.49]$ rad (~88.2°), ensuring camera never penetrates the ground plane ($y > 0$).
- [x] **T1.3 - Azimuthal Free Rotation**: Verifies horizontal rotation angle $\phi$ permits unconstrained 360° inspection across arbitrary revolutions ($\pm 4\pi$).
- [x] **T1.4 - Idle Camera Persistence**: Verifies camera position is preserved across 60 idle frames without being reset or lerped back to default `[0, 1.8, 3.8]`.
- [x] **T1.5 - OrbitControls Interaction Toggle**: Verifies OrbitControls can be disabled dynamically when modal sheets/overlays are visible.

##### Area 2: F03 & F04 (Presets Math, Dynamic Midpoint Targeting & Smooth Transitions)
- [x] **T1.6 - Preset Coordinates Math**: Verifies `computePresetCameraView` calculates exact 3D coordinates and lookAt targets for Front (`[0, Y+0.7, 3.8]`), Side 45° (`[2.55, Y+0.7, 2.55]`), and Top (`[0, Y+3.1, 0.45]`).
- [x] **T1.7 - Dynamic Midpoint Floor**: Verifies dynamic focus target $Y = \max(0.6, \text{towerTopY} \times 0.5)$ clamps low cairns ($0.2\text{m}$) to $0.6\text{m}$ while tracking tall towers ($6.0\text{m}$) to $3.0\text{m}$.
- [x] **T1.8 - Elevation Angle Perspectives**: Verifies Front view produces near eye-level perspective (~10°) and Top view produces steep (~82°) perspective avoiding 90° zenith lock.
- [x] **T1.9 - Exponential Smoothing Step**: Verifies frame-rate independent step $1 - e^{-6\Delta t}$ guarantees strictly monotonic distance convergence without overshoot.
- [x] **T1.10 - Sub-Millimeter Snapping Threshold**: Verifies camera snaps to exact preset coordinate when remaining distance drops below $0.005\text{m}$ (5mm).

##### Area 3: F05 (Camera Preset State Machine & Touch Interrupt Logic)
- [x] **T1.11 - Preset State Machine Lifecycle**: Verifies valid transitions across `'front'`, `'side45'`, `'top'`, and `'free'` states.
- [x] **T1.12 - In-Flight Transition Tracking**: Verifies selecting a preset marks `isTransitioning === true` while in flight.
- [x] **T1.13 - Touch Interrupt Cancels Lerp**: Verifies touch/drag on OrbitControls during active transition immediately aborts lerp and switches preset to `'free'`.
- [x] **T1.14 - Static Drag Shifts UI to Free**: Verifies user drag while resting in a preset automatically shifts UI indicator to `'360° 자유'`.
- [x] **T1.15 - Idempotent Preset Re-Selection**: Verifies re-selecting currently active preset is safe and causes zero visual jumps.

##### Area 4: F06 & F07 (3D Stone Raycasting & Toss Blue Highlighting)
- [x] **T1.16 - 3D Raycasting Hit Contract**: Verifies 3D ray-to-sphere/box intersection resolves exact stone ID on hit and returns `null` on empty background clicks.
- [x] **T1.17 - Toss Blue Emissive Specification**: Verifies selected stone applies canonical Toss Blue (`#0064FF` / `#3182F6`) emissive glow at $0.85$ intensity.
- [x] **T1.18 - Mineral Texture Preservation**: Verifies highlight maintains base color, roughness ($\ge 0.8$), metalness, and procedural geometry scale intact.
- [x] **T1.19 - Deselection State Restoration**: Verifies deselecting a stone restores original cheerLevel glow ($0 \sim 3$) and material parameters.
- [x] **T1.20 - 2D Fallback Selection Styling**: Verifies 2D fallback applies Toss Blue border (`#3182F6`, 2px) and $1.06\times$ scale transform.

##### Area 5: F08 & F09 (SCR-10 Bottom Sheet Data Mapping, Privacy & Cheer Trigger)
- [x] **T1.21 - SCR-10 Presentation Model Mapping**: Verifies mapping of `TowerStoneItem` to wish text, category badges (`#취업`, `#학업`, `#건강`, `#인간관계`, `#기타`), and bloom decorations.
- [x] **T1.22 - Public Tower Anonymity Enforcement**: Verifies author in global and category towers is strictly formatted as `'익명의 소원 돌'`.
- [x] **T1.23 - Group Tower Nickname Visibility**: Verifies group tower reveals verified author `nickname#tag`.
- [x] **T1.24 - Cheer Count Privacy vs Glow Level Rules**: Verifies exact cheer count (`🔥 응원 {N}회`) is visible only to owner, while non-owners see cheer level (`✨ 빛 레벨 {L}`) per DB-017 / D-006.
- [x] **T1.25 - Cheer Action Trigger**: Verifies cheering invokes repository, increments count, emits `cheer_spark` on `EffectBus`, and triggers emotional toast.

##### Area 6: F10 & F11 (Route /tower Entry Point, Controls & Return Navigation)
- [x] **T1.26 - Route Registration Contract**: Verifies route `/tower` (`tower/index`) is declared in root stack layout.
- [x] **T1.27 - Home Viewport Entry Trigger**: Verifies header button `[ 🔍 360° 둘러보기 ]` in `home.tsx` triggers `router.push('/tower')`.
- [x] **T1.28 - Exploration Canvas Configuration**: Verifies `/tower` enables full-screen OrbitControls, pan, and zoom.
- [x] **T1.29 - Category Filter Tabs in /tower**: Verifies category tab selection dynamically updates `TowerKey` (`global` vs `cat:{code}`) and filters stones.
- [x] **T1.30 - Return Navigation Contract**: Verifies back navigation button calls `router.back()` returning to `/home`.

---

#### Tier 2: Boundary Value Analysis & Extreme Corner Cases (5 tests)
- [x] **T2.1 - Extreme Tower Heights**: Verifies tower heights $0.1\text{m}$, $10.0\text{m}$, and $50.0\text{m}$ calculate safe, finite, non-NaN camera positions and midpoint targets.
- [x] **T2.2 - Zenith Singularity Guard**: Verifies top-down view maintains $Z = 0.45 > 0$ across all heights, keeping vertical look component $< 0.995$ to avoid gimbal lock.
- [x] **T2.3 - Strict Anonymity Leak Defense**: Verifies zero substring leaks of private nicknames occur in JSON serialization of public tower sheets.
- [x] **T2.4 - Already-Cheered Error Handling**: Verifies duplicate cheering throws `ALREADY_CHEERED` (409) and displays disabled button with `"✓ 응원 완료"`.
- [x] **T2.5 - Self-Cheer Prevention**: Verifies `isMine === true` disables cheer button with notice `"내가 정성껏 올린 소원입니다"` and throws `CANNOT_CHEER_OWN` (400).

---

#### Tier 3: Cross-Feature Combinations (3 tests)
- [x] **T3.1 - In-Flight Preset Interruption**: Verifies user touch drag during preset transition immediately cancels lerp, shifts preset to `'free'`, and preserves exact intermediate coordinates.
- [x] **T3.2 - Cheering Updates Visual Spec**: Verifies cheering a stone updates local cheer level, emits `cheer_spark`, and causes `buildStoneMaterialSpec` to emit level 1 glow (`#FFE066`, 0.22).
- [x] **T3.3 - SCR-10 Modal Disables OrbitControls**: Verifies opening SCR-10 bottom sheet locks OrbitControls (`enabled = false`), preventing background canvas spinning during sheet scrolling.

---

#### Tier 4: Real-World User Scenarios (5 tests)
- [x] **T4.1 - Multi-Perspective Inspection & Stone Selection**: User inspects 5-stone cairn from Front, Side 45°, and Top perspectives, then selects 3rd tier stone, highlighting it in Toss Blue and opening SCR-10.
- [x] **T4.2 - Complete Wish Cheering Flow**: User taps stone, inspects wish details, sends cheer, verifies optimistic count increment, level up (1 -> 2), `cheer_spark` particle event, and emotional toast.
- [x] **T4.3 - Dual Tower Inspection (Group vs Public)**: Verifies identical 3D cairns correctly reflect author privacy boundaries (group shows `nickname#tag`, public shows `익명의 소원 돌`).
- [x] **T4.4 - End-to-End Navigation Journey**: Complete loop: `/home` -> tap `[ 🔍 360° 둘러보기 ]` -> `/tower` -> select preset -> tap stone -> cheer wish -> dismiss modal -> back to `/home`.
- [x] **T4.5 - Interrupted Inspection with Custom Orientation**: User begins preset transition, drags mid-flight to examine cantilever balance from a custom angle, and selects a stone without camera dislocation.

---

## 3. Feature Coverage Checklist

| Feature ID | Feature Name | Mapped Tests | Verification Status |
|---|---|---|:---:|
| **F01** | Idle Camera Reset Bug Fix | T1.4, T3.1 | **COVERED & PASSING** |
| **F02** | 360° OrbitControls Integration | T1.1, T1.2, T1.3, T1.5 | **COVERED & PASSING** |
| **F03** | Camera View Presets Math Specification | T1.6, T1.7, T1.8, T2.1 | **COVERED & PASSING** |
| **F04** | Smooth Camera Preset Transitions | T1.9, T1.10 | **COVERED & PASSING** |
| **F05** | Camera Presets UI & Touch Interrupt | T1.11–T1.15, T3.1, T4.5 | **COVERED & PASSING** |
| **F06** | 3D Stone Selection & Raycasting | T1.16, T4.1 | **COVERED & PASSING** |
| **F07** | 3D Toss Blue Highlighting | T1.17–T1.20, T4.1, T4.5 | **COVERED & PASSING** |
| **F08** | Reusable SCR-10 Wish Detail Bottom Sheet | T1.21–T1.24, T2.3, T4.3 | **COVERED & PASSING** |
| **F09** | Wish Cheering Flow & Visual Feedback | T1.25, T2.4, T2.5, T3.2, T4.2 | **COVERED & PASSING** |
| **F10** | Dedicated Tower Exploration Page (`/tower`)| T1.28, T1.29, T4.4 | **COVERED & PASSING** |
| **F11** | Navigation & Route Integration | T1.26, T1.27, T1.30, T4.4 | **COVERED & PASSING** |

---

## 4. Auditor Sign-Off & Verification Readiness

- [x] **Zero facade tests or hardcoded expected outputs**: All 43 tests verify mathematical derivatives, genuine state transitions, and real entity contracts.
- [x] **All deliverable specifications directly tested**: `cameraPresetSpec.ts`, `stoneTowerSpec.ts`, `Tower.ts`, `Wish.ts`, `OptimisticMutationManager.ts`, `ToastStore.ts`, and `EffectBus.ts`.
- [x] **Exclusive Write Ownership Respected**: Zero edits to implementation source files; authored exclusively `TEST_INFRA.md`, `TEST_READY.md`, and `src/__tests__/e2e-camera-tower-exploration.test.ts`.
- [x] **`npx tsc --noEmit`**: Exited with code 0 (zero TypeScript errors across the entire codebase).
- [x] **`npm test`**: Passes 129 / 129 tests across all 8 test suites (100% green, 0 failed, 0 skipped, execution duration: ~1.5s).
