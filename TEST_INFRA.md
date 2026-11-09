# Wish Stone v2: Test Infrastructure & Verification Architecture (TEST_INFRA.md)

- **Version**: 2.0.0
- **Document Status**: Production Test Infrastructure Specification
- **Target Repository**: `c:\Users\sybon\Desktop\workspace\code\wish_stone\위시 스톤`
- **Applicable Milestones**: M1 (Map & Camera), M2 (Physics Engine Overhaul), M3 (Pebble Refinement & Reroll), M4 (Opaque-Box E2E Testing), M5 (Release Hardening)
- **Authoritative Requirements**: `ORIGINAL_REQUEST.md` (Follow-up 2026-11-08T23:35:29Z), `PROJECT_V2.md`, `넓은_맵_및_자유_카메라_탐험_기획서.md`, `차세대_오픈월드_소원_생태계_기획서_v3.md`

---

## 1. Test Philosophy & Core Principles

Wish Stone v2 is a meditative 3D Zen rock-balancing application. The testing strategy is grounded in **Requirement-Driven Opaque-Box End-to-End (E2E) Testing**, governed by five core principles:

1. **Opaque-Box Contract Verification**: Tests evaluate system behavior, state transitions, physical invariants, and interface contracts from the outside without coupling to transient implementation trivia.
2. **Deterministic Mathematical Oracles**: Every expected value is derived from first principles of classical mechanics (Coulomb friction, rigid body torque $\boldsymbol{\tau} = \mathbf{r} \times m\mathbf{g}$, damped harmonic oscillation $\theta(t) = \theta_0 e^{-\zeta\omega_n t}\cos(\omega_d t)$) and canonical UI specifications.
3. **Progressive Testability & Zero Regression**: Wish Stone v1 established 289 automated unit/adversarial tests. All v2 tests are additive and strictly preserve 100% green pass on all existing invariants, particularly the bounding half-extents anti-clipping contract ($\text{halfExtents} = \text{scale} \times 0.25 \pm 10^{-4}$).
4. **Scope Isolation & Quarantine Enforcement (R4)**: Features explicitly excluded by user requirements (multi-location biomes and mini-games like coin toss or shooting star launch) are systematically validated to ensure they remain quarantined from production routes and assets.
5. **Multi-Tier Testing Hierarchy**: Testing is structured across four rigorous tiers plus scope isolation, ensuring deep boundary analysis, combinatorial coverage, and real-world application stability.

---

## 2. Multi-Tier Testing Hierarchy

```
+-----------------------------------------------------------------------------------+
| Tier 4: Real-World Application Workloads                                          |
| - 5-Stone Zen Cairn Full Stacking Flow (Boulder -> Flat -> Oval -> Zen -> Pebble)  |
| - Panoramic Exploration & Return-to-Tower HUD Navigation                          |
| - Off-Center Drop -> Micro-Wobble Damping -> Stable Resting Equilibrium            |
| - Severe Cantilever Drop -> Incline Slip -> Ground Settlement (No Void Fall)      |
+-----------------------------------------------------------------------------------+
                                         ▲
+-----------------------------------------------------------------------------------+
| Tier 3: Cross-Feature Combinations                                                |
| - Panning viewport while holding unplaced stone at spawn pedestal                 |
| - Interrupting stone focus glide with touch pan/orbit                             |
| - Rerolling pebble after dynamic tumble during FALLEN_CHOICE phase                |
| - Rapid reroll stress (100 sequential rerolls) with state immutability           |
+-----------------------------------------------------------------------------------+
                                         ▲
+-----------------------------------------------------------------------------------+
| Tier 2: Boundary & Corner Cases (BVA)                                             |
| - Camera pan boundary: R = 14.99m (allowed) vs R = 15.01m (clamped)               |
| - Zoom limits: minDistance (1.2m) and maxDistance (24.0m)                         |
| - Stability eccentricity bands: eta = 0.399 (stable) vs 0.400 (tension) vs 0.900 |
| - Coulomb incline friction slip: theta = 24.9° (static) vs 26.8° (slip)           |
| - Recenter HUD trigger: lateral offset = 1.99m (hidden) vs 2.00m (visible)        |
+-----------------------------------------------------------------------------------+
                                         ▲
+-----------------------------------------------------------------------------------+
| Tier 1: Core Feature Coverage (>= 5 cases per core category)                      |
| - Map & Free Camera (F01-F10): 28m disc, fog, particles, 6-DoF, clamp, glide, HUD |
| - Physics CoG, Wobble & Slip (F11-F16): CoG eccentricity, multi-zone, wobble, slip|
| - River Pebble & Reroll (F17-F22): Smooth geometry, 12 mineral colors, reroll UI  |
| - Viewport Gesture Decoupling (F09): OrbitControls lock, window listener cleanup  |
+-----------------------------------------------------------------------------------+
                                         ▲
+-----------------------------------------------------------------------------------+
| R4 Scope Isolation & Quarantine Verification                                      |
| - Biome exclusion: No multi-biome routing (Moonlit Pond, Starlit Ridge, etc.)     |
| - Mini-game exclusion: No Lake Coin Toss (COIN) or Shooting Star (STAR) rituals   |
+-----------------------------------------------------------------------------------+
```

---

## 3. Feature Inventory Matrix (F01–F24)

| # | Feature | Category | Milestone | Specification Source | Test Target | Verification Method |
|---|---------|----------|-----------|----------------------|-------------|---------------------|
| **F01** | Zen Garden Landscape Terrain ($R=28\text{m}$) | Map Terrain | M1 | ORIGINAL_REQUEST §R1 | `StoneTowerCanvas.tsx` | Circle geometry $R=28.0\text{m}$, sand ripple rings, stepping stones |
| **F02** | Atmospheric Fog & Matching Sky | Atmosphere | M1 | ORIGINAL_REQUEST §R1 | `StoneTowerCanvas.tsx` | `<fogExp2 attach="fog" args={['#0F121A', 0.032]} />` and scene background `#0F121A` |
| **F03** | 3D Ambient Dust/Firefly Particles | Atmosphere | M1 | ORIGINAL_REQUEST §R1 | `StoneTowerCanvas.tsx` | `<ZenAmbientParticles count={24} />` with single `instancedMesh` |
| **F04** | Infinite Physics Ground Alignment | Physics Ground | M1 | ORIGINAL_REQUEST §R1 | `SimpleTowerPhysicsWorld.ts` | Aligns visual terrain with CANNON ground at $y=0$ |
| **F05** | Expanded OrbitControls Pan & Zoom | Camera Controls | M1 | ORIGINAL_REQUEST §R1 | `StoneTowerCanvas.tsx` | `enablePan={true}`, `screenSpacePanning={true}`, zoom $1.2\text{m} \sim 24.0\text{m}$ |
| **F06** | Cylindrical Camera Target Clamping | Camera Clamping | M1 | ORIGINAL_REQUEST §R1 | `cameraPresetSpec.ts` | Cylindrical target clamp $R \le 15.0\text{m}$, $0.2\text{m} \le y \le \text{topY}+2.5\text{m}$ |
| **F07** | Stone Click Focus Glide | Camera Focus | M1 | ORIGINAL_REQUEST §R1 | `cameraPresetSpec.ts` | 0.5s damped exponential glide to stone at $1.8\text{m}$ inspection distance |
| **F08** | "🎯 돌탑으로 복귀" Recenter HUD Button | Camera HUD | M1 | ORIGINAL_REQUEST §R1 | `StoneTowerCanvas.tsx` | Floating HUD appears when $\|\text{target}_{xz}\| \ge 2.0\text{m}$, smoothly resets to front |
| **F09** | Stone Drag & Viewport Gesture Decoupling | Gesture Decoupling | M1 | ORIGINAL_REQUEST §R1 | `InteractiveDraggableStone3D` | Locks OrbitControls on pointer down; unmount cleanup; pointerId isolation |
| **F10** | Camera Math & Boundary Unit Tests | Verification | M1 | ORIGINAL_REQUEST §R1 | `camera-presets.test.ts` | Math unit tests for `clampCameraTarget` & `computeFocusCameraView` |
| **F11** | Center of Gravity (CoG) & Eccentricity | Physics CoG | M2 | ORIGINAL_REQUEST §R2 | `StabilityEvaluator.ts` | Calculates eccentricity ratio $\eta = d_{\text{ecc}} / R_{\text{support}}$ against contact polygon |
| **F12** | Multi-Zone Critical Torque Threshold | Physics Stability | M2 | ORIGINAL_REQUEST §R2 | `StabilityEvaluator.ts` | 3 zones: Stable ($\eta < 0.40$), Tension ($0.40 \le \eta \le 0.90$), Topple ($\eta > 0.90$) |
| **F13** | Micro-Wobble Damped Oscillation | Physics Wobble | M2 | ORIGINAL_REQUEST §R2 | `SimpleTowerPhysicsWorld.ts` | Damped harmonic oscillation $\theta(t) = \theta_0 e^{-\zeta\omega_n t}\cos(\omega_d t)$ during settlement |
| **F14** | Coulomb Incline Friction Slip | Physics Friction | M2 | ORIGINAL_REQUEST §R2 | `SimpleTowerPhysicsWorld.ts` | Tangential slip when contact incline $\theta > 25^\circ \sim 30^\circ$ ($\tan\theta > \mu_s$) |
| **F15** | Physics Determinism & Settlement Invariant | Physics Verification | M2 | ORIGINAL_REQUEST §R2 | `SimpleTowerPhysicsWorld.ts` | 100% deterministic trajectory; sub-critical ($0.12\text{m}$) & super-critical ($0.55\text{m}$) tests |
| **F16** | Physics Overhaul Unit Tests | Verification | M2 | ORIGINAL_REQUEST §R2 | `physics-wobble-slip.test.ts` | Automated tests for CoG eccentricity, torque thresholds, wobble, and slip |
| **F17** | Elimination of Jagged Box/Polyhedra | Pebble Geometry | M3 | ORIGINAL_REQUEST §R3 | `pebbleGeometrySpec.ts` | Replace detail-0 dodecahedrons and sharp boxes with smooth river pebble meshes |
| **F18** | Procedural River Pebble (몽돌) Geometry | Pebble Geometry | M3 | ORIGINAL_REQUEST §R3 | `pebbleGeometrySpec.ts` | Base-flattened, smooth-normal pebble geometry preserving $\text{halfExtents} = \text{scale} \times 0.25$ |
| **F19** | Natural Mineral Color Spectrum | Pebble Aesthetics | M3 | ORIGINAL_REQUEST §R3 | `pebbleGeometrySpec.ts` | 12 curated river pebble mineral colors with valid `#` hex codes |
| **F20** | `rerollStone` Controller Action | Reroll Logic | M3 | ORIGINAL_REQUEST §R3 | `StackStoneController.ts` | Implements `rerollStone(): Stone` selecting random pebble archetype and color |
| **F21** | "🎲 다른 돌 찾아보기" Reroll UI Button | Reroll UI | M3 | ORIGINAL_REQUEST §R3 | `place.tsx`, `stone.tsx` | Floating UI button triggering real-time re-renders without unmounting canvas |
| **F22** | Pebble Geometry & Reroll Unit Tests | Verification | M3 | ORIGINAL_REQUEST §R3 | `pebble-reroll.test.ts` | Bounding half-extents invariant tests and controller reroll reactivity |
| **F23** | R4 Scope Isolation & Quarantine Check | Scope Isolation | M4 | ORIGINAL_REQUEST §R4 | `e2e-v2-features.test.ts` | AST and route audits verifying exclusion of multi-biomes and mini-games |
| **F24** | Requirement-Driven Opaque-Box E2E Testing | E2E Verification | M4 | ORIGINAL_REQUEST §R5, R6 | `e2e-v2-features.test.ts` | Full 4-tier test suite covering F01–F23, publishing `TEST_READY.md` |

---

## 4. Test Methodologies

### 4.1 Category-Partition Testing (Equivalence Partitioning)
Each core input domain is partitioned into discrete equivalence classes:

| Domain | Partition 1 (Sub-Critical / Nominal) | Partition 2 (Critical / Transition) | Partition 3 (Super-Critical / Out-of-Bounds) |
|---|---|---|---|
| **Camera Target Radius ($R$)** | $0 \le R < 12.0\text{m}$ (Nominal navigation) | $12.0\text{m} \le R \le 15.0\text{m}$ (Perimeter inspection) | $R > 15.0\text{m}$ (Clamped to $15.0\text{m}$) |
| **Camera Distance ($d$)** | $1.2\text{m} \le d \le 24.0\text{m}$ (Valid zoom) | $d < 1.2\text{m}$ (Clamped to $1.2\text{m}$) | $d > 24.0\text{m}$ (Clamped to $24.0\text{m}$) |
| **Recenter Offset ($\Delta r_{xz}$)** | $\Delta r < 2.0\text{m}$ (HUD Hidden) | $\Delta r \ge 2.0\text{m}$ (HUD Visible) | $\Delta r = 0$ (Default Cairn Front View) |
| **CoG Eccentricity Ratio ($\eta$)** | $\eta < 0.40$ (Firm Settlement) | $0.40 \le \eta \le 0.90$ (Micro-Wobble Damping) | $\eta > 0.90$ (Topple Overturning) |
| **Incline Tilt Angle ($\theta$)** | $\theta \le 25^\circ$ (Static Friction Holds) | $25^\circ < \theta \le 30^\circ$ (Incipient Slip) | $\theta > 30^\circ$ (Dynamic Tangential Slide) |
| **Pebble Scale ($s$)** | $0.5 \le s \le 2.0$ (Normal pebble range) | $s < 0.5$ (Micro pebble) | $s > 2.0$ (Large boulder) |

### 4.2 Boundary Value Analysis (BVA)
Tests probe exact limit values:
- **Camera Clamping**: $R = 14.99\text{m}$ (unmodified), $R = 15.00\text{m}$ (exact limit), $R = 15.01\text{m}$ (rescaled).
- **Recenter Trigger**: $\Delta r = 1.99\text{m}$ (`visible: false`), $\Delta r = 2.00\text{m}$ (`visible: true`).
- **Eccentricity Zones**: $\eta = 0.399$ (stable), $\eta = 0.400$ (tension zone entry), $\eta = 0.899$ (high tension), $\eta = 0.901$ (topple).
- **Coulomb Incline Angle**: $\theta = 24.9^\circ$ ($\tan\theta = 0.464 < \mu_s$), $\theta = 26.8^\circ$ ($\tan\theta = 0.505 > \mu_s$).
- **Anti-Clipping Half-Extents Tolerance**: $|h_{\text{actual}} - s \times 0.25| \le 1 \times 10^{-4}\text{m}$.

### 4.3 Pairwise & Combinatorial Testing
To ensure robust multi-attribute behavior:
- All 5 stone shapes $\times$ 12 natural mineral colors $\times$ 3 stability zones $\times$ 4 camera presets are tested for visual-physical coherence.
- Cross-feature interactions: Panning while dragging unplaced stone, focus gliding while tower is wobbling, rerolling after dynamic tumble during `FALLEN_CHOICE`.

### 4.4 Real-World Application Workloads
- Full canonical 5-stone cairn stacking flow (`boulder` base $\to$ `flat` stone $\to$ `oval` pebble $\to$ `zen` rock $\to$ `pebble` cap).
- Exploration journey: Panning away to inspect stepping stones, zooming to $20\text{m}$, triggering Return-to-Tower HUD, and verifying smooth return to origin.
- Physical settlement journey: Sub-critical drops settle firmly; tension drops exhibit micro-wobble damping and settle; severe cantilever drops slide cleanly off slopes to rest on the Zen sand terrain without void fall.

---

## 5. Repository Directory Layout

```
위시 스톤/
├── TEST_INFRA.md                   # This document
├── TEST_READY.md                   # Test execution & readiness report
├── package.json                    # Scripts: "test", "typecheck"
├── src/
│   ├── domain/
│   │   ├── entities/               # Stone.ts, Tower.ts, Wish.ts
│   │   ├── value-objects/          # Pose.ts, TowerKey.ts, CheerLevel.ts, BloomType.ts
│   │   └── ports/                  # PhysicsWorld.ts, EffectBus.ts, repositories.ts
│   ├── infrastructure/
│   │   └── physics/
│   │       ├── StabilityEvaluator.ts         # CoG, Support Polygon, Critical Torque
│   │       ├── SimpleTowerPhysicsWorld.ts     # CANNON 60Hz PGS solver, Wobble, Slip
│   │       ├── StonePhysicsBodyFactory.ts     # Half-extents, Ground Plane Body
│   │       └── PhysicsSimulationTypes.ts     # Stability & simulation interfaces
│   ├── presentation/
│   │   ├── components/
│   │   │   ├── StoneTowerCanvas.tsx          # 3D Scene, Fog, Particles, Controls, HUD
│   │   │   ├── cameraPresetSpec.ts           # Pure camera math, clamping & focus glide
│   │   │   ├── stoneTowerSpec.ts             # Pebble geometry & material specs
│   │   │   ├── pebbleGeometrySpec.ts         # Organic pebble geometry factory & colors
│   │   │   └── stoneDragSpec.ts              # 3D pointer drag & depth convergence math
│   │   └── controllers/
│   │       └── StackStoneController.ts       # Stacking, AR, Quota & rerollStone()
│   ├── app/
│   │   ├── home.tsx                          # SCR-04 Clean Dashboard
│   │   ├── settings/index.tsx                # SCR-18 Settings
│   │   ├── tower/index.tsx                   # Dedicated Tower Exploration & Focus
│   │   └── stack/
│   │       ├── stone.tsx                     # SCR-05 Stone selection & Reroll UI
│   │       ├── write.tsx                     # SCR-06 Wish text & classification
│   │       └── place.tsx                     # SCR-07 3D Stacking & Gesture Decoupling
│   └── __tests__/
│       ├── e2e-v2-features.test.ts           # ★ Comprehensive 4-Tier E2E Test Suite
│       ├── camera-presets.test.ts            # M1 Camera unit tests
│       ├── physics-wobble-slip.test.ts       # M2 Physics unit tests
│       ├── pebble-reroll.test.ts             # M3 Pebble & reroll unit tests
│       └── [28 existing unit/e2e tests]      # All existing baseline tests
```

---

## 6. Test Runner Commands & Execution Instructions

All commands must be executed within the project repository root:
`c:\Users\sybon\Desktop\workspace\code\wish_stone\위시 스톤`

### 6.1 Full Test Suite Execution
Runs all test suites across the repository (existing 289 tests + v2 E2E test suite):
```powershell
Set-Location "c:\Users\sybon\Desktop\workspace\code\wish_stone\위시 스톤"
npm.cmd test
```
*Expected Output*: Zero failures (`fail: 0`), exit code 0.

### 6.2 Target-Specific E2E Test Run
Runs only the v2 4-Tier E2E feature test suite:
```powershell
Set-Location "c:\Users\sybon\Desktop\workspace\code\wish_stone\위시 스톤"
node --test src/__tests__/e2e-v2-features.test.ts
```

### 6.3 Static AST & TypeScript Compilation Check
Verifies static type soundness across all application files:
```powershell
Set-Location "c:\Users\sybon\Desktop\workspace\code\wish_stone\위시 스톤"
npm.cmd run typecheck
```
*Expected Output*: Zero compiler errors (`Found 0 errors`), exit code 0.

---

## 7. Pass Criteria & Quality Gate

A test run is considered **PASSED** if and only if:
1. `npm.cmd test` passes with 100% green: `pass >= 320`, `fail == 0`, `cancelled == 0`.
2. `npm.cmd run typecheck` produces 0 TypeScript errors.
3. Anti-Clipping Invariant `Anti-Clipping 1` holds with $|h_{\text{visual}} - s \times 0.25| \le 1\times 10^{-4}$.
4. Determinism Invariant `Tier 1.1` holds with identical trajectory output across parallel physics simulations.
5. Scope Isolation Invariant `F23` confirms that secondary biomes and coin/star mini-games are completely excluded from production routes.
