import { createMsaAppContainer } from '../../container.ts';
import { Group, type GroupId } from '../../domain/entities/Group.ts';
import { type AuthProvider, type UserProfile } from '../../domain/ports/AuthService.ts';

export interface GroupViewState {
  readonly groups: readonly Group[];
  readonly selectedGroup: Group | null;
  readonly requiresSocialLinkPrompt: boolean;
  readonly promptMessage: string | null;
}

/**
 * 지인 그룹 돌탑 관리 컨트롤러 (SCR-15 ~ SCR-16)
 * - SCR-15: 내가 속한 지인 그룹 목록 조회 (API-14, DB-005)
 * - SCR-16: 그룹 만들기(8자리 초대 코드 발급, API-12) 및 초대 코드로 그룹 참여(API-13), 그룹 나가기(API-15)
 * - 게스트 보호 규칙(D-007): 게스트 계정(`isGuest === true`)이 그룹 생성·참여를 시도할 때
 *   기기 변경 시 그룹 돌탑 접근 권한이 유실되지 않도록 소셜 계정 연동(`linkGuestTo`) 안내 상태를 활성화한다.
 */
export class GroupController {
  private readonly app: ReturnType<typeof createMsaAppContainer>;
  private state: GroupViewState = {
    groups: [],
    selectedGroup: null,
    requiresSocialLinkPrompt: false,
    promptMessage: null,
  };

  constructor(app = createMsaAppContainer()) {
    this.app = app;
  }

  getState(): GroupViewState {
    return this.state;
  }

  /**
   * SCR-15 내가 속한 그룹 목록 조회 (API-14)
   */
  async loadMyGroups(): Promise<GroupViewState> {
    const groups = await this.app.repositories.groups.mine();
    this.state = {
      ...this.state,
      groups,
    };
    return this.state;
  }

  /**
   * 게스트 계정 여부 확인 및 소셜 계정 연동 안내 활성화 (D-007)
   */
  checkGuestLinkRecommendation(): boolean {
    const user: UserProfile | null = this.app.auth.currentUser();
    if (user?.isGuest) {
      this.state = {
        ...this.state,
        requiresSocialLinkPrompt: true,
        promptMessage:
          '게스트 계정은 기기 변경 시 지인 그룹 돌탑이 사라질 수 있어요. 소셜 계정(카카오/Apple/Google)을 연동하면 데이터가 그대로 유지됩니다.',
      };
      return true;
    }
    this.state = {
      ...this.state,
      requiresSocialLinkPrompt: false,
      promptMessage: null,
    };
    return false;
  }

  /**
   * 게스트 계정을 소셜 계정으로 즉시 연동 (API-18, D-007)
   */
  async linkGuestAccount(
    provider: Exclude<AuthProvider, 'guest'>
  ): Promise<UserProfile> {
    const session = await this.app.auth.linkGuestTo(provider);
    this.state = {
      ...this.state,
      requiresSocialLinkPrompt: false,
      promptMessage: null,
    };
    return session.user;
  }

  /**
   * SCR-16 지인 그룹 생성 (API-12, DB-005)
   */
  async createGroup(name: string): Promise<Group> {
    this.checkGuestLinkRecommendation();
    const created = await this.app.repositories.groups.create(name.trim());
    this.state = {
      ...this.state,
      groups: [...this.state.groups, created],
      selectedGroup: created,
    };
    return created;
  }

  /**
   * SCR-16 8자리 초대 코드로 지인 그룹 참여 (API-13, DB-005)
   */
  async joinGroup(inviteCode: string): Promise<Group> {
    const trimmed = inviteCode.trim();
    if (!trimmed) {
      throw new Error('INVITE_CODE_REQUIRED');
    }
    this.checkGuestLinkRecommendation();
    const joined = await this.app.repositories.groups.join(trimmed);
    const exists = this.state.groups.some((g) => g.id === joined.id);
    this.state = {
      ...this.state,
      groups: exists ? this.state.groups : [...this.state.groups, joined],
      selectedGroup: joined,
    };
    return joined;
  }

  /**
   * 그룹 나가기 (API-15, DB-005)
   */
  async leaveGroup(groupId: GroupId): Promise<GroupViewState> {
    await this.app.repositories.groups.leave(groupId);
    this.state = {
      ...this.state,
      groups: this.state.groups.filter((g) => g.id !== groupId),
      selectedGroup:
        this.state.selectedGroup?.id === groupId
          ? null
          : this.state.selectedGroup,
    };
    return this.state;
  }
}
