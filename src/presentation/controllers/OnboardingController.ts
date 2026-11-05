import {
  type AuthProvider,
  type AuthService,
  type AuthSession,
  type UserProfile,
} from '../../domain/ports/AuthService.ts';
import { Nickname } from '../../domain/value-objects/Nickname.ts';
import { createMsaAppContainer } from '../../container.ts';

export type OnboardingRoute = '/login' | '/onboarding/nickname' | '/home';

export interface NicknameValidationResult {
  readonly valid: boolean;
  readonly previewDisplayName: string | null;
  readonly errorCode: 'NICKNAME_INVALID' | 'TAG_INVALID' | null;
}

export interface OnboardingViewState {
  readonly isAuthenticated: boolean;
  readonly user: UserProfile | null;
  readonly nextRoute: OnboardingRoute;
  readonly lastError: string | null;
}

/**
 * 온보딩·인증 및 닉네임#태그(배틀태그) 설정 화면 컨트롤러 (SCR-01 ~ SCR-03)
 * - SCR-01 스플래시: 자동 로그인 세션 체크 후 `/login`, `/onboarding/nickname`, `/home` 중 이동 경로 결정
 * - SCR-02 로그인: Apple / Kakao / Google / 게스트 로그인 및 게스트 계정 소셜 연결(`linkGuestTo`) 제어 (D-007)
 * - SCR-03 닉네임 설정: `닉네임#태그`(예: `제미나이#real` 또는 미입력 시 기본 태그 부여) 실시간 검증 및 저장 (D-008, D-015)
 */
export class OnboardingController {
  private readonly auth: AuthService;
  private state: OnboardingViewState = {
    isAuthenticated: false,
    user: null,
    nextRoute: '/login',
    lastError: null,
  };

  constructor(auth: AuthService = createMsaAppContainer().auth) {
    this.auth = auth;
  }

  getState(): OnboardingViewState {
    return this.state;
  }

  /**
   * SCR-01 스플래시 자동 로그인 세션 확인
   */
  checkAutoLogin(): OnboardingViewState {
    const current = this.auth.currentUser();
    if (!current) {
      this.state = {
        isAuthenticated: false,
        user: null,
        nextRoute: '/login',
        lastError: null,
      };
      return this.state;
    }

    const nextRoute: OnboardingRoute = current.nickname
      ? '/home'
      : '/onboarding/nickname';

    this.state = {
      isAuthenticated: true,
      user: current,
      nextRoute,
      lastError: null,
    };
    return this.state;
  }

  /**
   * SCR-02 소셜(Apple/Kakao/Google) 및 게스트 로그인 (DB-001, D-007)
   */
  async signIn(provider: AuthProvider): Promise<OnboardingViewState> {
    const session: AuthSession = await this.auth.signIn(provider);
    const nextRoute: OnboardingRoute = session.user.nickname
      ? '/home'
      : '/onboarding/nickname';

    this.state = {
      isAuthenticated: true,
      user: session.user,
      nextRoute,
      lastError: null,
    };
    return this.state;
  }

  /**
   * 게스트 계정을 소셜 계정(Apple/Kakao/Google)으로 승격 연결 (데이터 유지, D-007, API-18)
   */
  async linkGuestAccount(
    provider: Exclude<AuthProvider, 'guest'>
  ): Promise<OnboardingViewState> {
    const session: AuthSession = await this.auth.linkGuestTo(provider);
    const nextRoute: OnboardingRoute = session.user.nickname
      ? '/home'
      : '/onboarding/nickname';

    this.state = {
      isAuthenticated: true,
      user: session.user,
      nextRoute,
      lastError: null,
    };
    return this.state;
  }

  /**
   * SCR-03 닉네임#태그 입력 실시간 유효성 검사 및 프리뷰 제공 (D-015)
   */
  validateNicknameInput(
    rawInput: string,
    explicitTag?: string
  ): NicknameValidationResult {
    try {
      const nickname = new Nickname(rawInput, explicitTag);
      return {
        valid: true,
        previewDisplayName: nickname.displayName,
        errorCode: null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'NICKNAME_INVALID';
      const errorCode =
        message === 'TAG_INVALID' ? 'TAG_INVALID' : 'NICKNAME_INVALID';
      return {
        valid: false,
        previewDisplayName: null,
        errorCode,
      };
    }
  }

  /**
   * SCR-03 닉네임#태그 확정 저장 후 대시보드(`/home`)로 라우팅 (API-01, D-015)
   */
  async submitNickname(
    rawInput: string,
    explicitTag?: string
  ): Promise<OnboardingViewState> {
    try {
      const nickname = new Nickname(rawInput, explicitTag);
      const updatedProfile = await this.auth.setNickname(nickname);
      this.state = {
        isAuthenticated: true,
        user: updatedProfile,
        nextRoute: '/home',
        lastError: null,
      };
      return this.state;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'NICKNAME_INVALID';
      this.state = {
        ...this.state,
        lastError: message,
      };
      throw err;
    }
  }

  async signOut(): Promise<OnboardingViewState> {
    await this.auth.signOut();
    this.state = {
      isAuthenticated: false,
      user: null,
      nextRoute: '/login',
      lastError: null,
    };
    return this.state;
  }
}
