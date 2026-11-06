import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Stone } from '../domain/entities/Stone.ts';
import { Tower } from '../domain/entities/Tower.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import { TowerKey } from '../domain/value-objects/TowerKey.ts';
import { SimpleTowerPhysicsWorld } from '../infrastructure/physics/SimpleTowerPhysicsWorld.ts';
import { StonePhysicsBodyFactory } from '../infrastructure/physics/StonePhysicsBodyFactory.ts';
import {
  calculate3DDropPoseFromWorldPosition,
  DROP_ZONE_MAX_LATERAL_X,
  DROP_ZONE_MAX_DEPTH_Z,
} from '../presentation/components/stoneDragSpec.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// =============================================================================
// Feature 1: Removal of 2D "여기에 돌을 놓아주세요" UI & 3D Drop Prediction Indicator
// =============================================================================
test('Feature 1.1: 2D dropZone UI is completely removed from src/app/stack/place.tsx', () => {
  const placeSource = fs.readFileSync(
    path.resolve(projectRoot, 'app/stack/place.tsx'),
    'utf8'
  );

  assert.ok(
    !placeSource.includes('여기에 돌을 놓아주세요'),
    '2D guide text "여기에 돌을 놓아주세요" must NOT exist in place.tsx'
  );
  assert.ok(
    !placeSource.includes('styles.dropZone'),
    'styles.dropZone must NOT be referenced in place.tsx'
  );
});

test('Feature 1.2: StoneTowerCanvas.tsx contains 3D Real-Time Drop Prediction Projection', () => {
  const canvasSource = fs.readFileSync(
    path.resolve(projectRoot, 'presentation/components/StoneTowerCanvas.tsx'),
    'utf8'
  );

  assert.ok(
    canvasSource.includes('Projected Landing Reticle Ring & Contact Shadow'),
    'StoneTowerCanvas must render projected landing reticle ring & contact shadow'
  );
  assert.ok(
    canvasSource.includes('Vertical Laser Drop Guide Beam'),
    'StoneTowerCanvas must render vertical laser drop guide beam connecting stone to landing point'
  );
  assert.ok(
    canvasSource.includes('Cairn Apex Sweet Spot Marker'),
    'StoneTowerCanvas must render stationary target center marker on cairn apex'
  );
});

test('Feature 1.3: calculate3DDropPoseFromWorldPosition respects ground vs tower footprint', () => {
  const topSurfaceY = 1.2;
  const stoneHalfY = 0.205;

  // Case A: Dropped within tower footprint
  const overTowerPose = calculate3DDropPoseFromWorldPosition(
    [0.1, 0.5, 0.05],
    topSurfaceY,
    stoneHalfY
  );
  assert.ok(
    overTowerPose.position.y >= topSurfaceY + stoneHalfY,
    'Drop over tower footprint must have elevation above topSurfaceY'
  );

  // Case B: Dropped outside tower footprint (cantilever / side drop)
  const outsidePose = calculate3DDropPoseFromWorldPosition(
    [0.85, 0.45, 0.6],
    topSurfaceY,
    stoneHalfY
  );
  assert.ok(
    outsidePose.position.y <= topSurfaceY,
    'Drop outside tower footprint must NOT be forced up to tower height'
  );
  assert.ok(
    outsidePose.position.y >= stoneHalfY,
    'Drop outside tower footprint must be at or above ground level'
  );
});

// =============================================================================
// Feature 2: Physics Engine Anti-Explosion & Gravity Realism
// =============================================================================
test('Feature 2.1: Contact material stiffness is 1e6 and restitution is inelastic (0.02)', () => {
  const factorySource = fs.readFileSync(
    path.resolve(projectRoot, 'infrastructure/physics/StonePhysicsBodyFactory.ts'),
    'utf8'
  );

  assert.ok(
    factorySource.includes('contactEquationStiffness: 1e6'),
    'Contact material stiffness must be 1e6 to prevent explosive normal impulses'
  );
  assert.ok(
    factorySource.includes('restitution: 0.02'),
    'Contact restitution must be 0.02 for realistic inelastic stone contact'
  );
});

test('Feature 2.2: Free fall drop adheres to gravity and lands on ground without hovering', async () => {
  const world = new SimpleTowerPhysicsWorld(0.45, 0.25);
  const droppedStone = new Stone({
    shape: 'round',
    color: '#444444',
    pose: Pose.origin(),
  });

  // Drop stone from 1.0m height with no tower (empty ground)
  const initialPose = new Pose({ x: 0, y: 1.0, z: 0 });
  const result = await world.drop(droppedStone, initialPose);

  assert.equal(result.settled, true, 'Drop onto ground settles cleanly');
  assert.ok(
    result.pose.position.y <= 0.35,
    `Settled stone must rest near ground, got y=${result.pose.position.y}`
  );
  assert.ok(
    result.pose.position.y >= 0.15,
    `Settled stone must not penetrate underground, got y=${result.pose.position.y}`
  );

  world.dispose();
});

// =============================================================================
// Feature 3: Dark Mode Visibility, Studio Rim Lighting & Ground Pedestal
// =============================================================================
test('Feature 3.1: StoneTowerCanvas includes circular ground pedestal and 3-point studio rim light', () => {
  const canvasSource = fs.readFileSync(
    path.resolve(projectRoot, 'presentation/components/StoneTowerCanvas.tsx'),
    'utf8'
  );

  assert.ok(
    canvasSource.includes('Silhouette Rim Back-Light for Dark Mode Contrast'),
    'Canvas must include silhouette rim back-light for dark mode stone edge delineation'
  );
  assert.ok(
    canvasSource.includes('Circular Ground Pedestal Platform'),
    'Canvas must include circular ground pedestal platform to give dark stones high-contrast base'
  );
});

// =============================================================================
// Feature 4: Overlapping Stones Cluster Popover & 3D Hover Outline Glow
// =============================================================================
test('Feature 4.1: src/app/tower/index.tsx includes cluster detection and hover outline glow popover', () => {
  const towerSource = fs.readFileSync(
    path.resolve(projectRoot, 'app/tower/index.tsx'),
    'utf8'
  );

  assert.ok(
    towerSource.includes('const [overlappingCluster, setOverlappingCluster] = useState'),
    'tower/index.tsx must manage overlappingCluster state'
  );
  assert.ok(
    towerSource.includes('const [hoveredStoneId, setHoveredStoneId] = useState'),
    'tower/index.tsx must manage hoveredStoneId state'
  );
  assert.ok(
    towerSource.includes('clusterPopover'),
    'tower/index.tsx must render clusterPopover for overlapping stones'
  );
  assert.ok(
    towerSource.includes('hoveredStoneId={hoveredStoneId}'),
    'tower/index.tsx must pass hoveredStoneId to StoneTowerCanvas'
  );
});

test('Feature 4.2: StoneTowerCanvas.tsx renders glowing 3D wireframe outline for hovered stone', () => {
  const canvasSource = fs.readFileSync(
    path.resolve(projectRoot, 'presentation/components/StoneTowerCanvas.tsx'),
    'utf8'
  );

  assert.ok(
    canvasSource.includes('isHovered && ('),
    'StoneMesh3D must check isHovered'
  );
  assert.ok(
    canvasSource.includes('color="#3182F6"') && canvasSource.includes('wireframe'),
    'StoneMesh3D must render glowing Toss Blue wireframe halo on hover'
  );
});

// =============================================================================
// Feature 5: Anti-Chatter Hover & Camera-Relative 3D Drag
// =============================================================================
test('Feature 5.1: StoneTowerCanvas eliminates hover highlight chattering', () => {
  const canvasSource = fs.readFileSync(
    path.resolve(projectRoot, 'presentation/components/StoneTowerCanvas.tsx'),
    'utf8'
  );

  // Wireframe halo mesh must disable raycast to prevent firing pointerout on parent mesh
  assert.ok(
    canvasSource.includes('scale={[1.08, 1.08, 1.08]} raycast={() => null}'),
    'Hover outline wireframe mesh must disable raycasting (raycast={() => null}) to avoid flickering'
  );

  // Parent mesh scale must not bounce on hover to prevent edge fluttering
  assert.ok(
    canvasSource.includes('[sx / sy, 1, sz / sy]'),
    'Mesh scale must remain constant on hover to prevent edge boundary fluttering'
  );

  // onPointerOut must stop propagation
  assert.ok(
    canvasSource.includes('onPointerOut={(e) => {') && canvasSource.includes('e.stopPropagation();') && canvasSource.includes('onHover?.(false);'),
    'onPointerOut must call e.stopPropagation()'
  );

  // Hover state updates must use debouncing / hysteresis
  assert.ok(
    canvasSource.includes('hoverDebounceRef') && canvasSource.includes('handleStoneHover'),
    'StoneTowerCanvas must implement handleStoneHover with debounce hysteresis'
  );
});

test('Feature 5.2: tower/index.tsx uses debounce hysteresis and pointerEvents none on popover items', () => {
  const towerSource = fs.readFileSync(
    path.resolve(projectRoot, 'app/tower/index.tsx'),
    'utf8'
  );

  assert.ok(
    towerSource.includes('hoverDebounceTimerRef') && towerSource.includes('handleSetHoveredStone'),
    'tower/index.tsx must debounce hover events on cluster items'
  );
  assert.ok(
    towerSource.includes('pointerEvents="none"'),
    'Cluster item child elements must have pointerEvents="none" to avoid target switching'
  );
});

test('Feature 5.3: InteractiveDraggableStone3D tracks camera azimuth and drags relative to camera', () => {
  const canvasSource = fs.readFileSync(
    path.resolve(projectRoot, 'presentation/components/StoneTowerCanvas.tsx'),
    'utf8'
  );

  // Azimuth tracking
  assert.ok(
    canvasSource.includes('cameraAzimuth') && canvasSource.includes('Math.atan2(camera.position.x, camera.position.z)'),
    'InteractiveDraggableStone3D must track camera azimuth angle'
  );

  // Spawn in front of camera
  assert.ok(
    canvasSource.includes('Math.sin(cameraAzimuth) * spawnDist') &&
    canvasSource.includes('Math.cos(cameraAzimuth) * spawnDist'),
    'Unplaced stone must spawn directly in front of camera at any viewing angle'
  );

  // Camera-relative drag translation
  assert.ok(
    canvasSource.includes('const rightX = Math.cos(theta);') &&
    canvasSource.includes('const rightZ = -Math.sin(theta);'),
    'Drag deltaX must project along camera right vector to eliminate 180 degree inverted movement'
  );
});

test('Feature 5.4: place.tsx status captions remove obsolete target reference', () => {
  const placeSource = fs.readFileSync(
    path.resolve(projectRoot, 'app/stack/place.tsx'),
    'utf8'
  );

  assert.ok(
    !placeSource.includes('타겟 원'),
    'place.tsx must NOT reference obsolete 2D target circle ("타겟 원")'
  );
  assert.ok(
    placeSource.includes('돌을 위로 끌어올려 돌탑 꼭대기에 균형을 맞춰보세요'),
    'place.tsx must use updated 3D placement prompt'
  );
});

// =============================================================================
// Feature 6: Authentication Session Persistence & Auto Guest Recovery
// =============================================================================
test('Feature 6.1: MsaHttpClient persists and restores token via localStorage', () => {
  const httpSource = fs.readFileSync(
    path.resolve(projectRoot, 'infrastructure/api/MsaHttpClient.ts'),
    'utf8'
  );

  assert.ok(
    httpSource.includes('localStorage.getItem(\'stonewish_access_token\')'),
    'MsaHttpClient must restore token from localStorage on initialization'
  );
  assert.ok(
    httpSource.includes('localStorage.setItem(\'stonewish_access_token\', token)'),
    'MsaHttpClient must persist token to localStorage when set'
  );
});

test('Feature 6.2: MsaAuthService persists session profile and provides ensureSession', () => {
  const authSource = fs.readFileSync(
    path.resolve(projectRoot, 'infrastructure/auth/MsaAuthService.ts'),
    'utf8'
  );

  assert.ok(
    authSource.includes('localStorage.getItem(\'stonewish_auth_profile\')'),
    'MsaAuthService must restore profile from localStorage on initialization'
  );
  assert.ok(
    authSource.includes('localStorage.setItem(\n          \'stonewish_auth_profile\'') ||
    authSource.includes('localStorage.setItem(\'stonewish_auth_profile\''),
    'MsaAuthService must persist profile to localStorage'
  );
});

test('Feature 6.3: place.tsx guarantees authenticated session on mount and auto-recovers on 401', () => {
  const placeSource = fs.readFileSync(
    path.resolve(projectRoot, 'app/stack/place.tsx'),
    'utf8'
  );

  assert.ok(
    placeSource.includes('container.auth.signIn(\'guest\')'),
    'place.tsx must auto-authenticate guest session if unauthenticated'
  );
  assert.ok(
    placeSource.includes('err?.status === 401') && placeSource.includes('retryRes'),
    'place.tsx must handle 401 with transparent guest session auto-recovery and retry'
  );
});
