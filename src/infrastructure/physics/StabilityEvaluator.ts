import { Stone, type StoneShape } from '../../domain/entities/Stone.ts';
import { type Pose, type Vec3, type Quat } from '../../domain/value-objects/Pose.ts';
import {
  type StabilityEvaluation,
  type SupportPolygon,
} from './PhysicsSimulationTypes.ts';
import { StonePhysicsBodyFactory } from './StonePhysicsBodyFactory.ts';

/**
 * 마이크로 워블(감쇠 조화 진동) 설정 인터페이스
 * PROJECT_V2.md § Interface Contracts 준수
 */
export interface WobbleConfig {
  readonly enabled: boolean;
  readonly initialAngle: number; // radians
  readonly tiltAxis: readonly [number, number, number]; // unit vector
  readonly frequency: number; // rad/s (omega_n or omega_d)
  readonly dampingRatio: number; // zeta
}

/**
 * CoG 편심비(eta), 3대 안정성 존(stable/tension/topple), 마이크로 워블 및 경사면 미끄러짐을 포함한 고급 안정성 평가 결과
 * PROJECT_V2.md § Interface Contracts 준수
 */
export interface AdvancedStabilityEvaluation extends StabilityEvaluation {
  readonly eccentricityRatio: number; // eta = d_ecc / R_support
  readonly zone: 'stable' | 'tension' | 'topple';
  readonly wobbleConfig?: WobbleConfig;
  readonly inclineSlipSpeed?: number;
  readonly criticalTorqueThreshold?: number; // tau_crit
}

/**
 * 쿨롱 경사면 마찰 미끄러짐 평가 결과
 */
export interface InclineSlipEvaluation {
  readonly shouldSlip: boolean;
  readonly tangentialAcceleration: number; // m/s^2 (a = g*(sin(theta) - mu_k*cos(theta)))
  readonly normalAcceleration: number; // m/s^2
  readonly criticalSlipAngleDeg: number; // degrees
  readonly frictionCoefficient: number; // mu_s
}

/**
 * 물리 안정성 및 마이크로 워블/마찰 미끄러짐 표준 상수
 */
export const STABILITY_ZONES = {
  STABLE_ETA_MAX: 0.40, // eta < 0.40: Stable
  TENSION_ETA_MAX: 0.90, // 0.40 <= eta <= 0.90: Tension Micro-Wobble
  // eta > 0.90: Topple / Overturning
  DEFAULT_NATURAL_FREQ: 20.0, // rad/s
  DEFAULT_DAMPING_RATIO: 0.30, // zeta (underdamped)
  STATIC_FRICTION_COEFF: 0.50, // tan(26.565°)
  KINETIC_FRICTION_RATIO: 0.90, // mu_k = 0.9 * mu_s = 0.45
  GRAVITY: 9.82, // m/s^2
} as const;

/**
 * 쿼터니언을 사용해 3차원 벡터를 회전
 */
export function rotateVec3ByQuat(v: Vec3, q: Quat): Vec3 {
  const qx = q.qx;
  const qy = q.qy;
  const qz = q.qz;
  const qw = q.qw;

  const tx = 2 * (qy * v.z - qz * v.y);
  const ty = 2 * (qz * v.x - qx * v.z);
  const tz = 2 * (qx * v.y - qy * v.x);

  return {
    x: v.x + qw * tx + (qy * tz - qz * ty),
    y: v.y + qw * ty + (qz * tx - qx * tz),
    z: v.z + qw * tz + (qx * ty - qy * tx),
  };
}

/**
 * 2D 볼록 껍질 (Andrew's Monotone Chain 2D Convex Hull 알고리즘)
 */
function computeConvexHull2D(points: readonly [number, number][]): [number, number][] {
  if (points.length <= 2) {
    return [...points];
  }

  const sorted = [...points].sort((a, b) =>
    a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]
  );

  // 중복점 제거
  const uniquePts: [number, number][] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (
      i === 0 ||
      Math.hypot(sorted[i][0] - sorted[i - 1][0], sorted[i][1] - sorted[i - 1][1]) > 1e-6
    ) {
      uniquePts.push(sorted[i]);
    }
  }

  if (uniquePts.length <= 2) {
    return uniquePts;
  }

  const cross = (
    o: [number, number],
    a: [number, number],
    b: [number, number]
  ): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  // Lower hull
  const lower: [number, number][] = [];
  for (const p of uniquePts) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-9
    ) {
      lower.pop();
    }
    lower.push(p);
  }

  // Upper hull
  const upper: [number, number][] = [];
  for (let i = uniquePts.length - 1; i >= 0; i--) {
    const p = uniquePts[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-9
    ) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();

  return lower.concat(upper);
}

/**
 * 돌탑 정적/동적 안정성 및 무게중심(COM) 평가기
 * - 월드 공간 중심 좌표(COM) 계산
 * - 기저 지지면의 2D 볼록 껍질(Support Polygon) 계산
 * - 수직 투영 COM과 지지 다각형 경계 간의 유도 거리(signed margin distance) 계산
 * - 다중 돌 복합 무게중심(Composite COM: X_comp = sum(m_i * x_i) / sum(m_i)) 계산
 * - 전복 토크(tau = r x m*g) 계산
 * 근거: ORIGINAL_REQUEST R1, F03, 아키텍처 설계.md 4장
 */
export class StabilityEvaluator {
  /**
   * 단일 돌의 월드 공간 무게중심(COM) 계산
   */
  public static computeCenterOfMass(stone: Stone | { pose: Pose }): Vec3 {
    return {
      x: stone.pose.position.x,
      y: stone.pose.position.y,
      z: stone.pose.position.z,
    };
  }

  /**
   * 복수 돌들의 복합 무게중심(Composite Center of Mass) 계산
   * X_comp = sum(m_i * x_i) / sum(m_i)
   */
  public static computeCompositeCOM(
    stones: readonly { mass: number; position: Vec3 }[]
  ): Vec3 {
    let totalMass = 0;
    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;

    for (const s of stones) {
      totalMass += s.mass;
      sumX += s.mass * s.position.x;
      sumY += s.mass * s.position.y;
      sumZ += s.mass * s.position.z;
    }

    if (totalMass <= 0) {
      return { x: 0, y: 0, z: 0 };
    }

    return {
      x: sumX / totalMass,
      y: sumY / totalMass,
      z: sumZ / totalMass,
    };
  }

  /**
   * 베이스 돌의 기저면/접촉면 2D 지지 다각형(Support Polygon) 계산
   */
  public static computeSupportPolygon(
    baseStone: Stone | { pose: Pose; shape: StoneShape }
  ): SupportPolygon {
    const config = StonePhysicsBodyFactory.getShapeConfig(baseStone.shape);
    const h = config.halfExtents;

    // 로컬 8개 꼭짓점
    const localCorners: Vec3[] = [
      { x: -h.x, y: -h.y, z: -h.z },
      { x: h.x, y: -h.y, z: -h.z },
      { x: h.x, y: -h.y, z: h.z },
      { x: -h.x, y: -h.y, z: h.z },
      { x: -h.x, y: h.y, z: -h.z },
      { x: h.x, y: h.y, z: -h.z },
      { x: h.x, y: h.y, z: h.z },
      { x: -h.x, y: h.y, z: h.z },
    ];

    // 월드 회전 및 평행이동 적용 후 XZ 평면 투영
    const projected2D: [number, number][] = localCorners.map((c) => {
      const rotated = rotateVec3ByQuat(c, baseStone.pose.rotation);
      return [
        rotated.x + baseStone.pose.position.x,
        rotated.z + baseStone.pose.position.z,
      ];
    });

    const hull = computeConvexHull2D(projected2D);

    // 다각형 면적 및 중심 계산 (Shoelace formula)
    let areaSum = 0;
    let cxSum = 0;
    let czSum = 0;

    for (let i = 0; i < hull.length; i++) {
      const a = hull[i];
      const b = hull[(i + 1) % hull.length];
      const cross = a[0] * b[1] - b[0] * a[1];
      areaSum += cross;
      cxSum += (a[0] + b[0]) * cross;
      czSum += (a[1] + b[1]) * cross;
    }

    const area = Math.abs(areaSum) * 0.5;
    const centroidX =
      area > 1e-6 ? cxSum / (3 * areaSum) : baseStone.pose.position.x;
    const centroidZ =
      area > 1e-6 ? czSum / (3 * areaSum) : baseStone.pose.position.z;

    return {
      vertices: hull,
      area,
      centroid: [centroidX, centroidZ],
    };
  }

  /**
   * 볼록 지지 다각형의 중심에서 특정 방향으로의 유효 지지 반경(R_support) 계산
   * - 방향 벡터가 없거나 미소한 경우 다각형 모서리까지의 최소/평균 거리 반환
   * - 방향 벡터가 있는 경우 중심에서 해당 방향으로 뻗는 반직선과 볼록 다각형 모서리와의 교점 거리 계산
   */
  public static computeSupportRadius(
    polygon: SupportPolygon | readonly (readonly [number, number])[] | readonly [number, number][],
    direction?: [number, number] | readonly [number, number],
    centroidOverride?: readonly [number, number]
  ): number {
    const vertices: readonly (readonly [number, number])[] = Array.isArray(polygon)
      ? polygon
      : (polygon as SupportPolygon).vertices;

    if (vertices.length < 3) {
      return 0;
    }

    const c: readonly [number, number] = centroidOverride ?? (
      Array.isArray(polygon)
        ? [
            vertices.reduce((acc, v) => acc + v[0], 0) / vertices.length,
            vertices.reduce((acc, v) => acc + v[1], 0) / vertices.length,
          ]
        : (polygon as SupportPolygon).centroid
    );

    const dirX = direction ? direction[0] : 0;
    const dirZ = direction ? direction[1] : 0;
    const dirLen = Math.hypot(dirX, dirZ);

    if (dirLen < 1e-6) {
      let minDist = Infinity;
      for (let i = 0; i < vertices.length; i++) {
        const a = vertices[i];
        const b = vertices[(i + 1) % vertices.length];
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const lenSq = dx * dx + dz * dz;
        if (lenSq > 1e-12) {
          const t = Math.max(0, Math.min(1, ((c[0] - a[0]) * dx + (c[1] - a[1]) * dz) / lenSq));
          const cx = a[0] + t * dx;
          const cz = a[1] + t * dz;
          const d = Math.hypot(c[0] - cx, c[1] - cz);
          if (d < minDist) minDist = d;
        }
      }
      return Number.isFinite(minDist) && minDist > 0 ? minDist : 0.25;
    }

    const ux = dirX / dirLen;
    const uz = dirZ / dirLen;

    // 반직선 c + t * u (t > 0)과 각 변 (a, b)의 교점 계산
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % vertices.length];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];

      const det = uz * dx - ux * dz;
      if (Math.abs(det) > 1e-9) {
        const t = ((a[1] - c[1]) * dx - (a[0] - c[0]) * dz) / det;
        const s = (ux * (a[1] - c[1]) - uz * (a[0] - c[0])) / det;
        if (t > 1e-6 && s >= -1e-5 && s <= 1 + 1e-5) {
          return t;
        }
      }
    }

    let avgDist = 0;
    for (const v of vertices) {
      avgDist += Math.hypot(v[0] - c[0], v[1] - c[1]);
    }
    return avgDist / vertices.length;
  }

  /**
   * 편심 거리(eccentricOffsetDistance)와 지지 반경(supportRadius)을 기반으로
   * CoG 편심비(eta = d_ecc / R_support) 및 3대 물리 존(stable/tension/topple) 판정
   */
  public static evaluateEccentricityZone(
    eccentricOffsetDistance: number,
    supportRadius: number
  ): { eta: number; zone: 'stable' | 'tension' | 'topple' } {
    if (
      supportRadius <= 1e-6 ||
      !Number.isFinite(eccentricOffsetDistance) ||
      !Number.isFinite(supportRadius)
    ) {
      return { eta: Infinity, zone: 'topple' };
    }
    const eta = eccentricOffsetDistance / supportRadius;
    if (eta < STABILITY_ZONES.STABLE_ETA_MAX) {
      return { eta, zone: 'stable' };
    }
    if (eta <= STABILITY_ZONES.TENSION_ETA_MAX) {
      return { eta, zone: 'tension' };
    }
    return { eta, zone: 'topple' };
  }

  /**
   * 마이크로 워블(감쇠 조화 진동) 순간 경사각 계산
   * theta(t) = theta0 * exp(-zeta * wn * t) * cos(wd * t)
   */
  public static computeMicroWobbleAngle(
    t: number,
    wobbleConfigOrInitialAngle: WobbleConfig | number,
    dampingRatio = STABILITY_ZONES.DEFAULT_DAMPING_RATIO,
    naturalFreq = STABILITY_ZONES.DEFAULT_NATURAL_FREQ
  ): number {
    const theta0 =
      typeof wobbleConfigOrInitialAngle === 'number'
        ? wobbleConfigOrInitialAngle
        : wobbleConfigOrInitialAngle.initialAngle;

    if (t <= 0) {
      return theta0;
    }

    const zeta =
      typeof wobbleConfigOrInitialAngle === 'number'
        ? dampingRatio
        : wobbleConfigOrInitialAngle.dampingRatio;
    const wn =
      typeof wobbleConfigOrInitialAngle === 'number'
        ? naturalFreq
        : wobbleConfigOrInitialAngle.frequency;

    const dampedFreq = wn * Math.sqrt(Math.max(0, 1 - zeta * zeta));
    const envelope = Math.exp(-zeta * wn * t);
    return theta0 * envelope * Math.cos(dampedFreq * t);
  }

  /**
   * 쿨롱 경사면 마찰 미끄러짐(Friction Slip) 평가
   * - 접촉면 경사각 theta > 25° ~ 30° (tan(theta) > mu_s) 시 하향 미끄러짐 개시
   * - 하향 접선 가속도 a = g * (sin(theta) - mu_k * cos(theta)) 계산
   */
  public static evaluateInclineSlip(
    surfaceTiltAngleDeg: number,
    frictionCoeff = STABILITY_ZONES.STATIC_FRICTION_COEFF,
    gravity = STABILITY_ZONES.GRAVITY
  ): InclineSlipEvaluation {
    const rad = (surfaceTiltAngleDeg * Math.PI) / 180;
    const tanTheta = Math.tan(rad);
    const shouldSlip = tanTheta > frictionCoeff;
    const criticalSlipAngleDeg = (Math.atan(frictionCoeff) * 180) / Math.PI;
    const muKinetic = frictionCoeff * STABILITY_ZONES.KINETIC_FRICTION_RATIO;
    const tangentialAcceleration = shouldSlip
      ? Math.max(0, gravity * (Math.sin(rad) - muKinetic * Math.cos(rad)))
      : 0;
    const normalAcceleration = gravity * Math.cos(rad);

    return {
      shouldSlip,
      tangentialAcceleration: Number(tangentialAcceleration.toFixed(4)),
      normalAcceleration: Number(normalAcceleration.toFixed(4)),
      criticalSlipAngleDeg: Number(criticalSlipAngleDeg.toFixed(2)),
      frictionCoefficient: frictionCoeff,
    };
  }

  /**
   * 무게중심(COM)과 지지 다각형 간의 정적/동적 안정성(유도 거리, 편심비, 마이크로 워블 및 전복 토크) 평가
   */
  public static evaluateStability(
    com: Vec3,
    polygon: SupportPolygon | readonly (readonly [number, number])[] | readonly [number, number][],
    mass = 1.0
  ): AdvancedStabilityEvaluation {
    const vertices: readonly (readonly [number, number])[] = Array.isArray(polygon)
      ? polygon
      : (polygon as SupportPolygon).vertices;

    const p: [number, number] = [com.x, com.z];

    if (
      !Number.isFinite(com.x) ||
      !Number.isFinite(com.y) ||
      !Number.isFinite(com.z) ||
      vertices.length < 3
    ) {
      return {
        isStable: false,
        marginDistance: -Infinity,
        com2D: p,
        nearestEdgeDistance: 0,
        eccentricityRatio: Infinity,
        zone: 'topple',
      };
    }

    let pos = false;
    let neg = false;
    let minDist = Infinity;
    let nearestEdgePoint: [number, number] = [vertices[0][0], vertices[0][1]];

    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % vertices.length];

      // Cross product orientation test: (b - a) x (p - a)
      const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
      if (cross > 1e-7) {
        pos = true;
      }
      if (cross < -1e-7) {
        neg = true;
      }

      // 선분 ab와 점 p 간의 최근접 거리 계산
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const lenSq = dx * dx + dz * dz;

      let closestX = a[0];
      let closestZ = a[1];
      if (lenSq > 1e-12) {
        const t = Math.max(
          0,
          Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / lenSq)
        );
        closestX = a[0] + t * dx;
        closestZ = a[1] + t * dz;
      }

      const dist = Math.hypot(p[0] - closestX, p[1] - closestZ);
      if (dist < minDist) {
        minDist = dist;
        nearestEdgePoint = [closestX, closestZ];
      }
    }

    // 볼록 다각형 내부는 모든 방향의 cross 부호가 일치
    const isInside = !(pos && neg);
    const marginDistance = isInside ? minDist : -minDist;
    const isStable = marginDistance >= -1e-4;

    // 편심 거리 및 유효 지지 반경 계산
    const centroid: readonly [number, number] = Array.isArray(polygon)
      ? [
          vertices.reduce((acc, v) => acc + v[0], 0) / vertices.length,
          vertices.reduce((acc, v) => acc + v[1], 0) / vertices.length,
        ]
      : (polygon as SupportPolygon).centroid;

    const rxCentroid = p[0] - centroid[0];
    const rzCentroid = p[1] - centroid[1];
    const eccDist = Math.hypot(rxCentroid, rzCentroid);
    const supportRadius = this.computeSupportRadius(polygon, [rxCentroid, rzCentroid], centroid);
    const { eta, zone } = this.evaluateEccentricityZone(eccDist, supportRadius);

    // 기하학적으로 외부에 있는 경우 topple zone 강제
    const finalZone: 'stable' | 'tension' | 'topple' = !isStable ? 'topple' : zone;

    let wobbleConfig: WobbleConfig | undefined;
    if (finalZone === 'tension') {
      const normalizedTension = Math.max(
        0,
        Math.min(
          1,
          (eta - STABILITY_ZONES.STABLE_ETA_MAX) /
            (STABILITY_ZONES.TENSION_ETA_MAX - STABILITY_ZONES.STABLE_ETA_MAX)
        )
      );
      const initialAngle = Number((0.03 + normalizedTension * (0.12 - 0.03)).toFixed(4));
      const dirLen = eccDist > 1e-6 ? eccDist : 1.0;
      const ux = rxCentroid / dirLen;
      const uz = rzCentroid / dirLen;

      // 틸트 회전축: 변위 방향(ux, 0, uz)에 수직인 단위 벡터 (-uz, 0, ux)
      wobbleConfig = {
        enabled: true,
        initialAngle,
        tiltAxis: [Number((-uz).toFixed(4)), 0, Number(ux.toFixed(4))],
        frequency: STABILITY_ZONES.DEFAULT_NATURAL_FREQ,
        dampingRatio: STABILITY_ZONES.DEFAULT_DAMPING_RATIO,
      };
    } else {
      wobbleConfig = {
        enabled: false,
        initialAngle: 0,
        tiltAxis: [1, 0, 0],
        frequency: STABILITY_ZONES.DEFAULT_NATURAL_FREQ,
        dampingRatio: STABILITY_ZONES.DEFAULT_DAMPING_RATIO,
      };
    }

    const g = STABILITY_ZONES.GRAVITY;
    const criticalTorqueThreshold = Number(
      (supportRadius * (1 - STABILITY_ZONES.STABLE_ETA_MAX) * mass * g * 0.5).toFixed(4)
    );

    let overturningTorque: Vec3 | undefined;
    if (!isStable || finalZone === 'topple') {
      // 전복 토크: tau = r x F, F = (0, -m*g, 0), g = 9.82 m/s^2
      // r = (rx, 0, rz)
      // tau_x = -rz * Fy = rz * mass * g
      // tau_y = 0
      // tau_z = rx * Fy = -rx * mass * g
      const rx = com.x - nearestEdgePoint[0];
      const rz = com.z - nearestEdgePoint[1];
      overturningTorque = {
        x: rz * mass * g,
        y: 0,
        z: -rx * mass * g,
      };
    }

    return {
      isStable,
      marginDistance,
      com2D: p,
      nearestEdgeDistance: minDist,
      overturningTorque,
      eccentricityRatio: Number(eta.toFixed(4)),
      zone: finalZone,
      wobbleConfig,
      criticalTorqueThreshold,
    };
  }

  /**
   * 상위 돌들의 복합 무게중심을 기준으로 하부 기저 돌에 대한 복합 안정성 평가
   */
  public static evaluateStackStability(
    baseStone: Stone,
    upperStones: readonly { stone: Stone; mass?: number }[]
  ): AdvancedStabilityEvaluation {
    const polygon = this.computeSupportPolygon(baseStone);

    const stoneEntries = upperStones.map((entry) => {
      const cfg = StonePhysicsBodyFactory.getShapeConfig(entry.stone.shape);
      return {
        mass: entry.mass ?? cfg.mass,
        position: entry.stone.pose.position,
      };
    });

    const compositeCOM = this.computeCompositeCOM(stoneEntries);
    const totalMass = stoneEntries.reduce((acc, e) => acc + e.mass, 0);

    return this.evaluateStability(compositeCOM, polygon, totalMass);
  }
}
