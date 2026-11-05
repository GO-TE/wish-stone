# Automated Testing Infrastructure & Verification Architecture (TEST_INFRA)

**Project**: Wish Stone (`위시 스톤`)  
**Scope**: 3D Rigid-Body Physics Simulation, Stacking Equilibrium & Dynamic Cascading Collapse (Requirements R1, R2, R3)  
**Milestones**: M1–M4 (Authored for Milestone M3: E2E Testing Track)  
**Environment**: Node.js v24 (Native ESM, `node:test`, `node:assert/strict`, `cannon-es: ^0.20.0`)  

---

## 1. Test Philosophy

The Wish Stone physics and tower collapse test suite is built on five core architectural principles designed to guarantee physical realism, prevent regression, and rigorously refute canned/mock animations:

### 1.1 Opaque-Box Requirement-Driven Testing
Tests treat the simulation environment as an opaque-box dynamic system. Rather than testing internal private variables or implementation trivia, tests verify **observable physical invariants**, **mathematical derivatives**, and **domain contracts**:
- **World coordinates**: Rest heights, scatter radii, and lateral trajectories in 3D Cartesian space $(X, Y, Z)$.
- **Kinematic derivatives**: Linear velocities $\mathbf{v}(t)$, angular velocities $\boldsymbol{\omega}(t)$, and numerical accelerations $\mathbf{a}(t) = \frac{\Delta \mathbf{v}}{\Delta t}$.
- **Attitude representations**: 4-element unit quaternions $\mathbf{q} = (q_x, q_y, q_z, q_w)$ preserving 6-DoF orientation.
- **Port contracts**: `PhysicsWorld.drop()` returns `settled`, `pose`, `collapsed`, `affectedStones`, and `trajectory`.

### 1.2 Category-Partition Method (CPM)
The input domain of stone placement is partitioned into mathematically disjoint equivalence classes across five fundamental dimensions:

| Parameter Category | Partition Classes | Values / Ranges | Physical Significance |
|---|---|---|---|
| **Drop Offset ($r_{xz}$)** | Concentric Center<br>Sub-critical Near-Edge<br>Super-critical Near-Edge<br>Extreme Off-Center | $r < 0.10\,\text{m}$<br>$r \in [r_{\text{edge}} - 0.15, r_{\text{edge}} - 0.02]$<br>$r \in [r_{\text{edge}} + 0.02, r_{\text{edge}} + 0.20]$<br>$r > 1.50\,\text{m}$ | Stable resting<br>Equilibrium maintained with minor dampening<br>Overturning torque initiates tumble<br>Immediate free fall to ground plane |
| **Drop Elevation ($h$)** | Low Contact<br>Nominal Drop<br>High Energy Impact | $h \in [0.10, 0.35]\,\text{m}$<br>$h \in [0.50, 0.85]\,\text{m}$<br>$h \ge 2.00\,\text{m}$ | Minimal bounce, fast settling<br>Standard user placement drop<br>Severe impact impulse, high restitution bounce |
| **Stone Shape Geometry** | `flat`<br>`round`<br>`pebble`<br>`boulder`<br>`tall` | Aspect ratio $H/W \approx 0.31$, scale $(1.35, 0.42, 1.25)$<br>Aspect ratio $H/W \approx 0.82$, scale $(1.00, 0.82, 1.00)$<br>Aspect ratio $H/W \approx 0.81$, scale $(0.72, 0.58, 0.68)$<br>Aspect ratio $H/W \approx 0.84$, scale $(1.25, 1.05, 1.20)$<br>Aspect ratio $H/W \approx 1.86$, scale $(0.78, 1.45, 0.76)$ | Low COM, high lateral stability<br>Balanced natural stone<br>Lightweight capstone<br>Heavy base stone, high inertia<br>Slender, high COM, easily tipped |
| **Mass Profile ($m$)** | Light<br>Standard<br>Heavy | $m = 0.6\,\text{kg}$ (`pebble`)<br>$m \in [1.2, 1.5]\,\text{kg}$ (`round`, `tall`, `flat`)<br>$m = 2.5\,\text{kg}$ (`boulder`) | Easily deflected by impacts<br>Nominal stacking bodies<br>Generates high kinetic energy and momentum transfer |
| **Stacking Multiplicity** | Monolithic (1 stone)<br>Bilateral Pair (2 stones)<br>Cairn Stack (3 stones)<br>Pyramid (5 stones) | Single drop on ground<br>Base + Capstone<br>Base + Mid + Capstone<br>2 Base + 2 Mid + 1 Capstone | Ground impact & restitution<br>Support boundary & friction<br>Cascading momentum propagation<br>Multi-contact static equilibrium |

### 1.3 Boundary Value Analysis (BVA)
Tests probe exact boundary conditions where physical behavior transitions discontinuously between stability and collapse:
- **Support Polygon Boundary ($\delta_{\text{margin}} = 0$)**: Placing a stone at $x = r_{\text{support}} - \epsilon$ ($+0.15\,\text{m}$) must settle stably, whereas placing at $x = r_{\text{support}} + \epsilon$ ($+0.55\,\text{m}$) must initiate tipping and tumble.
- **Critical Tipping Angle ($\theta_{\text{crit}} \approx 15^\circ \approx 0.26\,\text{rad}$)**: When tilt angle $2\arccos(q_w)$ exceeds $\theta_{\text{crit}}$, gravitational torque overcomes restorative friction.
- **Coulomb Friction Incline Angle ($\theta_{\text{slip}} = \arctan(\mu)$)**: For stone contact friction $\mu = 0.75$, the theoretical slip angle is $\theta_{\text{slip}} = \arctan(0.75) \approx 36.87^\circ$. At $20^\circ$ stone holds; at $45^\circ$ stone slides.
- **Sleep Velocity Limits**: Sleep state is triggered when linear speed satisfies $\|v\| < 0.05\,\text{m/s}$ and angular speed satisfies $\|\omega\| < 0.05\,\text{rad/s}$ continuously for $\Delta t \ge 0.1\,\text{s}$.

### 1.4 Pairwise Combinatorial Matrix
Critical physical variables are sampled pair-wise to ensure cross-cutting parameter interactions do not induce numerical solver instabilities:
$$\text{Shapes (5)} \times \text{Drop Offsets (4)} \times \text{Elevation (3)} \times \text{Mass Ratios (3)}$$
Selected test vectors verify extreme corners such as slender `tall` stone with high drop elevation, heavy `boulder` dropped onto lightweight `pebble`, and wide `flat` stone dropped off-center.

### 1.5 Anti-Canned Verification Protocol
To fulfill user request R2 and disprove the use of pre-baked keyframe animations, static CSS shakes, or hardcoded coordinates, the test suite enforces five programmatic verification tests:

```
+--------------------------------------------------------------------------------------------------+
|                              ANTI-CANNED VERIFICATION MATRIX                                     |
+-----------------------------------+--------------------------------+-----------------------------+
| Verification Criterion            | Rigid-Body Simulation          | Canned / Pre-baked Mock     |
+-----------------------------------+--------------------------------+-----------------------------+
| 1. Directional Vector Symmetry    | sign(v_final) == sign(x_drop)  | Fixed single direction      |
| 2. Multi-Directional Non-Identity | Pairwise dist(A, B) > 0.8m     | Identical trajectory        |
| 3. Numerical Derivative Continuity| a_y = -9.82 +- 0.05 m/s^2      | Piecewise linear / constant |
| 4. Variable Settling Duration     | Delta N_steps > 20 steps       | Constant setTimeout (3000ms)|
| 5. Momentum Transfer Cascade      | J = m * Delta v knocks base    | Upper only or static timer  |
+-----------------------------------+--------------------------------+-----------------------------+
```

1. **Directional Vector Symmetry**: Dropping off-center in the $+X$ (East), $-X$ (West), $+Z$ (North), or $-Z$ (South) direction must scatter the tumbling stones along the corresponding positive/negative coordinate axis with $> 95\%$ vector alignment.
2. **Multi-Directional Trajectory Non-Identity**: Pairwise Euclidean distances between the resting endpoints of directional drops must strictly satisfy:
   $$\sqrt{(x_i - x_j)^2 + (z_i - z_j)^2} > 0.8\,\text{m} \quad (\forall i \ne j)$$
3. **Second Numerical Derivative ($\ddot{y}(t)$)**: During free fall, the numerical acceleration computed from finite velocity differences:
   $$a_y[k] = \frac{v_y[k] - v_y[k-1]}{\Delta t}$$
   must match gravitational acceleration $-9.82 \pm 0.05\,\text{m/s}^2$ at every non-colliding timestep.
4. **Variable Settling Duration**: Dynamic sleep time varies as a function of kinetic energy and impact height. Low drops ($h = 0.35\,\text{m}$) settle in significantly fewer steps than high drops ($h = 1.20\,\text{m}$) with multiple restitution rebounds ($\Delta N_{\text{steps}} > 20$).
5. **Cascading Momentum Transfer**: When an eccentric top stone collapses, contact normal and frictional impulses transfer momentum $J = \int F\,dt = m\Delta v$ to underlying stones, displacing intermediate stones ($x > 0.4\,\text{m}, y < 0.35\,\text{m}$).

---

## 2. Feature Inventory Mapping

Every feature defined in `PROJECT.md` (F01–F14) is directly mapped to test cases in the 4-tier matrix:

| Feature ID | Feature Name | Test Suite | Test Cases | Primary Assertions |
|---|---|---|---|---|
| **F01** | 3D Rigid-Body Dynamics & Mass Properties | `physics-rigidbody-simulation` | Tier 1.1, 1.2, 1.6 | Monotonic time $\Delta t$, $a_y = -9.82 \pm 0.05$, mass ordering boulder > flat > tall > round > pebble |
| **F02** | Ground Plane & Contact Collision Physics | `physics-rigidbody-simulation` | Tier 1.3, 1.4, 1.5 | Ground penetration resolved ($y \ge h$), restitution bounce decay, sleep state entered |
| **F03** | Center of Mass (COM) & Support Polygon | `physics-rigidbody-simulation` | Tier 2.1, 2.2 | Sub-critical $x=0.15$ settles on top; super-critical $x=0.55$ tumbles to ground ($y \approx 0.15, x > 0.75$) |
| **F04** | Natural Dynamic Tower Collapse | `tower-dynamic-collapse` | Tier 3.2, 4.3 | Cascading momentum knocks mid stone ($x > 0.4, y < 0.35$), peak angular velocity $\|\omega\| > 1.0\,\text{rad/s}$ |
| **F05** | Ground Scattering & Energy Dissipation | `tower-dynamic-collapse` | Tier 4.3 | Radial ground scatter $R_{\text{scatter}} > 0.50\,\text{m}$, kinetic energy dissipates to sleep |
| **F06** | Enhanced PhysicsWorld Port Interface | `tower-dynamic-collapse` | Tier 3.1, 3.2 | DropResult contract with `settled`, `pose`, `collapsed`, `affectedStones` |
| **F07** | Stacking Controller 5-State Lifecycle | `tower-dynamic-collapse` | Tier 3.3, 3.4 | 3-attempt lifecycle: attempt 1 & 2 retry + collapsed=true; attempt 3 autoPlaced=true, quota consumed |
| **F08** | 3D Canvas Mesh Transform Sync | `tower-dynamic-collapse` | Tier 4.1, 4.2 | Poses and quaternions remain synchronized across 180 frames of stable cairns |
| **F09** | User Placement Flow in `place.tsx` | `tower-dynamic-collapse` | Tier 3.3 | Drop coordinate evaluation, retry messaging, quota deduction |
| **F10** | Opaque-Box E2E Test Infra & Runner | `TEST_INFRA.md`, runner | All Tiers | Pure headless Node.js execution under 350ms, zero DOM/WebGL dependency |
| **F11** | Tier 1 Feature Coverage Tests | `physics-rigidbody-simulation` | T1.1 – T1.6 | 6 primitive dynamic test cases |
| **F12** | Tier 2 Boundary & Corner Case Tests | `physics-rigidbody-simulation` | T2.1 – T2.5 | 5 boundary and corner case test cases |
| **F13** | Tier 3 Cross-Feature Combination Tests | `tower-dynamic-collapse` | T3.1 – T3.4 | 4 integration test cases |
| **F14** | Tier 4 Real-World & Anti-Canned Tests | `tower-dynamic-collapse` | T4.1 – T4.5 | 5 real-world cairn and anti-canned test cases |

---

## 3. Test Architecture & Execution Topology

### 3.1 Headless Node.js Execution Harness
- **Runtime**: Native Node.js v24 (`node:test`, `node:assert/strict`).
- **Command**: `npm.cmd test` or `node --test src/__tests__/*.test.ts`.
- **Zero Mocking Overhead**: Physics tests run directly against deliverable classes (`SimpleTowerPhysicsWorld`, `StonePhysicsBodyFactory`, `StabilityEvaluator`), `cannon-es: ^0.20.0`, and domain value objects (`Pose`, `Stone`, `Tower`). No DOM polyfills (`jsdom`), fake timers, or WebGL stubs are required.
- **Execution Speed**: Full test suite (18 existing + 20 new physics tests = 38 tests) executes in $< 600\,\text{ms}$.

### 3.2 Numerical Tolerance Bands & Analytical Oracles

All test assertions employ mathematically rigorous closed-form oracles with appropriate floating-point numerical tolerances:

1. **Free-fall Velocity Oracle**:
   $$v_{y,\text{expected}}(t) = -g \cdot t = -9.82 \cdot (k \cdot \Delta t)$$
   Tolerance: $\pm 0.05\,\text{m/s}$ (accounts for discrete symplectic Euler integration).

2. **Free-fall Position Oracle**:
   $$y_{\text{expected}}(t) = y_0 - \frac{1}{2} g t^2$$
   Tolerance: $\pm 0.05\,\text{m}$.

3. **Restitution Decay Criterion**:
   At resting equilibrium, vertical velocity must satisfy:
   $$|v_y| < 0.01\,\text{m/s}$$
   and angular velocity:
   $$\|\boldsymbol{\omega}\| = \sqrt{\omega_x^2 + \omega_y^2 + \omega_z^2} < 0.02\,\text{rad/s}$$

4. **Resting Height Oracle**:
   For a box body of half-height $h$, the resting center of mass height on a flat ground plane ($y=0$) is:
   $$y_{\text{rest}} = h \pm 0.01\,\text{m}$$
   For a two-stone stack with base half-height $h_1$ and capstone half-height $h_2$:
   $$y_{\text{stack}} = 2h_1 + h_2 \pm 0.02\,\text{m}$$

5. **Coulomb Friction Oracle**:
   $$\mu_s = 0.75 \implies \theta_{\text{crit}} = \arctan(0.75) \approx 0.6435\,\text{rad} \approx 36.87^\circ$$
   At $\theta = 20^\circ < \theta_{\text{crit}}$, displacement is bounded by $|\Delta x| < 0.02\,\text{m}$.
   At $\theta = 45^\circ > \theta_{\text{crit}}$, displacement satisfies $\Delta x > 0.15\,\text{m}$.

---

## 4. Verification & Audit Manifest

| Verification Phase | Command | Success Gate |
|---|---|---|
| **Syntax & Compilation** | `node --check src/__tests__/*.test.ts` | Zero syntax or module import errors |
| **Headless Stepping PoC** | `node -e "import('cannon-es').then(c => console.log('OK'))"` | `cannon-es` ESM loads successfully |
| **Full Test Suite Run** | `npm.cmd test` | 100% pass (0 failures, 0 skipped, 0 timeouts) |
| **Integrity Audit** | Independent review | No facade tests, no hardcoded results, true physics dynamics |
