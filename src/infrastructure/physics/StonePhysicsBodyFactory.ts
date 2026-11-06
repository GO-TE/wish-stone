import * as CANNON from 'cannon-es';
import { Stone, type StoneShape } from '../../domain/entities/Stone.ts';
import { type Vec3 } from '../../domain/value-objects/Pose.ts';
import { type PhysicsStoneBodyConfig } from './PhysicsSimulationTypes.ts';

/**
 * 돌 모양별 3D 물리 바디 및 재질 생성 팩토리
 * - 5종 절차적 돌 모양(round, flat, pebble, boulder, tall)을 3D 각면 박스 프록시로 매핑
 * - 질량(0.6kg ~ 2.5kg), 주 관성 모멘트(Ixx, Iyy, Izz), 선형 감쇠(0.3) 및 각감쇠(0.4) 구성
 * - 쿨롱 마찰(mu ~ 0.75)과 비탄성 반발 계수(e ~ 0.08) 접촉 재질 적용
 * 근거: ORIGINAL_REQUEST R1, F01, F02, 아키텍처 설계.md 4장
 */
export class StonePhysicsBodyFactory {
  private static stoneMaterialInstance: CANNON.Material | null = null;
  private static groundMaterialInstance: CANNON.Material | null = null;

  /**
   * 5대 형상별 물리 규격 테이블 (halfExtents, mass, damping, friction, restitution)
   * Half-extents는 ProceduralStoneGeometrySpec.scale * 0.25와 정확히 일치
   */
  public static readonly SHAPE_CONFIGS: Readonly<Record<StoneShape, PhysicsStoneBodyConfig>> = {
    boulder: {
      shape: 'boulder',
      mass: 2.5,
      halfExtents: { x: 0.3125, y: 0.2625, z: 0.3 },
      linearDamping: 0.35,
      angularDamping: 0.45,
      friction: 0.8,
      restitution: 0.02,
    },
    flat: {
      shape: 'flat',
      mass: 1.5,
      halfExtents: { x: 0.3375, y: 0.105, z: 0.3125 },
      linearDamping: 0.35,
      angularDamping: 0.45,
      friction: 0.8,
      restitution: 0.02,
    },
    tall: {
      shape: 'tall',
      mass: 1.4,
      halfExtents: { x: 0.195, y: 0.3625, z: 0.19 },
      linearDamping: 0.35,
      angularDamping: 0.45,
      friction: 0.8,
      restitution: 0.02,
    },
    round: {
      shape: 'round',
      mass: 1.2,
      halfExtents: { x: 0.25, y: 0.205, z: 0.25 },
      linearDamping: 0.35,
      angularDamping: 0.45,
      friction: 0.8,
      restitution: 0.02,
    },
    pebble: {
      shape: 'pebble',
      mass: 0.6,
      halfExtents: { x: 0.18, y: 0.145, z: 0.17 },
      linearDamping: 0.35,
      angularDamping: 0.45,
      friction: 0.8,
      restitution: 0.02,
    },
  };

  /**
   * 돌 물리 재질 싱글톤
   */
  public static getStoneMaterial(): CANNON.Material {
    if (!this.stoneMaterialInstance) {
      this.stoneMaterialInstance = new CANNON.Material('stone');
    }
    return this.stoneMaterialInstance;
  }

  /**
   * 지면 물리 재질 싱글톤
   */
  public static getGroundMaterial(): CANNON.Material {
    if (!this.groundMaterialInstance) {
      this.groundMaterialInstance = new CANNON.Material('ground');
    }
    return this.groundMaterialInstance;
  }

  /**
   * CANNON.World에 돌-돌 및 돌-지면 접촉 재질(마찰/반발 계수)을 등록
   */
  public static configureWorldMaterials(world: CANNON.World): void {
    const stoneMat = this.getStoneMaterial();
    const groundMat = this.getGroundMaterial();

    const stoneStoneContact = new CANNON.ContactMaterial(stoneMat, stoneMat, {
      friction: 0.8,
      restitution: 0.02,
      contactEquationStiffness: 1e6,
      contactEquationRelaxation: 4,
      frictionEquationStiffness: 1e6,
      frictionEquationRelaxation: 4,
    });

    const stoneGroundContact = new CANNON.ContactMaterial(stoneMat, groundMat, {
      friction: 0.85,
      restitution: 0.02,
      contactEquationStiffness: 1e6,
      contactEquationRelaxation: 4,
      frictionEquationStiffness: 1e6,
      frictionEquationRelaxation: 4,
    });

    world.addContactMaterial(stoneStoneContact);
    world.addContactMaterial(stoneGroundContact);
  }

  /**
   * 돌 형상별 물리 바디 설정 조회
   */
  public static getShapeConfig(shape: StoneShape): PhysicsStoneBodyConfig {
    const config = this.SHAPE_CONFIGS[shape];
    if (!config) {
      return this.SHAPE_CONFIGS.round;
    }
    return config;
  }

  /**
   * Domain Stone 엔티티로부터 CANNON.Body를 생성
   */
  public static createStoneBody(
    stone: Stone,
    options?: {
      isStatic?: boolean;
      id?: string;
      linearDamping?: number;
      angularDamping?: number;
    }
  ): CANNON.Body {
    const config = this.getShapeConfig(stone.shape);
    const half = config.halfExtents;
    const boxShape = new CANNON.Box(new CANNON.Vec3(half.x, half.y, half.z));

    const isStatic = options?.isStatic ?? false;
    const mass = isStatic ? 0 : config.mass;

    const body = new CANNON.Body({
      mass,
      type: isStatic ? CANNON.Body.STATIC : CANNON.Body.DYNAMIC,
      material: this.getStoneMaterial(),
      shape: boxShape,
      linearDamping: options?.linearDamping ?? config.linearDamping,
      angularDamping: options?.angularDamping ?? config.angularDamping,
      allowSleep: true,
      sleepSpeedLimit: 0.02,
      sleepTimeLimit: 0.1,
    });

    body.position.set(
      stone.pose.position.x,
      stone.pose.position.y,
      stone.pose.position.z
    );

    body.quaternion.set(
      stone.pose.rotation.qx,
      stone.pose.rotation.qy,
      stone.pose.rotation.qz,
      stone.pose.rotation.qw
    );

    (body as unknown as { userData?: unknown }).userData = {
      id: options?.id ?? 'stone',
      shape: stone.shape,
      color: stone.color,
      initialPose: stone.pose,
    };

    return body;
  }

  /**
   * 지면 정적 바디 생성 (y=0, 상향 법선 벡터)
   */
  public static createGroundBody(): CANNON.Body {
    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.STATIC,
      material: this.getGroundMaterial(),
      shape: groundShape,
    });

    groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    groundBody.position.set(0, 0, 0);

    return groundBody;
  }
}
