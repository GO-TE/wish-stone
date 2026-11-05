export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Quat {
  readonly qx: number;
  readonly qy: number;
  readonly qz: number;
  readonly qw: number;
}

export interface PoseJSON {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}

/**
 * 돌의 3D 공간 위치 및 회전 상태 (탑 기준 로컬 좌표계)
 * 근거: 데이터 모델.md (wishes.pose), DECISIONS.md (D-010)
 */
export class Pose {
  readonly position: Vec3;
  readonly rotation: Quat;

  constructor(
    position: Vec3 = { x: 0, y: 0, z: 0 },
    rotation: Quat = { qx: 0, qy: 0, qz: 0, qw: 1 }
  ) {
    this.position = Object.freeze({ ...position });
    this.rotation = Object.freeze({ ...rotation });
  }

  static origin(): Pose {
    return new Pose({ x: 0, y: 0, z: 0 }, { qx: 0, qy: 0, qz: 0, qw: 1 });
  }

  static identity(): Pose {
    return Pose.origin();
  }

  /**
   * 3회 연속 물리 안착 실패 시 탑 꼭대기에 자동 배치할 위치 계산 (화면 설계서 SCR-08 4단계)
   */
  static onTopOf(topY: number, stoneHeight = 0.25): Pose {
    return new Pose(
      { x: 0, y: Number((topY + stoneHeight).toFixed(4)), z: 0 },
      { qx: 0, qy: 0, qz: 0, qw: 1 }
    );
  }

  /**
   * AR 월드 좌표를 돌탑 앵커 기준 로컬 좌표로 변환 (데이터 모델.md 3장)
   */
  toTowerLocal(anchor: Pose): Pose {
    return new Pose(
      {
        x: Number((this.position.x - anchor.position.x).toFixed(4)),
        y: Number((this.position.y - anchor.position.y).toFixed(4)),
        z: Number((this.position.z - anchor.position.z).toFixed(4)),
      },
      this.rotation
    );
  }

  static fromJSON(json: PoseJSON): Pose {
    return new Pose(
      { x: json.x, y: json.y, z: json.z },
      { qx: json.qx, qy: json.qy, qz: json.qz, qw: json.qw }
    );
  }

  toJSON(): PoseJSON {
    return {
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
      qx: this.rotation.qx,
      qy: this.rotation.qy,
      qz: this.rotation.qz,
      qw: this.rotation.qw,
    };
  }
}
