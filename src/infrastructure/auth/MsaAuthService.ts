import {
  type AuthProvider,
  type AuthService,
  type AuthSession,
  type UserProfile,
} from '../../domain/ports/AuthService.ts';
import { Nickname } from '../../domain/value-objects/Nickname.ts';
import { MsaHttpClient } from '../api/MsaHttpClient.ts';

interface AuthResponseDto {
  accessToken: string;
  user: {
    id: string;
    nickname: string | null;
    isGuest: boolean;
  };
}

/**
 * Spring Boot MSA (`user-auth-service` :8081 via Gateway :8080) 인증 어댑터
 * Apple / Kakao / Google OAuth2 및 게스트 로그인, 게스트 계정 연결(`link`)을 담당한다.
 * 근거: API 명세서.md API-01, API-02, API-17, API-18, D-007
 */
export class MsaAuthService implements AuthService {
  private readonly http: MsaHttpClient;
  private currentProfile: UserProfile | null = null;

  constructor(http: MsaHttpClient) {
    this.http = http;
  }

  async signIn(provider: AuthProvider): Promise<AuthSession> {
    const dto = await this.http.request<AuthResponseDto>(
      'POST',
      '/api/v1/auth/login',
      { provider }
    );
    return this.applySession(dto);
  }

  async linkGuestTo(
    provider: Exclude<AuthProvider, 'guest'>
  ): Promise<AuthSession> {
    const dto = await this.http.request<AuthResponseDto>(
      'POST',
      '/api/v1/auth/link',
      { provider }
    );
    return this.applySession(dto);
  }

  async setNickname(nickname: Nickname): Promise<UserProfile> {
    const res = await this.http.request<{
      id: string;
      nickname: string;
      isGuest: boolean;
    }>('PUT', '/api/v1/users/me/nickname', {
      nickname: nickname.displayName,
    });

    const updated: UserProfile = {
      id: res.id,
      nickname: new Nickname(res.nickname, nickname.tag),
      isGuest: res.isGuest,
    };
    this.currentProfile = updated;
    return updated;
  }

  async signOut(): Promise<void> {
    this.http.setAccessToken(null);
    this.currentProfile = null;
  }

  currentUser(): UserProfile | null {
    return this.currentProfile;
  }

  private applySession(dto: AuthResponseDto): AuthSession {
    this.http.setAccessToken(dto.accessToken);
    const profile: UserProfile = {
      id: dto.user.id,
      nickname: dto.user.nickname ? new Nickname(dto.user.nickname) : null,
      isGuest: dto.user.isGuest,
    };
    this.currentProfile = profile;
    return {
      accessToken: dto.accessToken,
      user: profile,
    };
  }
}
