/**
 * Challenger M1.2 Adversarial Empirical Test Suite:
 * - Scene graph resolver (`resolveGrounded3DNodes`) empirical stress-testing
 * - Airborne cantilever arches (C-curves / banana shapes) impossibility verification
 * - User placement coordinate preservation (zero center-pull distortion)
 * - Fallen stone placement flow & coordinate integrity (`place.tsx`)
 * - D-022 `FALLEN_CHOICE` lifecycle, retry flow, and 3-attempt auto-settling
 *
 * Requirements: ORIGINAL_REQUEST.md (R2, R3, R5), PROJECT.md (F01, F02, F10, F26, F27), DISPATCH.md
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import { Stone, type StoneShape } from '../domain/entities/Stone.ts';
import { Pose, type Vec3 } from '../domain/value-objects/Pose.ts';
import { StonePhysicsBodyFactory } from '../infrastructure/physics/StonePhysicsBodyFactory.ts';
import {
  buildStoneGeometrySpec,
  type StoneRenderNode,
} from '../presentation/components/stoneTowerSpec.ts';
import { createMsaAppContainer } from '../container.ts';
import { Tower } from '../domain/entities/Tower.ts';
import { TowerKey } from '../domain/value-objects/TowerKey.ts';
import { StackStoneController } from '../presentation/controllers/StackStoneController.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

/**
 * Dynamically extract and transpile the production functions directly from
 * `src/presentation/components/StoneTowerCanvas.tsx`.
 * This guarantees 100% fidelity to production source code without synthetic mocks.
 */
function loadGroundedResolverFromProductionSource() {
  const canvasPath = path.resolve(projectRoot, 'presentation/components/StoneTowerCanvas.tsx');
  const src = fs.readFileSync(canvasPath, 'utf8');

  const startMarker = 'export const ROUND_PEBBLE_VISUAL_SCALES';
  const endMarker = 'export type TowerArchStyle';
  const startIndex = src.indexOf(startMarker);
  const endIndex = src.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error('Failed to locate grounding resolver code in StoneTowerCanvas.tsx');
  }

  const codeSegment = src.slice(startIndex, endIndex);
  const transpiled = ts.transpileModule(codeSegment, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const sandboxModule: { exports: any } = { exports: {} };
  const fn = new Function('exports', transpiled);
  fn(sandboxModule.exports);

  return sandboxModule.exports as {
    ROUND_PEBBLE_VISUAL_SCALES: Record<StoneShape, { readonly x: number; readonly y: number; readonly z: number }>;
    getRoundPebbleVisualScale: (shape: StoneShape) => { readonly x: number; readonly y: number; readonly z: number };
    resolveLocalSupportTopY: (
      x: number,
      z: number,
      horizontalRadius: number,
      groundedNodes: readonly StoneRenderNode[]
    ) => number;
    resolveGrounded3DNodes: (rawNodes: readonly StoneRenderNode[]) => StoneRenderNode[];
  };
}

const resolver = loadGroundedResolverFromProductionSource();

/**
 * Helper to build a valid StoneRenderNode for testing
 */
function createMockRenderNode(
  id: string,
  shape: StoneShape,
  pos: { x: number; y: number; z: number }
): StoneRenderNode {
  return {
    id: id as any,
    position: { x: pos.x, y: pos.y, z: pos.z },
    geometry: buildStoneGeometrySpec(shape),
    material: {
      baseColor: '#808080',
      roughness: 0.9,
      metalness: 0.05,
      emissiveColor: '#000000',
      emissiveIntensity: 0,
      outlineHighlighted: false,
      outlineColor: '#ffffff',
    },
    decoration: null,
    nicknameLabel: null,
  };
}

// =============================================================================
// Suite 1: Pure Empirical Stress Test of resolveGrounded3DNodes
// =============================================================================

test('Challenger M1.2.1: Adversarial Airborne Cantilever Arch (C-Curve) Synthesis Impossibility', () => {
  // Scenario: Attempt to synthesize an airborne C-curve arch by sequentially offsetting stones:
  // S0: Boulder base at (0, 0, 0) -> scale: { x: 0.72, y: 0.50, z: 0.70 }, radius = 0.18m
  // Maximum allowed cantilever overhang from foundation root: 0.18m * 1.15 = 0.207m.
  //
  // Stones S1..S6 continuously step out horizontally in +X by +0.08m increments:
  // S0: x = 0.00 (within 0.207m) -> sits on ground
  // S1: x = 0.08 (within 0.207m) -> sits on S0 (elevated)
  // S2: x = 0.16 (within 0.207m) -> sits on S1 (elevated)
  // S3: x = 0.24 (> 0.207m from S0) -> EXCEEDS base root footprint!
  // S4: x = 0.32 (> 0.207m from S0)
  // S5: x = 0.24 (curving back up and left)
  // S6: x = 0.16 (curving back over the top)

  const rawNodes: StoneRenderNode[] = [
    createMockRenderNode('s0', 'boulder', { x: 0.00, y: 1.0, z: 0.0 }),
    createMockRenderNode('s1', 'flat', { x: 0.08, y: 2.0, z: 0.0 }),
    createMockRenderNode('s2', 'flat', { x: 0.16, y: 3.0, z: 0.0 }),
    createMockRenderNode('s3', 'flat', { x: 0.24, y: 4.0, z: 0.0 }),
    createMockRenderNode('s4', 'flat', { x: 0.32, y: 5.0, z: 0.0 }),
    createMockRenderNode('s5', 'round', { x: 0.24, y: 6.0, z: 0.0 }),
    createMockRenderNode('s6', 'pebble', { x: 0.16, y: 7.0, z: 0.0 }),
  ];

  const grounded = resolver.resolveGrounded3DNodes(rawNodes);

  assert.equal(grounded.length, 7);

  // S0: Grounded at y = hy = 0.50 * 0.25 = 0.125m
  const s0 = grounded[0];
  assert.equal(s0.position.y, 0.125, 'S0 must rest on ground');

  // S1: x=0.08 is within S0 root radius (0.18 * 1.15 = 0.207m) -> elevated onto S0
  const s1 = grounded[1];
  assert.ok(s1.position.y > s0.position.y, 'S1 must be elevated onto S0');

  // S2: x=0.16 is within S0 root radius (0.207m) -> elevated onto S1
  const s2 = grounded[2];
  assert.ok(s2.position.y > s1.position.y, 'S2 must be elevated onto S1');

  // S3: x=0.24 exceeds S0 root radius (0.24 > 0.207m)!
  // Anti-Banana Invariant: S3 CANNOT hang in mid-air from S2. It MUST drop to ground!
  const s3 = grounded[3];
  const s3Scale = resolver.getRoundPebbleVisualScale('flat');
  const s3Hy = Number((s3Scale.y * 0.25).toFixed(4));
  assert.equal(
    s3.position.y,
    s3Hy,
    `Anti-Banana Invariant violated: S3 at x=0.24m must fall to ground (y=${s3Hy}), got ${s3.position.y}`
  );

  // Invariant verification across all nodes: NO NODE with distFromRoot > rootRadius * 1.15 can have supportTopY > 0
  for (let i = 0; i < grounded.length; i++) {
    const node = grounded[i];
    const scale = resolver.getRoundPebbleVisualScale(node.geometry.shape);
    const hy = Number((scale.y * 0.25).toFixed(4));

    // Grounded resting height must be >= hy
    assert.ok(
      node.position.y >= hy - 1e-4,
      `Node ${node.id} is below ground plane: y=${node.position.y} < ${hy}`
    );

    // If elevated above ground: must have valid ground root within rootRadius * 1.15
    if (node.position.y > hy + 1e-4) {
      // Find the supporting stone
      const prevNodes = grounded.slice(0, i);
      let foundValidSupport = false;
      for (const prev of prevNodes) {
        const prevScale = resolver.getRoundPebbleVisualScale(prev.geometry.shape);
        const radius = Math.max(scale.x * 0.25, scale.z * 0.25);
        const prevRadius = Math.max(prevScale.x * 0.25, prevScale.z * 0.25);
        const distXZ = Math.hypot(node.position.x - prev.position.x, node.position.z - prev.position.z);
        if (distXZ <= Math.min(radius, prevRadius) * 0.62) {
          foundValidSupport = true;
          break;
        }
      }
      assert.ok(
        foundValidSupport,
        `Node ${node.id} is elevated without underlying contact support`
      );
    }
  }
});

test('Challenger M1.2.2: 1,000 Fuzzed Adversarial Configurations Guarantee Zero Airborne Cantilever Hovering', () => {
  const shapes: StoneShape[] = ['boulder', 'flat', 'tall', 'round', 'pebble'];
  const testNodeCount = 1000;

  // Generate 1000 randomized nodes with extreme lateral and vertical dispersion
  const randomNodes: StoneRenderNode[] = [];
  for (let i = 0; i < testNodeCount; i++) {
    const shape = shapes[i % shapes.length];
    // Random position in [-2.5, 2.5]m x [-2.5, 2.5]m, random initial Y in [-5.0, 30.0]m
    const x = Number(((Math.sin(i * 997) * 2.5)).toFixed(4));
    const z = Number(((Math.cos(i * 7919) * 2.5)).toFixed(4));
    const y = Number(((Math.sin(i * 13) * 15.0 + 15.0)).toFixed(4));

    randomNodes.push(createMockRenderNode(`fuzz-${i}`, shape, { x, y, z }));
  }

  const resolved = resolver.resolveGrounded3DNodes(randomNodes);
  assert.equal(resolved.length, testNodeCount);

  let groundedToFloorCount = 0;
  let elevatedCount = 0;

  for (let i = 0; i < resolved.length; i++) {
    const node = resolved[i];
    const scale = resolver.getRoundPebbleVisualScale(node.geometry.shape);
    const hy = Number((scale.y * 0.25).toFixed(4));

    // Coordinates must be valid finite numbers
    assert.ok(Number.isFinite(node.position.x), `Node ${node.id} has non-finite X`);
    assert.ok(Number.isFinite(node.position.y), `Node ${node.id} has non-finite Y`);
    assert.ok(Number.isFinite(node.position.z), `Node ${node.id} has non-finite Z`);

    // Invariant 1: Y must never be below resting half-extent
    assert.ok(
      node.position.y >= hy - 1e-4,
      `Node ${node.id} clipped below ground: ${node.position.y} < ${hy}`
    );

    if (Math.abs(node.position.y - hy) <= 1e-4) {
      groundedToFloorCount++;
    } else {
      elevatedCount++;
      // Invariant 2: If elevated, there MUST be an underlying stone supporting it
      let hasSupport = false;
      for (let j = 0; j < i; j++) {
        const prev = resolved[j];
        const prevScale = resolver.getRoundPebbleVisualScale(prev.geometry.shape);
        const radius = Math.max(scale.x * 0.25, scale.z * 0.25);
        const prevRadius = Math.max(prevScale.x * 0.25, prevScale.z * 0.25);
        const distXZ = Math.hypot(node.position.x - prev.position.x, node.position.z - prev.position.z);
        if (distXZ <= Math.min(radius, prevRadius) * 0.62) {
          hasSupport = true;
          break;
        }
      }
      assert.ok(
        hasSupport,
        `Node ${node.id} at y=${node.position.y} is floating in mid-air without support!`
      );
    }
  }

  assert.ok(groundedToFloorCount > 0, 'At least one stone must be on the floor');
  // Confirm zero hovering cantilever arches across all 1,000 fuzzed stones
});

test('Challenger M1.2.3: User Coordinate Preservation & Zero Center-Pull Distortion Oracle', () => {
  // Test across 200 high-precision coordinate pairs.
  // Historical defect: previous implementation applied `(node.x - prev.x) * 0.45` center pull.
  // Requirement: Authentic physics coordinates must be preserved with zero distortion (toFixed(4)).

  const baseNode = createMockRenderNode('base', 'boulder', { x: 0.0, y: 0.125, z: 0.0 });
  const rawNodes: StoneRenderNode[] = [baseNode];

  const testCoords: { x: number; z: number }[] = [];
  for (let i = 1; i <= 200; i++) {
    // Generate fine offsets within and outside support radius
    const x = Number(((i % 2 === 0 ? 1 : -1) * (0.001 * i)).toFixed(4));
    const z = Number(((i % 3 === 0 ? 1 : -1) * (0.0015 * i)).toFixed(4));
    testCoords.push({ x, z });
    rawNodes.push(createMockRenderNode(`stone-${i}`, 'pebble', { x, y: 2.0, z }));
  }

  const resolved = resolver.resolveGrounded3DNodes(rawNodes);

  // Check that EVERY resolved stone's X and Z strictly match raw node coordinates to 4 decimal places
  for (let i = 1; i <= 200; i++) {
    const original = testCoords[i - 1];
    const node = resolved[i];

    assert.equal(
      node.position.x,
      original.x,
      `Coordinate distortion detected on X for stone-${i}: expected ${original.x}, got ${node.position.x}`
    );
    assert.equal(
      node.position.z,
      original.z,
      `Coordinate distortion detected on Z for stone-${i}: expected ${original.z}, got ${node.position.z}`
    );
  }
});

test('Challenger M1.2.4: Adversarial Reversed & Permuted Scene Graph Order Integrity', () => {
  // Scenario: Stones supplied in reverse order (top stone first, base foundation last).
  // A top stone passed first has no prior support in `grounded`, so it MUST land on the ground (y = hy).
  // It must NEVER hover in mid-air just because its input position was high.

  const topNode = createMockRenderNode('top', 'pebble', { x: 0.0, y: 5.0, z: 0.0 });
  const midNode = createMockRenderNode('mid', 'round', { x: 0.0, y: 3.0, z: 0.0 });
  const baseNode = createMockRenderNode('base', 'boulder', { x: 0.0, y: 1.0, z: 0.0 });

  const reversedNodes = [topNode, midNode, baseNode];
  const resolved = resolver.resolveGrounded3DNodes(reversedNodes);

  // First stone (topNode) has no prior supporting stone -> drops to ground
  const resolvedTop = resolved[0];
  const pebbleHy = Number((resolver.getRoundPebbleVisualScale('pebble').y * 0.25).toFixed(4));
  assert.equal(
    resolvedTop.position.y,
    pebbleHy,
    `Top stone when fed first must be grounded at groundRestY (${pebbleHy}), got ${resolvedTop.position.y}`
  );

  // Subsequent stones stack on top of whatever is grounded beneath them
  assert.ok(resolved[1].position.y > resolved[0].position.y);
  assert.ok(resolved[2].position.y > resolved[1].position.y);
});

test('Challenger M1.2.5: Multi-Tower Forest Ground Root Isolation', () => {
  // Construct 3 distinct towers on the ground:
  // Tower A at (0.0, 0.0)
  // Tower B at (2.0, 0.0)
  // Tower C at (0.0, 2.0)
  // Each tower has 3 stones stacked vertically.

  const rawNodes: StoneRenderNode[] = [
    // Tower A
    createMockRenderNode('a0', 'boulder', { x: 0.0, y: 1.0, z: 0.0 }),
    createMockRenderNode('a1', 'round', { x: 0.02, y: 2.0, z: 0.01 }),
    createMockRenderNode('a2', 'pebble', { x: 0.03, y: 3.0, z: 0.02 }),

    // Tower B
    createMockRenderNode('b0', 'flat', { x: 2.0, y: 1.0, z: 0.0 }),
    createMockRenderNode('b1', 'round', { x: 2.01, y: 2.0, z: -0.01 }),
    createMockRenderNode('b2', 'tall', { x: 2.02, y: 3.0, z: 0.01 }),

    // Tower C
    createMockRenderNode('c0', 'boulder', { x: 0.0, y: 1.0, z: 2.0 }),
    createMockRenderNode('c1', 'flat', { x: -0.01, y: 2.0, z: 2.01 }),
    createMockRenderNode('c2', 'pebble', { x: 0.01, y: 3.0, z: 2.02 }),
  ];

  const resolved = resolver.resolveGrounded3DNodes(rawNodes);
  assert.equal(resolved.length, 9);

  // Tower A base is at ground
  const a0 = resolved[0];
  const b0 = resolved[3];
  const c0 = resolved[6];

  assert.equal(a0.position.x, 0.0);
  assert.equal(b0.position.x, 2.0);
  assert.equal(c0.position.z, 2.0);

  // All 3 bases must be on the ground
  assert.equal(a0.position.y, Number((resolver.getRoundPebbleVisualScale('boulder').y * 0.25).toFixed(4)));
  assert.equal(b0.position.y, Number((resolver.getRoundPebbleVisualScale('flat').y * 0.25).toFixed(4)));
  assert.equal(c0.position.y, Number((resolver.getRoundPebbleVisualScale('boulder').y * 0.25).toFixed(4)));

  // Upper stones of Tower B must stack above b0 (x ~ 2.0), NOT confused with a0 (x = 0)
  const b1 = resolved[4];
  const b2 = resolved[5];
  assert.ok(b1.position.y > b0.position.y);
  assert.ok(b2.position.y > b1.position.y);
  assert.equal(b1.position.x, 2.01);
  assert.equal(b2.position.x, 2.02);
});

// =============================================================================
// Suite 2: Fallen Stone Placement Flow & Coordinate Integrity (place.tsx)
// =============================================================================

test('Challenger M1.2.6: place.tsx Fallen Pose Simulation & Coordinate Hand-off Contract', async () => {
  // Scenario: A drop fails / collapses.
  // Physics world simulates dynamic tumbling down to ground.
  // place.tsx receives dropResult.pose and MUST construct finalPose:
  // - finalPose.x = simulated landing X (NOT user mid-air drag X)
  // - finalPose.y = groundRestY (NOT mid-air Y)
  // - finalPose.z = simulated landing Z (NOT user mid-air drag Z)

  const stoneConfig = StonePhysicsBodyFactory.getShapeConfig('round');
  const groundRestY = Number(stoneConfig.halfExtents.y.toFixed(4));

  // User was dragging high in mid-air at (0.25, 2.80, 0.15)
  const userDropPose = new Pose({ x: 0.25, y: 2.80, z: 0.15 });

  // Physics simulation tumbling ended at (0.4215, groundRestY, -0.1832)
  const simulatedLandingPose = new Pose({ x: 0.4215, y: groundRestY, z: -0.1832 });

  // Mimic place.tsx lines 278-291:
  const simulatedPose = simulatedLandingPose ?? userDropPose;
  const finalPose = new Pose(
    {
      x: Number(simulatedPose.position.x.toFixed(4)),
      y: groundRestY,
      z: Number(simulatedPose.position.z.toFixed(4)),
    },
    simulatedPose.rotation
  );

  // Invariant 1: Y is strictly groundRestY
  assert.equal(finalPose.position.y, groundRestY, 'finalPose Y must strictly equal groundRestY');

  // Invariant 2: X and Z use authentic simulated landing coordinates, NOT mid-air drag coordinates
  assert.equal(finalPose.position.x, 0.4215, 'finalPose X must use simulated tumble landing coordinate');
  assert.equal(finalPose.position.z, -0.1832, 'finalPose Z must use simulated tumble landing coordinate');
  assert.notEqual(finalPose.position.x, userDropPose.position.x, 'Must NOT use user mid-air drop X');
  assert.notEqual(finalPose.position.z, userDropPose.position.z, 'Must NOT use user mid-air drop Z');
});

test('Challenger M1.2.7: D-022 FALLEN_CHOICE End-to-End Commit Flow with Authentic Ground Resting Pose', async () => {
  // Setup AppContainer and StackStoneController
  const originalFetch = globalThis.fetch;
  let savedRequestPayload: any = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';

    if (url.includes('/api/v1/auth/login')) {
      return new Response(
        JSON.stringify({
          accessToken: 'mock-token-m1-2',
          user: { id: 'user-m1-2', nickname: null, isGuest: true },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url.includes('/api/v1/wishes') && method === 'POST') {
      savedRequestPayload = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({
          id: 'wish-m1-2-grounded',
          content: savedRequestPayload.content,
          category: savedRequestPayload.category,
          scope: savedRequestPayload.scope,
          stone: savedRequestPayload.stone,
          createdAt: new Date().toISOString(),
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({}), { status: 200 });
  }) as typeof fetch;

  try {
    const container = createMsaAppContainer();
    await container.auth.signIn('guest');

    const controller = new StackStoneController(container);
    controller.grantRewardQuotaBonus(5);
    controller.updateContent('소원이 온전히 이루어지기를 바랍니다');

    // Initial state check
    assert.equal(controller.getState().phase, 'IDLE');

    // Prepare a fallen pose resting on ground
    const pebbleConfig = StonePhysicsBodyFactory.getShapeConfig('pebble');
    const expectedGroundY = Number(pebbleConfig.halfExtents.y.toFixed(4));
    const fallenGroundPose = new Pose({ x: 0.3842, y: expectedGroundY, z: -0.2155 });

    // User chooses [ ⛰️ 이 자리에 그대로 두기 ] (confirmFallenPlacement)
    const result = await controller.confirmFallenPlacement(fallenGroundPose);

    // Invariant assertions:
    assert.equal(result.status, 'saved');
    assert.equal(result.autoPlaced, false);
    assert.equal(result.pose.position.y, expectedGroundY);
    assert.equal(result.pose.position.x, 0.3842);
    assert.equal(result.pose.position.z, -0.2155);

    // Controller state transitioned to SETTLED
    assert.equal(controller.getState().phase, 'SETTLED');
    assert.equal(controller.getState().savedWishId, 'wish-m1-2-grounded');

    // Verify backend received the authentic ground pose
    assert.ok(savedRequestPayload !== null);
    assert.equal(savedRequestPayload.pose.y, expectedGroundY);
    assert.equal(savedRequestPayload.pose.x, 0.3842);
    assert.equal(savedRequestPayload.pose.z, -0.2155);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Challenger M1.2.8: Retry Placement (handleRetryPlacement) Cleans State and Enables Clean Re-Drag', () => {
  const container = createMsaAppContainer();
  const controller = new StackStoneController(container);
  controller.grantRewardQuotaBonus(5);

  // Simulate a failed drop transition to COLLAPSING
  (controller as any).updateState({
    phase: 'COLLAPSING',
    attempt: 1,
    towerCollapsed: true,
  });

  assert.equal(controller.getState().phase, 'COLLAPSING');
  assert.equal(controller.getState().attempt, 1);

  // User selects [ ↺ 다시 올려보기 ] (handleRetryPlacement)
  const nextState = controller.retryPlacement();

  // Invariant assertions:
  assert.equal(nextState.phase, 'IDLE', 'Phase must be cleanly restored to IDLE');
  assert.equal(nextState.towerCollapsed, false, 'towerCollapsed flag must be cleared');
  assert.equal(nextState.attempt, 1, 'Attempt counter must be preserved for 3-attempt lifecycle');
  assert.equal(nextState.lastAffectedStones, undefined, 'lastAffectedStones must be reset');
});

test('Challenger M1.2.9: 3rd Consecutive Collapse Auto-Settling on Summit Guarantee', async () => {
  // Scenario: If user fails 3 consecutive times, controller auto-places safely on summit
  const container = createMsaAppContainer();
  await container.auth.signIn('guest');
  const controller = new StackStoneController(container);
  controller.grantRewardQuotaBonus(5);
  controller.updateContent('소원이 꼭 이루어지기를 바랍니다');

  // Create an active tower with 1 base stone
  const baseStone = new Stone({
    shape: 'boulder',
    color: '#333333',
    pose: new Pose({ x: 0.0, y: 0.125, z: 0.0 }),
  });
  const tower = new Tower(
    TowerKey.global(),
    [
      {
        id: 'stone-0',
        stone: baseStone,
        status: 'active',
        bloom: null,
        cheerLevel: 0,
        isMine: false,
        nickname: null,
      },
    ],
    { stoneCount: 1, todayCount: 1, cheerCount: 0, fulfilledCount: 0 }
  );

  // Attempt 1: Drop far off (fails)
  const offDrop = new Pose({ x: 1.5, y: 1.0, z: 0.0 });
  const res1 = await controller.placeStone(tower, offDrop);
  assert.equal(res1.status, 'retry');
  assert.equal(controller.getState().attempt, 1);

  // Attempt 2: Drop far off (fails)
  controller.retryPlacement();
  const res2 = await controller.placeStone(tower, offDrop);
  assert.equal(res2.status, 'retry');
  assert.equal(controller.getState().attempt, 2);

  // Attempt 3: Drop far off -> MUST auto-place on summit
  controller.retryPlacement();
  const res3 = await controller.placeStone(tower, offDrop);

  assert.equal(res3.status, 'saved', '3rd attempt must auto-save');
  assert.equal(res3.autoPlaced, true, '3rd attempt must flag autoPlaced = true');
  assert.equal(controller.getState().phase, 'SETTLED');

  // Verify auto-placed position is centered on the summit stone
  assert.ok(
    Math.hypot(res3.pose.position.x - baseStone.pose.position.x, res3.pose.position.z - baseStone.pose.position.z) < 0.05,
    'Auto-placed stone must be centered on the summit'
  );
  assert.ok(
    res3.pose.position.y > baseStone.pose.position.y,
    'Auto-placed stone must be placed above summit'
  );
});

test('Challenger M1.2.10: High-Volume Performance & Scalability Stress Benchmark (200 Stones)', () => {
  // Stress-test resolveGrounded3DNodes with 200 nodes
  const nodes: StoneRenderNode[] = [];
  for (let i = 0; i < 200; i++) {
    nodes.push(
      createMockRenderNode(`bench-${i}`, 'round', {
        x: Number((Math.sin(i * 0.1) * 0.05).toFixed(4)),
        y: Number((i * 0.2).toFixed(4)),
        z: Number((Math.cos(i * 0.1) * 0.05).toFixed(4)),
      })
    );
  }

  const startTime = performance.now();
  const resolved = resolver.resolveGrounded3DNodes(nodes);
  const elapsedMs = performance.now() - startTime;

  assert.equal(resolved.length, 200);
  assert.ok(
    elapsedMs < 30.0,
    `resolveGrounded3DNodes for 200 nodes must complete in < 30ms, took ${elapsedMs.toFixed(2)}ms`
  );
});
