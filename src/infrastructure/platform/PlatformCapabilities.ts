/**
 * 플랫폼 기능 탐지 포트 및 기본 구현
 * 화면 계층에서 `Platform.OS` 분기를 직접 쓰지 않도록 한 곳에서 판별한다.
 * 근거: 아키텍처 설계.md 1·5장, DB-027, DB-028
 */
export interface PlatformCapabilities {
  readonly isNative: boolean;
  hasARKitOrARCore(): Promise<boolean>;
  hasWebXRImmersiveAR(): Promise<boolean>;
  hasCamera(): Promise<boolean>;
}

export class BrowserAndNativeCapabilities implements PlatformCapabilities {
  readonly isNative: boolean;

  constructor(isNative = false) {
    this.isNative = isNative;
  }

  async hasARKitOrARCore(): Promise<boolean> {
    if (!this.isNative) return false;
    return true;
  }

  async hasWebXRImmersiveAR(): Promise<boolean> {
    if (this.isNative) return false;
    const nav = (globalThis as { navigator?: { xr?: { isSessionSupported?: (mode: string) => Promise<boolean> } } }).navigator;
    if (!nav?.xr?.isSessionSupported) return false;
    try {
      return await nav.xr.isSessionSupported('immersive-ar');
    } catch {
      return false;
    }
  }

  async hasCamera(): Promise<boolean> {
    if (this.isNative) return true;
    const nav = (globalThis as { navigator?: { mediaDevices?: { getUserMedia?: unknown } } }).navigator;
    return Boolean(nav?.mediaDevices && typeof nav.mediaDevices.getUserMedia === 'function');
  }
}
