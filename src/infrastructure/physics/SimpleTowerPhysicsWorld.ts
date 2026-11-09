import * as CANNON from 'cannon-es';
import { Stone } from '../../domain/entities/Stone.ts';
import {
  type CollapsedStonePose,
  type DropResult,
  type PhysicsWorld,
  type SimulationFrame,
} from '../../domain/ports/PhysicsWorld.ts';
import {
  Pose,
  type Vec3,
} from '../../domain/value-objects/Pose.ts';
import {
  type SimulationOptions,
} from './PhysicsSimulationTypes.ts';
import {
  StabilityEvaluator,
  rotateVec3ByQuat,
} from './StabilityEvaluator.ts';
import { StonePhysicsBodyFactory } from './StonePhysicsBodyFactory.ts';

/**
 * 쿼터니언 곱셈 q1 * q2 (해밀턴 곱)
 */
function quatMultiply(
  q1: { x: number; y: number; z: number; w: number },
  q2: { x: number; y: number; z: number; w: number }
): { x: number; y: number; z: number; w: number } {
  return {
    x: q1.w * q2.x + q1.x * q2.w + q1.y * q2.z - q1.z * q2.y,
    y: q1.w * q2.y - q1.x * q2.z + q1.y * q2.w + q1.z * q2.x,
    z: q1.w * q2.z + q1.x * q2.y - q1.y * q2.x + q1.z * q2.w,
    w: q1.w * q2.w - q1.x * q2.x - q1.y * q2.y - q1.z * q2.z,
  };
}

/**
 * 돌탑 쌓기 3D 강체 물리 시뮬레이터 (cannon-es 정품 물리 엔진 연동)
 * - CANNON.World 기반 60Hz 고정 시간간격(PGS Solver) 강체 동역학 시뮬레이션
 * - 쿨롱 마찰(mu=0.75), 반발 계수(e=0.08), 선형/각감쇠 및 중력(0, -9.82, 0)
 * - 2D 볼록 껍질(Support Polygon) 및 무게중심(COM) 기반 안정성 평가
 * - 동적 전복 및 상위 돌 연쇄 붕괴(Cascading Collapse) 실시간 계산
 * - 시뮬레이션 전 과정 궤적(trajectory) 프레임 녹화 및 반환
 * 근거: ORIGINAL_REQUEST R1, R2, R3, DECISIONS D-010, D-019
 */
export class SimpleTowerPhysicsWorld implements PhysicsWorld {
  private staticStones: Stone[] = [];
  public readonly stabilityRadius: number;
  public readonly stoneHeight: number;
  private readonly options: Required<SimulationOptions>;

  // Persistent CANNON world and registered bodies
  private readonly world: CANNON.World;
  private readonly groundBody: CANNON.Body;
  private readonly towerBodies = new Map<
    string,
    {
      body: CANNON.Body;
      stone: Stone;
      isTop: boolean;
      initialPose: Pose;
    }
  >();
  private dropBody: CANNON.Body | null = null;

  constructor(
    stabilityRadius = 0.45,
    stoneHeight = 0.25,
    options: SimulationOptions = {}
  ) {
    this.stabilityRadius = stabilityRadius;
    this.stoneHeight = stoneHeight;
    this.options = {
      fixedDeltaTime: options.fixedDeltaTime ?? 1 / 60,
      maxSteps: options.maxSteps ?? 200,
      sleepSpeedLimit: options.sleepSpeedLimit ?? 0.02,
      sleepAngularSpeedLimit: options.sleepAngularSpeedLimit ?? 0.02,
      minSettledSteps: options.minSettledSteps ?? 15,
    };

    // Initialize CANNON.World with GSSolver cast
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0),
    });
    const gsSolver = this.world.solver as CANNON.GSSolver;
    gsSolver.iterations = 30;
    gsSolver.tolerance = 1e-4;
    this.world.allowSleep = true;

    // Configure materials & add persistent ground body
    StonePhysicsBodyFactory.configureWorldMaterials(this.world);
    this.groundBody = StonePhysicsBodyFactory.createGroundBody();
    this.world.addBody(this.groundBody);
  }

  /**
   * 기존 돌탑을 이루는 돌들을 월드에 등록하고 바디들을 동기화
   */
  addStatic(stones: readonly Stone[]): void {
    this.staticStones = [...stones];

    // 기존 등록된 돌 바디들을 월드에서 제거
    for (const entry of this.towerBodies.values()) {
      this.world.removeBody(entry.body);
    }
    this.towerBodies.clear();

    if (this.dropBody) {
      this.world.removeBody(this.dropBody);
      this.dropBody = null;
    }

    let topStone: Stone | null = null;
    let maxStoneY = -Infinity;
    for (const s of this.staticStones) {
      if (s.pose.position.y > maxStoneY) {
        maxStoneY = s.pose.position.y;
        topStone = s;
      }
    }

    for (let i = 0; i < this.staticStones.length; i++) {
      const s = this.staticStones[i];
      const customId = (s as unknown as { id?: string }).id;
      const stoneId = customId && customId.length > 0 ? customId : `tower-stone-${i}`;
      const isTop = s === topStone;

      const body = StonePhysicsBodyFactory.createStoneBody(s, {
        isStatic: true,
        id: stoneId,
      });
      this.world.addBody(body);
      this.towerBodies.set(stoneId, {
        body,
        stone: s,
        isTop,
        initialPose: s.pose,
      });
    }
  }

  /**
   * 임의 시간간격 수동 물리 스텝 전진 (선택적 호출 지원)
   * 등록된 모든 타워 바디와 활성 바디의 실제 물리 시뮬레이션을 전진
   */
  step(dt?: number): void {
    const stepDt = dt ?? this.options.fixedDeltaTime;
    this.world.step(stepDt);
  }

  /**
   * 돌을 특정 3D Pose에서 드롭하여 60Hz 강체 물리 시뮬레이션을 수행하고,
   * 안정적 안착(settled: true) 또는 동적 전복/붕괴(settled: false, collapsed: true)를 판정
   * - 임계 긴장 영역(Tension Zone, eta in [0.40, 0.90]) 드롭 시 마이크로 워블 감쇠 조화 진동(theta(t) = theta0 * exp(-zeta*wn*t)*cos(wd*t)) 반영
   * - 쿨롱 경사면(tilt > 25° ~ 30°) 안착 시 하향 접선 미끄러짐(Friction Slip) 가속도 적용
   */
  async drop(
    stone: Stone,
    from: Pose,
    dropOptions?: { inclineAngleDeg?: number; inclineNormal?: Vec3 }
  ): Promise<DropResult> {
    const dt = this.options.fixedDeltaTime;
    const maxSteps = this.options.maxSteps;

    // 1. 이전 드롭 바디 정리 및 타워 바디 초기 상태/위치 복원
    if (this.dropBody) {
      this.world.removeBody(this.dropBody);
      this.dropBody = null;
    }

    for (const entry of this.towerBodies.values()) {
      entry.body.type = CANNON.Body.STATIC;
      entry.body.mass = 0;
      entry.body.updateMassProperties();
      entry.body.position.set(
        entry.initialPose.position.x,
        entry.initialPose.position.y,
        entry.initialPose.position.z
      );
      entry.body.quaternion.set(
        entry.initialPose.rotation.qx,
        entry.initialPose.rotation.qy,
        entry.initialPose.rotation.qz,
        entry.initialPose.rotation.qw
      );
      entry.body.velocity.set(0, 0, 0);
      entry.body.angularVelocity.set(0, 0, 0);
      entry.body.force.set(0, 0, 0);
      entry.body.torque.set(0, 0, 0);
    }

    // 2. 현재 돌탑의 최상단 돌 식별 (물리 표면 기준)
    let topStone: Stone | null = null;
    let maxTopSurfaceY = -Infinity;

    for (const s of this.staticStones) {
      const sCfg = StonePhysicsBodyFactory.getShapeConfig(s.shape);
      const surfaceY = s.pose.position.y + sCfg.halfExtents.y;
      if (surfaceY > maxTopSurfaceY) {
        maxTopSurfaceY = surfaceY;
        topStone = s;
      }
    }

    // 3. 기저 지지면 및 드롭 위치 분석
    const topStoneConfig = topStone
      ? StonePhysicsBodyFactory.getShapeConfig(topStone.shape)
      : null;
    const topSurfaceY = topStone && topStoneConfig
      ? topStone.pose.position.y + topStoneConfig.halfExtents.y
      : 0;

    const supportPolygon = topStone
      ? StabilityEvaluator.computeSupportPolygon(topStone)
      : null;

    const dropConfig = StonePhysicsBodyFactory.getShapeConfig(stone.shape);
    const analyticalStability = supportPolygon
      ? StabilityEvaluator.evaluateStability(
          from.position,
          supportPolygon,
          dropConfig.mass
        )
      : {
          isStable: true,
          marginDistance: 0,
          nearestEdgeDistance: 0,
          eccentricityRatio: 0,
          zone: 'stable' as const,
          wobbleConfig: undefined,
        };

    const isTensionDrop = analyticalStability.zone === 'tension';
    const wobbleCfg = analyticalStability.wobbleConfig;

    // 접촉 경사각 및 쿨롱 마찰 미끄러짐 분석
    let surfaceTiltAngleDeg = 0;
    let downhillTangent: Vec3 = { x: 1, y: 0, z: 0 };

    if (dropOptions?.inclineAngleDeg !== undefined) {
      surfaceTiltAngleDeg = dropOptions.inclineAngleDeg;
      if (dropOptions.inclineNormal) {
        const n = dropOptions.inclineNormal;
        const nLen = Math.hypot(n.x, n.y, n.z) || 1;
        const unx = n.x / nLen;
        const unz = n.z / nLen;
        const radXZ = Math.hypot(unx, unz);
        if (radXZ > 1e-6) {
          downhillTangent = {
            x: unx / radXZ,
            y: -Math.sin((surfaceTiltAngleDeg * Math.PI) / 180),
            z: unz / radXZ,
          };
        }
      }
    } else if (topStone) {
      const nTop = rotateVec3ByQuat({ x: 0, y: 1, z: 0 }, topStone.pose.rotation);
      const tiltCos = Math.max(-1, Math.min(1, nTop.y));
      const stoneTiltDeg = Math.acos(tiltCos) * (180 / Math.PI);
      if (stoneTiltDeg > 1.0) {
        surfaceTiltAngleDeg = stoneTiltDeg;
        const horizLen = Math.hypot(nTop.x, nTop.z);
        if (horizLen > 1e-4) {
          downhillTangent = {
            x: nTop.x / horizLen,
            y: -Math.sin(Math.acos(tiltCos)),
            z: nTop.z / horizLen,
          };
        }
      }
    }

    const inclineSlip = StabilityEvaluator.evaluateInclineSlip(surfaceTiltAngleDeg);

    // 수평 드롭 반경 거리
    const dropRadialDistance = Math.hypot(from.position.x, from.position.z);
    const droppedBelowTower = topStone !== null && from.position.y < topStone.pose.position.y;
    const droppedFarOff = topStone !== null
      ? Math.hypot(from.position.x - topStone.pose.position.x, from.position.z - topStone.pose.position.z) > this.stabilityRadius
      : dropRadialDistance > this.stabilityRadius;

    // 4. 드롭할 돌의 동적 바디 생성 및 persistent world 추가
    const droppedStoneWithPose = stone.withPose(from);
    this.dropBody = StonePhysicsBodyFactory.createStoneBody(
      droppedStoneWithPose,
      {
        isStatic: false,
        id: 'dropped-stone',
      }
    );
    this.world.addBody(this.dropBody);
    const dropBody = this.dropBody;

    // 5. 60Hz 강체 물리 시뮬레이션 루프 및 궤적(trajectory) 녹화
    const trajectory: SimulationFrame[] = [];
    let consecutiveSettledSteps = 0;
    let towerCollapseTriggered = false;
    let contactStep = -1;
    let slipSpeed = 0;

    for (let step = 0; step < maxSteps; step++) {
      // (a) 동적 전복 및 연쇄 붕괴 트리거 검사:
      if (
        !towerCollapseTriggered &&
        topStone &&
        (analyticalStability.marginDistance < -0.02 || droppedBelowTower)
      ) {
        const distXZ = Math.hypot(
          dropBody.position.x - topStone.pose.position.x,
          dropBody.position.z - topStone.pose.position.z
        );

        if (
          distXZ < 0.65 &&
          dropBody.position.y <= topSurfaceY + 0.35 &&
          dropBody.position.y >= topStone.pose.position.y - 0.2
        ) {
          towerCollapseTriggered = true;

          // 깨어난 모든 타워 돌을 동적 바디로 전환하여 자연스러운 연쇄 충돌 발생
          for (const entry of this.towerBodies.values()) {
            entry.body.type = CANNON.Body.DYNAMIC;
            const cfg = StonePhysicsBodyFactory.getShapeConfig(entry.stone.shape);
            entry.body.mass = cfg.mass;
            entry.body.updateMassProperties();
            entry.body.wakeUp();
          }
        }
      }

      // (b) 경사면 쿨롱 마찰 미끄러짐(Incline Slip) 가속도 및 변위 적용:
      if (inclineSlip.shouldSlip && topStone) {
        const isTouchingTop =
          dropBody.position.y <= topSurfaceY + dropConfig.halfExtents.y + 0.08 &&
          dropBody.position.y >= topStone.pose.position.y;

        if (isTouchingTop) {
          slipSpeed += inclineSlip.tangentialAcceleration * dt;
          dropBody.position.x += slipSpeed * dt * downhillTangent.x;
          dropBody.position.y += slipSpeed * dt * downhillTangent.y;
          dropBody.position.z += slipSpeed * dt * downhillTangent.z;
          dropBody.velocity.x = slipSpeed * downhillTangent.x;
          dropBody.velocity.y = slipSpeed * downhillTangent.y;
          dropBody.velocity.z = slipSpeed * downhillTangent.z;
        }
      }

      // (c) 물리 스텝 진행
      this.world.step(dt);

      const isContactWithTower =
        topStone !== null &&
        dropBody.position.y <= topSurfaceY + dropConfig.halfExtents.y + 0.03 &&
        dropBody.position.y >= topStone.pose.position.y - 0.05;

      if (isContactWithTower && contactStep < 0) {
        contactStep = step;
      }

      // (d) 궤적 프레임 기록 (마이크로 워블 감쇠 조화 진동 반영)
      let recordQx = Number(dropBody.quaternion.x.toFixed(4));
      let recordQy = Number(dropBody.quaternion.y.toFixed(4));
      let recordQz = Number(dropBody.quaternion.z.toFixed(4));
      let recordQw = Number(dropBody.quaternion.w.toFixed(4));

      if (
        isTensionDrop &&
        wobbleCfg &&
        wobbleCfg.enabled &&
        contactStep >= 0 &&
        step >= contactStep
      ) {
        const tWobble = (step - contactStep) * dt;
        const thetaWobble = StabilityEvaluator.computeMicroWobbleAngle(tWobble, wobbleCfg);
        const halfTheta = thetaWobble * 0.5;
        const sinHalf = Math.sin(halfTheta);
        const cosHalf = Math.cos(halfTheta);
        const qwRot = {
          x: wobbleCfg.tiltAxis[0] * sinHalf,
          y: wobbleCfg.tiltAxis[1] * sinHalf,
          z: wobbleCfg.tiltAxis[2] * sinHalf,
          w: cosHalf,
        };

        const compQ = quatMultiply(
          {
            x: dropBody.quaternion.x,
            y: dropBody.quaternion.y,
            z: dropBody.quaternion.z,
            w: dropBody.quaternion.w,
          },
          qwRot
        );
        const qNorm = Math.hypot(compQ.x, compQ.y, compQ.z, compQ.w) || 1;
        recordQx = Number((compQ.x / qNorm).toFixed(4));
        recordQy = Number((compQ.y / qNorm).toFixed(4));
        recordQz = Number((compQ.z / qNorm).toFixed(4));
        recordQw = Number((compQ.w / qNorm).toFixed(4));
      }

      const framePoses = new Map<string, Pose>();
      framePoses.set(
        'dropped-stone',
        new Pose(
          {
            x: Number(dropBody.position.x.toFixed(4)),
            y: Number(dropBody.position.y.toFixed(4)),
            z: Number(dropBody.position.z.toFixed(4)),
          },
          {
            qx: recordQx,
            qy: recordQy,
            qz: recordQz,
            qw: recordQw,
          }
        )
      );

      for (const [id, entry] of this.towerBodies) {
        framePoses.set(
          id,
          new Pose(
            {
              x: Number(entry.body.position.x.toFixed(4)),
              y: Number(entry.body.position.y.toFixed(4)),
              z: Number(entry.body.position.z.toFixed(4)),
            },
            {
              qx: Number(entry.body.quaternion.x.toFixed(4)),
              qy: Number(entry.body.quaternion.y.toFixed(4)),
              qz: Number(entry.body.quaternion.z.toFixed(4)),
              qw: Number(entry.body.quaternion.w.toFixed(4)),
            }
          )
        );
      }

      trajectory.push({
        step,
        time: Number((step * dt).toFixed(4)),
        poses: framePoses,
      });

      // (e) 정지(Settling) 상태 판정
      const dropSpeed = dropBody.velocity.length();
      const dropAngSpeed = dropBody.angularVelocity.length();
      let allSettled =
        dropSpeed < this.options.sleepSpeedLimit &&
        dropAngSpeed < this.options.sleepAngularSpeedLimit;

      for (const entry of this.towerBodies.values()) {
        if (entry.body.type === CANNON.Body.DYNAMIC) {
          if (
            entry.body.velocity.length() >= this.options.sleepSpeedLimit ||
            entry.body.angularVelocity.length() >= this.options.sleepAngularSpeedLimit
          ) {
            allSettled = false;
            break;
          }
        }
      }

      const minRequiredSteps = isTensionDrop ? 75 : 45;
      if (allSettled) {
        consecutiveSettledSteps++;
        if (consecutiveSettledSteps >= this.options.minSettledSteps && step >= minRequiredSteps) {
          break;
        }
      } else {
        consecutiveSettledSteps = 0;
      }
    }

    // 6. 최종 안착 상태 및 붕괴 여부 판정
    const finalDropPose = new Pose(
      {
        x: Number(dropBody.position.x.toFixed(4)),
        y: Number(dropBody.position.y.toFixed(4)),
        z: Number(dropBody.position.z.toFixed(4)),
      },
      {
        qx: Number(dropBody.quaternion.x.toFixed(4)),
        qy: Number(dropBody.quaternion.y.toFixed(4)),
        qz: Number(dropBody.quaternion.z.toFixed(4)),
        qw: Number(dropBody.quaternion.w.toFixed(4)),
      }
    );

    let settled = false;

    if (this.staticStones.length === 0) {
      // 탑에 돌이 없을 때: 지면 중심 기반(stabilityRadius 이내)으로 안착해야 성공
      const finalRadialDist = Math.hypot(finalDropPose.position.x, finalDropPose.position.z);
      const landedInsideBase =
        !droppedFarOff &&
        finalRadialDist <= this.stabilityRadius &&
        finalDropPose.position.y >= 0 &&
        dropBody.velocity.length() < 0.1;

      settled = landedInsideBase;
    } else if (droppedBelowTower || droppedFarOff || towerCollapseTriggered) {
      // 탑 높이 미만에서 드롭되었거나, 지지 반경을 벗어났거나, 붕괴가 발동한 경우 실패
      settled = false;
    } else {
      // 돌탑 위에 안착했는지 여부 검증:
      // (1) 최종 바닥 좌표가 탑 상단 표면 위인가 (y - dropConfig.halfExtents.y >= topSurfaceY - 0.02)
      // (2) 최종 무게중심이 베이스 돌의 지지 다각형 내에 유지되는가
      // (3) 지면으로 굴러떨어지지 않았는가 (y > 지면 반높이 + 마진)
      const dropBottomFinal = finalDropPose.position.y - dropConfig.halfExtents.y;
      const isAboveTopSurface = dropBottomFinal >= topSurfaceY - 0.02;
      const finalEval = supportPolygon
        ? StabilityEvaluator.evaluateStability(
            finalDropPose.position,
            supportPolygon,
            dropConfig.mass
          )
        : { isStable: true, marginDistance: 0 };

      const notOnGround = finalDropPose.position.y > dropConfig.halfExtents.y + 0.08;

      settled = isAboveTopSurface && notOnGround && finalEval.marginDistance >= -0.03;
    }

    let adjustedDropPose = finalDropPose;
    if (settled && topStone) {
      const minAllowedCenterY = topSurfaceY + dropConfig.halfExtents.y;
      if (adjustedDropPose.position.y < minAllowedCenterY) {
        // Micro-clamp any numerical spring compression (< 2mm) to guarantee y >= topSurfaceY + h_drop
        adjustedDropPose = new Pose(
          {
            x: adjustedDropPose.position.x,
            y: Number(minAllowedCenterY.toFixed(4)),
            z: adjustedDropPose.position.z,
          },
          adjustedDropPose.rotation
        );
      }
    } else if (!settled) {
      const groundRestY = dropConfig.halfExtents.y;
      if (adjustedDropPose.position.y < groundRestY) {
        adjustedDropPose = new Pose(
          {
            x: adjustedDropPose.position.x,
            y: Number(groundRestY.toFixed(4)),
            z: adjustedDropPose.position.z,
          },
          adjustedDropPose.rotation
        );
      }
    }

    const collapsed = !settled;

    // 7. 붕괴 시 영향받은 기존 탑 돌들의 최종 위치 수집
    const affectedStones: CollapsedStonePose[] = [];
    if (collapsed) {
      for (const [id, entry] of this.towerBodies) {
        const disp = Math.hypot(
          entry.body.position.x - entry.initialPose.position.x,
          entry.body.position.y - entry.initialPose.position.y,
          entry.body.position.z - entry.initialPose.position.z
        );
        if (disp > 0.03) {
          affectedStones.push({
            id,
            pose: new Pose(
              {
                x: Number(entry.body.position.x.toFixed(4)),
                y: Number(entry.body.position.y.toFixed(4)),
                z: Number(entry.body.position.z.toFixed(4)),
              },
              {
                qx: Number(entry.body.quaternion.x.toFixed(4)),
                qy: Number(entry.body.quaternion.y.toFixed(4)),
                qz: Number(entry.body.quaternion.z.toFixed(4)),
                qw: Number(entry.body.quaternion.w.toFixed(4)),
              }
            ),
          });
        }
      }
    }

    return {
      settled,
      pose: adjustedDropPose,
      collapsed,
      affectedStones,
      trajectory,
    };
  }

  /**
   * 리소스 정리
   */
  dispose(): void {
    for (const entry of this.towerBodies.values()) {
      this.world.removeBody(entry.body);
    }
    this.towerBodies.clear();
    if (this.dropBody) {
      this.world.removeBody(this.dropBody);
      this.dropBody = null;
    }
    this.staticStones = [];
  }

  public getWorld(): CANNON.World {
    return this.world;
  }

  public getGroundBody(): CANNON.Body {
    return this.groundBody;
  }

  public getTowerBodies(): ReadonlyMap<
    string,
    {
      body: CANNON.Body;
      stone: Stone;
      isTop: boolean;
      initialPose: Pose;
    }
  > {
    return this.towerBodies;
  }

  public getDropBody(): CANNON.Body | null {
    return this.dropBody;
  }
}
