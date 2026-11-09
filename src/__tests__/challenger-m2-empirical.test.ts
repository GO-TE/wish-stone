/**
 * Wish Stone v2: Milestone M2 Adversarial Empirical Verification Test Suite
 * Author: Empirical Challenger (challenger_v2_m2_1)
 *
 * Mandatory Verification Scope:
 * 1. CoG eccentricity ratio (eta) across convex hulls (3, 4, 8, 16 vertices & irregular geometries)
 *    tested against an independent analytical geometry oracle.
 * 2. Multi-zone boundary stress tests: eta in {0.3999, 0.4000, 0.4001} and {0.8999, 0.9000, 0.9001}.
 * 3. Micro-wobble damping curves theta(t): decay rate, frequency consistency, zero-crossings, settling times.
 * 4. Full rigid-body physics world trajectory validation for stable, tension, and topple regimes.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { Stone } from '../domain/entities/Stone.ts';
import { Pose, type Vec3 } from '../domain/value-objects/Pose.ts';
import {
  StabilityEvaluator,
  STABILITY_ZONES,
  type WobbleConfig,
} from '../infrastructure/physics/StabilityEvaluator.ts';
import { SimpleTowerPhysicsWorld } from '../infrastructure/physics/SimpleTowerPhysicsWorld.ts';
import { StonePhysicsBodyFactory } from '../infrastructure/physics/StonePhysicsBodyFactory.ts';

// =============================================================================
// INDEPENDENT ANALYTICAL ORACLES
// =============================================================================

/**
 * Independent mathematical oracle for ray-convex polygon intersection distance.
 * Computes the exact positive distance t along ray c + t * (dirX, dirZ) to polygon boundary.
 */
function analyticalRayPolygonIntersectionOracle(
  vertices: readonly (readonly [number, number])[],
  centroid: readonly [number, number],
  direction: [number, number]
): number {
  const dirLen = Math.hypot(direction[0], direction[1]);
  assert.ok(dirLen > 1e-9, 'Direction must be non-zero');
  const ux = direction[0] / dirLen;
  const uz = direction[1] / dirLen;

  let bestT = Infinity;

  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];

    // System: c + t * u = a + s * (b - a)
    // t * ux - s * dx = a[0] - c[0]
    // t * uz - s * dz = a[1] - c[1]
    const det = ux * (-dz) - uz * (-dx); // uz * dx - ux * dz
    if (Math.abs(det) < 1e-12) {
      continue; // Parallel to edge
    }

    const t = ((a[1] - centroid[1]) * dx - (a[0] - centroid[0]) * dz) / det;
    const s = (ux * (a[1] - centroid[1]) - uz * (a[0] - centroid[0])) / det;

    if (t > 1e-7 && s >= -1e-6 && s <= 1 + 1e-6) {
      if (t < bestT) {
        bestT = t;
      }
    }
  }

  assert.ok(Number.isFinite(bestT) && bestT > 0, `Oracle failed to find intersection for dir (${ux}, ${uz})`);
  return bestT;
}

/**
 * Centroid calculation oracle for arbitrary polygon using Green's theorem (Shoelace)
 */
function analyticalPolygonCentroidOracle(
  vertices: readonly (readonly [number, number])[]
): [number, number] {
  let areaSum = 0;
  let cxSum = 0;
  let czSum = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const cross = a[0] * b[1] - b[0] * a[1];
    areaSum += cross;
    cxSum += (a[0] + b[0]) * cross;
    czSum += (a[1] + b[1]) * cross;
  }
  const area3 = 3 * areaSum;
  return [cxSum / area3, czSum / area3];
}

// =============================================================================
// SUITE 1: CoG ECCENTRICITY RATIO ACROSS CONVEX HULLS (3, 4, 8, 16 VERTICES)
// =============================================================================

test('Suite 1.1: 3-Vertex Hull (Triangle) - Directional support radius and eccentricity ratio against oracle', () => {
  // Equilateral triangle centered at (0, 0) with side length 1.0
  const h = Math.sqrt(3) / 2; // ~0.866025
  const triangle: [number, number][] = [
    [-0.5, -h / 3],
    [0.5, -h / 3],
    [0.0, (2 * h) / 3],
  ];
  const centroid: [number, number] = [0, 0];

  // Inscribed circle radius: h / 3 ~ 0.288675
  // Circumscribed circle radius: 2h / 3 ~ 0.577350
  const expectedInradius = h / 3;
  const expectedCircumradius = (2 * h) / 3;

  // Test zero displacement direction -> should equal inradius
  const rZero = StabilityEvaluator.computeSupportRadius(triangle, [0, 0], centroid);
  assert.ok(
    Math.abs(rZero - expectedInradius) < 1e-4,
    `Inradius mismatch: expected ${expectedInradius}, got ${rZero}`
  );

  // Test rays across 36 directions (every 10 degrees) against independent oracle
  for (let deg = 0; deg < 360; deg += 10) {
    const rad = (deg * Math.PI) / 180;
    const dir: [number, number] = [Math.cos(rad), Math.sin(rad)];
    const computedR = StabilityEvaluator.computeSupportRadius(triangle, dir, centroid);
    const oracleR = analyticalRayPolygonIntersectionOracle(triangle, centroid, dir);

    assert.ok(
      Math.abs(computedR - oracleR) < 1e-4,
      `Degree ${deg}: computed ${computedR} vs oracle ${oracleR} (diff ${Math.abs(computedR - oracleR)})`
    );

    // Bounded between inradius and circumradius
    assert.ok(
      computedR >= expectedInradius - 1e-5 && computedR <= expectedCircumradius + 1e-5,
      `Degree ${deg}: radius ${computedR} out of bounds [${expectedInradius}, ${expectedCircumradius}]`
    );
  }

  // Right-angled triangle with offset centroid
  const rightTriangle: [number, number][] = [
    [0.0, 0.0],
    [1.2, 0.0],
    [0.0, 0.9],
  ];
  const rightCentroid = analyticalPolygonCentroidOracle(rightTriangle); // (0.4, 0.3)
  for (let deg = 0; deg < 360; deg += 15) {
    const rad = (deg * Math.PI) / 180;
    const dir: [number, number] = [Math.cos(rad), Math.sin(rad)];
    const computedR = StabilityEvaluator.computeSupportRadius(rightTriangle, dir, rightCentroid);
    const oracleR = analyticalRayPolygonIntersectionOracle(rightTriangle, rightCentroid, dir);

    assert.ok(
      Math.abs(computedR - oracleR) < 1e-4,
      `Right triangle deg ${deg}: computed ${computedR} vs oracle ${oracleR}`
    );
  }
});

test('Suite 1.2: 4-Vertex Hull (Quadrilateral) - Symmetric & asymmetric geometries against oracle', () => {
  // Asymmetric Trapezoid
  const trapezoid: [number, number][] = [
    [-0.8, -0.4],
    [0.6, -0.4],
    [0.4, 0.5],
    [-0.5, 0.5],
  ];
  const centroid = analyticalPolygonCentroidOracle(trapezoid);

  for (let deg = 0; deg < 360; deg += 10) {
    const rad = (deg * Math.PI) / 180;
    const dir: [number, number] = [Math.cos(rad), Math.sin(rad)];
    const computedR = StabilityEvaluator.computeSupportRadius(trapezoid, dir, centroid);
    const oracleR = analyticalRayPolygonIntersectionOracle(trapezoid, centroid, dir);

    assert.ok(
      Math.abs(computedR - oracleR) < 1e-4,
      `Trapezoid deg ${deg}: computed ${computedR} vs oracle ${oracleR}`
    );
  }

  // Off-center elongated rectangle: 1.6m x 0.4m (aspect ratio 4:1)
  const rect: [number, number][] = [
    [-0.8, -0.2],
    [0.8, -0.2],
    [0.8, 0.2],
    [-0.8, 0.2],
  ];
  const rLong = StabilityEvaluator.computeSupportRadius(rect, [1, 0], [0, 0]);
  const rShort = StabilityEvaluator.computeSupportRadius(rect, [0, 1], [0, 0]);
  assert.ok(Math.abs(rLong - 0.8) < 1e-4, `Long axis radius should be 0.8, got ${rLong}`);
  assert.ok(Math.abs(rShort - 0.2) < 1e-4, `Short axis radius should be 0.2, got ${rShort}`);
});

test('Suite 1.3: 8-Vertex Hull (Octagon) - Regular and irregular octagonal boundaries', () => {
  // Regular Octagon with circumradius R = 0.5
  const R = 0.5;
  const regularOctagon: [number, number][] = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i * 2 * Math.PI) / 8;
    regularOctagon.push([R * Math.cos(angle), R * Math.sin(angle)]);
  }
  const centroid: [number, number] = [0, 0];
  const expectedInradius = R * Math.cos(Math.PI / 8); // 0.5 * cos(22.5°) ~ 0.46194

  for (let deg = 0; deg < 360; deg += 5) {
    const rad = (deg * Math.PI) / 180;
    const dir: [number, number] = [Math.cos(rad), Math.sin(rad)];
    const computedR = StabilityEvaluator.computeSupportRadius(regularOctagon, dir, centroid);
    const oracleR = analyticalRayPolygonIntersectionOracle(regularOctagon, centroid, dir);

    assert.ok(
      Math.abs(computedR - oracleR) < 1e-4,
      `Octagon deg ${deg}: computed ${computedR} vs oracle ${oracleR}`
    );
    assert.ok(
      computedR >= expectedInradius - 1e-5 && computedR <= R + 1e-5,
      `Octagon deg ${deg}: radius ${computedR} not in [${expectedInradius}, ${R}]`
    );
  }

  // Irregular 8-gon with distorted vertices
  const irregularOctagon: [number, number][] = [
    [-0.4, -0.3],
    [0.1, -0.5],
    [0.5, -0.2],
    [0.6, 0.1],
    [0.4, 0.4],
    [0.0, 0.6],
    [-0.3, 0.4],
    [-0.5, 0.1],
  ];
  const irrCentroid = analyticalPolygonCentroidOracle(irregularOctagon);
  for (let deg = 0; deg < 360; deg += 10) {
    const rad = (deg * Math.PI) / 180;
    const dir: [number, number] = [Math.cos(rad), Math.sin(rad)];
    const computedR = StabilityEvaluator.computeSupportRadius(irregularOctagon, dir, irrCentroid);
    const oracleR = analyticalRayPolygonIntersectionOracle(irregularOctagon, irrCentroid, dir);
    assert.ok(
      Math.abs(computedR - oracleR) < 1e-4,
      `Irr-Octagon deg ${deg}: computed ${computedR} vs oracle ${oracleR}`
    );
  }
});

test('Suite 1.4: 16-Vertex Hull (Hexadecagon) - High-resolution polygonal circle approximation', () => {
  const R = 0.45;
  const hexadecagon: [number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const angle = (i * 2 * Math.PI) / 16;
    hexadecagon.push([R * Math.cos(angle), R * Math.sin(angle)]);
  }
  const centroid: [number, number] = [0, 0];
  const expectedInradius = R * Math.cos(Math.PI / 16); // 0.45 * cos(11.25°) ~ 0.44135

  // 72 directional probes across all quadrants
  for (let deg = 0; deg < 360; deg += 5) {
    const rad = (deg * Math.PI) / 180;
    const dir: [number, number] = [Math.cos(rad), Math.sin(rad)];
    const computedR = StabilityEvaluator.computeSupportRadius(hexadecagon, dir, centroid);
    const oracleR = analyticalRayPolygonIntersectionOracle(hexadecagon, centroid, dir);

    assert.ok(
      Math.abs(computedR - oracleR) < 1e-4,
      `16-gon deg ${deg}: computed ${computedR} vs oracle ${oracleR}`
    );
    assert.ok(
      computedR >= expectedInradius - 1e-5 && computedR <= R + 1e-5,
      `16-gon deg ${deg}: radius ${computedR} not in [${expectedInradius}, ${R}]`
    );
  }
});

test('Suite 1.5: Ray directly targeting vertices and translation invariance', () => {
  // Test ray passing EXACTLY through every single vertex of 3, 4, 8, and 16-gons
  const polygons = [
    // 3-gon
    [
      [-0.4, -0.3],
      [0.5, -0.2],
      [0.0, 0.6],
    ] as [number, number][],
    // 4-gon
    [
      [-0.5, -0.3],
      [0.5, -0.4],
      [0.4, 0.4],
      [-0.4, 0.5],
    ] as [number, number][],
  ];

  for (const poly of polygons) {
    const centroid = analyticalPolygonCentroidOracle(poly);
    for (let i = 0; i < poly.length; i++) {
      const v = poly[i];
      const dir: [number, number] = [v[0] - centroid[0], v[1] - centroid[1]];
      const expectedDist = Math.hypot(dir[0], dir[1]);
      const computedR = StabilityEvaluator.computeSupportRadius(poly, dir, centroid);

      assert.ok(
        Math.abs(computedR - expectedDist) < 1e-4,
        `Vertex ${i} targeting: expected ${expectedDist}, got ${computedR}`
      );
    }
  }

  // Translation Invariance: Polygon translated far from origin
  const basePoly: [number, number][] = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ];
  const offset: [number, number] = [128.45, -73.12];
  const translatedPoly: [number, number][] = basePoly.map((p) => [
    p[0] + offset[0],
    p[1] + offset[1],
  ]);

  for (let deg = 0; deg < 360; deg += 30) {
    const rad = (deg * Math.PI) / 180;
    const dir: [number, number] = [Math.cos(rad), Math.sin(rad)];
    const rBase = StabilityEvaluator.computeSupportRadius(basePoly, dir, [0, 0]);
    const rTrans = StabilityEvaluator.computeSupportRadius(translatedPoly, dir, offset);
    assert.ok(
      Math.abs(rBase - rTrans) < 1e-5,
      `Translation invariance violated at ${deg}°: base=${rBase}, translated=${rTrans}`
    );
  }
});

// =============================================================================
// SUITE 2: MULTI-ZONE BOUNDARY STRESS-TESTING (0.3999..0.4001, 0.8999..0.9001)
// =============================================================================

test('Suite 2.1: Zone Boundary 1 - Probing eta = 0.3999 vs 0.4000 vs 0.4001', () => {
  const supportR = 1.0;

  // 1. Direct evaluateEccentricityZone evaluation
  const zBelow = StabilityEvaluator.evaluateEccentricityZone(0.3999, supportR);
  const zExact = StabilityEvaluator.evaluateEccentricityZone(0.4000, supportR);
  const zAbove = StabilityEvaluator.evaluateEccentricityZone(0.4001, supportR);

  assert.equal(zBelow.zone, 'stable', 'eta = 0.3999 must strictly be STABLE');
  assert.equal(zExact.zone, 'tension', 'eta = 0.4000 must transition into TENSION');
  assert.equal(zAbove.zone, 'tension', 'eta = 0.4001 must be TENSION');

  // 2. Full evaluateStability evaluation on a 2.0m x 2.0m square polygon (R_support = 1.0 along +X)
  const squarePoly: [number, number][] = [
    [-1.0, -1.0],
    [1.0, -1.0],
    [1.0, 1.0],
    [-1.0, 1.0],
  ];

  // (a) eta = 0.3999
  const evalBelow = StabilityEvaluator.evaluateStability(
    { x: 0.3999, y: 1.0, z: 0.0 },
    squarePoly,
    1.0
  );
  assert.equal(evalBelow.zone, 'stable');
  assert.equal(evalBelow.isStable, true);
  assert.equal(evalBelow.wobbleConfig?.enabled, false, 'Wobble must be disabled at eta = 0.3999');
  assert.equal(evalBelow.wobbleConfig?.initialAngle, 0);

  // (b) eta = 0.4000
  const evalExact = StabilityEvaluator.evaluateStability(
    { x: 0.4000, y: 1.0, z: 0.0 },
    squarePoly,
    1.0
  );
  assert.equal(evalExact.zone, 'tension');
  assert.equal(evalExact.isStable, true);
  assert.equal(evalExact.wobbleConfig?.enabled, true, 'Wobble must be enabled at eta = 0.4000');
  // At exact boundary eta = 0.40, normalized tension = 0 -> initialAngle = 0.03 rad
  assert.ok(
    Math.abs(evalExact.wobbleConfig!.initialAngle - 0.03) < 1e-4,
    `Initial angle at eta=0.4000 must be exactly 0.03 rad, got ${evalExact.wobbleConfig!.initialAngle}`
  );

  // (c) eta = 0.4001
  const evalAbove = StabilityEvaluator.evaluateStability(
    { x: 0.4001, y: 1.0, z: 0.0 },
    squarePoly,
    1.0
  );
  assert.equal(evalAbove.zone, 'tension');
  assert.equal(evalAbove.isStable, true);
  assert.equal(evalAbove.wobbleConfig?.enabled, true);
  assert.ok(
    evalAbove.wobbleConfig!.initialAngle >= 0.03,
    `Initial angle at eta=0.4001 must be >= 0.03 rad, got ${evalAbove.wobbleConfig!.initialAngle}`
  );
});

test('Suite 2.2: Zone Boundary 2 - Probing eta = 0.8999 vs 0.9000 vs 0.9001', () => {
  const supportR = 1.0;

  // 1. Direct evaluateEccentricityZone evaluation
  const zBelow = StabilityEvaluator.evaluateEccentricityZone(0.8999, supportR);
  const zExact = StabilityEvaluator.evaluateEccentricityZone(0.9000, supportR);
  const zAbove = StabilityEvaluator.evaluateEccentricityZone(0.9001, supportR);

  assert.equal(zBelow.zone, 'tension', 'eta = 0.8999 must be TENSION');
  assert.equal(zExact.zone, 'tension', 'eta = 0.9000 must be TENSION (upper inclusive bound)');
  assert.equal(zAbove.zone, 'topple', 'eta = 0.9001 must transition into TOPPLE');

  // 2. Full evaluateStability evaluation on square polygon
  const squarePoly: [number, number][] = [
    [-1.0, -1.0],
    [1.0, -1.0],
    [1.0, 1.0],
    [-1.0, 1.0],
  ];

  // (a) eta = 0.8999
  const evalBelow = StabilityEvaluator.evaluateStability(
    { x: 0.8999, y: 1.0, z: 0.0 },
    squarePoly,
    1.0
  );
  assert.equal(evalBelow.zone, 'tension');
  assert.equal(evalBelow.isStable, true);
  assert.equal(evalBelow.wobbleConfig?.enabled, true);
  assert.ok(
    evalBelow.wobbleConfig!.initialAngle >= 0.119,
    `Initial angle at eta=0.8999 should be near 0.12 rad, got ${evalBelow.wobbleConfig!.initialAngle}`
  );

  // (b) eta = 0.9000
  const evalExact = StabilityEvaluator.evaluateStability(
    { x: 0.9000, y: 1.0, z: 0.0 },
    squarePoly,
    1.0
  );
  assert.equal(evalExact.zone, 'tension');
  assert.equal(evalExact.isStable, true);
  assert.equal(evalExact.wobbleConfig?.enabled, true);
  assert.ok(
    Math.abs(evalExact.wobbleConfig!.initialAngle - 0.12) < 1e-4,
    `Initial angle at eta=0.9000 must reach max 0.12 rad, got ${evalExact.wobbleConfig!.initialAngle}`
  );

  // (c) eta = 0.9001
  const evalAbove = StabilityEvaluator.evaluateStability(
    { x: 0.9001, y: 1.0, z: 0.0 },
    squarePoly,
    1.0
  );
  assert.equal(evalAbove.zone, 'topple', 'eta = 0.9001 must evaluate to topple zone');
  assert.equal(evalAbove.wobbleConfig?.enabled, false, 'Wobble must be disabled in topple zone');
  assert.ok(
    evalAbove.criticalTorqueThreshold !== undefined && evalAbove.criticalTorqueThreshold > 0,
    'Critical torque threshold must be present'
  );
});

test('Suite 2.3: Monotonicity of initial wobble angle across the entire Tension Zone [0.40, 0.90]', () => {
  const squarePoly: [number, number][] = [
    [-1.0, -1.0],
    [1.0, -1.0],
    [1.0, 1.0],
    [-1.0, 1.0],
  ];

  let prevAngle = -Infinity;
  for (let eta = 0.40; eta <= 0.90001; eta += 0.05) {
    const x = Number(eta.toFixed(4));
    const res = StabilityEvaluator.evaluateStability({ x, y: 1.0, z: 0.0 }, squarePoly, 1.0);
    assert.equal(res.zone, 'tension');
    assert.ok(res.wobbleConfig?.enabled);
    const angle = res.wobbleConfig!.initialAngle;

    assert.ok(
      angle >= prevAngle,
      `Monotonicity violation at eta=${eta}: prev=${prevAngle}, curr=${angle}`
    );
    assert.ok(
      angle >= 0.03 - 1e-5 && angle <= 0.12 + 1e-5,
      `Angle ${angle} out of range [0.03, 0.12]`
    );
    prevAngle = angle;
  }
});

// =============================================================================
// SUITE 3: MICRO-WOBBLE DAMPING CURVES theta(t) EMPIRICAL VERIFICATION
// =============================================================================

test('Suite 3.1: Damping decay rate and exponential envelope validation', () => {
  const theta0 = 0.10; // 0.1 rad (~5.73 deg)
  const zeta = 0.30;
  const wn = 20.0;
  const wd = wn * Math.sqrt(1 - zeta * zeta); // ~19.078784 rad/s

  // Decay constant lambda = zeta * wn = 6.0 s^-1
  const lambda = zeta * wn; // 6.0
  const halfLife = Math.LN2 / lambda; // ln(2) / 6.0 ~ 0.115525 s

  // 1. Verify half-life envelope reduction
  const envHalf = Math.exp(-lambda * halfLife);
  assert.ok(
    Math.abs(envHalf - 0.5) < 1e-4,
    `Envelope at half-life must be 0.50, got ${envHalf}`
  );

  // 2. High-density time sampling: check that |theta(t)| <= theta0 * exp(-lambda * t) everywhere
  for (let t = 0; t <= 1.5; t += 0.005) {
    const angle = StabilityEvaluator.computeMicroWobbleAngle(t, theta0, zeta, wn);
    const envelope = theta0 * Math.exp(-lambda * t);

    assert.ok(
      Math.abs(angle) <= envelope + 1e-6,
      `At t=${t}s: |theta|=${Math.abs(angle)} exceeded envelope=${envelope}`
    );
  }

  // 3. Settling time benchmarks:
  // - t = 0.5s: exp(-3.0) ~ 0.0498 (< 5% of theta0)
  const t0_5 = StabilityEvaluator.computeMicroWobbleAngle(0.5, theta0, zeta, wn);
  assert.ok(Math.abs(t0_5) < theta0 * 0.05, `At t=0.5s, amplitude must be < 5% of theta0`);

  // - t = 1.0s: exp(-6.0) ~ 0.00248 (< 0.3% of theta0)
  const t1_0 = StabilityEvaluator.computeMicroWobbleAngle(1.0, theta0, zeta, wn);
  assert.ok(Math.abs(t1_0) < theta0 * 0.003, `At t=1.0s, amplitude must be < 0.3% of theta0`);

  // - t = 1.25s: exp(-7.5) ~ 0.000553 (< 0.06% of theta0, > 99.94% decayed)
  const t1_25 = StabilityEvaluator.computeMicroWobbleAngle(1.25, theta0, zeta, wn);
  assert.ok(Math.abs(t1_25) < theta0 * 0.0006, `At t=1.25s, amplitude must be < 0.06% of theta0`);
});

test('Suite 3.2: Damped frequency consistency and zero-crossing locations', () => {
  const theta0 = 0.08;
  const zeta = 0.30;
  const wn = 20.0;
  const wd = wn * Math.sqrt(1 - zeta * zeta); // 19.078784 rad/s

  // Analytical zero crossings occur when cos(wd * t) = 0:
  // wd * t_k = (k + 0.5) * pi => t_k = (k + 0.5) * pi / wd
  for (let k = 0; k < 6; k++) {
    const tk = ((k + 0.5) * Math.PI) / wd;
    const angleAtZero = StabilityEvaluator.computeMicroWobbleAngle(tk, theta0, zeta, wn);
    assert.ok(
      Math.abs(angleAtZero) < 1e-4,
      `Zero crossing ${k} at t=${tk.toFixed(5)}s must evaluate to ~0, got ${angleAtZero}`
    );

    // Immediate neighborhood: sign change across tk
    const angleBefore = StabilityEvaluator.computeMicroWobbleAngle(tk - 0.005, theta0, zeta, wn);
    const angleAfter = StabilityEvaluator.computeMicroWobbleAngle(tk + 0.005, theta0, zeta, wn);
    assert.ok(
      angleBefore * angleAfter < 0,
      `Zero crossing ${k} must exhibit sign reversal across root`
    );
  }
});

// =============================================================================
// SUITE 4: RIGID-BODY DROP SIMULATION & TRAJECTORY FRAME DYNAMICS
// =============================================================================

test('Suite 4.1: Tension Zone drop records continuous oscillation trajectory and settles to equilibrium', async () => {
  const world = new SimpleTowerPhysicsWorld();

  const baseConfig = StonePhysicsBodyFactory.getShapeConfig('boulder');
  const baseStone = new Stone({
    shape: 'boulder',
    color: '#2C3038',
    pose: new Pose({ x: 0, y: baseConfig.halfExtents.y, z: 0 }),
  });
  world.addStatic([baseStone]);

  const topConfig = StonePhysicsBodyFactory.getShapeConfig('round');
  const topStone = new Stone({
    shape: 'round',
    color: '#8D99AE',
    pose: Pose.origin(),
  });

  const topSurfaceY = baseStone.pose.position.y + baseConfig.halfExtents.y;

  // Drop at x = 0.18m (eccentricity eta = 0.18 / 0.3125 = 0.576 -> Tension Zone)
  const dropPose = new Pose({
    x: 0.18,
    y: topSurfaceY + topConfig.halfExtents.y + 0.10,
    z: 0.0,
  });

  const result = await world.drop(topStone, dropPose);

  assert.equal(result.settled, true, 'Tension drop must settle stably');
  assert.equal(result.collapsed, false, 'Tension drop must not collapse');
  assert.ok(result.trajectory !== undefined);
  assert.ok(result.trajectory.length >= 75, `Trajectory length (${result.trajectory.length}) must be >= 75`);

  // Extract quaternions for the dropped stone across frames
  const qList = result.trajectory.map((f) => {
    const p = f.poses.get('dropped-stone');
    assert.ok(p, 'Trajectory frame must include dropped-stone pose');
    return { step: f.step, time: f.time, rot: p.rotation };
  });

  // Verify quaternion unit norm across all frames: qx^2 + qy^2 + qz^2 + qw^2 ~ 1.0
  for (const item of qList) {
    const norm = Math.hypot(item.rot.qx, item.rot.qy, item.rot.qz, item.rot.qw);
    assert.ok(
      Math.abs(norm - 1.0) < 0.01,
      `Step ${item.step}: quaternion norm must be ~1.0, got ${norm}`
    );
  }

  // Verify that rocking occurs primarily about the Z axis (since offset was along X)
  const maxQz = Math.max(...qList.map((q) => Math.abs(q.rot.qz)));
  const maxQx = Math.max(...qList.map((q) => Math.abs(q.rot.qx)));
  assert.ok(maxQz > 0.01, `Noticeable Z-tilt must occur (got max |qz| = ${maxQz})`);
  assert.ok(maxQz > maxQx, `Z tilt (${maxQz}) must dominate over X tilt (${maxQx}) for pure X displacement`);

  // Verify continuity: no discontinuous angular jumps between consecutive steps
  for (let i = 1; i < qList.length; i++) {
    const prev = qList[i - 1].rot;
    const curr = qList[i].rot;
    const dq = Math.hypot(curr.qx - prev.qx, curr.qy - prev.qy, curr.qz - prev.qz, curr.qw - prev.qw);
    assert.ok(
      dq < 0.15,
      `Step ${i}: discontinuous rotation jump detected (dq = ${dq})`
    );
  }

  // Verify final settlement: final 10 frames show negligible motion
  const final10 = qList.slice(-10);
  for (let i = 1; i < final10.length; i++) {
    const dFinal = Math.hypot(
      final10[i].rot.qz - final10[i - 1].rot.qz,
      final10[i].rot.qw - final10[i - 1].rot.qw
    );
    assert.ok(
      dFinal < 0.005,
      `Final frames must be stationary at equilibrium (got dFinal = ${dFinal})`
    );
  }

  world.dispose();
});

test('Suite 4.2: Stable Zone drop (x = 0.05m) settles directly without wobble amplification', async () => {
  const world = new SimpleTowerPhysicsWorld();
  const baseConfig = StonePhysicsBodyFactory.getShapeConfig('boulder');
  const baseStone = new Stone({
    shape: 'boulder',
    color: '#2C3038',
    pose: new Pose({ x: 0, y: baseConfig.halfExtents.y, z: 0 }),
  });
  world.addStatic([baseStone]);

  const topConfig = StonePhysicsBodyFactory.getShapeConfig('round');
  const topStone = new Stone({
    shape: 'round',
    color: '#8D99AE',
    pose: Pose.origin(),
  });

  const topSurfaceY = baseStone.pose.position.y + baseConfig.halfExtents.y;

  // Drop at x = 0.05m (eccentricity eta = 0.05 / 0.3125 = 0.16 < 0.40 -> Stable Zone)
  const dropPose = new Pose({
    x: 0.05,
    y: topSurfaceY + topConfig.halfExtents.y + 0.05,
    z: 0.0,
  });

  const result = await world.drop(topStone, dropPose);
  assert.equal(result.settled, true);
  assert.equal(result.collapsed, false);

  // Stable drop settles quicker (~45 steps)
  assert.ok(
    result.trajectory && result.trajectory.length <= 65,
    `Stable drop should settle quickly, took ${result.trajectory?.length} frames`
  );

  world.dispose();
});

// =============================================================================
// SUITE 5: ADVERSARIAL STRESS & SINGULARITY HARNESSES
// =============================================================================

test('Suite 5.1: Clockwise (CW) vs Counter-Clockwise (CCW) polygon ordering invariance', () => {
  const ccwPoly: [number, number][] = [
    [-0.6, -0.4],
    [0.7, -0.3],
    [0.5, 0.5],
    [-0.4, 0.6],
  ];
  const cwPoly: [number, number][] = [...ccwPoly].reverse();

  const cCCW = analyticalPolygonCentroidOracle(ccwPoly);
  const cCW = analyticalPolygonCentroidOracle(cwPoly);

  for (let deg = 0; deg < 360; deg += 20) {
    const rad = (deg * Math.PI) / 180;
    const dir: [number, number] = [Math.cos(rad), Math.sin(rad)];
    const rCCW = StabilityEvaluator.computeSupportRadius(ccwPoly, dir, cCCW);
    const rCW = StabilityEvaluator.computeSupportRadius(cwPoly, dir, cCW);

    assert.ok(
      Math.abs(rCCW - rCW) < 1e-5,
      `CW vs CCW radius mismatch at ${deg}°: rCCW=${rCCW}, rCW=${rCW}`
    );
  }

  // evaluateStability inside/outside test with CW polygon
  const evalInside = StabilityEvaluator.evaluateStability({ x: cCW[0], y: 1.0, z: cCW[1] }, cwPoly, 1.0);
  assert.equal(evalInside.isStable, true, 'Centroid must evaluate as stable for CW polygon');

  const evalFarOutside = StabilityEvaluator.evaluateStability({ x: 10.0, y: 1.0, z: 10.0 }, cwPoly, 1.0);
  assert.equal(evalFarOutside.isStable, false, 'Far point must evaluate as unstable for CW polygon');
});

test('Suite 5.2: Incline slip extreme boundary conditions and vertical cliff limit', () => {
  const mu_s = 0.50;
  const criticalDeg = (Math.atan(mu_s) * 180) / Math.PI; // ~26.565°

  // 1. Exact critical boundary: theta = criticalDeg - 0.001° vs criticalDeg + 0.001°
  const subSlip = StabilityEvaluator.evaluateInclineSlip(criticalDeg - 0.001, mu_s);
  assert.equal(subSlip.shouldSlip, false, 'Just below critical angle must not slip');

  const superSlip = StabilityEvaluator.evaluateInclineSlip(criticalDeg + 0.001, mu_s);
  assert.equal(superSlip.shouldSlip, true, 'Just above critical angle must slip');

  // 2. Vertical cliff (90 degrees): tangential acceleration = g * sin(90°) = 9.82 m/s^2
  const cliffSlip = StabilityEvaluator.evaluateInclineSlip(90.0, mu_s);
  assert.equal(cliffSlip.shouldSlip, true);
  assert.ok(
    Math.abs(cliffSlip.tangentialAcceleration - STABILITY_ZONES.GRAVITY) < 1e-3,
    `Vertical cliff acceleration must be ~9.82, got ${cliffSlip.tangentialAcceleration}`
  );
  assert.ok(
    Math.abs(cliffSlip.normalAcceleration) < 1e-4,
    `Vertical cliff normal acceleration must be ~0, got ${cliffSlip.normalAcceleration}`
  );

  // 3. Flat plane (0 degrees)
  const flatSlip = StabilityEvaluator.evaluateInclineSlip(0.0, mu_s);
  assert.equal(flatSlip.shouldSlip, false);
  assert.equal(flatSlip.tangentialAcceleration, 0);

  // 4. Negative angles (e.g. -15 degrees)
  const negSlip = StabilityEvaluator.evaluateInclineSlip(-15.0, mu_s);
  assert.equal(negSlip.shouldSlip, false);
});

test('Suite 5.3: Overdamped (zeta >= 1.0) and negative time robustness in micro-wobble math', () => {
  const theta0 = 0.05;

  // 1. Negative time: t <= 0 must return theta0 without NaN
  const angleNeg = StabilityEvaluator.computeMicroWobbleAngle(-0.5, theta0);
  assert.equal(angleNeg, theta0);

  // 2. Critically damped (zeta = 1.0): wd = 0, cos(0) = 1, theta(t) = theta0 * exp(-wn * t)
  const critCfg: WobbleConfig = {
    enabled: true,
    initialAngle: theta0,
    dampingRatio: 1.0,
    frequency: 20.0,
    tiltAxis: [1, 0, 0],
  };
  const angleCrit = StabilityEvaluator.computeMicroWobbleAngle(0.1, critCfg);
  const expectedCrit = theta0 * Math.exp(-20.0 * 0.1);
  assert.ok(
    Math.abs(angleCrit - expectedCrit) < 1e-5,
    `Critical damping should produce pure exponential decay: expected ${expectedCrit}, got ${angleCrit}`
  );

  // 3. Overdamped (zeta = 1.5): Math.max(0, 1 - zeta^2) prevents NaN
  const overCfg: WobbleConfig = {
    enabled: true,
    initialAngle: theta0,
    dampingRatio: 1.5,
    frequency: 20.0,
    tiltAxis: [1, 0, 0],
  };
  const angleOver = StabilityEvaluator.computeMicroWobbleAngle(0.1, overCfg);
  assert.ok(Number.isFinite(angleOver), `Overdamped response must be finite, got ${angleOver}`);

  // 4. Asymptotic limit t -> infinity: must decay to 0 without underflow issues
  const angleInf = StabilityEvaluator.computeMicroWobbleAngle(100.0, theta0);
  assert.ok(Math.abs(angleInf) < 1e-15, `At t=100s, angle must be effectively 0, got ${angleInf}`);
});

test('Suite 5.4: Micro-displacement perturbation and tilt axis orthogonality', () => {
  const squarePoly: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];

  // Displacements along 8 compass directions at tension zone distance (d = 0.60m)
  const directions = [
    { name: '+X', dx: 0.6, dz: 0.0, expectedAxis: [0, 0, 1] },
    { name: '-X', dx: -0.6, dz: 0.0, expectedAxis: [0, 0, -1] },
    { name: '+Z', dx: 0.0, dz: 0.6, expectedAxis: [-1, 0, 0] },
    { name: '-Z', dx: 0.0, dz: -0.6, expectedAxis: [1, 0, 0] },
  ];

  for (const dir of directions) {
    const res = StabilityEvaluator.evaluateStability(
      { x: dir.dx, y: 1.0, z: dir.dz },
      squarePoly,
      1.0
    );
    assert.equal(res.zone, 'tension');
    assert.ok(res.wobbleConfig?.enabled);

    const axis = res.wobbleConfig!.tiltAxis;
    // Dot product between displacement vector and tilt axis must be exactly 0 (perpendicular)
    const dot = dir.dx * axis[0] + dir.dz * axis[2];
    assert.ok(
      Math.abs(dot) < 1e-4,
      `${dir.name}: tilt axis (${axis}) must be orthogonal to displacement vector (${dir.dx}, ${dir.dz}), dot=${dot}`
    );

    // Tilt axis must have unit length
    const axisLen = Math.hypot(axis[0], axis[1], axis[2]);
    assert.ok(
      Math.abs(axisLen - 1.0) < 1e-3,
      `${dir.name}: tilt axis magnitude must be 1.0, got ${axisLen}`
    );
  }
});

test('Suite 5.5: Multi-Stone Stack Stability: Composite COM with 4 stacked stones', () => {
  const baseStone = new Stone({
    shape: 'boulder',
    color: '#2C3038',
    pose: Pose.origin(),
  });

  // 3 upper stones stacked with progressively increasing offset in +X
  const upperStones = [
    {
      stone: new Stone({
        shape: 'flat',
        color: '#4E5868',
        pose: new Pose({ x: 0.10, y: 0.25, z: 0 }),
      }),
      mass: 1.5,
    },
    {
      stone: new Stone({
        shape: 'round',
        color: '#8D99AE',
        pose: new Pose({ x: 0.20, y: 0.50, z: 0 }),
      }),
      mass: 1.0,
    },
    {
      stone: new Stone({
        shape: 'pebble',
        color: '#D4CCC2',
        pose: new Pose({ x: 0.30, y: 0.75, z: 0 }),
      }),
      mass: 0.5,
    },
  ];

  // Expected composite COM:
  // totalMass = 1.5 + 1.0 + 0.5 = 3.0
  // sumX = 1.5*0.10 + 1.0*0.20 + 0.5*0.30 = 0.15 + 0.20 + 0.15 = 0.50
  // X_comp = 0.50 / 3.0 = 0.1667
  const stackEval = StabilityEvaluator.evaluateStackStability(baseStone, upperStones);
  assert.equal(stackEval.isStable, true, 'Composite stack must be stable');
  assert.ok(
    Math.abs(stackEval.com2D[0] - (0.50 / 3.0)) < 1e-3,
    `Composite COM X mismatch: expected ~0.1667, got ${stackEval.com2D[0]}`
  );

  // Eccentricity ratio must reflect the composite offset
  assert.ok(stackEval.eccentricityRatio > 0 && stackEval.eccentricityRatio < 1.0);
});

