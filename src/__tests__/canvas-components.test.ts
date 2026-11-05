import assert from 'node:assert/strict';
import test from 'node:test';

import { Stone } from '../domain/entities/Stone.ts';
import { type TowerStoneItem } from '../domain/entities/Tower.ts';
import { type SimulationFrame } from '../domain/ports/PhysicsWorld.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
import { SimpleTowerPhysicsWorld } from '../infrastructure/physics/SimpleTowerPhysicsWorld.ts';
import {
  buildCheerSparkAnimationSpec,
  evaluateQuadraticBezier,
} from '../presentation/components/cheerSparkSpec.ts';
import {
  buildBloomDecorationSpec,
  buildNaturalLightingRig,
  buildStoneGeometrySpec,
  buildStoneMaterialSpec,
  buildTowerSceneGraph,
  interpolateTrajectoryFrame,
  resetTowerMeshTransforms,
  resolveStonePose,
  type StoneRenderNode,
} from '../presentation/components/stoneTowerSpec.ts';

test('StoneTowerCanvas (SCR-04, SCR-07, SCR-10): 돌 모양(round/flat/pebble/tall)별 절차적 지오메트리·매트 셰이더 재질 및 이루어짐(flower/sprout/moss) 데코레이션 스펙을 생성한다', () => {
  const roundGeo = buildStoneGeometrySpec('round');
  const flatGeo = buildStoneGeometrySpec('flat');
  const pebbleGeo = buildStoneGeometrySpec('pebble');
  const tallGeo = buildStoneGeometrySpec('tall');

  assert.ok(flatGeo.scale.x > flatGeo.scale.y); // 납작한 돌 비율 검증
  assert.ok(tallGeo.scale.y > tallGeo.scale.x); // 길쭉한 선돌 비율 검증
  assert.equal(pebbleGeo.flatShading, false); // 자갈돌은 매끄러운 곡면 셰이딩
  assert.ok(roundGeo.roughness >= 0.8); // 거친 매트 질감 확인

  // 응원 빛 단계(0~3단계) 및 내 돌 테두리 하이라이트 재질 검증
  const myLevel3Mat = buildStoneMaterialSpec('#D6C7B2', 'tall', 3, true);
  assert.equal(myLevel3Mat.outlineHighlighted, true);
  assert.equal(myLevel3Mat.emissiveColor, '#FF922B');
  assert.ok(myLevel3Mat.emissiveIntensity > 0.8);

  const otherLevel0Mat = buildStoneMaterialSpec('#A89F91', 'round', 0, false);
  assert.equal(otherLevel0Mat.outlineHighlighted, false);
  assert.equal(otherLevel0Mat.emissiveIntensity, 0);

  // 소원 이루어짐 데코레이션(flower, sprout, moss) 검증
  const flowerDeco = buildBloomDecorationSpec('flower', tallGeo.scale.y);
  const sproutDeco = buildBloomDecorationSpec('sprout', roundGeo.scale.y);
  const mossDeco = buildBloomDecorationSpec('moss', flatGeo.scale.y);

  assert.equal(flowerDeco?.emoji, '🌸');
  assert.equal(sproutDeco?.emoji, '🌱');
  assert.equal(mossDeco?.emoji, '🍀');
  assert.ok((flowerDeco?.offsetY ?? 0) > (mossDeco?.offsetY ?? 0));

  // 씬 그래프 빌드 및 자연스러운 3점 조명 리그 검증
  const lighting = buildNaturalLightingRig();
  assert.ok(lighting.directionalIntensity > lighting.ambientIntensity);

  const items: TowerStoneItem[] = [
    {
      id: 'stone-a',
      stone: new Stone({
        shape: 'tall',
        color: '#D6C7B2',
        pose: new Pose({ x: 0, y: 0.5, z: 0 }),
      }),
      status: 'fulfilled',
      bloom: 'flower',
      cheerLevel: 3,
      isMine: true,
      nickname: '소원빌기#7788',
    },
    {
      id: 'stone-b',
      stone: new Stone({
        shape: 'pebble',
        color: '#8D99AE',
        pose: new Pose({ x: 0.1, y: 1.2, z: -0.05 }),
      }),
      status: 'active',
      bloom: null,
      cheerLevel: 1,
      isMine: false,
      nickname: null,
    },
  ];

  const sceneNodes = buildTowerSceneGraph(items);
  assert.equal(sceneNodes.length, 2);
  assert.equal(sceneNodes[0].geometry.shape, 'tall');
  assert.equal(sceneNodes[0].decoration?.bloom, 'flower');
  assert.equal(sceneNodes[0].nicknameLabel, '소원빌기#7788');
  assert.equal(sceneNodes[1].decoration, null);
});

test('CheerSparkEffect (DB-017): cheer_spark 이벤트 시 돌탑 꼭대기를 향해 날아가는 베지어 곡선 반딧불 파티클 궤적을 생성한다', () => {
  // 비활성 이벤트인 경우 파티클 없음
  const inactive = buildCheerSparkAnimationSpec(null, 2.0);
  assert.equal(inactive.active, false);
  assert.equal(inactive.particles.length, 0);

  // 단계 상승(levelUp = true) 응원 이벤트인 경우 12개 반딧불 파티클 생성 및 돌탑 꼭대기 타겟팅 확인
  const sparkSpec = buildCheerSparkAnimationSpec(
    {
      type: 'cheer_spark',
      wishId: 'wish-77',
      level: 2,
      levelUp: true,
    },
    2.0
  );

  assert.equal(sparkSpec.active, true);
  assert.equal(sparkSpec.sparkBurstDurationMs, 500);
  assert.equal(sparkSpec.stoneFlightDurationMs, 800);
  assert.equal(sparkSpec.particles.length, 12);
  assert.equal(sparkSpec.particles[0].target.y, 2.25); // towerTopY(2.0) + 0.25

  // 베지어 곡선 시작(t=0), 중간 정점(t=0.5), 도착(t=1) 좌표 검증
  const p0 = sparkSpec.particles[0];
  const atStart = evaluateQuadraticBezier(p0.start, p0.control, p0.target, 0);
  const atMid = evaluateQuadraticBezier(p0.start, p0.control, p0.target, 0.5);
  const atEnd = evaluateQuadraticBezier(p0.start, p0.control, p0.target, 1);

  assert.deepEqual(atStart, p0.start);
  assert.deepEqual(atEnd, p0.target);
  assert.ok(atMid.y > p0.start.y);
});

test('StoneTowerCanvas (Feature F08): interpolateTrajectoryFrame() 60Hz 궤적 프레임 LERP(위치) 및 SLERP(쿼터니언) 보간 및 resolveStonePose 검증', async () => {
  // 1) 3개 프레임의 합성 궤적 데이터 준비 (60Hz, dt = 1/60)
  const traj: SimulationFrame[] = [
    {
      step: 0,
      time: 0,
      poses: new Map([
        ['stone-1', new Pose({ x: 0, y: 1.0, z: 0 }, { qx: 0, qy: 0, qz: 0, qw: 1 })],
        ['dropped-stone', new Pose({ x: 0.1, y: 1.5, z: 0 }, { qx: 0, qy: 0, qz: 0, qw: 1 })],
      ]),
    },
    {
      step: 1,
      time: 1 / 60,
      poses: new Map([
        ['stone-1', new Pose({ x: 0.2, y: 0.8, z: 0 }, { qx: 0, qy: 0, qz: 0.7071, qw: 0.7071 })],
        ['dropped-stone', new Pose({ x: 0.3, y: 1.1, z: 0 }, { qx: 0, qy: 0, qz: 0.3827, qw: 0.9239 })],
      ]),
    },
    {
      step: 2,
      time: 2 / 60,
      poses: new Map([
        ['stone-1', new Pose({ x: 0.4, y: 0.6, z: 0 }, { qx: 0, qy: 0, qz: 1, qw: 0 })],
        ['dropped-stone', new Pose({ x: 0.5, y: 0.7, z: 0 }, { qx: 0, qy: 0, qz: 0.7071, qw: 0.7071 })],
      ]),
    },
  ];

  // (A) t = 0: 시작 프레임과 정확히 일치
  const atStart = interpolateTrajectoryFrame(traj, 0);
  assert.equal(atStart.isComplete, false);
  assert.equal(atStart.currentStep, 0);
  const p0 = atStart.poses.get('stone-1');
  assert.ok(p0);
  assert.equal(p0.position.x, 0);
  assert.equal(p0.position.y, 1.0);
  assert.equal(p0.rotation.qw, 1);

  // (B) t = 0.5 * dt: 프레임 0과 1의 정확한 중간점 LERP & SLERP 보간
  const halfDt = (1 / 60) * 0.5;
  const atMid = interpolateTrajectoryFrame(traj, halfDt);
  assert.equal(atMid.isComplete, false);
  assert.equal(atMid.currentStep, 0);
  const pMid = atMid.poses.get('stone-1');
  assert.ok(pMid);
  // LERP: x = 0.1, y = 0.9
  assert.ok(Math.abs(pMid.position.x - 0.1) < 0.005);
  assert.ok(Math.abs(pMid.position.y - 0.9) < 0.005);
  // SLERP: 쿼터니언 단위 길이 확인
  const quatLen = Math.hypot(
    pMid.rotation.qx,
    pMid.rotation.qy,
    pMid.rotation.qz,
    pMid.rotation.qw
  );
  assert.ok(Math.abs(quatLen - 1.0) < 0.005);

  // (C) t >= (N-1)*dt: 마지막 프레임 도달 시 isComplete = true
  const atEnd = interpolateTrajectoryFrame(traj, 0.1);
  assert.equal(atEnd.isComplete, true);
  assert.equal(atEnd.currentStep, 2);
  const pEnd = atEnd.poses.get('stone-1');
  assert.ok(pEnd);
  assert.equal(pEnd.position.x, 0.4);
  assert.equal(pEnd.position.y, 0.6);

  // (D) resolveStonePose: ID, 인덱스 폴백, dropped-stone 해석
  const resolvedById = resolveStonePose(atMid.poses, 'stone-1');
  assert.ok(resolvedById);
  assert.equal(resolvedById.position.x, pMid.position.x);

  const resolvedByDropped = resolveStonePose(atMid.poses, 'any-missing-id');
  assert.ok(resolvedByDropped);
  assert.equal(resolvedByDropped.position.x, atMid.poses.get('dropped-stone')!.position.x);

  // (E) 실제 물리 엔진 드롭 시뮬레이션 궤적 연동 검증
  const physics = new SimpleTowerPhysicsWorld();
  const towerStone = new Stone({
    shape: 'round',
    color: '#333',
    pose: new Pose({ x: 0, y: 0.25, z: 0 }),
  });
  physics.addStatic([towerStone]);

  const droppedStone = new Stone({
    shape: 'tall',
    color: '#666',
    pose: Pose.origin(),
  });
  const dropRes = await physics.drop(
    droppedStone,
    new Pose({ x: 0.5, y: 0.8, z: 0 })
  );

  assert.ok(dropRes.trajectory && dropRes.trajectory.length > 0);
  const sampled = interpolateTrajectoryFrame(dropRes.trajectory, 0.15);
  assert.ok(sampled.poses.size > 0);
  for (const [id, pose] of sampled.poses) {
    assert.ok(!Number.isNaN(pose.position.x));
    assert.ok(!Number.isNaN(pose.position.y));
    assert.ok(!Number.isNaN(pose.position.z));
    const len = Math.hypot(
      pose.rotation.qx,
      pose.rotation.qy,
      pose.rotation.qz,
      pose.rotation.qw
    );
    assert.ok(Math.abs(len - 1.0) < 0.01, `Pose for ${id} must have normalized quaternion`);
  }
  physics.dispose();
});

test('StoneTowerCanvas (F08 Remediation): resetTowerMeshTransforms restores all meshes to node positions and unit quaternion', () => {
  const makeMockMesh = () => {
    const pos = { x: 99, y: 99, z: 99 };
    const quat = { qx: 99, qy: 99, qz: 99, qw: 99 };
    return {
      position: {
        set(x: number, y: number, z: number) {
          pos.x = x;
          pos.y = y;
          pos.z = z;
        },
        get x() {
          return pos.x;
        },
        get y() {
          return pos.y;
        },
        get z() {
          return pos.z;
        },
      },
      quaternion: {
        set(x: number, y: number, z: number, w: number) {
          quat.qx = x;
          quat.qy = y;
          quat.qz = z;
          quat.qw = w;
        },
        get qx() {
          return quat.qx;
        },
        get qy() {
          return quat.qy;
        },
        get qz() {
          return quat.qz;
        },
        get qw() {
          return quat.qw;
        },
      },
    };
  };

  const mesh1 = makeMockMesh();
  const mesh2 = makeMockMesh();
  const meshDropped = makeMockMesh();
  const meshMap = new Map<string, any>([
    ['stone-1', mesh1],
    ['stone-2', mesh2],
    ['dropped-stone', meshDropped],
  ]);

  const nodes: StoneRenderNode[] = [
    {
      id: 'stone-1',
      position: { x: 0, y: 0.25, z: 0 },
      geometry: {} as any,
      material: {} as any,
      decoration: null,
      nicknameLabel: null,
    },
    {
      id: 'stone-2',
      position: { x: 0, y: 0.55, z: 0 },
      geometry: {} as any,
      material: {} as any,
      decoration: null,
      nicknameLabel: null,
    },
  ];

  const dropped = new Stone({
    shape: 'round',
    color: '#333',
    pose: new Pose({ x: 0.05, y: 0.85, z: 0 }, { qx: 0, qy: 0, qz: 0, qw: 1 }),
  });

  resetTowerMeshTransforms(meshMap as any, nodes, dropped);

  // Verify mesh 1 restored to node.position and unit quaternion
  assert.equal(mesh1.position.x, 0);
  assert.equal(mesh1.position.y, 0.25);
  assert.equal(mesh1.position.z, 0);
  assert.equal(mesh1.quaternion.qw, 1);
  assert.equal(mesh1.quaternion.qx, 0);

  // Verify mesh 2 restored
  assert.equal(mesh2.position.x, 0);
  assert.equal(mesh2.position.y, 0.55);
  assert.equal(mesh2.position.z, 0);
  assert.equal(mesh2.quaternion.qw, 1);

  // Verify dropped mesh restored
  assert.equal(meshDropped.position.x, 0.05);
  assert.equal(meshDropped.position.y, 0.85);
  assert.equal(meshDropped.position.z, 0);
  assert.equal(meshDropped.quaternion.qw, 1);
});
