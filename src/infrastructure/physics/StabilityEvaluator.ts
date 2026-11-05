import { Stone, type StoneShape } from '../../domain/entities/Stone.ts';
import { type Pose, type Vec3, type Quat } from '../../domain/value-objects/Pose.ts';
import {
  type StabilityEvaluation,
  type SupportPolygon,
} from './PhysicsSimulationTypes.ts';
import { StonePhysicsBodyFactory } from './StonePhysicsBodyFactory.ts';

/**
 * 쿼터니언을 사용해 3차원 벡터를 회전
 */
function rotateVec3ByQuat(v: Vec3, q: Quat): Vec3 {
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
   * 무게중심(COM)과 지지 다각형 간의 정적 안정성(유도 거리 및 전복 토크) 평가
   */
  public static evaluateStability(
    com: Vec3,
    polygon: SupportPolygon | readonly [number, number][],
    mass = 1.0
  ): StabilityEvaluation {
    const vertices: readonly [number, number][] = Array.isArray(polygon)
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

    let overturningTorque: Vec3 | undefined;
    if (!isStable) {
      // 전복 토크: tau = r x F, F = (0, -m*g, 0), g = 9.82 m/s^2
      // r = (rx, 0, rz)
      // tau_x = -rz * Fy = -rz * (-m * g) = rz * mass * g
      // tau_y = 0
      // tau_z = rx * Fy = rx * (-m * g) = -rx * mass * g
      const rx = com.x - nearestEdgePoint[0];
      const rz = com.z - nearestEdgePoint[1];
      const g = 9.82;
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
    };
  }

  /**
   * 상위 돌들의 복합 무게중심을 기준으로 하부 기저 돌에 대한 복합 안정성 평가
   */
  public static evaluateStackStability(
    baseStone: Stone,
    upperStones: readonly { stone: Stone; mass?: number }[]
  ): StabilityEvaluation {
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
