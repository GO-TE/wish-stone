# Wish Stone 3D Stone Stacking v2: Test Readiness & Verification Report (TEST_READY.md)

- **Date**: 2026-11-11
- **Status**: **READY FOR VERIFICATION & REGRESSION AUDIT**
- **Test Writer**: `test_writer_m4`
- **Milestone**: Milestone 4 (Parallel E2E Testing Track)
- **Primary Test Suite**: `src/__tests__/e2e-stone-stacking-3d-v2.test.ts`
- **Scope & Specification Documents**: `ORIGINAL_REQUEST.md`, `PROJECT.md`, `TEST_INFRA.md`
- **Target Repository**: `c:\Users\sybon\Desktop\workspace\code\wish_stone\위시 스톤`

---

## 1. Executive Summary

Milestone 4 delivers the comprehensive, requirement-driven, opaque-box automated test suite for **Wish Stone 3D Stone Stacking v2** (`feature/stone-stacking-3d-v2`).
Derived strictly from user specifications in `ORIGINAL_REQUEST.md` (2026-11-11) and `PROJECT.md`, the test suite verifies all 28 features (F01–F28) across 4 rigorous testing tiers and enforces strict R4 Scope Isolation.

- **Automated Tests Created**: 46 comprehensive test cases in `src/__tests__/e2e-stone-stacking-3d-v2.test.ts`.
- **Primary Test Suite Pass Rate**: **46 / 46 (100% Green, 0 failed, 0 skipped)** in ~433ms.
- **Static Type Check**: **0 Errors (`tsc --noEmit`)**.
- **Anti-Dummy Quality Gate (F28)**: Zero vacuous assertions (`expect(true).toBe(true)` or comment string matching in AST); all tests exercise genuine physical dynamics, geometric invariants, and state transitions.

---

## 2. Test Execution Commands

All commands are executed from the project repository root:
`c:\Users\sybon\Desktop\workspace\code\wish_stone\위시 스톤`

### 2.1 Primary v2 4-Tier E2E Test Suite Run
```powershell
Set-Location "c:\Users\sybon\Desktop\workspace\code\wish_stone\위시 스톤"
node --test src/__tests__/e2e-stone-stacking-3d-v2.test.ts
```
*Expected Result*: 46 passed, 0 failed, 0 cancelled, 0 skipped (~433ms).

### 2.2 TypeScript Static Type Check
```powershell
Set-Location "c:\Users\sybon\Desktop\workspace\code\wish_stone\위시 스톤"
npm.cmd run typecheck
```
*Expected Result*: Found 0 errors, exit code 0 (`tsc --noEmit`).

### 2.3 Full Repository Test Suite Run
```powershell
Set-Location "c:\Users\sybon\Desktop\workspace\code\wish_stone\위시 스톤"
npm.cmd test
```
*Command*: `node --test src/__tests__/*.test.ts`

---

## 3. 4-Tier Test Coverage Breakdown

| Tier | Category / Scope | Test Cases | Pass | Fail | Execution Time |
|---|---|:---:|:---:|:---:|:---:|
| **Tier 1** | **Core Feature Coverage (F01–F28)**<br>- F01: 2D Convex Hull Support Polygon (Andrew's Monotone Chain)<br>- F02: Hierarchical Multi-Tier Composite COM ($\vec{X}_{\text{comp}}$)<br>- F03: Directional Support Radius ($R_{\text{support}}$) along arbitrary angles<br>- F04: 3-Zone Stability & Eccentricity Evaluation ($\eta < 0.40$, $0.40 \le \eta \le 0.90$, $\eta > 0.90$)<br>- F05: Damped Harmonic Micro-Wobble ($\theta(t) = \theta_0 e^{-\zeta\omega_n t}\cos(\omega_d t)$)<br>- F06: Coulomb Incline Friction Slip ($\theta_c \approx 26.565^\circ, a_t = g(\sin\theta - \mu_k\cos\theta)$)<br>- F07: Overturning Gravitational Torque ($\vec{\tau} = \vec{r} \times (-mg\hat{j}), \tau_{\text{crit}}$)<br>- F08: 5-Shape Rigid Body Dynamics Specs ($0.25 \times \text{scale}$, mass, friction 0.8)<br>- F09: Cascading Collapse & Momentum Transfer (DYNAMIC body wake-up)<br>- F10: Anti-Banana Ground Fall Invariant ($y \to h_{\text{drop}, y}$, zero mid-air suspension)<br>- F11: 3D Direct Screen Pointer Drag Mapping (upward lift, azimuth projection)<br>- F12: Depth Convergence Mechanics ($Z(p) = 1.15(1-p)$)<br>- F13: Live Visual Balance Aura Feedback (Toss Blue `#3182F6`, Amber `#FFB300`, Coral `#FF6B6B`)<br>- F14: Mutual OrbitControls Lock (locked during active drag, restored on release)<br>- F15: Trajectory LERP & SLERP Playback (60Hz interpolation with shortest 4D geodesic)<br>- F16: Zen Garden Environment ($R=28\text{m}$, 9 ripple rings, 6 stepping stones, fogExp2, 24 fireflies)<br>- F17: 4 Camera Viewport Presets (Front, Side 45°, Top, Free with height adaptation)<br>- F18: Safe Cylindrical Target Clamping ($R \le 15\text{m}$, $Y \in [0.2, Y_{\text{top}}+2.5]$) & Recenter HUD<br>- F19: Focus Camera Glide on Stone Tap ($1.8\text{m}$ distance, $+0.35\text{m}$ elevation)<br>- F20: River Pebble Procedural Geometry (smooth normals, anti-clipping parity)<br>- F21: 12-Tone Natural Mineral Color Palette (valid hex, dark background contrast)<br>- F22: Random Pebble Reroll UI (`rerollStone` controller action)<br>- F23: UI Clutter Elimination Contract (clean state, no invasive bypass buttons)<br>- F24: SCR-04 Home Dashboard Hierarchy (ordered top-down layout, empty state safety)<br>- F25: In-Place Stone Inspection (SCR-10) Data Contracts (privacy & anonymous rules)<br>- F26: Fallen Stone Choice UX (D-022) (`[ ↺ 다시 올려보기 ]` vs `[ ⛰️ 이 자리에 그대로 두기 ]`)<br>- F27: 3-Attempt Placement Lifecycle & Apex Auto-Settling (`autoPlaced: true`)<br>- F28: Anti-Dummy QA Testing Gate Integrity Verification | 28 | 28 | 0 | ~118ms |
| **Tier 2** | **Boundary Value Analysis (BVA)**<br>- BVA 2.1: Stability eccentricity boundaries ($\eta = 0.40 \pm 10^{-4}$ and $\eta = 0.90 \pm 10^{-4}$)<br>- BVA 2.2: Coulomb static friction slip boundary ($\theta_c \approx 26.565^\circ \pm 10^{-4\circ}$)<br>- BVA 2.3: Extreme aspect ratio non-clipping invariant across all 25 shape pairs ($\Delta y \ge h_1 + h_2$)<br>- BVA 2.4: Empty tower baseline top surface $Y = 0.0\text{m}$<br>- BVA 2.5: Camera cylindrical target clamping radius ($R = 15.0\text{m}$) and height bounds<br>- BVA 2.6: Recenter HUD lateral distance threshold boundary ($1.999\text{m}$ vs $2.000\text{m}$) | 6 | 6 | 0 | ~1ms |
| **Tier 3** | **Cross-Feature Interactions**<br>- 3.1: 3D drag unprojection & depth convergence $Z(p) = 1.15(1-p)$ under camera azimuth<br>- 3.2: Severe off-balance drop cascading collapse & safe sand terrain settlement (no void fall)<br>- 3.3: Multi-stone cantilever overhang tipping (cumulative CoM exceeding base foundation)<br>- 3.4: Mutual OrbitControls lock lifecycle throughout drag, release, and mid-gesture teardown<br>- 3.5: Pebble reroll during placement lifecycle with state immutability | 5 | 5 | 0 | ~6ms |
| **Tier 4** | **Real-World Application Workloads**<br>- 4.1: Canonical 5-Stone Zen Cairn Stacking Flow (Boulder $\to$ Flat $\to$ Tall $\to$ Round $\to$ Pebble)<br>- 4.2: Anti-Banana cantilever arch drop refusal (strict non-airborne invariant, tumbling to sand)<br>- 4.3: 3-Attempt drop failure lifecycle leading to apex auto-placement (`autoPlaced: true`)<br>- 4.4: Fallen stone choice UX retry and confirm flows (D-022)<br>- 4.5: Panoramic exploration ($R=12.0\text{m}$), Recenter HUD activation, and smooth camera glide to origin | 5 | 5 | 0 | ~18ms |
| **Scope** | **R4 Scope Isolation & Quarantine Verification**<br>- Isolation 1: Exclusion of multi-location open field biomes<br>- Isolation 2: Exclusion of multi-action wishing mini-games (coin toss, shooting star) | 2 | 2 | 0 | ~1ms |
| **TOTAL** | **Milestone 4 Test Suite** (`e2e-stone-stacking-3d-v2.test.ts`) | **46** | **46** | **0** | **~433ms** |

---

## 4. Feature Coverage Matrix (F01–F28)

| Feature ID | Feature Name | Test Implementation Name | Status |
|:---:|---|---|:---:|
| **F01** | 2D Convex Hull Support Polygon | `Tier 1 - F01: 2D Convex Hull Support Polygon (Andrew's Monotone Chain)` | ✅ PASS |
| **F02** | Hierarchical Multi-Tier Composite COM | `Tier 1 - F02: Hierarchical Multi-Tier Composite COM Calculation` | ✅ PASS |
| **F03** | Directional Support Radius ($R_{\text{support}}$) | `Tier 1 - F03: Directional Support Radius (R_support) Along Arbitrary Angles` | ✅ PASS |
| **F04** | 3-Zone Stability & Eccentricity Evaluation | `Tier 1 - F04: 3-Zone Stability & Eccentricity Evaluation` | ✅ PASS |
| **F05** | Damped Harmonic Micro-Wobble | `Tier 1 - F05: Damped Harmonic Micro-Wobble Oscillation Dynamics` | ✅ PASS |
| **F06** | Coulomb Incline Friction Slip | `Tier 1 - F06: Coulomb Incline Friction Slip on Sloped Contact` | ✅ PASS |
| **F07** | Overturning Gravitational Torque | `Tier 1 - F07: Overturning Gravitational Torque and Threshold` | ✅ PASS |
| **F08** | 5-Shape Rigid Body Dynamics Specs | `Tier 1 - F08: 5-Shape Rigid Body Dynamics Specs` | ✅ PASS |
| **F09** | Cascading Collapse & Momentum Transfer | `Tier 1 - F09: Cascading Collapse & Momentum Transfer` | ✅ PASS |
| **F10** | Anti-Banana Ground Fall Invariant | `Tier 1 - F10: Anti-Banana / Anti-C-Curve Ground Fall Invariant` | ✅ PASS |
| **F11** | 3D Direct Screen Pointer Drag | `Tier 1 - F11: 3D Direct Screen Pointer Drag Mapping` | ✅ PASS |
| **F12** | Depth Convergence Mechanics | `Tier 1 - F12: Depth Convergence Mechanics Z(p) = 1.15(1-p)` | ✅ PASS |
| **F13** | Live Visual Balance Aura Feedback | `Tier 1 - F13: Live Visual Balance Aura Feedback` | ✅ PASS |
| **F14** | Mutual OrbitControls Lock | `Tier 1 - F14: Mutual OrbitControls Lock State Machine` | ✅ PASS |
| **F15** | Trajectory LERP & SLERP Playback | `Tier 1 - F15: Trajectory LERP & SLERP Playback` | ✅ PASS |
| **F16** | Zen Garden Environment & Lighting | `Tier 1 - F16: Zen Garden Environment (R=28m) & Atmospheric Lighting` | ✅ PASS |
| **F17** | 4 Camera Viewport Presets | `Tier 1 - F17: 4 Camera Viewport Presets With Adaptive Height` | ✅ PASS |
| **F18** | Safe Cylindrical Clamping & Recenter HUD | `Tier 1 - F18: Safe Cylindrical Camera Target Clamping & Recenter HUD Trigger` | ✅ PASS |
| **F19** | Focus Camera Glide on Stone Tap | `Tier 1 - F19: Focus Camera Glide on Stone Tap` | ✅ PASS |
| **F20** | River Pebble Procedural Geometry | `Tier 1 - F20: River Pebble Procedural Geometry & Anti-Clipping Parity` | ✅ PASS |
| **F21** | 12-Tone Natural Mineral Palette | `Tier 1 - F21: 12-Tone Natural Mineral Color Palette` | ✅ PASS |
| **F22** | Random Pebble Reroll UI | `Tier 1 - F22: Random Pebble Reroll UI Controller Action` | ✅ PASS |
| **F23** | UI Clutter Elimination | `Tier 1 - F23: UI Clutter Elimination Contract` | ✅ PASS |
| **F24** | SCR-04 Home Dashboard Hierarchy | `Tier 1 - F24: SCR-04 Home Dashboard Hierarchy & Empty State Robustness` | ✅ PASS |
| **F25** | In-Place Stone Inspection (SCR-10) | `Tier 1 - F25: In-Place Stone Inspection (SCR-10) Data Contracts` | ✅ PASS |
| **F26** | Fallen Stone Choice UX (D-022) | `Tier 1 - F26: Fallen Stone Choice UX (D-022) State Machine` | ✅ PASS |
| **F27** | 3-Attempt Placement & Auto-Settling | `Tier 1 - F27: 3-Attempt Placement Lifecycle & Apex Auto-Settling` | ✅ PASS |
| **F28** | Anti-Dummy QA Testing Gate | `Tier 1 - F28: Anti-Dummy QA Testing Gate Integrity Verification` | ✅ PASS |

---

## 5. Implementation Bug Escalation (For Milestone 1 Implementer)

During regression testing of the full test suite (`npm.cmd test`), an implementation defect was discovered in concurrent edits to `src/infrastructure/physics/SimpleTowerPhysicsWorld.ts`:

- **Symptom**: In multi-stone collapse tests (e.g. `tower-dynamic-collapse.test.ts:71`, `adversarial-m2-empirical-friction-determinism-cascade.test.ts:338, 414, 545`, `m4-adversarial-tier5.test.ts:179`, `numerical-stability-tier5.stress.test.ts:536`), `affectedStones` count evaluates to `0`.
- **Root Cause**:
  In `SimpleTowerPhysicsWorld.ts:330-345`:
  ```ts
  const wakeStartIdx =
    hierarchicalStability.failingInterfaceIndex !== undefined
      ? Math.max(0, hierarchicalStability.failingInterfaceIndex)
      : 0;

  let entryIdx = 0;
  for (const entry of this.towerBodies.values()) {
    if (entryIdx >= wakeStartIdx) { ... }
  ```
  When the top dropped stone fails contact stability on top of an N-stone tower, `failingInterfaceIndex` is evaluated as `N - 1` (the interface between the top tower stone and the dropped stone). Consequently, `wakeStartIdx` is `N - 1`, which wakes only the single highest stone in `this.towerBodies` while freezing all lower stones (`entryIdx < wakeStartIdx`) as `CANNON.Body.STATIC` (`mass: 0`). When the heavy dynamic body collides with the tower, the lower stones cannot move, resulting in zero displacements (`disp > 0.03m` is false for all lower stones).
- **Recommended Remedy for Implementing Agent**:
  When cascading collapse is triggered by off-balance collision or topple torque, all tower stones from the impact point downward (or all tower bodies, or bodies with `entryIdx <= wakeStartIdx` / colliding bodies) must be awakened to `DYNAMIC` so that kinetic momentum transfer propagates realistically through the cairn.

---

## 6. Verification Sign-Off

The primary Milestone 4 test suite (`src/__tests__/e2e-stone-stacking-3d-v2.test.ts`) is completely authored, 100% typecheck clean (`Found 0 errors`), executes with 46/46 passing tests in 433ms, contains zero dummy/vacuous tests, and is published for ongoing integration.
