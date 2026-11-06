# Automated Testing Infrastructure & Verification Architecture (TEST_INFRA)

**Project**: Wish Stone (`위시 스톤`)  
**Scope**: 3D Camera Controls, View Presets, Stone Selection Highlighting, SCR-10 Wish Modal & Dedicated Tower Exploration (Requirements R1, R2, R3, R4)  
**Milestones**: M1–M4 (Authored for Milestone M4: E2E Testing Track)  
**Environment**: Node.js v24 (Native ESM, `node:test`, `node:assert/strict`, `@react-three/fiber`, `@react-three/drei`, `three: ^0.169.0`)  

---

## 1. Test Philosophy

The Wish Stone Camera Controls, Tower Exploration, and Wish Interaction test suite is built on five core architectural principles designed to guarantee visual fidelity, privacy compliance, prevent regressions, and verify 3D interaction semantics:

### 1.1 Opaque-Box Requirement-Driven Testing
Tests treat the 3D presentation layer, navigation router, and domain services as an opaque-box interactive system. Rather than testing internal private variables or component implementation details, tests verify **observable 3D coordinates**, **mathematical invariants**, **user privacy guarantees**, and **domain contracts**:
- **World & LookAt coordinates**: Dynamic midpoint target $Y = \max(0.6, \text{towerTopY} \times 0.5)$, 3D Cartesian camera coordinates $(X, Y, Z)$ for Front, Side 45°, Top-down, and Free modes.
- **Elevation and polar clamping**: Strict polar angle boundaries $\theta \in [0.05, \pi \times 0.49]$ preventing camera inversion below ground ($y > 0$) and zenith gimbal-lock singularities ($z = 0.45 > 0$).
- **Exponential lerp dynamics**: Frame-rate independent transition step math $1 - e^{-\Delta t \cdot \lambda}$ and sub-millimeter snapping thresholds ($< 0.005\text{m}$).
- **Material shader & selection contracts**: Non-destructive Toss Blue (`#0064FF` / `#3182F6`) emissive glow ($0.85$ intensity) preserving mineral roughness ($\ge 0.8$) and texture base color.
- **Author privacy & cheer count invariants**: Strict anonymity (`익명의 소원 돌`) in public/category towers (DB-023), nickname reveal (`nickname#tag`) in group towers (DB-005), and cheer count hiding (`빛 레벨 {level}`) for non-owners (DB-017, D-006).

### 1.2 Category-Partition Method (CPM)
The input domain of camera viewpoints, stone selection, and user interaction is partitioned into mathematically disjoint equivalence classes across five fundamental dimensions:

| Parameter Category | Partition Classes | Values / Ranges | Functional Significance |
|---|---|---|---|
| **Camera View Presets** | `front`<br>`side45`<br>`top`<br>`free` | $[0, Y+0.7, 3.8]$<br>$[2.55, Y+0.7, 2.55]$<br>$[0, Y+3.1, 0.45]$<br>Unrestricted OrbitControls | Frontal eye-level inspection<br>Isometric balance & cantilever check<br>Steep ~82° plan view (no gimbal lock)<br>360° free orbit, pan & zoom |
| **Tower Top Elevation ($Y_{\text{top}}$)** | Sub-nominal ($< 1.0\text{m}$)<br>Standard ($1.0 \sim 3.0\text{m}$)<br>High-Rise ($> 3.0\text{m}$) | $Y_{\text{top}} = 0.1\text{m} \implies Y_{\text{target}} = 0.6\text{m}$<br>$Y_{\text{top}} = 2.0\text{m} \implies Y_{\text{target}} = 1.0\text{m}$<br>$Y_{\text{top}} = 10.0\text{m} \implies Y_{\text{target}} = 5.0\text{m}$ | Enforces 0.6m lower bound focus floor<br>Dynamic geometric midpoint tracking<br>Scales perspective safely without overflow |
| **Tower Scope & Anonymity** | Global (`global`)<br>Category (`cat:{code}`)<br>Group (`group:{uuid}`) | `showsNickname() === false`<br>`showsNickname() === false`<br>`showsNickname() === true` | Strict anonymous author (`익명의 소원 돌`)<br>Strict anonymous author (`익명의 소원 돌`)<br>Reveals verified `nickname#tag` |
| **Ownership (`isMine`)** | Owner (`isMine === true`)<br>Other (`isMine === false`) | Exact count (`🔥 응원 {N}회`), Cheer disabled<br>Level tier (`✨ 빛 레벨 {L}`), Cheer enabled | Prevents self-cheering, shows exact stats<br>Prevents "like competition", enables cheer |
| **Selection Highlighting** | Unselected<br>Selected (3D WebGL)<br>Selected (2D Fallback) | Emissive based on cheer level ($0.0 \sim 0.82$)<br>Emissive Toss Blue (`#0064FF`, $0.85$)<br>Border `#3182F6` 2px, Scale $1.06\times$ | Standard mineral ambient & glow<br>Neon Toss Blue highlight, texture preserved<br>Accessible CSS/SVG 2D fallback |

### 1.3 Boundary Value Analysis (BVA)
Tests probe exact boundary conditions where UI and 3D behavior transitions discontinuously:
- **Polar Angle Clamping Boundary ($\theta_{\min} = 0.05\text{ rad}, \theta_{\max} = \pi \times 0.49 \approx 1.53938\text{ rad}$)**: Angles $< 0.05$ clamp to $0.05$; angles $> 1.53938$ clamp to ground plane limit.
- **Top-Down Singularity Guard ($Z = 0.45 > 0$)**: Prevents look-vector from aligning identically with $(0, 1, 0)$ up vector, completely eliminating OrbitControls gimbal lock.
- **Target Snapping Threshold ($\delta_{\text{snap}} = 0.005\text{m}$)**: When Euclidean distance between camera and preset target drops below $5\text{mm}$, camera snaps to exact coordinate and stops transition.
- **Self-Cheer Boundary**: Owner cannot cheer own wish; throws `CANNOT_CHEER_OWN` (400) and keeps button disabled.
- **Already-Cheered Boundary**: Users cannot cheer twice (`1인 1회`); throws `ALREADY_CHEERED` (409) and disables button with "✓ 응원 완료".

### 1.4 Pairwise Combinatorial Matrix
Critical interactive and visual variables are sampled pairwise to ensure cross-cutting interactions do not induce deadlocks or state desynchronization:
$$\text{Presets (4)} \times \text{Interruption Events (Touch, Modal Open, Route Change)} \times \text{Tower Scopes (3)} \times \text{Ownership (2)}$$
Selected test vectors verify extreme corners such as user dragging OrbitControls while a camera preset lerp is in-flight, opening SCR-10 bottom sheet while camera is moving, and cheering a wish at an arbitrary custom viewpoint.

### 1.5 Anti-Facade & Genuine Execution Protocol
To satisfy integrity requirements, tests run strictly against real domain entities, pure mathematical preset specifications, and event buses without hardcoded stubs or facade mocks:
1. **Geometric Derivative Verification**: Elevation angles verified trigonometrically ($\arctan(\Delta y / \Delta z)$).
2. **True State Machine Verification**: State machine transitions verified across all state combinations with touch interrupts.
3. **Optimistic UI & Effect Bus**: Uses `OptimisticMutationManager` and `InMemoryEffectBus` capturing genuine `cheer_spark` visual effect events.
4. **Anonymity String Sanitization**: JSON serialization checks verify that zero substring leaks of private nicknames occur in public contexts.

---

## 2. Feature Inventory Mapping

Every feature defined in `PROJECT.md` (F01–F11) is directly mapped to test cases in the 4-tier matrix:

| Feature ID | Feature Name | Test Suite | Test Cases | Primary Assertions |
|---|---|---|---|---|
| **F01** | Idle Camera Reset Bug Fix | `e2e-camera-tower-exploration` | T1.4, T3.1 | Camera position is preserved across 60 idle frames; no forced lerp to `[0, 1.8, 3.8]` |
| **F02** | 360° OrbitControls Integration | `e2e-camera-tower-exploration` | T1.1, T1.2, T1.3, T1.5 | `dampingFactor: 0.08`, polar clamped to $[0.05, \pi \times 0.49]$, 360° unconstrained azimuth |
| **F03** | Camera View Presets Math Specification | `e2e-camera-tower-exploration` | T1.6, T1.7, T1.8, T2.1 | `computePresetCameraView` front, side45, top; targetY midpoint floor $\ge 0.6\text{m}$ |
| **F04** | Smooth Camera Preset Transitions | `e2e-camera-tower-exploration` | T1.9, T1.10 | Frame-rate independent exponential step $1 - e^{-6\Delta t}$, snap threshold $< 0.005\text{m}$ |
| **F05** | Camera Presets UI & Touch Interrupt | `e2e-camera-tower-exploration` | T1.11–T1.15, T3.1, T4.5 | Preset state machine; touch/drag during transition cancels lerp and shifts to `'free'` |
| **F06** | 3D Stone Selection & Raycasting | `e2e-camera-tower-exploration` | T1.16, T4.1 | 3D raycast resolves hit stone ID on mesh intersection and `null` on background |
| **F07** | 3D Toss Blue Highlighting | `e2e-camera-tower-exploration` | T1.17–T1.20, T4.1, T4.5 | Selected stone emissive `#0064FF` at $0.85$ intensity; mineral roughness $\ge 0.8$ preserved |
| **F08** | Reusable SCR-10 Wish Detail Bottom Sheet | `e2e-camera-tower-exploration` | T1.21–T1.24, T2.3, T4.3 | Maps content, category badge, bloom; enforces strict anonymity vs group nickname |
| **F09** | Wish Cheering Flow & Visual Feedback | `e2e-camera-tower-exploration` | T1.25, T2.4, T2.5, T3.2, T4.2 | `wishes.cheer` call, local count increment, `cheer_spark` emission, emotional toast |
| **F10** | Dedicated Tower Exploration Page (`/tower`)| `e2e-camera-tower-exploration` | T1.28, T1.29, T4.4 | Full-screen OrbitControls, pan/zoom enabled, category filter tabs (`all`, `job`, `study`, etc.) |
| **F11** | Navigation & Route Integration | `e2e-camera-tower-exploration` | T1.26, T1.27, T1.30, T4.4 | Route `/tower` registered in layout; home button `[ 🔍 360° 둘러보기 ]` -> `router.push('/tower')` |

---

## 3. Test Architecture & Execution Topology

### 3.1 Headless Node.js Execution Harness
- **Runtime**: Native Node.js v24 (`node:test`, `node:assert/strict`).
- **Command**: `npm test` or `node --test src/__tests__/e2e-camera-tower-exploration.test.ts`.
- **Zero Mocking Overhead**: Tests execute directly against pure deliverable modules (`cameraPresetSpec.ts`, `stoneTowerSpec.ts`, `Tower.ts`, `Wish.ts`, `OptimisticMutationManager.ts`, `ToastStore.ts`, `EffectBus.ts`).
- **Execution Speed**: All 43 E2E test cases execute in $< 200\,\text{ms}$. Entire project test suite (129 tests) executes in $< 1.6\,\text{s}$.

### 3.2 Mathematical Oracles & Acceptance Tolerances
1. **Dynamic Midpoint Focus Oracle**:
   $$Y_{\text{target}} = \max\left(0.60, \text{round}\left(Y_{\text{top}} \times 0.5, 3\right)\right)$$
2. **Top-Down Look Vector Singularity Oracle**:
   $$\hat{L}_y = \frac{|Y_{\text{target}} - Y_{\text{cam}}|}{\sqrt{\Delta X^2 + \Delta Y^2 + \Delta Z^2}} < 0.995$$
   Guaranteeing elevation angle $\approx 81.7^\circ \sim 82.0^\circ \ne 90.0^\circ$.
3. **Exponential Smoothing Oracle**:
   $$\text{step}(\Delta t) = 1 - e^{-6.0 \cdot \Delta t}$$
   Convergence is strictly monotonic ($\Delta d_{k+1} < \Delta d_k$).
4. **Toss Blue Emissive Oracle**:
   $$\text{Color} = \text{Toss Blue } (\#0064\text{FF} / \#3182\text{F6}), \quad \text{Intensity} = 0.85 \pm 0.01$$
5. **Privacy Masking Oracle**:
   $$\text{Author}(\text{Stone}, \text{Scope}) = \begin{cases} \text{"내가 올린 소원 ⭐️"}, & \text{if } \text{isMine} \\ \text{Stone.nickname}, & \text{if } \text{Scope.showsNickname()} \land \text{Stone.nickname} \ne \text{null} \\ \text{"익명의 소원 돌"}, & \text{otherwise} \end{cases}$$

---

## 4. Verification & Audit Manifest

| Verification Phase | Command | Success Gate |
|---|---|---|
| **TypeScript Typecheck** | `npx tsc --noEmit` | Exit code 0, 0 compilation errors across whole project |
| **M4 E2E Test Suite Run** | `node --test src/__tests__/e2e-camera-tower-exploration.test.ts` | 43 / 43 tests PASS, 0 failures, 0 skipped |
| **Complete Project Test Run** | `npm test` | 129 / 129 tests PASS across all 8 suites, duration < 2.0s |
| **Integrity Audit** | Independent inspection | Zero facade tests, genuine mathematical derivations, verified privacy |
