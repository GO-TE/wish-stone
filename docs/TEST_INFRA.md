# Automated Testing Infrastructure & Verification Architecture (TEST_INFRA)

**Project**: Wish Stone (`위시 스톤`)  
**Scope**: 3D Stone Direct Drag Interaction, Anti-Penetration & Clipping Invariants, Main Home SCR-04 Hierarchy & SCR-18 Settings Separation (Requirements R1, R2, R3, R4)  
**Milestones**: M1–M4 (Milestone 4: Requirement-Driven Opaque-Box E2E Testing Suite)  
**Environment**: Node.js v24 (Native ESM, `node:test`, `node:assert/strict`, `@react-three/fiber`, `three: ^0.169.0`, `cannon-es: ^0.20.0`)  

---

## 1. Test Philosophy

The Wish Stone Milestone 4 E2E test suite (`e2e-drag-anti-clipping-home.test.ts`) is designed on five architectural testing pillars to guarantee 3D geometric fidelity, physics stability, UX layout ergonomics, and zero regression:

### 1.1 Opaque-Box Requirement-Driven Testing
Tests treat 3D rendering viewports, drag interaction systems, physics collision boundaries, and navigation hierarchy as an opaque-box system. All test cases are derived strictly from user requirements in `ORIGINAL_REQUEST.md` and architectural specifications in `PROJECT.md`:
- **3D Direct Drag Mechanics (R1)**: Verifies initial spawn coordinate $(0, 0.18, 1.15)$, camera-facing pointer mapping, depth convergence ($Z: 1.15 \to 0.0$), real-time horizontal cantilever balance rating (`stable` / `caution` / `critical`), drop elevation calculation, and elimination of the legacy 2D button UI (`styles.draggableStone`, `PanResponder`).
- **Anti-Penetration & Anti-Clipping Invariants (R2)**: Visual dodecahedron and box geometry half-extents match CANNON collision half-extents ($0.25 \cdot scale.y$) within $5\text{mm}$, dynamic top surface tracking $\text{topSurfaceY}() = \max(y_i + h_{i,y})$, flush base placement $\Delta y \ge h_1 + h_2$, zero frame-0 spawn overlap ($\text{bottomY}_{\text{spawn}} > \text{topSurfaceY}$), and physical resting clearance ($y - h_{\text{drop}} \ge \text{topSurfaceY} - 0.02$).
- **SCR-04 Hierarchy & SCR-18 Settings Isolation (R3)**: Header with brand, chips, and `[⚙️ 설정]` navigation chip routing to `/settings`; Category filter tabs (Section ①); compact inline stats bar (`돌 1,234 · 오늘 56 · 🌱 78`, Section ②); 3D viewport with in-place stone tap opening `WishDetailBottomSheet` (SCR-10) without page navigation; removal of redundant `/tower` banner; wish card report `⋯` trigger; and conditional cheer news banner.
- **Quality Gates & Runtime Contracts (R4)**: Zero type errors with `npx tsc --noEmit`, 100% test pass rate with `node:test`, and non-finite NaN/Infinity protection.

### 1.2 Category-Partition Method (CPM)
The input domain of 3D stone drag coordinates, cairn heights, stone shapes, and navigation states is partitioned into mathematically disjoint equivalence classes across five fundamental dimensions:

| Dimension | Equivalence Partitions | Values / Ranges | Functional Significance |
|---|---|---|---|
| **Stone Shapes** | `boulder`<br>`flat`<br>`tall`<br>`round`<br>`pebble` | $h_y = 0.2625\text{m}, m = 2.5\text{kg}$<br>$h_y = 0.1050\text{m}, m = 1.5\text{kg}$<br>$h_y = 0.3625\text{m}, m = 1.4\text{kg}$<br>$h_y = 0.2050\text{m}, m = 1.2\text{kg}$<br>$h_y = 0.1450\text{m}, m = 0.6\text{kg}$ | Broad base anchor<br>Wide resting platform<br>High-rise vertical riser<br>Natural spherical middle<br>Lightweight capstone |
| **Drag Cantilever Offset ($|X|$)** | Stable ($|X| \le 0.12\text{m}$)<br>Caution ($0.12 < \|X\| \le 0.25\text{m}$)<br>Critical ($|X| > 0.25\text{m}$) | Centered drop zone<br>Moderate eccentricity<br>Unstable overhanging cantilever | Green/blue visual feedback<br>Amber warning feedback<br>Red warning & tumble prediction |
| **Drag Elevation ($Y$)** | Below Spawn ($Y < 0.18\text{m}$)<br>Mid-Flight ($0.18 \le Y < Y_{\text{target}} - 0.15$)<br>Ready to Drop ($Y \ge Y_{\text{target}} - 0.15$) | Downward drag<br>Rising along drag plane<br>Over target cairn summit | Clamps progress to $0.0$<br>Interpolates depth $Z: 1.15 \to 0.0$<br>`isOverDropZone === true` |
| **Tower Height ($Y_{\text{top}}$)** | Empty Ground ($0.0\text{m}$)<br>Standard Cairn ($0.5 \sim 3.0\text{m}$)<br>Extreme Cairn ($50.0\text{m}$) | $0$ stones<br>$2 \sim 8$ stones<br>Massive monolith | Places stone directly on floor $y = h_{\text{drop}}$<br>Calculates true surface $\max(y_i + h_{i,y})$<br>Finite arithmetic without numerical overflow |
| **Screen Navigation** | `/home`<br>`/stack/place`<br>`/settings`<br>`/tower` | SCR-04 Dashboard<br>SCR-07 3D Stacking<br>SCR-18 Settings & Quota<br>360° Cairn Inspection | Tab switching, stats, feed, SCR-10 in-place<br>3D drag interaction, drop settlement<br>Isolated profile, quota, account deletion<br>Full-screen OrbitControls |

### 1.3 Boundary Value Analysis (BVA)
Tests probe exact boundary conditions where UI and 3D behavior transitions:
- **Zero-Volume Penetration Boundary ($\Delta y \ge h_1 + h_2$)**: Vertical center-to-center distance must be at least the sum of both stone half-extents. Any value below $h_1 + h_2$ produces positive penetration depth and is rejected.
- **Empty Tower Top Surface Boundary ($N = 0$)**: When tower contains 0 stones, `topSurfaceY()` must return exactly $0.0\text{m}$, and the initial stone must rest on the ground plane at $y = h_{\text{drop}}$.
- **Extreme Drag Input Bounds ($\Delta x = \pm 5000\text{px}, \Delta y = \pm 5000\text{px}$)**: Clamps normalized progress strictly to $[0, 1]$ and produces finite, non-overflowing 3D coordinates.
- **Downward Drag Reversal ($\Delta y > 0$)**: Dragging below initial spawn elevation clamps progress to $0.0$ and prevents the stone from penetrating into the floor.
- **Micro-Clamping Boundary ($\text{bottom} < \text{topSurfaceY}$)**: Physical contact solver micro-penetrations ($< 0.02\text{m}$) are clamped to guarantee flush contact with zero numerical sinking.

### 1.4 Pairwise Combinatorial Matrix
Critical interactive and visual variables are sampled pairwise:
$$\text{Drag World Position} \times \text{Drop Zone Clearance} \times \text{Tower Top Surfaces} \times \text{Category Tabs} \times \text{Modal Overlays}$$
Selected test vectors verify cross-cutting interactions:
- Dragging a 3D stone over a multi-stone tower computes drop elevation with zero bounding volume clipping.
- Switching category tabs on Home updates tower scope and selects stones opening SCR-10 for that specific tower.
- Dragging a stone with critical balance rating predicts unstable drop and alerts user to center the stone.
- Navigating to `/settings` from Home and returning preserves selected category tab state.
- Initiating 3D stone drag suppresses canvas OrbitControls to eliminate camera tilting during placement.

### 1.5 Anti-Facade & Genuine Execution Protocol
To satisfy strict integrity requirements:
1. **Zero Hardcoded Stubs**: Tests run against real domain entities (`Tower`, `Stone`, `Wish`, `Pose`, `TowerKey`), physics body configs, and event buses.
2. **True Contact Invariant Verification**: All 25 shape pairs $(s_1, s_2)$ are evaluated for contact clearance $\Delta y \ge h_1 + h_2$.
3. **Genuine Event Buses**: Uses `InMemoryEffectBus` capturing `stone_stacked` and `cheer_spark` events and `ToastStore` managing real notification queues.

---

## 2. Feature Inventory Mapping

Features F01 through F16 from `PROJECT.md` are directly covered across the 4-tier matrix:

| Feature ID | Feature Name | Test Suite | Test Cases | Primary Invariants & Assertions |
|---|---|---|---|---|
| **F01** | Anti-Clipping Geometry Parity | `e2e-drag-anti-clipping-home` | T1.7 | Visual mesh half-extents match CANNON collision half-extents ($0.25 \cdot scale.y$) within $5\text{mm}$ across all 5 shapes |
| **F02** | Tower Top Surface API | `e2e-drag-anti-clipping-home` | T1.8, T2.1 | `topSurfaceY()` returns $\max(y_i + h_{i,y})$ across all stones; $0.0\text{m}$ on empty tower |
| **F03** | Dynamic Top Surface Pose Placement | `e2e-drag-anti-clipping-home` | T1.9, T1.21 | `Pose.onTopOf(topSurfaceY, halfHeight)` places base flush on top surface ($\Delta y \ge h_1 + h_2$) |
| **F04** | Collision-Free Spawn Elevation & Initial Poses | `e2e-drag-anti-clipping-home` | T1.10, T1.11 | Spawn elevation $\text{dropY} = \text{topSurfaceY} + h_{\text{drop}} + 0.08 + \text{heightBonus}$; sample tower base stones at $y = h_y$ |
| **F05** | Physics Settlement Invariant & Clamping | `e2e-drag-anti-clipping-home` | T1.12 | Settled stone bottom $\ge \text{topSurfaceY} - 0.02$; micro-clamping restores flush placement |
| **F06** | Anti-Clipping Automated Tests | `e2e-drag-anti-clipping-home` | T1.7–T1.12, T2.4, T2.5 | 6 core anti-clipping tests verifying mathematical non-penetration across all shapes |
| **F07** | 2D Draggable Button UI Removal | `e2e-drag-anti-clipping-home` | T1.6, T4.1 | 2D button elimination contract; absence of `styles.draggableStone` and `PanResponder` |
| **F08** | 3D Stone Drag Math Specification | `e2e-drag-anti-clipping-home` | T1.1–T1.5, T2.2, T2.3 | Spawn at $(0, 0.18, 1.15)$; pointer mapping; depth convergence $Z: 1.15 \to 0.0$; balance rating |
| **F09** | 3D Draggable Stone Component & Pointer Events | `e2e-drag-anti-clipping-home` | T1.6, T3.5 | W3C pointer events; OrbitControls locked during 3D stone drag (`isOrbitControlsEnabled = false`) |
| **F10** | 3D Drag Drop Integration | `e2e-drag-anti-clipping-home` | T1.5, T3.1, T4.1 | `calculate3DDropPoseFromWorldPosition` produces valid drop Pose; delivers to `StackStoneController` |
| **F11** | 3D Drag Interaction Automated Tests | `e2e-drag-anti-clipping-home` | T1.1–T1.6, T3.3, T4.5 | 6 core drag interaction tests verifying geometry, unprojection, and state lifecycle |
| **F12** | SCR-04 Hierarchy Restructuring in `home.tsx` | `e2e-drag-anti-clipping-home` | T1.14, T1.15 | Top-to-bottom order: Header → Tabs → Compact Stat Bar → 3D Viewport → Feed → News → CTA |
| **F13** | 3D Viewport Clutter Removal & SCR-10 In-Place | `e2e-drag-anti-clipping-home` | T1.16, T1.17, T4.2 | Redundant bottom banner removed; `onSelectStone` opens SCR-10 modal in-place without page transition |
| **F14** | Settings Navigation & Isolation (SCR-18) | `e2e-drag-anti-clipping-home` | T1.13, T1.19, T4.3 | Header `[⚙️ 설정]` chip navigates to `/settings`; settings isolated in `/settings/index.tsx` |
| **F15** | Wish Card Report & Conditional Cheer Banner | `e2e-drag-anti-clipping-home` | T1.18 | Wish card `⋯` report trigger; Section ⑤ cheer news banner renders when unread count $> 0$ |
| **F16** | Quality Gates & Clean Baseline | `e2e-drag-anti-clipping-home` | T1.20–T1.24 | Positive definite physics configs; NaN/Infinity sanitation; router cycle; clean compilation |

---

## 3. Test Architecture & Execution Topology

### 3.1 Headless Node.js Execution Harness
- **Runtime**: Native Node.js v24 (`node:test`, `node:assert/strict`).
- **Command**: `node --test src/__tests__/e2e-drag-anti-clipping-home.test.ts`.
- **Zero External Mock Dependencies**: Runs directly against genuine domain entities, physics configs, and mathematical specifications without browser or WebGL mocks.
- **Execution Speed**: All 40 test cases execute in $< 200\,\text{ms}$.

### 3.2 Mathematical Oracles & Acceptance Tolerances
1. **Depth Convergence Oracle**:
   $$Z(p) = Z_{\text{initial}} \cdot (1 - p) + 0.0 \cdot p = 1.15 \cdot (1 - p)$$
   When $p = 1$, $Z = 0.0$ directly above the cairn axis.
2. **Anti-Penetration Oracle**:
   $$\Delta y = y_{\text{upper}} - y_{\text{lower}} \ge h_{\text{lower}, y} + h_{\text{upper}, y}$$
   $$\text{penetrationDepth} = \max\left(0, (h_{\text{lower}, y} + h_{\text{upper}, y}) - \Delta y\right) = 0.0\text{m}$$
3. **Drop Spawn Elevation Clearance Oracle**:
   $$\text{spawnY} = \text{topSurfaceY} + h_{\text{drop}, y} + 0.08 + \text{heightBonus}$$
   $$\text{bottomY}_{\text{spawn}} - \text{topSurfaceY} \ge 0.08\text{m}$$
4. **Balance Rating Oracle**:
   $$\text{Rating}(|X|) = \begin{cases} \text{'stable'}, & |X| \le 0.12\text{m} \\ \text{'caution'}, & 0.12\text{m} < |X| \le 0.25\text{m} \\ \text{'critical'}, & |X| > 0.25\text{m} \end{cases}$$
5. **Drop Zone Recognition Oracle**:
   $$\text{isOverDropZone} \iff (Y \ge \text{targetDropY} - 0.15) \land (|X| \le 0.35) \land (|Z| \le 0.30)$$

---

## 4. Verification & Quality Gates

1. **Type Checking**:
   ```cmd
   cmd /c "npx tsc --noEmit"
   ```
   *Gate Requirement*: Exit code 0, 0 type errors across the entire codebase.

2. **Milestone 4 E2E Test Suite**:
   ```powershell
   node --test src/__tests__/e2e-drag-anti-clipping-home.test.ts
   ```
   *Gate Requirement*: 40 / 40 tests executed, 40 passed, 0 failed, duration $< 250\text{ms}$.
