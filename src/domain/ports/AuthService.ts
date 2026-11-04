import { type UserId } from '../entities/Wish.ts';
import { Nickname } from '../value-objects/Nickname.ts';

export type AuthProvider = 'apple' | 'kakao' | 'google' | 'guest';

export interface UserProfile {
  readonly id: UserId;
  readonly nickname: Nickname | null;
  readonly isGuest: boolean;
}

export interface AuthSession {
  readonly accessToken: string;
  readonly user: UserProfile;
}

/**
 * 인증 서비스 포트 (Apple / Kakao / Google / Guest)
 * 근거: 아키텍처 설계.md 4장, API-01, API-17, API-18, D-007
 */
export interface AuthService {
  signIn(provider: AuthProvider): Promise<AuthSession>;
  linkGuestTo(provider: Exclude<AuthProvider, 'guest'>): Promise<AuthSession>;
  setNickname(nickname: Nickname): Promise<UserProfile>;
  signOut(): Promise<void>;
  currentUser(): UserProfile | null;
}
