import assert from 'node:assert/strict';
import test from 'node:test';

import { Stone } from '../domain/entities/Stone.ts';
import { type TowerStoneItem } from '../domain/entities/Tower.ts';
import { Pose } from '../domain/value-objects/Pose.ts';
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
