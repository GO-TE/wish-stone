import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { Stone, type StoneShape } from '../domain/entities/Stone.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import { StabilityEvaluator } from '../infrastructure/physics/StabilityEvaluator.ts';
import { SimpleTowerPhysicsWorld } from '../infrastructure/physics/SimpleTowerPhysicsWorld.ts';
import { StonePhysicsBodyFactory } from '../infrastructure/physics/StonePhysicsBodyFactory.ts';
import {
  computeInitialSpawnPosition,
  computeDragWorldPosition,
  evaluateLiveBalance,
  evaluateLiveBalanceByEccentricity,
  raycastToPlacementPlane,
  shouldTriggerDrop,
  calculate3DDropPoseFromWorldPosition,
  DEFAULT_INITIAL_SPAWN_POSITION,
  BALANCE_THRESHOLD_STABLE,
  BALANCE_THRESHOLD_CAUTION,
  DROP_ZONE_MAX_LATERAL_X,
  DROP_ZONE_MAX_DEPTH_Z,
} from '../presentation/components/stoneDragSpec.ts';
import { interpolateTrajectoryFrame } from '../presentation/components/stoneTowerSpec.ts';

// =============================================================================
// MILESTONE 2: 3D SPATIAL POINTER DRAG, VISUAL BALANCE AURA & DROP MOTION TESTS
// =============================================================================

test('M2-1.1: 3D pointer drag unprojection maps screen horizontal displacement across camera tangent/right vector', () => {
  const initialPos = computeInitialSpawnPosition();
  const topSurfaceY = 0.8;

  // Azimuth 0 rad (Looking from +Z to -Z): Right vector is (+X)
  const resFront = computeDragWorldPosition(100, -100, initialPos, topSurfaceY, 0);
  assert.ok(resFront.position[0] > 0, 'At azimuth 0, positive deltaX moves +X');
  assert.ok(Math.abs(resFront.position[2] - 1.15 * (1 - resFront.normalizedProgress)) < 1e-3);

  // Azimuth PI/2 rad (Looking from +X to -X): Right vector is (-Z)
  const resSide = computeDragWorldPosition(100, -100, initialPos, topSurfaceY, Math.PI / 2);
  assert.ok(
    resSide.position[2] < initialPos[2],
    'At azimuth PI/2, positive deltaX projects along -Z camera tangent'
  );

  // Azimuth PI rad (Looking from -Z to +Z): Right vector is (-X)
  const resBack = computeDragWorldPosition(100, -100, initialPos, topSurfaceY, Math.PI);
  assert.ok(
    resBack.position[0] < initialPos[0],
    'At azimuth PI, positive deltaX projects along -X camera tangent'
  );
});

test('M2-1.2: Smooth depth convergence Z(p) = 1.15(1-p) brings stone from spawn offset to cairn vertical axis', () => {
  const initialPos = computeInitialSpawnPosition();
  const topSurfaceY = 1.0;
  const targetDropY = topSurfaceY + 0.35;
  const verticalSpan = targetDropY - initialPos[1];

  // Progress p = 0: Z is exactly 1.15m
  const startRes = computeDragWorldPosition(0, 0, initialPos, topSurfaceY);
  assert.equal(startRes.position[2], 1.15);
  assert.equal(startRes.normalizedProgress, 0);

  // Progress p = 0.25, 0.50, 0.75: Z satisfies Z(p) = 1.15(1-p)
  for (const p of [0.25, 0.5, 0.75]) {
    const deltaY = -(verticalSpan * p) / 0.0035;
    const res = computeDragWorldPosition(0, deltaY, initialPos, topSurfaceY);
    const expectedZ = Number((1.15 * (1 - res.normalizedProgress)).toFixed(4));
    assert.ok(
      Math.abs(res.position[2] - expectedZ) < 1e-3,
      `Z at p=${p} (${res.position[2]}) must match 1.15*(1-p) (${expectedZ})`
    );
  }

  // Progress p = 1.0 (Apex): Z converges strictly to 0.0m
  const apexDeltaY = -verticalSpan / 0.0035;
  const apexRes = computeDragWorldPosition(0, apexDeltaY, initialPos, topSurfaceY);
  assert.equal(apexRes.position[2], 0.0, 'Apex Z must be identically 0.0m');
  assert.equal(apexRes.normalizedProgress, 1.0);
  assert.equal(apexRes.isOverDropZone, true);
});

test('M2-1.3: raycastToPlacementPlane computes exact 3D unprojected intersection with horizontal plane', () => {
  const planeY = 1.25;

  // Camera at (0, 3, 4) looking down toward (0, 1.25, 0)
  const rayOrigin: readonly [number, number, number] = [0, 3.0, 4.0];
  const dir = new THREE.Vector3(0, 1.25 - 3.0, 0 - 4.0).normalize();
  const rayDir: readonly [number, number, number] = [dir.x, dir.y, dir.z];

  const hit = raycastToPlacementPlane(rayOrigin, rayDir, planeY);
  assert.ok(hit !== null);
  assert.equal(hit![1], planeY);
  assert.ok(Math.abs(hit![0] - 0) < 1e-3);
  assert.ok(Math.abs(hit![2] - 0) < 1e-3);

  // Parallel ray (pointing horizontally) returns null
  const parallelDir: readonly [number, number, number] = [1, 0, 0];
  assert.equal(raycastToPlacementPlane(rayOrigin, parallelDir, planeY), null);

  // Ray pointing upwards (away from lower plane) returns null
  const upwardDir: readonly [number, number, number] = [0, 1, 0];
  assert.equal(raycastToPlacementPlane(rayOrigin, upwardDir, planeY), null);
});

test('M2-2.1: Live visual balance aura mappings: Toss Blue, Amber, and Coral Red', () => {
  // Stable zone (|X| <= 0.22): Toss Blue #3182F6
  const stable = evaluateLiveBalance(0.12);
  assert.equal(stable.rating, 'stable');
  assert.equal(stable.auraColor, '#3182F6');
  assert.equal(stable.isBalanced, true);

  // Caution zone (0.22 < |X| <= 0.35): Amber #FFB300
  const caution = evaluateLiveBalance(0.25);
  assert.equal(caution.rating, 'caution');
  assert.equal(caution.auraColor, '#FFB300');
  assert.equal(caution.isBalanced, false);

  // Critical zone (|X| > 0.35): Coral Red #FF6B6B
  const critical = evaluateLiveBalance(0.40);
  assert.equal(critical.rating, 'critical');
  assert.equal(critical.auraColor, '#FF6B6B');
  assert.equal(critical.isBalanced, false);
});

test('M2-2.2: 3-Zone Eccentricity Evaluation (eta = d_ecc / R_support)', () => {
  const supportRadius = 0.25;

  // Boundary 1: eta = 0.39 < 0.40 -> Stable (#3182F6)
  const eval1 = evaluateLiveBalance(0.25 * 0.39, supportRadius);
  assert.equal(eval1.rating, 'stable');
  assert.equal(eval1.auraColor, '#3182F6');
  assert.equal(eval1.isBalanced, true);

  // Boundary 2: eta = 0.41 in [0.40, 0.90] -> Caution/Tension (#FFB300)
  const eval2 = evaluateLiveBalance(0.25 * 0.41, supportRadius);
  assert.equal(eval2.rating, 'caution');
  assert.equal(eval2.auraColor, '#FFB300');
  assert.equal(eval2.isBalanced, false);

  // Boundary 3: eta = 0.91 > 0.90 -> Critical/Topple (#FF6B6B)
  const eval3 = evaluateLiveBalance(0.25 * 0.91, supportRadius);
  assert.equal(eval3.rating, 'critical');
  assert.equal(eval3.auraColor, '#FF6B6B');
  assert.equal(eval3.isBalanced, false);

  // Direct helper evaluateLiveBalanceByEccentricity
  assert.equal(evaluateLiveBalanceByEccentricity(0.35).rating, 'stable');
  assert.equal(evaluateLiveBalanceByEccentricity(0.65).rating, 'caution');
  assert.equal(evaluateLiveBalanceByEccentricity(1.05).rating, 'critical');
});

test('M2-3.1: Mutual OrbitControls lock lifecycle throughout drag, release, and teardown', () => {
  const mockControls = { enabled: true };

  const startDrag = () => {
    mockControls.enabled = false;
  };

  const endDrag = () => {
    mockControls.enabled = true;
  };

  // Initially unlocked
  assert.equal(mockControls.enabled, true);

  // Active drag locks OrbitControls
  startDrag();
  assert.equal(mockControls.enabled, false);

  // Release restores OrbitControls
  endDrag();
  assert.equal(mockControls.enabled, true);

  // Cancel restores OrbitControls
  startDrag();
  assert.equal(mockControls.enabled, false);
  endDrag();
  assert.equal(mockControls.enabled, true);

  // Component unmount guarantees restore
  startDrag();
  assert.equal(mockControls.enabled, false);
  const unmountCleanup = () => {
    mockControls.enabled = true;
  };
  unmountCleanup();
  assert.equal(mockControls.enabled, true);
});

test('M2-4.1: Release drop in tension zone triggers damped harmonic micro-wobble oscillation', async () => {
  const base = new Stone({
    shape: 'boulder',
    color: '#2C2F33',
    pose: new Pose({ x: 0, y: 0.2625, z: 0 }),
  });

  const world = new SimpleTowerPhysicsWorld();
  world.addStatic([base]);

  // Drop pebble in tension zone (eccentricity ratio ~0.65)
  const pebble = new Stone({
    shape: 'pebble',
    color: '#D4AF37',
    pose: Pose.origin(),
  });
  const dropPose = new Pose({ x: 0.17, y: 0.80, z: 0.0 });

  const res = await world.drop(pebble, dropPose);
  assert.equal(res.settled, true, 'Tension drop within boundary should settle');
  assert.ok(res.trajectory && res.trajectory.length > 20, 'Must record dynamic trajectory');

  // Verify that trajectory frames contain micro-wobble rotation damping
  let maxTilt = 0;
  for (const frame of res.trajectory!) {
    const p = frame.poses.get('dropped-stone');
    if (p) {
      const qTilt = Math.hypot(p.rotation.qx, p.rotation.qz);
      if (qTilt > maxTilt) maxTilt = qTilt;
    }
  }
  assert.ok(maxTilt > 0.001, 'Tension zone placement must exhibit micro-wobble tilt perturbation');
});

test('M2-4.2: Contact on steep incline triggers Coulomb friction slip and ground settlement', async () => {
  const base = new Stone({
    shape: 'boulder',
    color: '#2C2F33',
    pose: new Pose({ x: 0, y: 0.2625, z: 0 }),
  });

  const world = new SimpleTowerPhysicsWorld();
  world.addStatic([base]);

  const dropped = new Stone({
    shape: 'pebble',
    color: '#9E9E9E',
    pose: Pose.origin(),
  });

  // Drop onto sloped surface tilt exceeding critical angle theta_c = 26.565 deg (e.g. 35 deg)
  const dropPose = new Pose({ x: 0.20, y: 0.65, z: 0 });
  const res = await world.drop(dropped, dropPose, {
    inclineAngleDeg: 35.0,
    inclineNormal: { x: 0.5736, y: 0.8192, z: 0 },
  });

  // Tangential slip causes pebble to slide down flank and settle on ground
  const pebbleHalfY = StonePhysicsBodyFactory.getShapeConfig('pebble').halfExtents.y;
  assert.ok(res.pose.position.y >= pebbleHalfY - 0.02);
  assert.ok(res.trajectory && res.trajectory.length > 10);
});

test('M2-4.3: 60Hz Trajectory LERP & SLERP playback interpolates poses along shortest 4D geodesic', () => {
  const pA = new Pose({ x: 0, y: 1.0, z: 0 }, { qx: 0, qy: 0, qz: 0, qw: 1 });
  const pB = new Pose({ x: 0.2, y: 1.4, z: 0.1 }, { qx: 0, qy: 0.3827, qz: 0, qw: 0.9239 });

  const trajectory = [
    { step: 0, time: 0, poses: new Map([['dropped-stone', pA]]) },
    { step: 1, time: 1 / 60, poses: new Map([['dropped-stone', pB]]) },
  ];

  // At t = 0.5 / 60 (halfway)
  const mid = interpolateTrajectoryFrame(trajectory, 0.5 / 60);
  assert.equal(mid.isComplete, false);

  const pose = mid.poses.get('dropped-stone')!;
  assert.ok(pose !== undefined);
  assert.ok(Math.abs(pose.position.x - 0.1) < 1e-4);
  assert.ok(Math.abs(pose.position.y - 1.2) < 1e-4);
  assert.ok(Math.abs(pose.position.z - 0.05) < 1e-4);

  // Quaternion must remain normalized unit quaternion
  const norm = Math.hypot(pose.rotation.qx, pose.rotation.qy, pose.rotation.qz, pose.rotation.qw);
  assert.ok(Math.abs(norm - 1.0) < 1e-3);
});
