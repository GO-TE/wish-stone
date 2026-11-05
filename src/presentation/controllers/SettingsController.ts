import { createMsaAppContainer } from '../../container.ts';
import {
  type AuthProvider,
  type UserProfile,
} from '../../domain/ports/AuthService.ts';
import {
  DailyWishQuota,
  type DailyWishQuotaProps,
} from '../../domain/value-objects/DailyWishQuota.ts';
import { Nickname } from '../../domain/value-objects/Nickname.ts';

export interface SettingsViewState {
  readonly user: UserProfile | null;
  readonly quota: DailyWishQuota;
  readonly linkAccountModalOpen: boolean;
  readonly withdrawModalOpen: boolean;
  readonly accountDeleted: boolean;
  readonly statusMessage: string | null;
}

/**
 * 설정·프로필·닉네임#태그 변경·일일 쿼터 현황 및 계정 연동·회원 탈퇴 컨트롤러 (SCR-17 ~ SCR-18)
 * - 프로필 조회 및 배틀태그(`닉네임#태그`, 예: `제미나이#real`) 변경 (API-01, D-015)
 * - 오늘의 소원 쿼터 현황(기본 5개 + 리워드 보너스 쿼터, 남은 횟수) 조회 및 리워드 보너스 충전 (D-018)
 * - 게스트 계정 소셜 연동 모달 제어 및 Apple/Kakao/Google 계정 승격 연결 (API-18, D-007)
 * - 로그아웃 및 회원 탈퇴 확인 모달 제어 (`deleteAccount`)
 */
export class SettingsController {
  private readonly app: ReturnType<typeof createMsaAppContainer>;
  private state: SettingsViewState;

  constructor(
    app = createMsaAppContainer(),
    initialQuotaProps: DailyWishQuotaProps = {
      baseQuota: 5,
      bonusQuota: 0,
      usedCount: 0,
    }
  ) {
    this.app = app;
    this.state = {
      user: this.app.auth.currentUser(),
      quota: new DailyWishQuota(initialQuotaProps),
      linkAccountModalOpen: false,
      withdrawModalOpen: false,
      accountDeleted: false,
      statusMessage: null,
    };
  }

  getState(): SettingsViewState {
    return this.state;
  }

  /**
   * 현재 로그인된 사용자 프로필 및 쿼터 상태 동기화
   */
  refreshProfile(): SettingsViewState {
    this.state = {
      ...this.state,
      user: this.app.auth.currentUser(),
    };
    return this.state;
  }

  /**
   * SCR-17 배틀태그(`닉네임#태그`) 변경 (API-01, D-015)
   */
  async updateNickname(
    rawInput: string,
    explicitTag?: string
  ): Promise<UserProfile> {
    const nextNickname = new Nickname(rawInput, explicitTag);
    const updatedUser = await this.app.auth.setNickname(nextNickname);
    this.state = {
      ...this.state,
      user: updatedUser,
      statusMessage: `닉네임이 ${updatedUser.nickname?.displayName}(으)로 변경되었습니다.`,
    };
    return updatedUser;
  }

  /**
   * SCR-17 일일 소원 쿼터 리워드 보너스 충전 (D-018)
   */
  grantRewardBonusQuota(amount = 1): DailyWishQuota {
    const nextQuota = this.state.quota.grantRewardBonus(amount);
    this.state = {
      ...this.state,
      quota: nextQuota,
      statusMessage: `보너스 소원 횟수 +${amount}회가 충전되었습니다.`,
    };
    return nextQuota;
  }

  /**
   * SCR-18 게스트 계정 소셜 연동 모달 열기/닫기
   */
  openLinkAccountModal(): SettingsViewState {
    this.state = {
      ...this.state,
      linkAccountModalOpen: true,
    };
    return this.state;
  }

  closeLinkAccountModal(): SettingsViewState {
    this.state = {
      ...this.state,
      linkAccountModalOpen: false,
    };
    return this.state;
  }

  /**
   * SCR-18 게스트 계정을 소셜 계정(Apple / Kakao / Google)으로 연동 (API-18, D-007)
   */
  async linkGuestToSocial(
    provider: Exclude<AuthProvider, 'guest'>
  ): Promise<UserProfile> {
    const session = await this.app.auth.linkGuestTo(provider);
    this.state = {
      ...this.state,
      user: session.user,
      linkAccountModalOpen: false,
      statusMessage: `${provider.toUpperCase()} 소셜 계정과 성공적으로 연동되었습니다.`,
    };
    return session.user;
  }

  /**
   * SCR-18 회원 탈퇴 확인 모달 열기/닫기
   */
  openWithdrawModal(): SettingsViewState {
    this.state = {
      ...this.state,
      withdrawModalOpen: true,
    };
    return this.state;
  }

  closeWithdrawModal(): SettingsViewState {
    this.state = {
      ...this.state,
      withdrawModalOpen: false,
    };
    return this.state;
  }

  /**
   * 로그아웃
   */
  async signOut(): Promise<SettingsViewState> {
    await this.app.auth.signOut();
    this.state = {
      ...this.state,
      user: null,
      statusMessage: '로그아웃되었습니다.',
    };
    return this.state;
  }

  /**
   * SCR-18 회원 탈퇴 실행
   */
  async withdrawAccount(): Promise<SettingsViewState> {
    if (this.app.auth.deleteAccount) {
      await this.app.auth.deleteAccount();
    } else {
      await this.app.auth.signOut();
    }
    this.state = {
      ...this.state,
      user: null,
      withdrawModalOpen: false,
      accountDeleted: true,
      statusMessage: '회원 탈퇴가 완료되었습니다.',
    };
    return this.state;
  }
}
