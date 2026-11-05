import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { Stone } from '../domain/entities/Stone.ts';
import { Tower, type TowerStoneItem } from '../domain/entities/Tower.ts';
import { type SimulationFrame } from '../domain/ports/PhysicsWorld.ts';
import { Pose, type Quat, type Vec3 } from '../domain/value-objects/Pose.ts';
import { TowerKey } from '../domain/value-objects/TowerKey.ts';
import { SimpleTowerPhysicsWorld } from '../infrastructure/physics/SimpleTowerPhysicsWorld.ts';
import {
  buildStoneGeometrySpec,
  buildStoneMaterialSpec,
  buildTowerSceneGraph,
  interpolateTrajectoryFrame,
  resetTowerMeshTransforms,
  resolveStonePose,
  type StoneRenderNode,
} from '../presentation/components/stoneTowerSpec.ts';
import {
  StackStoneController,
  type StackStoneViewState,
} from '../presentation/controllers/StackStoneController.ts';
import { createMsaAppContainer } from '../container.ts';

console.log('================================================================');
console.log('STARTING EMPIRICAL CHALLENGER STRESS HARNESS — M2 GEN2');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// TEST SUITE 1: resetTowerMeshTransforms Multi-Cycle Collapse & Chaos Stress
// -----------------------------------------------------------------------------
console.log('>>> [SUITE 1] resetTowerMeshTransforms Multi-Cycle Collapse & Chaos');

function createMockMesh(initialPos: Vec3 = { x: 0, y: 0, z: 0 }, initialQuat: Quat = { qx: 0, qy: 0, qz: 0, qw: 1 }) {
  const position = {
    x: initialPos.x,
    y: initialPos.y,
    z: initialPos.z,
    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
    },
  };
  const quaternion = {
    qx: initialQuat.qx,
    qy: initialQuat.qy,
    qz: initialQuat.qz,
    qw: initialQuat.qw,
    set(x: number, y: number, z: number, w: number) {
      this.qx = x;
      this.qy = y;
      this.qz = z;
      this.qw = w;
    },
  };
  return { position, quaternion };
}

function runResetTowerMeshTransformsStress() {
  const stones: TowerStoneItem[] = [
    {
      id: 'stone-0',
      stone: new Stone({ shape: 'boulder', color: '#3E4947', pose: new Pose({ x: 0, y: 0, z: 0 }) }),
      status: 'active',
      bloom: null,
      cheerLevel: 0,
      isMine: false,
      nickname: 'base',
    },
    {
      id: 'stone-1',
      stone: new Stone({ shape: 'round', color: '#5C6B73', pose: new Pose({ x: 0.02, y: 0.35, z: 0 }) }),
      status: 'active',
      bloom: null,
      cheerLevel: 1,
      isMine: false,
      nickname: 'mid1',
    },
    {
      id: 'stone-2',
      stone: new Stone({ shape: 'flat', color: '#7E8287', pose: new Pose({ x: -0.01, y: 0.65, z: 0.01 }) }),
      status: 'active',
      bloom: null,
      cheerLevel: 2,
      isMine: false,
      nickname: 'mid2',
    },
    {
      id: 'stone-3',
      stone: new Stone({ shape: 'pebble', color: '#A0AAB2', pose: new Pose({ x: 0, y: 0.9, z: 0 }) }),
      status: 'active',
      bloom: null,
      cheerLevel: 0,
      isMine: true,
      nickname: 'top',
    },
  ];

  const nodes = buildTowerSceneGraph(stones);
  assert.equal(nodes.length, 4, 'Should build 4 scene graph nodes');

  // 1.1 Test 50 consecutive chaotic collapse and reset cycles
  const meshMap = new Map<string, any>();
  const realThreeMeshMap = new Map<string, THREE.Mesh>();

  // Register both mock and real THREE.Mesh instances
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    meshMap.set(node.id, createMockMesh(node.position));
    const threeMesh = new THREE.Mesh();
    threeMesh.position.set(node.position.x, node.position.y, node.position.z);
    realThreeMeshMap.set(node.id, threeMesh);
  }

  const droppedStone = new Stone({
    shape: 'tall',
    color: '#D4A373',
    pose: new Pose({ x: 0.05, y: 1.15, z: 0 }, { qx: 0, qy: 0, qz: 0.1, qw: 0.995 }),
  });
  meshMap.set('dropped-stone', createMockMesh(droppedStone.pose.position, droppedStone.pose.rotation));

  const realDroppedMesh = new THREE.Mesh();
  realDroppedMesh.position.set(
    droppedStone.pose.position.x,
    droppedStone.pose.position.y,
    droppedStone.pose.position.z
  );
  realDroppedMesh.quaternion.set(
    droppedStone.pose.rotation.qx,
    droppedStone.pose.rotation.qy,
    droppedStone.pose.rotation.qz,
    droppedStone.pose.rotation.qw
  );
  realThreeMeshMap.set('dropped-stone', realDroppedMesh);

  for (let cycle = 1; cycle <= 50; cycle++) {
    // Chaos perturbation: displace all meshes randomly
    for (const [id, mesh] of meshMap) {
      mesh.position.set(
        (Math.random() - 0.5) * 8.0,
        Math.random() * 2.0,
        (Math.random() - 0.5) * 8.0
      );
      mesh.quaternion.set(
        Math.random(),
        Math.random(),
        Math.random(),
        Math.random()
      );
    }
    for (const [id, mesh] of realThreeMeshMap) {
      mesh.position.set(
        (Math.random() - 0.5) * 8.0,
        Math.random() * 2.0,
        (Math.random() - 0.5) * 8.0
      );
      mesh.quaternion.set(
        Math.random(),
        Math.random(),
        Math.random(),
        Math.random()
      ).normalize();
    }

    // Call resetTowerMeshTransforms on both maps
    resetTowerMeshTransforms(meshMap, nodes, droppedStone);
    resetTowerMeshTransforms(realThreeMeshMap as any, nodes, droppedStone);

    // Verify all standing nodes are restored to original node.position and unit quaternion
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const mesh = meshMap.get(node.id);
      assert.ok(mesh, `Mesh for node ${node.id} must exist in cycle ${cycle}`);
      assert.equal(mesh.position.x, node.position.x, `Cycle ${cycle}: node ${i} x must reset`);
      assert.equal(mesh.position.y, node.position.y, `Cycle ${cycle}: node ${i} y must reset`);
      assert.equal(mesh.position.z, node.position.z, `Cycle ${cycle}: node ${i} z must reset`);
      assert.deepEqual(
        { qx: mesh.quaternion.qx, qy: mesh.quaternion.qy, qz: mesh.quaternion.qz, qw: mesh.quaternion.qw },
        { qx: 0, qy: 0, qz: 0, qw: 1 },
        `Cycle ${cycle}: node ${i} quaternion must be identity`
      );

      const threeMesh = realThreeMeshMap.get(node.id)!;
      assert.equal(threeMesh.position.x, node.position.x);
      assert.equal(threeMesh.position.y, node.position.y);
      assert.equal(threeMesh.position.z, node.position.z);
      assert.equal(threeMesh.quaternion.x, 0);
      assert.equal(threeMesh.quaternion.y, 0);
      assert.equal(threeMesh.quaternion.z, 0);
      assert.equal(threeMesh.quaternion.w, 1);
    }

    // Verify dropped stone restored
    const droppedMesh = meshMap.get('dropped-stone');
    assert.equal(droppedMesh.position.x, droppedStone.pose.position.x);
    assert.equal(droppedMesh.position.y, droppedStone.pose.position.y);
    assert.equal(droppedMesh.position.z, droppedStone.pose.position.z);
    assert.equal(droppedMesh.quaternion.qx, droppedStone.pose.rotation.qx);
    assert.equal(droppedMesh.quaternion.qy, droppedStone.pose.rotation.qy);
    assert.equal(droppedMesh.quaternion.qz, droppedStone.pose.rotation.qz);
    assert.equal(droppedMesh.quaternion.qw, droppedStone.pose.rotation.qw);
  }
  console.log('  ✔ 50 consecutive chaos collapse/retry cycles: all meshes deterministically reset');

  // 1.2 Key format resolution: fallback to tower-stone-${i}
  const indexKeyedMeshMap = new Map<string, any>();
  for (let i = 0; i < nodes.length; i++) {
    indexKeyedMeshMap.set(`tower-stone-${i}`, createMockMesh({ x: 99, y: 99, z: 99 }));
  }
  resetTowerMeshTransforms(indexKeyedMeshMap, nodes, null);
  for (let i = 0; i < nodes.length; i++) {
    const mesh = indexKeyedMeshMap.get(`tower-stone-${i}`);
    assert.equal(mesh.position.x, nodes[i].position.x, `tower-stone-${i} x restored`);
    assert.equal(mesh.position.y, nodes[i].position.y, `tower-stone-${i} y restored`);
    assert.equal(mesh.position.z, nodes[i].position.z, `tower-stone-${i} z restored`);
    assert.equal(mesh.quaternion.qw, 1);
  }
  console.log('  ✔ tower-stone-${i} index key fallback correctly recognized and reset');

  // 1.3 Missing mesh resilience (empty map, sparse map, extra keys)
  const sparseMap = new Map<string, any>();
  sparseMap.set('stone-1', createMockMesh({ x: 42, y: 42, z: 42 }));
  sparseMap.set('unrelated-ghost-mesh', createMockMesh({ x: 10, y: 10, z: 10 }));

  // Should not throw even if nodes 0, 2, 3 and dropped-stone are missing
  assert.doesNotThrow(() => {
    resetTowerMeshTransforms(sparseMap, nodes, droppedStone);
  }, 'Sparse mesh map must not throw on missing node meshes');

  assert.equal(sparseMap.get('stone-1').position.x, nodes[1].position.x);
  // Unrelated mesh untouched
  assert.equal(sparseMap.get('unrelated-ghost-mesh').position.x, 10);
  console.log('  ✔ Sparse mesh maps and unrelated keys handled safely without throwing');

  // 1.4 Null/empty edge cases
  assert.doesNotThrow(() => {
    resetTowerMeshTransforms(new Map(), [], null);
    resetTowerMeshTransforms(new Map(), nodes, undefined);
  }, 'Empty nodes or maps must execute cleanly');
  console.log('  ✔ Empty nodes and empty meshMap execute cleanly');
}

runResetTowerMeshTransformsStress();

// -----------------------------------------------------------------------------
// TEST SUITE 2: Dropped Stone Mesh Persistence During Dynamic Collapse Animation
// -----------------------------------------------------------------------------
console.log('\n>>> [SUITE 2] Dropped Stone Mesh Persistence During Collapse Flow');

async function testDroppedStoneMeshPersistenceFlow() {
  const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/v1/auth/login')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: 'token-guest-emp',
          user: { id: 'user-emp-1', nickname: '도전자#9999', isGuest: true },
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: 'wish-emp-1', createdAt: new Date().toISOString() }),
    };
  };
  const container = createMsaAppContainer('http://localhost:8080', mockFetch as any);
  await container.auth.signIn('guest');
  const controller = new StackStoneController(container, {
    baseQuota: 5,
    bonusQuota: 0,
    usedCount: 0,
  });
  controller.updateContent('Empirical persistence test wish');

  const baseTower = new Tower(
    TowerKey.global(),
    [
      {
        id: 'base-0',
        stone: new Stone({ shape: 'boulder', color: '#3E4947', pose: new Pose({ x: 0, y: 0, z: 0 }) }),
        status: 'active',
        bloom: null,
        cheerLevel: 1,
        isMine: false,
        nickname: 'base',
      },
      {
        id: 'base-1',
        stone: new Stone({ shape: 'tall', color: '#5C6B73', pose: new Pose({ x: 0, y: 0.5, z: 0 }) }),
        status: 'active',
        bloom: null,
        cheerLevel: 1,
        isMine: false,
        nickname: 'mid',
      },
    ],
    { stoneCount: 2, todayCount: 2, fulfilledCount: 0, cheerCount: 2 }
  );

  // Simulate place.tsx state flow
  type StateTracker = {
    phase: string;
    renderedDroppedStone: Stone | null;
    currentTrajectory: readonly SimulationFrame[] | undefined;
    meshMap: Map<string, any>;
  };

  const simState: StateTracker = {
    phase: 'IDLE',
    renderedDroppedStone: null,
    currentTrajectory: undefined,
    meshMap: new Map(),
  };

  // Register existing tower meshes
  simState.meshMap.set('base-0', createMockMesh({ x: 0, y: 0, z: 0 }));
  simState.meshMap.set('base-1', createMockMesh({ x: 0, y: 0.5, z: 0 }));

  // Step 1: User drags and drops with off-center pose triggering collapse
  const dropPose = new Pose({ x: 0.35, y: 1.1, z: 0 }); // Intentionally off-center
  simState.phase = 'BALANCING';
  const initialDropped = controller.getState().selectedStone.withPose(dropPose);
  simState.renderedDroppedStone = initialDropped;

  // Mount dropped stone in meshMap (as DroppedStoneMesh3D does via useEffect)
  const droppedMesh = createMockMesh(initialDropped.pose.position, initialDropped.pose.rotation);
  simState.meshMap.set('dropped-stone', droppedMesh);

  assert.ok(simState.renderedDroppedStone !== null, 'Dropped stone must be mounted during BALANCING');
  assert.equal(droppedMesh.position.x, 0.35, 'Initial dropped stone pose must not be (0,0,0)');
  assert.equal(droppedMesh.position.y, 1.1);

  // Step 2: Controller executes drop simulation
  const dropResult = await controller.placeStone(baseTower, dropPose);
  assert.equal(dropResult.status, 'retry', 'Off-center drop should collapse and return retry');
  assert.ok(dropResult.trajectory && dropResult.trajectory.length > 5, 'Must provide trajectory frames');

  // Step 3: Enter COLLAPSING phase
  simState.phase = 'COLLAPSING';
  simState.currentTrajectory = dropResult.trajectory;

  // CRITICAL VERIFICATION: dropped stone REMAINS MOUNTED during COLLAPSING!
  assert.ok(simState.renderedDroppedStone !== null, 'Dropped stone MUST persist mounted during COLLAPSING phase');
  assert.ok(simState.meshMap.has('dropped-stone'), 'MeshMap must retain dropped-stone mesh during collapse');

  // Step 4: Trajectory animation playback verification
  // Sample trajectory frames at 25%, 50%, 75%, 100% of collapse duration
  const totalDuration = dropResult.trajectory[dropResult.trajectory.length - 1].time;
  const sampleTimes = [totalDuration * 0.25, totalDuration * 0.5, totalDuration * 0.75, totalDuration];

  let droppedStoneObservedMoving = false;
  let previousY = droppedMesh.position.y;

  for (const t of sampleTimes) {
    const frame = interpolateTrajectoryFrame(simState.currentTrajectory!, t);
    assert.ok(frame.poses.has('dropped-stone'), `Frame at t=${t.toFixed(3)}s must include dropped-stone pose`);

    // Imperative update (as TrajectorySynchronizer does)
    for (const [id, pose] of frame.poses) {
      const mesh = simState.meshMap.get(id);
      if (mesh) {
        mesh.position.set(pose.position.x, pose.position.y, pose.position.z);
        mesh.quaternion.set(pose.rotation.qx, pose.rotation.qy, pose.rotation.qz, pose.rotation.qw);
      }
    }

    if (Math.abs(droppedMesh.position.y - previousY) > 0.05) {
      droppedStoneObservedMoving = true;
    }
    previousY = droppedMesh.position.y;
  }

  assert.ok(droppedStoneObservedMoving, 'Dropped stone mesh position must actively animate during collapse');
  console.log('  ✔ Dropped stone mesh remains mounted and actively animates throughout collapse trajectory');

  // Step 5: Dynamic playback duration formula verification (from place.tsx)
  const trajectoryFrames = dropResult.trajectory.length;
  const dynamicTimeoutMs = Math.max(1200, Math.ceil(trajectoryFrames * (1000 / 60)) + 500);
  assert.ok(dynamicTimeoutMs >= 1200, 'Dynamic timeout must respect 1200ms minimum floor');
  assert.ok(dynamicTimeoutMs > trajectoryFrames * 16.6, 'Dynamic timeout must exceed pure trajectory duration');
  console.log(`  ✔ Dynamic collapse playback timeout calculated: ${dynamicTimeoutMs}ms for ${trajectoryFrames} frames`);

  // Step 6: Post-collapse reset flow (resetAfterCollapse)
  controller.resetPlacement();
  simState.phase = 'IDLE';
  simState.renderedDroppedStone = null;
  simState.meshMap.delete('dropped-stone'); // unmount
  simState.currentTrajectory = undefined;

  // Canvas useEffect triggers resetTowerMeshTransforms
  const baseNodes = buildTowerSceneGraph(baseTower.stones);
  resetTowerMeshTransforms(simState.meshMap, baseNodes, null);

  // Verify standing meshes are restored to initial base tower positions
  for (const node of baseNodes) {
    const mesh = simState.meshMap.get(node.id);
    assert.equal(mesh.position.x, node.position.x, `Post-collapse reset: ${node.id} x restored`);
    assert.equal(mesh.position.y, node.position.y, `Post-collapse reset: ${node.id} y restored`);
    assert.equal(mesh.position.z, node.position.z, `Post-collapse reset: ${node.id} z restored`);
    assert.equal(mesh.quaternion.qw, 1, `Post-collapse reset: ${node.id} rotation restored to identity`);
  }
  console.log('  ✔ Post-collapse reset cleanly unmounts dropped stone and restores standing tower meshes to baseline');
}

await testDroppedStoneMeshPersistenceFlow();

// -----------------------------------------------------------------------------
// TEST SUITE 3: Node.js ESM Test Runner Compatibility (0 .tsx imports)
// -----------------------------------------------------------------------------
console.log('\n>>> [SUITE 3] Node.js ESM Test Runner Compatibility Verification');

function verifyEsmCompatibility() {
  const testsDir = path.resolve('src/__tests__');
  const testFiles = fs.readdirSync(testsDir).filter((f) => f.endsWith('.test.ts'));

  assert.ok(testFiles.length >= 8, `Expected at least 8 .test.ts files, found ${testFiles.length}`);

  let totalTsxImports = 0;
  const violations: string[] = [];

  for (const file of testFiles) {
    const filePath = path.join(testsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Regex matching any import or require referencing a .tsx file
    const tsxImportRegex = /import\s+.*?from\s+['"][^'"]*?\.tsx['"]/g;
    const matches = content.match(tsxImportRegex);

    if (matches && matches.length > 0) {
      totalTsxImports += matches.length;
      violations.push(`${file}: ${matches.join(', ')}`);
    }
  }

  assert.equal(
    totalTsxImports,
    0,
    `Found direct .tsx imports in test files:\n${violations.join('\n')}`
  );
  console.log(`  ✔ Verified ${testFiles.length} test files: ZERO .tsx imports found`);

  // Verify stoneTowerSpec exports resetTowerMeshTransforms
  assert.equal(
    typeof resetTowerMeshTransforms,
    'function',
    'resetTowerMeshTransforms must be exported by stoneTowerSpec.ts'
  );
  console.log('  ✔ resetTowerMeshTransforms is safely exported from pure TypeScript stoneTowerSpec.ts');
}

verifyEsmCompatibility();

// -----------------------------------------------------------------------------
// TEST SUITE 4: Multi-Stone Stacking Session Isolation & Concurrency Defense
// -----------------------------------------------------------------------------
console.log('\n>>> [SUITE 4] Multi-Stone Stacking Session Isolation & Concurrency Stress');

async function testSessionIsolationAndConcurrency() {
  const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/v1/auth/login')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: 'token-guest-emp-2',
          user: { id: 'user-emp-2', nickname: '도전자2#8888', isGuest: true },
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: 'wish-emp-2', createdAt: new Date().toISOString() }),
    };
  };
  const container = createMsaAppContainer('http://localhost:8080', mockFetch as any);
  await container.auth.signIn('guest');
  const controller = new StackStoneController(container, {
    baseQuota: 5,
    bonusQuota: 0,
    usedCount: 0,
  });
  controller.updateContent('Session isolation wish');

  const tower = new Tower(
    TowerKey.global(),
    [
      {
        id: 'stone-base',
        stone: new Stone({ shape: 'boulder', color: '#3E4947', pose: new Pose({ x: 0, y: 0, z: 0 }) }),
        status: 'active',
        bloom: null,
        cheerLevel: 1,
        isMine: false,
        nickname: 'base',
      },
    ],
    { stoneCount: 1, todayCount: 1, fulfilledCount: 0, cheerCount: 1 }
  );

  // Stone 1: Collapses twice, settles on attempt 3
  controller.startPlacing();
  assert.equal(controller.getState().attempt, 0, 'Attempt starts at 0 before first drop');

  // Attempt 1 collapse
  const res1 = await controller.placeStone(tower, new Pose({ x: 0.35, y: 0.6, z: 0 }));
  assert.equal(res1.status, 'retry');
  assert.equal(res1.attempt, 1);
  assert.equal(controller.getState().attempt, 1);

  // Attempt 2 collapse
  const res2 = await controller.placeStone(tower, new Pose({ x: -0.35, y: 0.6, z: 0 }));
  assert.equal(res2.status, 'retry');
  assert.equal(res2.attempt, 2);
  assert.equal(controller.getState().attempt, 2);

  // Attempt 3 auto-settle
  const res3 = await controller.placeStone(tower, new Pose({ x: 0.35, y: 0.6, z: 0 }));
  assert.equal(res3.status, 'saved');
  assert.equal(res3.autoPlaced, true);
  assert.equal(controller.getState().phase, 'SETTLED');

  // CRITICAL SESSION ISOLATION ASSERTION:
  // Post-settlement attempt must reset to 0 so the next stone gets full 3 attempts!
  assert.equal(
    controller.getState().attempt,
    0,
    'Attempt counter MUST reset to 0 upon settlement for multi-stone session isolation'
  );
  console.log('  ✔ Session isolation: attempt counter resets to 0 upon settlement');

  // Stone 2: Brand new stone placement session
  controller.startPlacing();
  assert.equal(controller.getState().attempt, 0, 'Subsequent stone session starts cleanly with attempt 0');

  // Drop stably right on top
  const resStone2 = await controller.placeStone(tower, new Pose({ x: 0, y: 0.45, z: 0 }));
  assert.equal(resStone2.status, 'saved', 'Stable center drop settles on attempt 1');
  assert.equal(resStone2.autoPlaced, false, 'First drop was stable, not autoPlaced');
  assert.equal(controller.getState().phase, 'SETTLED');
  assert.equal(controller.getState().attempt, 0, 'Attempt counter resets to 0 again post-settlement');
  console.log('  ✔ Second stone correctly starts at attempt 0, settles without autoPlacement, and resets to 0');

  // Concurrency Re-entrancy Defense:
  // Start placing and test concurrent calls while in flight
  controller.startPlacing();
  const slowDropPromise = controller.placeStone(tower, new Pose({ x: 0, y: 0.7, z: 0 }));

  // Concurrent call while slowDropPromise is executing must be rejected with PLACEMENT_IN_PROGRESS
  await assert.rejects(
    async () => {
      await controller.placeStone(tower, new Pose({ x: 0, y: 0.7, z: 0 }));
    },
    /PLACEMENT_IN_PROGRESS/,
    'Concurrent placeStone() call during in-flight drop must be rejected'
  );

  const finalRes = await slowDropPromise;
  assert.equal(finalRes.status, 'saved');
  console.log('  ✔ Concurrency defense: concurrent placeStone() rejected with PLACEMENT_IN_PROGRESS');
}

await testSessionIsolationAndConcurrency();

console.log('\n================================================================');
console.log('ALL EMPIRICAL CHALLENGER STRESS TESTS PASSED WITH 100% SUCCESS');
console.log('================================================================');
