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
    tag?: string | null;
    displayName?: string | null;
    isGuest: boolean;
  };
}

/**
 * Spring Boot MSA (`user-auth-service` :8081 via Gateway :8080) 인증 어댑터
 * Apple / Kakao / Google OAuth2 및 게스트 로그인, 게스트 계정 연결(`link`), 회원 탈퇴를 담당한다.
 * 근거: API 명세서.md API-01, API-02, API-17, API-18, D-007
 */
export class MsaAuthService implements AuthService {
  private readonly http: MsaHttpClient;
  private currentProfile: UserProfile | null = null;

  constructor(http: MsaHttpClient) {
    this.http = http;
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('wishstone_auth_profile');
        if (raw) {
          const parsed = JSON.parse(raw);
          this.currentProfile = {
            id: parsed.id,
            nickname: parsed.nickname ? new Nickname(parsed.nickname, parsed.tag) : null,
            isGuest: parsed.isGuest ?? true,
          };
        }
      } catch {
        // Non-blocking
      }
    }
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
      tag?: string | null;
      displayName?: string | null;
      isGuest: boolean;
    }>('PUT', '/api/v1/users/me/nickname', {
      nickname: nickname.toRequestPayload(),
    });

    const rawNick = res.displayName ?? res.nickname;
    const explicitTag =
      res.tag ??
      (rawNick.includes('#')
        ? undefined
        : nickname.hasExplicitTag
          ? nickname.tag
          : undefined);

    const updated: UserProfile = {
      id: res.id,
      nickname: new Nickname(rawNick, explicitTag),
      isGuest: res.isGuest,
    };
    this.currentProfile = updated;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('wishstone_auth_profile', JSON.stringify({ id: updated.id, nickname: updated.nickname?.displayName ?? null, tag: updated.nickname?.tag ?? null, isGuest: updated.isGuest }));
      } catch {}
    }
    return updated;
  }

  async signOut(): Promise<void> {
    this.http.setAccessToken(null);
    this.currentProfile = null;
    if (typeof localStorage !== 'undefined') { try { localStorage.removeItem('wishstone_auth_profile'); } catch {} }
  }

  async deleteAccount(): Promise<void> {
    await this.http.request('DELETE', '/api/v1/users/me');
    this.http.setAccessToken(null);
    this.currentProfile = null;
    if (typeof localStorage !== 'undefined') { try { localStorage.removeItem('wishstone_auth_profile'); } catch {} }
  }

  currentUser(): UserProfile | null {
    return this.currentProfile;
  }

  private applySession(dto: AuthResponseDto): AuthSession {
    this.http.setAccessToken(dto.accessToken);
    const rawNick = dto.user.displayName ?? dto.user.nickname;
    const profile: UserProfile = {
      id: dto.user.id,
      nickname: rawNick
        ? new Nickname(rawNick, dto.user.tag ?? undefined)
        : null,
      isGuest: dto.user.isGuest,
    };
    this.currentProfile = profile;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('wishstone_auth_profile', JSON.stringify({ id: profile.id, nickname: rawNick ?? null, tag: dto.user.tag ?? null, isGuest: profile.isGuest }));
      } catch {}
    }
    return {
      accessToken: dto.accessToken,
      user: profile,
    };
  }
}
