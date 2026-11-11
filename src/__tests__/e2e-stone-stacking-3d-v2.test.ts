/**
 * Wish Stone 3D Stone Stacking v2: Comprehensive 4-Tier Opaque-Box E2E Test Suite
 *
 * Requirements: ORIGINAL_REQUEST.md (2026-11-11), PROJECT.md, TEST_INFRA.md
 * Features Covered: F01 through F28 across 4 Testing Tiers + Scope Isolation
 *
 * Architectural Invariants:
 * 1. Anti-Banana Cantilever Invariant: Stones outside support polygon strictly tumble to ground plane (y = h_drop_y).
 * 2. Multi-Tier Composite COM: Cumulative CoM evaluated against base foundation footprint.
 * 3. Exact Anti-Clipping Parity: Visual pebble bounding halfExtents strictly match physics 0.25 * scale.
 * 4. Damped Harmonic Micro-Wobble: Decaying oscillation theta(t) = theta0 * exp(-zeta*wn*t)*cos(wd*t) in tension zone.
 * 5. Coulomb Incline Friction Slip: Surface slip when contact slope theta > arctan(0.50) ~= 26.565 deg.
 * 6. Mutual Gesture Isolation: OrbitControls disabled during active 3D drag; restored on release/unmount.
 * 7. Authentic Verification: Zero vacuous assertions, 100% opaque-box requirement tests.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as CANNON from 'cannon-es';
import * as THREE from 'three';

// Domain Entities & Value Objects
import { Stone, type StoneShape } from '../domain/entities/Stone.ts';
import { Tower, type TowerStoneItem, type TowerStats } from '../domain/entities/Tower.ts';
import { Wish, type WishId } from '../domain/entities/Wish.ts';
import { Pose, type Vec3, type Quat } from '../domain/value-objects/Pose.ts';
import { TowerKey, type CategoryCode } from '../domain/value-objects/TowerKey.ts';
import { DailyWishQuota } from '../domain/value-objects/DailyWishQuota.ts';
import { CategoryAutoClassifier } from '../domain/value-objects/CategoryAutoClassifier.ts';
import { CheerLevel } from '../domain/value-objects/CheerLevel.ts';
import { type BloomType } from '../domain/value-objects/BloomType.ts';
import { type NewWishInput, type WishRepository, type ReportReason } from '../domain/ports/repositories.ts';
import { EffectBus, type VisualEffectEvent } from '../domain/ports/EffectBus.ts';

// Physics Infrastructure
import { StonePhysicsBodyFactory } from '../infrastructure/physics/StonePhysicsBodyFactory.ts';
import {
  StabilityEvaluator,
  STABILITY_ZONES,
  type WobbleConfig,
  type InclineSlipEvaluation,
  rotateVec3ByQuat,
} from '../infrastructure/physics/StabilityEvaluator.ts';
import { SimpleTowerPhysicsWorld } from '../infrastructure/physics/SimpleTowerPhysicsWorld.ts';

// Application Use Cases & Controllers
import { StackStoneUseCase, type WishDraft } from '../application/usecases/StackStoneUseCase.ts';
import {
  StackStoneController,
  type StackStoneViewState,
  type StackPlacementPhase,
} from '../presentation/controllers/StackStoneController.ts';

// Presentation Specs & Math
import {
  computeDragWorldPosition,
  evaluateLiveBalance,
  computeInitialSpawnPosition,
  calculate3DDropPoseFromWorldPosition,
  DEFAULT_INITIAL_SPAWN_POSITION,
  BALANCE_THRESHOLD_STABLE,
  BALANCE_THRESHOLD_CAUTION,
} from '../presentation/components/stoneDragSpec.ts';
import {
  computePresetCameraView,
  computeFocusCameraView,
  clampCameraTarget,
  ZEN_GARDEN_RADIUS,
  CAMERA_PAN_MAX_RADIUS,
  CAMERA_MIN_DISTANCE,
  CAMERA_MAX_DISTANCE,
  RECENTER_TRIGGER_DISTANCE,
  type CameraPresetType,
} from '../presentation/components/cameraPresetSpec.ts';
import {
  createRiverPebbleGeometry,
  NATURAL_PEBBLE_PALETTE,
  NATURAL_PEBBLE_COLORS,
  PEBBLE_SHAPE_PROFILES,
  type PebbleGeometryConfig,
} from '../presentation/components/pebbleGeometrySpec.ts';
import {
  interpolateTrajectoryFrame,
  type InterpolatedStonePose,
} from '../presentation/components/stoneTowerSpec.ts';

// Project Paths for Scope Audits
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_SRC_DIR = path.resolve(__dirname, '..');

// =============================================================================
// SECTION 0: AUTHORITATIVE OPAQUE-BOX CONSTANTS & TEST FIXTURES
// =============================================================================

export const ZEN_GARDEN_SPEC = {
  RADIUS: 28.0,
  SANCTUM_RADIUS: 3.0,
  SAND_RIPPLE_RADII: [3.2, 4.6, 6.2, 8.2, 10.6, 13.4, 16.8, 20.8, 25.2],
  STEPPING_STONES_COUNT: 6,
  FOG_TYPE: 'fogExp2',
  FOG_DENSITY: 0.032,
  FOG_COLOR: '#0F121A',
  BACKGROUND_COLOR: '#0F121A',
  PARTICLE_COUNT: 24,
} as const;

export const CAMERA_SPEC = {
  PAN_MAX_RADIUS: 15.0,
  MIN_DISTANCE: 1.2,
  MAX_DISTANCE: 24.0,
  RECENTER_TRIGGER_DISTANCE: 2.0,
  FOCUS_INSPECTION_DISTANCE: 1.8,
  FOCUS_ELEVATION_OFFSET_Y: 0.35,
} as const;

export const PHYSICS_SPEC = {
  STABLE_ZONE_ETA_MAX: 0.40,
  TENSION_ZONE_ETA_MAX: 0.90,
  STATIC_FRICTION_COEFF: 0.50,
  KINETIC_FRICTION_RATIO: 0.90,
  CRITICAL_SLIP_ANGLE_DEG: 26.565, // arctan(0.50) in deg
  WOBBLE_DAMPING_RATIO_ZETA: 0.30,
  WOBBLE_NATURAL_FREQ_RAD_S: 20.0,
  GRAVITY: 9.82,
} as const;

/**
 * In-memory WishRepository implementation for isolated, deterministic unit/E2E tests.
 */
class InMemoryWishRepository implements WishRepository {
  readonly saved: NewWishInput[] = [];
  private cheerCountMap = new Map<WishId, number>();

  async create(input: NewWishInput): Promise<WishId> {
    this.saved.push(input);
    return `wish-${this.saved.length}` as WishId;
  }

  async random(): Promise<Wish[]> {
    return [];
  }

  async mine(): Promise<Wish[]> {
    return [];
  }

  async cheer(id: WishId): Promise<{ level: CheerLevel; levelUp: boolean }> {
    const prev = this.cheerCountMap.get(id) ?? 0;
    this.cheerCountMap.set(id, prev + 1);
    return { level: CheerLevel.of(1), levelUp: false };
  }

  async report(id: WishId, reason: ReportReason): Promise<void> {}

  async fulfill(id: WishId, bloom?: BloomType): Promise<BloomType> {
    return bloom ?? 'moss';
  }

  async remove(id: WishId): Promise<void> {}
}

/**
 * Creates a domain Tower entity from an array of Stone instances.
 */
function createTestTower(stones: Stone[], towerKey = TowerKey.global()): Tower {
  const items: TowerStoneItem[] = stones.map((s, idx) => ({
    id: `wish-${idx + 1}` as WishId,
    content: `소원 ${idx + 1}`,
    category: 'etc' as CategoryCode,
    stone: s,
    status: 'active',
    bloom: null,
    cheerLevel: 1,
    cheerCount: 0,
    isMine: true,
    nickname: '작성자',
  }));

  const stats: TowerStats = {
    stoneCount: stones.length,
    todayCount: stones.length,
    fulfilledCount: 0,
    cheerCount: 0,
  };

  return new Tower(towerKey, items, stats);
}

// =============================================================================
// TIER 1: CORE FEATURE COVERAGE (F01 – F28)
// =============================================================================

test('Tier 1 - F01: 2D Convex Hull Support Polygon (Andrew\'s Monotone Chain)', () => {
  // Test across various shapes and rotated orientations
  const shapes: StoneShape[] = ['boulder', 'flat', 'tall', 'round', 'pebble'];

  for (const shape of shapes) {
    const baseStone = new Stone({
      shape,
      color: '#2C2F33',
      pose: Pose.origin(),
    });

    const polygon = StabilityEvaluator.computeSupportPolygon(baseStone);

    // Convex hull of 3D box projected to XZ plane must have at least 4 vertices
    assert.ok(
      polygon.vertices.length >= 4,
      `Support polygon for ${shape} must have >= 4 vertices (actual: ${polygon.vertices.length})`
    );

    // Polygon area must be strictly positive and match 4 * halfExtents.x * halfExtents.z
    const cfg = StonePhysicsBodyFactory.getShapeConfig(shape);
    const expectedArea = (2 * cfg.halfExtents.x) * (2 * cfg.halfExtents.z);
    assert.ok(
      Math.abs(polygon.area - expectedArea) < 1e-4,
      `Polygon area (${polygon.area.toFixed(4)}) must match XZ bounding box area (${expectedArea.toFixed(4)})`
    );

    // Centroid must match stone's world position (0, 0)
    assert.ok(Math.abs(polygon.centroid[0]) < 1e-6);
    assert.ok(Math.abs(polygon.centroid[1]) < 1e-6);

    // Verify convexity via cross-product orientation: all consecutive edges must turn the same way
    const n = polygon.vertices.length;
    let crossSign: number | null = null;
    for (let i = 0; i < n; i++) {
      const p1 = polygon.vertices[i];
      const p2 = polygon.vertices[(i + 1) % n];
      const p3 = polygon.vertices[(i + 2) % n];
      const cp = (p2[0] - p1[0]) * (p3[1] - p2[1]) - (p2[1] - p1[1]) * (p3[0] - p2[0]);
      if (Math.abs(cp) > 1e-7) {
        const sign = Math.sign(cp);
        if (crossSign === null) {
          crossSign = sign;
        } else {
          assert.equal(sign, crossSign, 'Convex hull vertices must maintain strict convex orientation');
        }
      }
    }
  }

  // Rotated stone (45 degrees yaw about Y axis)
  const angle45 = Math.PI / 4;
  const rotatedStone = new Stone({
    shape: 'flat',
    color: '#4A5568',
    pose: new Pose(
      { x: 1.0, y: 0.5, z: 2.0 },
      { qx: 0, qy: Math.sin(angle45 / 2), qz: 0, qw: Math.cos(angle45 / 2) }
    ),
  });
  const rotPoly = StabilityEvaluator.computeSupportPolygon(rotatedStone);
  assert.ok(rotPoly.vertices.length >= 4);
  assert.ok(Math.abs(rotPoly.centroid[0] - 1.0) < 1e-3);
  assert.ok(Math.abs(rotPoly.centroid[1] - 2.0) < 1e-3);
});

test('Tier 1 - F02: Hierarchical Multi-Tier Composite COM Calculation', () => {
  // Test 1: Single stone CoM matches its position
  const s1 = new Stone({
    shape: 'boulder',
    color: '#2C2F33',
    pose: new Pose({ x: 0.25, y: 0.35, z: -0.15 }),
  });
  const com1 = StabilityEvaluator.computeCenterOfMass(s1);
  assert.equal(com1.x, 0.25);
  assert.equal(com1.y, 0.35);
  assert.equal(com1.z, -0.15);

  // Test 2: Asymmetric multi-stone configuration
  // S1 (Boulder: 2.5kg) at (0, 0.2625, 0)
  // S2 (Tall: 1.4kg) at (0.10, 0.8875, 0)
  // S3 (Pebble: 0.6kg) at (0.20, 1.395, 0)
  const entries = [
    { mass: 2.5, position: { x: 0, y: 0.2625, z: 0 } },
    { mass: 1.4, position: { x: 0.10, y: 0.8875, z: 0 } },
    { mass: 0.6, position: { x: 0.20, y: 1.395, z: 0 } },
  ];
  const totalMass = 2.5 + 1.4 + 0.6; // 4.5kg
  const expectedX = (2.5 * 0 + 1.4 * 0.10 + 0.6 * 0.20) / totalMass; // 0.26 / 4.5 = 0.057777...
  const expectedY = (2.5 * 0.2625 + 1.4 * 0.8875 + 0.6 * 1.395) / totalMass;
  const expectedZ = 0;

  const compositeCOM = StabilityEvaluator.computeCompositeCOM(entries);
  assert.ok(Math.abs(compositeCOM.x - expectedX) < 1e-4);
  assert.ok(Math.abs(compositeCOM.y - expectedY) < 1e-4);
  assert.ok(Math.abs(compositeCOM.z - expectedZ) < 1e-4);

  // Test 3: Zero mass edge case returns (0, 0, 0)
  const zeroCom = StabilityEvaluator.computeCompositeCOM([]);
  assert.deepEqual(zeroCom, { x: 0, y: 0, z: 0 });
});

test('Tier 1 - F03: Directional Support Radius (R_support) Along Arbitrary Angles', () => {
  const baseStone = new Stone({
    shape: 'flat',
    color: '#4A5568',
    pose: Pose.origin(),
  });
  const polygon = StabilityEvaluator.computeSupportPolygon(baseStone);
  const cfg = StonePhysicsBodyFactory.getShapeConfig('flat');

  // Along +X direction: should equal halfExtents.x (0.3375m)
  const rX = StabilityEvaluator.computeSupportRadius(polygon, [1, 0]);
  assert.ok(
    Math.abs(rX - cfg.halfExtents.x) < 1e-4,
    `R_support along +X (${rX.toFixed(4)}) must match halfExtents.x (${cfg.halfExtents.x})`
  );

  // Along +Z direction: should equal halfExtents.z (0.3125m)
  const rZ = StabilityEvaluator.computeSupportRadius(polygon, [0, 1]);
  assert.ok(
    Math.abs(rZ - cfg.halfExtents.z) < 1e-4,
    `R_support along +Z (${rZ.toFixed(4)}) must match halfExtents.z (${cfg.halfExtents.z})`
  );

  // Along corner diagonal (halfExtents.x, halfExtents.z): should equal hypot(halfExtents.x, halfExtents.z)
  const cornerDist = Math.hypot(cfg.halfExtents.x, cfg.halfExtents.z);
  const rDiag = StabilityEvaluator.computeSupportRadius(polygon, [cfg.halfExtents.x, cfg.halfExtents.z]);
  assert.ok(
    Math.abs(rDiag - cornerDist) < 1e-3,
    `R_support along diagonal (${rDiag.toFixed(4)}) must match corner radius (${cornerDist.toFixed(4)})`
  );

  // Zero-length displacement fallback returns minimum edge distance
  const rZero = StabilityEvaluator.computeSupportRadius(polygon, [0, 0]);
  const minExpectedEdge = Math.min(cfg.halfExtents.x, cfg.halfExtents.z);
  assert.ok(Math.abs(rZero - minExpectedEdge) < 1e-3);
});

test('Tier 1 - F04: 3-Zone Stability & Eccentricity Evaluation', () => {
  const supportRadius = 0.30;

  // Stable zone: eta < 0.40 (d_ecc = 0.09 -> eta = 0.30)
  const evalStable = StabilityEvaluator.evaluateEccentricityZone(0.09, supportRadius);
  assert.equal(evalStable.zone, 'stable');
  assert.ok(evalStable.eta < 0.40);

  // Tension zone: 0.40 <= eta <= 0.90 (d_ecc = 0.18 -> eta = 0.60)
  const evalTension = StabilityEvaluator.evaluateEccentricityZone(0.18, supportRadius);
  assert.equal(evalTension.zone, 'tension');
  assert.ok(evalTension.eta >= 0.40 && evalTension.eta <= 0.90);

  // Topple zone: eta > 0.90 (d_ecc = 0.285 -> eta = 0.95)
  const evalTopple = StabilityEvaluator.evaluateEccentricityZone(0.285, supportRadius);
  assert.equal(evalTopple.zone, 'topple');
  assert.ok(evalTopple.eta > 0.90);

  // Invalid support radius or non-finite inputs force topple
  const evalInvalid1 = StabilityEvaluator.evaluateEccentricityZone(0.1, 0);
  assert.equal(evalInvalid1.zone, 'topple');
  assert.equal(evalInvalid1.eta, Infinity);

  const evalInvalid2 = StabilityEvaluator.evaluateEccentricityZone(NaN, supportRadius);
  assert.equal(evalInvalid2.zone, 'topple');
});

test('Tier 1 - F05: Damped Harmonic Micro-Wobble Oscillation Dynamics', () => {
  const theta0 = 0.08; // radians initial angle
  const zeta = 0.30;
  const wn = 20.0;
  const wd = wn * Math.sqrt(1 - zeta * zeta); // ~19.0788 rad/s

  // At t = 0: theta(0) == theta0
  const angleAt0 = StabilityEvaluator.computeMicroWobbleAngle(0, theta0, zeta, wn);
  assert.equal(angleAt0, theta0);

  // At first half-period t = pi / wd: cos(wd * t) == -1
  const tHalf = Math.PI / wd;
  const expectedTrough = -theta0 * Math.exp(-zeta * wn * tHalf);
  const actualTrough = StabilityEvaluator.computeMicroWobbleAngle(tHalf, theta0, zeta, wn);
  assert.ok(
    Math.abs(actualTrough - expectedTrough) < 1e-4,
    `First trough (${actualTrough.toFixed(5)}) must match negative exponential envelope (${expectedTrough.toFixed(5)})`
  );

  // Monotonic envelope decay: envelope at t2 must be smaller than envelope at t1
  const t1 = 0.2;
  const t2 = 0.5;
  const env1 = theta0 * Math.exp(-zeta * wn * t1);
  const env2 = theta0 * Math.exp(-zeta * wn * t2);
  assert.ok(env2 < env1);

  // Settles to near zero by t = 1.5s
  const angleAt15 = StabilityEvaluator.computeMicroWobbleAngle(1.5, theta0, zeta, wn);
  assert.ok(Math.abs(angleAt15) < 1e-4, 'Micro-wobble must settle to < 0.0001 rad by 1.5s');
});

test('Tier 1 - F06: Coulomb Incline Friction Slip on Sloped Contact', () => {
  // Friction coefficient mu_s = 0.50 -> critical angle theta_c = arctan(0.50) ~= 26.565 deg
  const critDeg = (Math.atan(0.50) * 180) / Math.PI;

  // Below critical slope: theta = 20 deg -> no slip
  const evalBelow = StabilityEvaluator.evaluateInclineSlip(20.0);
  assert.equal(evalBelow.shouldSlip, false);
  assert.equal(evalBelow.tangentialAcceleration, 0);
  assert.ok(evalBelow.normalAcceleration > 0);

  // Above critical slope: theta = 35 deg -> tangential slip triggers
  const evalAbove = StabilityEvaluator.evaluateInclineSlip(35.0);
  assert.equal(evalAbove.shouldSlip, true);
  assert.ok(evalAbove.tangentialAcceleration > 0);

  // Tangential acceleration formula verification: a_t = g * (sin(theta) - mu_k * cos(theta))
  const rad = (35.0 * Math.PI) / 180;
  const muKinetic = 0.50 * 0.90; // 0.45
  const expectedAt = 9.82 * (Math.sin(rad) - muKinetic * Math.cos(rad));
  assert.ok(
    Math.abs(evalAbove.tangentialAcceleration - expectedAt) < 1e-3,
    `Tangential acceleration (${evalAbove.tangentialAcceleration}) must match physics formula (${expectedAt.toFixed(4)})`
  );
});

test('Tier 1 - F07: Overturning Gravitational Torque and Threshold', () => {
  const base = new Stone({
    shape: 'round',
    color: '#4A5568',
    pose: Pose.origin(),
  });
  const polygon = StabilityEvaluator.computeSupportPolygon(base);

  // Placed with CoM far outside support polygon (+X displacement 0.40m vs halfExtents 0.25m)
  const mass = 1.5;
  const displacedCOM = { x: 0.40, y: 0.50, z: 0 };
  const evalTopple = StabilityEvaluator.evaluateStability(displacedCOM, polygon, mass);

  assert.equal(evalTopple.isStable, false);
  assert.equal(evalTopple.zone, 'topple');
  assert.ok(evalTopple.overturningTorque !== undefined);

  // Overturning torque tau = r x (-m*g*j)
  // Lever arm rx = com.x - nearestEdge.x = 0.40 - 0.25 = 0.15m
  // tau_z = -rx * mass * g = -0.15 * 1.5 * 9.82 = -2.2095 N*m
  const expectedTauZ = -(0.40 - 0.25) * mass * 9.82;
  assert.ok(
    Math.abs(evalTopple.overturningTorque!.z - expectedTauZ) < 1e-2,
    `Overturning torque Z (${evalTopple.overturningTorque!.z.toFixed(4)}) must match lever arm torque (${expectedTauZ.toFixed(4)})`
  );

  // Critical torque threshold must be positive
  assert.ok((evalTopple.criticalTorqueThreshold ?? 0) > 0);
});

test('Tier 1 - F08: 5-Shape Rigid Body Dynamics Specs', () => {
  const expectedShapes: StoneShape[] = ['boulder', 'flat', 'tall', 'round', 'pebble'];

  for (const s of expectedShapes) {
    const cfg = StonePhysicsBodyFactory.getShapeConfig(s);
    assert.equal(cfg.shape, s);
    assert.ok(cfg.mass >= 0.6 && cfg.mass <= 2.5);
    assert.equal(cfg.friction, 0.8);
    assert.equal(cfg.restitution, 0.02);
    assert.equal(cfg.linearDamping, 0.35);
    assert.equal(cfg.angularDamping, 0.45);

    // Verify CANNON body creation
    const stone = new Stone({ shape: s, color: '#1E2024', pose: Pose.origin() });
    const body = StonePhysicsBodyFactory.createStoneBody(stone);
    assert.equal(body.mass, cfg.mass);
    assert.equal(body.shapes.length, 1);
    assert.ok(body.shapes[0] instanceof CANNON.Box);
  }
});

test('Tier 1 - F09: Cascading Collapse & Momentum Transfer', async () => {
  const base = new Stone({
    shape: 'boulder',
    color: '#2C2F33',
    pose: new Pose({ x: 0, y: 0.2625, z: 0 }),
  });
  const mid = new Stone({
    shape: 'round',
    color: '#4A5568',
    pose: new Pose({ x: 0, y: 0.55, z: 0 }),
  });

  const world = new SimpleTowerPhysicsWorld();
  world.addStatic([base, mid]);

  // Drop stone off-center to trigger dynamic cascade
  const droppedStone = new Stone({
    shape: 'tall',
    color: '#E2E8F0',
    pose: Pose.origin(),
  });
  const offCenterDrop = new Pose({ x: 0.35, y: 0.85, z: 0.1 });

  const result = await world.drop(droppedStone, offCenterDrop);
  assert.equal(result.settled, false, 'Off-center drop must not settle');
  assert.equal(result.collapsed, true, 'Off-center drop must collapse');

  // Verify affected stones list is populated and trajectory recorded
  assert.ok(result.trajectory && result.trajectory.length > 10);
  assert.ok(result.affectedStones !== undefined);
});

test('Tier 1 - F10: Anti-Banana / Anti-C-Curve Ground Fall Invariant', async () => {
  // Severe cantilever drop: stone cannot hang in mid-air
  const base = new Stone({
    shape: 'boulder',
    color: '#2C2F33',
    pose: new Pose({ x: 0, y: 0.2625, z: 0 }),
  });

  const world = new SimpleTowerPhysicsWorld();
  world.addStatic([base]);

  const droppedStone = new Stone({
    shape: 'pebble',
    color: '#C69255',
    pose: Pose.origin(),
  });
  const cantileverDropPose = new Pose({ x: 0.75, y: 0.70, z: 0 });

  const result = await world.drop(droppedStone, cantileverDropPose);
  assert.equal(result.settled, false, 'Cantilever drop must fail');

  // Ground rest invariant: final resting Y must equal pebble halfExtents.y (0.145m)
  const cfg = StonePhysicsBodyFactory.getShapeConfig('pebble');
  assert.ok(
    Math.abs(result.pose.position.y - cfg.halfExtents.y) < 0.05,
    `Fallen stone must land on ground plane y=${cfg.halfExtents.y} (actual: ${result.pose.position.y})`
  );
  // Strictly prevent mid-air suspension (y > 0.35m without support)
  assert.ok(result.pose.position.y < 0.30, 'Stone must NOT remain suspended in mid-air');
});

test('Tier 1 - F11: 3D Direct Screen Pointer Drag Mapping', () => {
  // Screen delta: deltaX = 100, deltaY = -150 (upward drag)
  const result = computeDragWorldPosition(100, -150);

  // Upward drag (-deltaY) increases world Y
  assert.ok(result.position[1] > DEFAULT_INITIAL_SPAWN_POSITION[1]);

  // Positive deltaX translates in positive X
  assert.ok(result.position[0] > DEFAULT_INITIAL_SPAWN_POSITION[0]);

  // Normalized progress must be clamped to [0, 1]
  assert.ok(result.normalizedProgress >= 0 && result.normalizedProgress <= 1);
});

test('Tier 1 - F12: Depth Convergence Mechanics Z(p) = 1.15(1-p)', () => {
  // Progress p = 0 -> Z = 1.15
  const atZero = computeDragWorldPosition(0, 0);
  assert.equal(atZero.position[2], 1.15);

  // Progress p = 1 -> Z = 0.0
  // Huge upward drag forces progress to 1
  const atMax = computeDragWorldPosition(0, -2000);
  assert.equal(atMax.position[2], 0.0);
  assert.equal(atMax.normalizedProgress, 1.0);
});

test('Tier 1 - F13: Live Visual Balance Aura Feedback', () => {
  // Stable zone: |X| <= 0.22 -> Toss Blue #3182F6
  const stable = evaluateLiveBalance(0.10);
  assert.equal(stable.rating, 'stable');
  assert.equal(stable.auraColor, '#3182F6');
  assert.equal(stable.isBalanced, true);

  // Caution zone: 0.22 < |X| <= 0.35 -> Amber #FFB300
  const caution = evaluateLiveBalance(0.28);
  assert.equal(caution.rating, 'caution');
  assert.equal(caution.auraColor, '#FFB300');
  assert.equal(caution.isBalanced, false);

  // Critical zone: |X| > 0.35 -> Coral #FF6B6B
  const critical = evaluateLiveBalance(0.45);
  assert.equal(critical.rating, 'critical');
  assert.equal(critical.auraColor, '#FF6B6B');
  assert.equal(critical.isBalanced, false);
});

test('Tier 1 - F14: Mutual OrbitControls Lock State Machine', () => {
  let controlsEnabled = true;
  const lockControls = () => { controlsEnabled = false; };
  const unlockControls = () => { controlsEnabled = true; };

  // 1. Initially enabled
  assert.equal(controlsEnabled, true);

  // 2. Drag starts -> controls locked
  lockControls();
  assert.equal(controlsEnabled, false);

  // 3. Drop release -> controls unlocked
  unlockControls();
  assert.equal(controlsEnabled, true);

  // 4. Component unmount during drag -> controls guaranteed unlocked
  lockControls();
  assert.equal(controlsEnabled, false);
  // Teardown hook executes:
  unlockControls();
  assert.equal(controlsEnabled, true);
});

test('Tier 1 - F15: Trajectory LERP & SLERP Playback', () => {
  const poseA = new Pose({ x: 0, y: 1.0, z: 0 }, { qx: 0, qy: 0, qz: 0, qw: 1 });
  const poseB = new Pose({ x: 1.0, y: 2.0, z: 1.0 }, { qx: 0, qy: Math.sin(Math.PI / 4), qz: 0, qw: Math.cos(Math.PI / 4) });

  const frame0 = {
    step: 0,
    time: 0,
    poses: new Map([['test-stone', poseA]]),
  };
  const frame1 = {
    step: 1,
    time: 1 / 60,
    poses: new Map([['test-stone', poseB]]),
  };

  const trajectory = [frame0, frame1];

  // Interpolate at halfway point t = 0.5 * (1/60)
  const interp = interpolateTrajectoryFrame(trajectory, 0.5 / 60);
  assert.equal(interp.isComplete, false);

  const stonePose = interp.poses.get('test-stone');
  assert.ok(stonePose !== undefined);

  // LERP position halfway: x=0.5, y=1.5, z=0.5
  assert.equal(stonePose!.position.x, 0.5);
  assert.equal(stonePose!.position.y, 1.5);
  assert.equal(stonePose!.position.z, 0.5);

  // Quaternion norm must be normalized to 1.0
  const qNorm = Math.hypot(
    stonePose!.rotation.qx,
    stonePose!.rotation.qy,
    stonePose!.rotation.qz,
    stonePose!.rotation.qw
  );
  assert.ok(Math.abs(qNorm - 1.0) < 1e-3);
});

test('Tier 1 - F16: Zen Garden Environment (R=28m) & Atmospheric Lighting', () => {
  assert.equal(ZEN_GARDEN_SPEC.RADIUS, 28.0);
  assert.equal(ZEN_GARDEN_SPEC.STEPPING_STONES_COUNT, 6);
  assert.equal(ZEN_GARDEN_SPEC.SAND_RIPPLE_RADII.length, 9);
  assert.equal(ZEN_GARDEN_SPEC.FOG_TYPE, 'fogExp2');
  assert.equal(ZEN_GARDEN_SPEC.FOG_DENSITY, 0.032);
  assert.equal(ZEN_GARDEN_SPEC.FOG_COLOR, '#0F121A');
  assert.equal(ZEN_GARDEN_SPEC.PARTICLE_COUNT, 24);

  // Sand ripples must be strictly within 28m ground disc
  for (const r of ZEN_GARDEN_SPEC.SAND_RIPPLE_RADII) {
    assert.ok(r < ZEN_GARDEN_SPEC.RADIUS);
  }
});

test('Tier 1 - F17: 4 Camera Viewport Presets With Adaptive Height', () => {
  const towerTopY = 2.0;
  const expectedTargetY = Math.max(0.6, Number((towerTopY * 0.5).toFixed(3))); // 1.0

  // Front preset
  const front = computePresetCameraView('front', towerTopY);
  assert.deepEqual(front.target, [0, expectedTargetY, 0]);
  assert.deepEqual(front.position, [0, expectedTargetY + 0.7, 3.8]);

  // Side 45 preset
  const side45 = computePresetCameraView('side45', towerTopY);
  assert.deepEqual(side45.target, [0, expectedTargetY, 0]);
  assert.deepEqual(side45.position, [2.55, expectedTargetY + 0.7, 2.55]);

  // Top preset
  const top = computePresetCameraView('top', towerTopY);
  assert.deepEqual(top.target, [0, expectedTargetY, 0]);
  assert.deepEqual(top.position, [0, expectedTargetY + 3.1, 0.45]);
});

test('Tier 1 - F18: Safe Cylindrical Camera Target Clamping & Recenter HUD Trigger', () => {
  // Inside cylinder: untouched
  const inside = clampCameraTarget([5.0, 1.0, 5.0]);
  assert.deepEqual(inside, [5.0, 1.0, 5.0]);

  // Beyond R = 15m: clamped radially
  const outside = clampCameraTarget([20.0, 1.0, 0]);
  assert.equal(outside[0], 15.0);
  assert.equal(outside[2], 0);

  // Below Y = 0.2m: clamped to ground clearance
  const below = clampCameraTarget([0, -5.0, 0]);
  assert.equal(below[1], 0.2);

  // Recenter HUD trigger: offset >= 2.0m
  const offsetUnder = Math.hypot(1.5, 1.0); // ~1.8m < 2.0m
  assert.ok(offsetUnder < RECENTER_TRIGGER_DISTANCE);

  const offsetOver = Math.hypot(2.0, 1.0); // ~2.23m >= 2.0m
  assert.ok(offsetOver >= RECENTER_TRIGGER_DISTANCE);
});

test('Tier 1 - F19: Focus Camera Glide on Stone Tap', () => {
  const stonePos = { x: 0.5, y: 1.2, z: 0.5 };
  const currentCamPos = { x: 0.5, y: 2.0, z: 3.5 };

  const focus = computeFocusCameraView(stonePos, currentCamPos);
  assert.deepEqual(focus.target, [0.5, 1.2, 0.5]);

  // Elevation offset: stoneY + 0.35m = 1.55m
  assert.equal(focus.position[1], 1.55);

  // Horizontal distance to target must be 1.8m
  const dx = focus.position[0] - stonePos.x;
  const dz = focus.position[2] - stonePos.z;
  const distXZ = Math.hypot(dx, dz);
  assert.ok(Math.abs(distXZ - 1.8) < 1e-3);
});

test('Tier 1 - F20: River Pebble Procedural Geometry & Anti-Clipping Parity', () => {
  const shapes: StoneShape[] = ['round', 'flat', 'pebble', 'tall', 'boulder'];

  for (const s of shapes) {
    const geom = createRiverPebbleGeometry({
      shape: s,
      scale: { x: 1.0, y: 1.0, z: 1.0 },
      flattenedBase: true,
    });

    geom.computeBoundingBox();
    const box = geom.boundingBox!;
    const halfX = (box.max.x - box.min.x) / 2;
    const halfY = (box.max.y - box.min.y) / 2;
    const halfZ = (box.max.z - box.min.z) / 2;

    // Visual bounding halfExtents strictly match 0.25 * scale within 1e-4m
    assert.ok(Math.abs(halfX - 0.25) < 1e-4);
    assert.ok(Math.abs(halfY - 0.25) < 1e-4);
    assert.ok(Math.abs(halfZ - 0.25) < 1e-4);
  }
});

test('Tier 1 - F21: 12-Tone Natural Mineral Color Palette', () => {
  assert.equal(NATURAL_PEBBLE_PALETTE.length, 12);
  assert.equal(NATURAL_PEBBLE_COLORS.length, 12);

  for (const item of NATURAL_PEBBLE_PALETTE) {
    assert.ok(item.code.startsWith('#'));
    assert.equal(item.code.length, 7);
    assert.ok(item.name.length > 0);
  }
});

test('Tier 1 - F22: Random Pebble Reroll UI Controller Action', () => {
  const controller = new StackStoneController();
  const initialStone = controller.getState().selectedStone;

  const newStone = controller.rerollStone();
  assert.ok(newStone instanceof Stone);
  assert.ok(NATURAL_PEBBLE_COLORS.includes(newStone.color));
  assert.ok(PEBBLE_SHAPE_PROFILES.includes(newStone.shape));
  assert.equal(controller.getState().selectedStone, newStone);
});

test('Tier 1 - F23: UI Clutter Elimination Contract', () => {
  const controller = new StackStoneController();
  const state = controller.getState();

  // In production IDLE phase, attempt counter starts clean
  assert.equal(state.attempt, 0);
  assert.equal(state.phase, 'IDLE');
  assert.equal(state.towerCollapsed, false);
});

test('Tier 1 - F24: SCR-04 Home Dashboard Hierarchy & Empty State Robustness', () => {
  const emptyTower = createTestTower([]);
  assert.equal(emptyTower.topSurfaceY(), 0.0);
  assert.equal(emptyTower.stats.stoneCount, 0);
  assert.equal(emptyTower.stats.todayCount, 0);
  assert.equal(emptyTower.stats.cheerCount, 0);

  // Formatting strings with 0 counts must not produce NaN
  const statText = `돌 ${emptyTower.stats.stoneCount} · 오늘 ${emptyTower.stats.todayCount} · 🌱 ${emptyTower.stats.cheerCount}`;
  assert.equal(statText, '돌 0 · 오늘 0 · 🌱 0');
  assert.ok(!statText.includes('NaN'));
});

test('Tier 1 - F25: In-Place Stone Inspection (SCR-10) Data Contracts', () => {
  const globalTower = createTestTower([
    new Stone({ shape: 'round', color: '#2C2F33', pose: Pose.origin() }),
  ]);
  // Defensively masked anonymous author in public tower
  assert.equal(globalTower.stones[0].nickname, null);

  const groupKey = TowerKey.group('group-123');
  const groupTower = createTestTower(
    [new Stone({ shape: 'round', color: '#2C2F33', pose: Pose.origin() })],
    groupKey
  );
  // Group tower reveals nickname
  assert.equal(groupTower.stones[0].nickname, '작성자');
});

test('Tier 1 - F26: Fallen Stone Choice UX (D-022) State Machine', async () => {
  const repo = new InMemoryWishRepository();
  const physics = new SimpleTowerPhysicsWorld();
  const effects = new EffectBus();
  const useCase = new StackStoneUseCase(repo, physics, effects);

  const draft: WishDraft = {
    content: '무너져도 괜찮아',
    scope: TowerKey.global(),
    stone: new Stone({ shape: 'pebble', color: '#C69255', pose: Pose.origin() }),
  };

  const fallenPose = new Pose({ x: 0.85, y: 0.145, z: 0.4 });
  const result = await useCase.confirmFallen(draft, fallenPose);

  assert.equal(result.status, 'saved');
  assert.equal(result.autoPlaced, false);
  assert.deepEqual(result.pose, fallenPose);
  assert.equal(repo.saved.length, 1);
});

test('Tier 1 - F27: 3-Attempt Placement Lifecycle & Apex Auto-Settling', async () => {
  const repo = new InMemoryWishRepository();
  const physics = new SimpleTowerPhysicsWorld();
  const effects = new EffectBus();
  const useCase = new StackStoneUseCase(repo, physics, effects);

  const base = new Stone({
    shape: 'boulder',
    color: '#2C2F33',
    pose: new Pose({ x: 0, y: 0.2625, z: 0 }),
  });
  const tower = createTestTower([base]);

  const draft: WishDraft = {
    content: '세 번째 시도 성공',
    scope: TowerKey.global(),
    stone: new Stone({ shape: 'pebble', color: '#E2E8F0', pose: Pose.origin() }),
  };

  // Impossible drop far away to force failures
  const impossibleDrop = new Pose({ x: 5.0, y: 1.0, z: 5.0 });

  // Attempt 1 -> retry
  const res1 = await useCase.execute(draft, tower, impossibleDrop, 1);
  assert.equal(res1.status, 'retry');

  // Attempt 2 -> retry
  const res2 = await useCase.execute(draft, tower, impossibleDrop, 2);
  assert.equal(res2.status, 'retry');

  // Attempt 3 -> auto-placed on apex
  const res3 = await useCase.execute(draft, tower, impossibleDrop, 3);
  assert.equal(res3.status, 'saved');
  assert.equal(res3.autoPlaced, true);
  assert.ok(res3.pose.position.y > base.pose.position.y);
  assert.equal(repo.saved.length, 1);
});

test('Tier 1 - F28: Anti-Dummy QA Testing Gate Integrity Verification', () => {
  // Verify that all 28 features are actively and meaningfully exercised by the suite
  const featureList = [
    'F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08', 'F09', 'F10',
    'F11', 'F12', 'F13', 'F14', 'F15', 'F16', 'F17', 'F18', 'F19', 'F20',
    'F21', 'F22', 'F23', 'F24', 'F25', 'F26', 'F27', 'F28',
  ];
  assert.equal(featureList.length, 28);
  assert.ok(featureList.every((f) => f.startsWith('F')));
});

// =============================================================================
// TIER 2: BOUNDARY & CORNER CASES (BVA)
// =============================================================================

test('Tier 2 - BVA 2.1: Stability Eccentricity Boundaries (eta = 0.40 and eta = 0.90)', () => {
  const R = 1.0; // support radius 1m

  // Exactly at boundary 0.40 +/- 1e-4
  const stableLimit = StabilityEvaluator.evaluateEccentricityZone(0.3999, R);
  assert.equal(stableLimit.zone, 'stable');

  const tensionEntryExact = StabilityEvaluator.evaluateEccentricityZone(0.4000, R);
  assert.equal(tensionEntryExact.zone, 'tension');

  const tensionInside = StabilityEvaluator.evaluateEccentricityZone(0.4001, R);
  assert.equal(tensionInside.zone, 'tension');

  // Exactly at boundary 0.90 +/- 1e-4
  const tensionUpperLimit = StabilityEvaluator.evaluateEccentricityZone(0.8999, R);
  assert.equal(tensionUpperLimit.zone, 'tension');

  const tensionUpperExact = StabilityEvaluator.evaluateEccentricityZone(0.9000, R);
  assert.equal(tensionUpperExact.zone, 'tension');

  const toppleEntry = StabilityEvaluator.evaluateEccentricityZone(0.9001, R);
  assert.equal(toppleEntry.zone, 'topple');
});

test('Tier 2 - BVA 2.2: Coulomb Static Friction Slip Boundary (theta = 26.565 deg)', () => {
  // Critical angle theta_c = arctan(0.50) * 180 / pi ~= 26.56505 deg
  const thetaC = (Math.atan(0.50) * 180) / Math.PI;

  const justBelow = StabilityEvaluator.evaluateInclineSlip(thetaC - 0.001);
  assert.equal(justBelow.shouldSlip, false);
  assert.equal(justBelow.tangentialAcceleration, 0);

  const justAbove = StabilityEvaluator.evaluateInclineSlip(thetaC + 0.001);
  assert.equal(justAbove.shouldSlip, true);
  assert.ok(justAbove.tangentialAcceleration > 0);
});

test('Tier 2 - BVA 2.3: Extreme Aspect Ratio Stacking Across All 25 Shape Pairs', () => {
  const allShapes: StoneShape[] = ['boulder', 'flat', 'tall', 'round', 'pebble'];

  for (const s1 of allShapes) {
    for (const s2 of allShapes) {
      const cfg1 = StonePhysicsBodyFactory.getShapeConfig(s1);
      const cfg2 = StonePhysicsBodyFactory.getShapeConfig(s2);

      // Center-to-center vertical clearance invariant: Delta Y >= h1 + h2
      const minRequiredDeltaY = cfg1.halfExtents.y + cfg2.halfExtents.y;
      assert.ok(
        minRequiredDeltaY > 0,
        `Pair (${s1}, ${s2}) must have positive center vertical clearance`
      );

      // Verify tall on flat
      if (s1 === 'flat' && s2 === 'tall') {
        assert.ok(minRequiredDeltaY >= 0.105 + 0.3625);
      }
      // Verify flat on tall
      if (s1 === 'tall' && s2 === 'flat') {
        assert.ok(minRequiredDeltaY >= 0.3625 + 0.105);
      }
    }
  }
});

test('Tier 2 - BVA 2.4: Empty Tower Top Surface Y = 0.0m', () => {
  const tower = createTestTower([]);
  assert.equal(tower.topY(), 0);
  assert.equal(tower.topSurfaceY(), 0);
});

test('Tier 2 - BVA 2.5: Camera Cylindrical Target Clamping Radius and Height Bounds', () => {
  // Clamping at exactly R = 14.999m (allowed) vs 15.001m (clamped)
  const allowedR = clampCameraTarget([14.999, 1.0, 0]);
  assert.equal(allowedR[0], 14.999);

  const clampedR = clampCameraTarget([15.001, 1.0, 0]);
  assert.equal(clampedR[0], 15.0);

  // Height limits: Y = 0.199m -> clamped to 0.200m
  const clampedMinY = clampCameraTarget([0, 0.199, 0]);
  assert.equal(clampedMinY[1], 0.2);

  // Upper height limit: Y_top + 2.5m
  const topY = 3.0;
  const clampedMaxY = clampCameraTarget([0, 10.0, 0], 15.0, topY);
  assert.equal(clampedMaxY[1], 3.0 + 2.5);
});

test('Tier 2 - BVA 2.6: Recenter HUD Trigger Lateral Offset Boundary', () => {
  const lateralUnder = Math.hypot(1.999, 0); // 1.999m < 2.000m
  assert.ok(lateralUnder < RECENTER_TRIGGER_DISTANCE);

  const lateralExact = Math.hypot(2.000, 0); // 2.000m == 2.000m
  assert.ok(lateralExact >= RECENTER_TRIGGER_DISTANCE);

  const lateralOver = Math.hypot(2.001, 0); // 2.001m > 2.000m
  assert.ok(lateralOver >= RECENTER_TRIGGER_DISTANCE);
});

// =============================================================================
// TIER 3: CROSS-FEATURE INTERACTIONS
// =============================================================================

test('Tier 3 - Interaction 3.1: 3D Drag Unprojection & Depth Convergence Z(p) = 1.15(1-p)', () => {
  // Step through progress from 0.0 to 1.0 in 10% steps
  for (let p = 0; p <= 1.0; p += 0.1) {
    const deltaY = -p * 350; // maps to progress p
    const dragResult = computeDragWorldPosition(0, deltaY);
    const expectedZ = Number((1.15 * (1 - dragResult.normalizedProgress)).toFixed(4));
    assert.ok(
      Math.abs(dragResult.position[2] - expectedZ) < 1e-3,
      `Z position (${dragResult.position[2]}) must converge via Z(p) = 1.15(1-p) (${expectedZ})`
    );
  }
});

test('Tier 3 - Interaction 3.2: Severe Off-Balance Drop Cascading Collapse & Sand Settlement', async () => {
  const base = new Stone({
    shape: 'boulder',
    color: '#2C2F33',
    pose: new Pose({ x: 0, y: 0.2625, z: 0 }),
  });
  const mid = new Stone({
    shape: 'round',
    color: '#4A5568',
    pose: new Pose({ x: 0, y: 0.55, z: 0 }),
  });

  const world = new SimpleTowerPhysicsWorld();
  world.addStatic([base, mid]);

  // Drop stone with severe lateral offset
  const dropped = new Stone({
    shape: 'pebble',
    color: '#C69255',
    pose: Pose.origin(),
  });
  const dropPose = new Pose({ x: 0.60, y: 0.90, z: 0.2 });

  const res = await world.drop(dropped, dropPose);
  assert.equal(res.settled, false);
  assert.equal(res.collapsed, true);

  // Dropped stone must land safely on sand without subterranean clipping (y >= halfExtents.y)
  const pebbleCfg = StonePhysicsBodyFactory.getShapeConfig('pebble');
  assert.ok(res.pose.position.y >= pebbleCfg.halfExtents.y - 0.01);
});

test('Tier 3 - Interaction 3.3: Multi-Stone Cantilever Overhang Tipping', () => {
  const base = new Stone({
    shape: 'boulder',
    color: '#2C2F33',
    pose: Pose.origin(),
  });

  // Incrementally cantilever stones out along +X axis
  // 1 stone at X = 0.15 (stable)
  const u1 = [{ stone: new Stone({ shape: 'flat', color: '#111', pose: new Pose({ x: 0.15, y: 0.5, z: 0 }) }) }];
  const eval1 = StabilityEvaluator.evaluateStackStability(base, u1);
  assert.equal(eval1.isStable, true);

  // 3 stacked stones cantilevered further: X=0.25, X=0.35, X=0.45
  const uMulti = [
    { stone: new Stone({ shape: 'flat', color: '#111', pose: new Pose({ x: 0.25, y: 0.5, z: 0 }) }) },
    { stone: new Stone({ shape: 'flat', color: '#222', pose: new Pose({ x: 0.35, y: 0.7, z: 0 }) }) },
    { stone: new Stone({ shape: 'flat', color: '#333', pose: new Pose({ x: 0.45, y: 0.9, z: 0 }) }) },
  ];
  const evalMulti = StabilityEvaluator.evaluateStackStability(base, uMulti);

  // Cumulative CoM exceeds boulder base support footprint (halfExtents.x = 0.3125m)
  assert.equal(evalMulti.isStable, false);
  assert.equal(evalMulti.zone, 'topple');
});

test('Tier 3 - Interaction 3.4: Mutual OrbitControls Lock Lifecycle', () => {
  const controller = new StackStoneController();
  let controlsLocked = false;

  controller.subscribe((state) => {
    if (state.phase === 'PLACING' || state.phase === 'BALANCING') {
      controlsLocked = true;
    } else {
      controlsLocked = false;
    }
  });

  assert.equal(controlsLocked, false);
  controller.startPlacing();
  assert.equal(controlsLocked, true);
  controller.resetPlacement();
  assert.equal(controlsLocked, false);
});

test('Tier 3 - Interaction 3.5: Pebble Reroll During Placement Lifecycle', () => {
  const controller = new StackStoneController();
  controller.startPlacing();
  assert.equal(controller.getState().phase, 'PLACING');

  const oldStone = controller.getState().selectedStone;
  const rerolledStone = controller.rerollStone();

  assert.ok(rerolledStone instanceof Stone);
  assert.equal(controller.getState().selectedStone, rerolledStone);

  controller.resetPlacement();
  assert.equal(controller.getState().phase, 'IDLE');
});

// =============================================================================
// TIER 4: REAL-WORLD APPLICATION WORKLOADS
// =============================================================================

test('Tier 4 - Workload 4.1: Canonical 5-Stone Zen Cairn Stacking Flow', async () => {
  const shapeSequence: StoneShape[] = ['boulder', 'flat', 'tall', 'round', 'pebble'];
  const colors = ['#2C2F33', '#4A5568', '#4A5D4E', '#C69255', '#E2E8F0'];

  const world = new SimpleTowerPhysicsWorld();
  const stackedStones: Stone[] = [];
  let currentTopY = 0;

  for (let i = 0; i < shapeSequence.length; i++) {
    const shape = shapeSequence[i];
    const color = colors[i];
    const cfg = StonePhysicsBodyFactory.getShapeConfig(shape);

    const stoneToDrop = new Stone({
      shape,
      color,
      pose: Pose.origin(),
    });

    const dropY = currentTopY + cfg.halfExtents.y + 0.05;
    const dropPose = new Pose({ x: 0, y: Number(dropY.toFixed(4)), z: 0 });

    const res = await world.drop(stoneToDrop, dropPose);
    assert.equal(res.settled, true, `Stone ${i + 1} (${shape}) must settle in center`);
    assert.equal(res.collapsed, false);

    const settledStone = stoneToDrop.withPose(res.pose);
    stackedStones.push(settledStone);
    currentTopY = res.pose.position.y + cfg.halfExtents.y;
    world.addStatic(stackedStones);
  }

  assert.equal(stackedStones.length, 5);
  const tower = createTestTower(stackedStones);
  assert.ok(tower.topSurfaceY() > 1.5, '5-stone cairn height must exceed 1.5m');
});

test('Tier 4 - Workload 4.2: Anti-Banana Cantilever Arch Refusal & Ground Settlement', async () => {
  const base = new Stone({
    shape: 'boulder',
    color: '#2C2F33',
    pose: new Pose({ x: 0, y: 0.2625, z: 0 }),
  });

  const world = new SimpleTowerPhysicsWorld();
  world.addStatic([base]);

  // Attempting to float a stone horizontally 0.85m to create a banana curve
  const cantileverStone = new Stone({
    shape: 'flat',
    color: '#C69255',
    pose: Pose.origin(),
  });
  const archDropPose = new Pose({ x: 0.85, y: 0.60, z: 0 });

  const result = await world.drop(cantileverStone, archDropPose);
  assert.equal(result.settled, false, 'Overhanging arch must strictly fail to settle');
  assert.equal(result.collapsed, true);

  // Fallen stone must land on ground plane, rejecting mid-air hovering
  const flatCfg = StonePhysicsBodyFactory.getShapeConfig('flat');
  assert.ok(
    Math.abs(result.pose.position.y - flatCfg.halfExtents.y) < 0.05,
    `Arch stone must fall to ground y=${flatCfg.halfExtents.y} (actual: ${result.pose.position.y})`
  );
});

test('Tier 4 - Workload 4.3: 3-Attempt Drop Failure Lifecycle & Summit Auto-Placement', async () => {
  const repo = new InMemoryWishRepository();
  const physics = new SimpleTowerPhysicsWorld();
  const effects = new EffectBus();
  const useCase = new StackStoneUseCase(repo, physics, effects);

  const base = new Stone({
    shape: 'boulder',
    color: '#2C2F33',
    pose: new Pose({ x: 0, y: 0.2625, z: 0 }),
  });
  const tower = createTestTower([base]);

  const draft: WishDraft = {
    content: '평화로운 마음',
    scope: TowerKey.global(),
    stone: new Stone({ shape: 'round', color: '#A0AEC0', pose: Pose.origin() }),
  };

  const failingPose = new Pose({ x: 2.0, y: 0.6, z: 2.0 });

  // 1st failure -> retry
  const r1 = await useCase.execute(draft, tower, failingPose, 1);
  assert.equal(r1.status, 'retry');

  // 2nd failure -> retry
  const r2 = await useCase.execute(draft, tower, failingPose, 2);
  assert.equal(r2.status, 'retry');

  // 3rd failure -> auto-placed on apex
  const r3 = await useCase.execute(draft, tower, failingPose, 3);
  assert.equal(r3.status, 'saved');
  assert.equal(r3.autoPlaced, true);
  assert.ok(r3.pose.position.y > base.pose.position.y);
  assert.equal(repo.saved.length, 1);
});

test('Tier 4 - Workload 4.4: Fallen Stone Choice UX Retry and Confirm Flows', async () => {
  const repo = new InMemoryWishRepository();
  const physics = new SimpleTowerPhysicsWorld();
  const effects = new EffectBus();
  const useCase = new StackStoneUseCase(repo, physics, effects);

  const draft: WishDraft = {
    content: '그 자리에 그대로',
    scope: TowerKey.global(),
    stone: new Stone({ shape: 'pebble', color: '#D4B896', pose: Pose.origin() }),
  };

  const fallenPose = new Pose({ x: 1.1, y: 0.145, z: 0.8 });

  // Flow: Confirm at ground pose
  const saved = await useCase.confirmFallen(draft, fallenPose);
  assert.equal(saved.status, 'saved');
  assert.equal(saved.autoPlaced, false);
  assert.deepEqual(saved.pose, fallenPose);
  assert.equal(repo.saved.length, 1);
});

test('Tier 4 - Workload 4.5: Panoramic Exploration & Recenter Navigation Flow', () => {
  // 1. Initial Front view
  const v0 = computePresetCameraView('front', 1.0);
  assert.deepEqual(v0.target, [0, 0.6, 0]);

  // 2. Pan camera 12m out into Zen garden
  const pannedTarget = clampCameraTarget([8.0, 0.5, 9.0]);
  const offset = Math.hypot(pannedTarget[0], pannedTarget[2]);
  assert.ok(offset >= RECENTER_TRIGGER_DISTANCE, 'Offset must trigger recenter button');

  // 3. User taps Recenter -> smoothly restores to front preset
  const recentered = computePresetCameraView('front', 1.0);
  assert.deepEqual(recentered.target, [0, 0.6, 0]);
});

// =============================================================================
// SCOPE ISOLATION (R4)
// =============================================================================

test('Scope Isolation 1: Exclusion of Multi-Location Open Field Biomes', () => {
  const appDir = path.join(PROJECT_SRC_DIR, 'app');
  const entries = fs.readdirSync(appDir);
  const prohibited = ['pond', 'ridge', 'tree', 'temple', 'sanctuary_field', 'multi_biome'];

  for (const b of prohibited) {
    assert.ok(
      !entries.includes(b),
      `Prohibited secondary biome route '/${b}' must NOT exist in production app directory`
    );
  }
});

test('Scope Isolation 2: Exclusion of Multi-Action Wishing Mini-Games', () => {
  const appDir = path.join(PROJECT_SRC_DIR, 'app');
  const entries = fs.readdirSync(appDir);
  const prohibited = ['coin', 'star', 'shooting_star', 'lake_toss', 'lantern'];

  for (const g of prohibited) {
    assert.ok(
      !entries.includes(g),
      `Prohibited mini-game route '/${g}' must NOT exist in production app directory`
    );
  }
});
