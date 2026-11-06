# Test Readiness Verification Manifest (TEST_READY.md)

**Project**: Wish Stone (`위시 스톤`)  
**Milestone**: Milestone 4: Requirement-Driven Opaque-Box E2E Testing Suite (3D Drag Interaction, Anti-Clipping Geometry & Physics, Home Cleanup & Settings Separation)  
**Date**: 2026-11-06  
**Author**: `test_writer_e2e_m4_1` (Teamwork Test Writer)  
**Verification Gate**: **100% PASS** (Milestone 4 E2E Suite: 40 / 40 tests passed, 0 failed, 0 skipped, duration: ~176ms; `npx tsc --noEmit`: 0 errors)  

---

## 1. Test Runner & Execution Commands

The test suite runs natively in headless Node.js v24 with ESM and zero external mock dependencies (no DOM/WebGL stubs required).

```powershell
Set-Location "c:\Users\sybon\Desktop\workspace\code\wish_stone\위시 스톤"

# 1. Typecheck verification gate: 0 errors
cmd /c "npx tsc --noEmit"

# 2. Run new Milestone 4 E2E test suite directly (40 tests)
node --test src/__tests__/e2e-drag-anti-clipping-home.test.ts
```

---

## 2. Test Suite Breakdown & Test Case Inventory

### Summary Matrix
| Category | File | Test Count | Pass Status | Duration |
|---|---|---|---|---|
| **Tier 1: Feature Coverage (R1–R4)** | `src/__tests__/e2e-drag-anti-clipping-home.test.ts` | 24 tests | 24 / 24 PASS | ~35ms |
| **Tier 2: Boundary & Corner Cases** | `src/__tests__/e2e-drag-anti-clipping-home.test.ts` | 6 tests | 6 / 6 PASS | ~15ms |
| **Tier 3: Cross-Feature Interactions** | `src/__tests__/e2e-drag-anti-clipping-home.test.ts` | 5 tests | 5 / 5 PASS | ~12ms |
| **Tier 4: Real-World User Scenarios** | `src/__tests__/e2e-drag-anti-clipping-home.test.ts` | 5 tests | 5 / 5 PASS | ~18ms |
| **Total Milestone 4 E2E Suite** | `src/__tests__/e2e-drag-anti-clipping-home.test.ts` | **40 tests** | **40 / 40 PASS** | **~176ms** |

---

### Detailed Test Inventory (`e2e-drag-anti-clipping-home.test.ts`)

#### Tier 1: Feature Coverage (24 tests)

##### Area 1: R1 (3D Stone Direct Drag Interaction Contracts, 6 tests)
- [x] **T1.1 - Initial Spawn Coordinate**: Verifies `computeInitialSpawnPosition` initializes stone in front of cairn at $(0, 0.18, 1.15)$, safe from base stones at $Z = 0$.
- [x] **T1.2 - 3D Pointer Drag Mechanics**: Verifies upward screen movement ($-\Delta y > 0$) maps to increasing 3D world $Y$ coordinate and lateral $\Delta x$ maps to world $X$.
- [x] **T1.3 - Depth Convergence Contract**: Verifies $Z$ converges smoothly from $1.15 \to 0.0$ as normalized vertical progress advances towards target drop zone.
- [x] **T1.4 - Real-Time Balance Rating**: Verifies horizontal cantilever evaluation: $|X| \le 0.12\text{m} \implies \text{'stable'}$, $0.12 < |X| \le 0.25\text{m} \implies \text{'caution'}$, $|X| > 0.25\text{m} \implies \text{'critical'}$.
- [x] **T1.5 - Drop Pose Generation & Zone Detection**: Verifies `isOverDropZone` boundaries and verifies `calculate3DDropPoseFromWorldPosition` generates valid `Pose` with unit quaternion.
- [x] **T1.6 - 2D Button Elimination & Canvas Drag Callbacks**: Verifies canvas props contract (`isDraggable`, `onStoneDragStart`, `onStoneDragMove`, `onStoneDrop`) and elimination of legacy 2D button UI.

##### Area 2: R2 (Anti-Penetration & Anti-Clipping Invariants, 6 tests)
- [x] **T1.7 - Visual & Collision Geometry Parity**: Verifies visual geometry half-extents match CANNON collision half-extents ($0.25 \cdot scale.y$) within $5\text{mm}$ across all 5 shapes.
- [x] **T1.8 - Tower Top Surface Calculation**: Verifies `Tower.topSurfaceY()` returns true highest surface boundary $\max(y_i + h_{i,y})$ ($0.935\text{m}$) rather than stone center Y ($0.730\text{m}$).
- [x] **T1.9 - Dynamic Pose.onTopOf Placement**: Verifies placing new stone on top surface yields base position flush with top surface with zero vertical interpenetration.
- [x] **T1.10 - Drop Spawn Elevation Clearance**: Verifies spawn elevation $\text{dropY} = \text{topSurfaceY} + h_{\text{drop}} + 0.08 + \text{heightBonus}$ guarantees $\ge 8\text{cm}$ air clearance at frame 0.
- [x] **T1.11 - Sample Tower Initial Coordinate Non-Penetration**: Verifies base stones sit above floor ($y \ge h_y$) and top stone sits above base top surface ($\Delta y \ge h_1 + h_2$).
- [x] **T1.12 - Physics Settlement Invariant & Micro-Clamping**: Verifies settled stone bottom satisfies $y - h_{\text{drop}} \ge \text{topSurfaceY} - 0.02$, and clamping restores exact flush resting.

##### Area 3: R3 (Main Home SCR-04 Layout Hierarchy & Settings Separation, 7 tests)
- [x] **T1.13 - Header Layout & Settings Navigation Chip**: Verifies Header contains brand and `[⚙️ 설정]` navigation chip routing to `/settings`.
- [x] **T1.14 - Category Tabs Under Header**: Verifies Section ① Category Tabs are positioned directly below Header ahead of stats and 3D preview.
- [x] **T1.15 - Compact Inline Stats Bar**: Verifies bulky card is replaced with compact inline stat row (`돌 1,234 · 오늘 56 · 🌱 78`).
- [x] **T1.16 - 3D Viewport In-Place Stone Tap**: Verifies tapping stone in canvas opens `WishDetailBottomSheet` (SCR-10) in-place on Home without routing away.
- [x] **T1.17 - Viewport Clutter Elimination**: Verifies removal of redundant bottom `/tower` banner from 3D viewport.
- [x] **T1.18 - Wish Feed Report Trigger & Cheer News Banner**: Verifies wish card footer has report `⋯` trigger and cheer news banner renders conditionally.
- [x] **T1.19 - Settings Isolation (SCR-18)**: Verifies `/settings` contains profile, quota, social link, and withdrawal with clean back navigation to `/home`.

##### Area 4: R4 (Quality Gates & Runtime Contracts, 5 tests)
- [x] **T1.20 - Rigid Body Physics Table Immutability**: Verifies all 5 shapes have positive mass, valid half-extents, high friction ($0.75$), and low restitution ($0.08$).
- [x] **T1.21 - Settled Stone Clearance Contract Across 25 Shape Pairs**: Verifies $\Delta y \ge h_1 + h_2$ produces 0 penetration depth for all pairs $(s_1, s_2)$.
- [x] **T1.22 - Numerical Stability & NaN/Infinity Protection**: Verifies drag calculation and pose generation sanitize non-finite inputs without crashing.
- [x] **T1.23 - Visual Effect Bus & Toast Triggers**: Verifies stone stacking emits `stone_stacked` event and shows toast notification.
- [x] **T1.24 - Navigation Router Cycle Integrity**: Verifies navigation cycle across `/home`, `/stack/place`, `/settings`, and `/tower` preserves route stack.

---

#### Tier 2: Boundary & Corner Cases (6 tests)
- [x] **T2.1 - Empty Tower Top Surface Boundary**: Verifies empty tower ($N = 0$) returns `topSurfaceY() = 0.0m` and places first stone safely at half-height.
- [x] **T2.2 - Extreme Tower Height Boundary (50.0m)**: Verifies drag target elevation and depth convergence remain finite and numerically stable on massive cairns.
- [x] **T2.3 - Extreme Pointer Drag Coordinates**: Verifies pointer displacement $\pm 5000\text{px}$ clamps progress $[0, 1]$ and produces bounded 3D coordinates.
- [x] **T2.4 - Multi-Stone Bounding Limits (10-Stone Cairn)**: Verifies sequential stacking of 10 stones maintains monotonic height and zero cumulative clipping across all 9 interfaces.
- [x] **T2.5 - Extreme Aspect Ratio Stacking**: Verifies stacking tall slender on wide flat and vice versa satisfies anti-clipping elevation.
- [x] **T2.6 - Downward Drag Reversal**: Verifies dragging below spawn floor clamps progress to $0.0$ and prevents ground penetration.

---

#### Tier 3: Cross-Feature Interactions (5 tests)
- [x] **T3.1 - Drag Interaction + Anti-Clipping Elevation**: Verifies dragging stone to drop zone computes drop pose with zero bounding box collision against tower top surface.
- [x] **T3.2 - Home Category Switch + 3D Stone Selection**: Verifies switching category tab updates tower scope and opens SCR-10 bottom sheet with correct category badge.
- [x] **T3.3 - Balance Feedback + Drop Settlement**: Verifies stable drag rating settles safely whereas critical rating predicts unstable tumble.
- [x] **T3.4 - Home Settings Navigation + Back Return**: Verifies navigating to `/settings` and returning via `router.back()` preserves active category tab.
- [x] **T3.5 - OrbitControls Suppression During Drag**: Verifies 3D stone drag suppresses camera orbit controls to prevent view tilting during placement.

---

#### Tier 4: Real-World User Scenarios (5 tests)
- [x] **T4.1 - Journey 1 (End-to-End Stacking)**: Home Dashboard $\to$ Tap CTA $\to$ `/stack/place` $\to$ 3D Drag & Drop $\to$ Verify settled cairn $\to$ Return Home.
- [x] **T4.2 - Journey 2 (In-Place Stone Inspection & Cheer)**: Home Dashboard $\to$ Tap Stone in 3D Viewport $\to$ Open SCR-10 $\to$ Send Cheer $\to$ Toast notification.
- [x] **T4.3 - Journey 3 (Settings Isolation & Quota Management)**: Home Dashboard $\to$ Tap `[⚙️ 설정]` $\to$ Enter `/settings` $\to$ Claim quota recharge $\to$ Return to Home.
- [x] **T4.4 - Journey 4 (Multi-Tier Progressive Cairn Stacking)**: Progressive construction of 4-tier cairn (Boulder $\to$ Round $\to$ Tall $\to$ Pebble) with zero clipping at each tier.
- [x] **T4.5 - Journey 5 (Critical Balance Recovery & Placement)**: Drag off-center to critical warning $\to$ pull back to stable zone $\to$ release on drop zone safely.

---

## 3. Verification Gate Summary

| Gate Requirement | Command | Result |
|---|---|---|
| **Type Check** | `cmd /c "npx tsc --noEmit"` | **0 errors, Exit code 0** |
| **Milestone 4 E2E Test Suite** | `node --test src/__tests__/e2e-drag-anti-clipping-home.test.ts` | **40 / 40 Passed (100%), ~176ms** |
