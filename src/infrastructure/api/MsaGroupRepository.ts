import {
  Group,
  type GroupId,
  type GroupProps,
} from '../../domain/entities/Group.ts';
import { type GroupRepository } from '../../domain/ports/repositories.ts';
import { MsaHttpClient } from './MsaHttpClient.ts';

/**
 * Spring Boot MSA (`group-service` :8084 via Gateway :8080) 지인 그룹 어댑터
 * 근거: API 명세서.md API-12 ~ API-15
 */
export class MsaGroupRepository implements GroupRepository {
  private readonly http: MsaHttpClient;

  constructor(http: MsaHttpClient) {
    this.http = http;
  }

  async create(name: string): Promise<Group> {
    const dto = await this.http.request<GroupProps>('POST', '/api/v1/groups', {
      name,
    });
    return new Group(dto);
  }

  async join(inviteCode: string): Promise<Group> {
    const dto = await this.http.request<GroupProps>(
      'POST',
      '/api/v1/groups/join',
      { inviteCode }
    );
    return new Group(dto);
  }

  async mine(): Promise<Group[]> {
    const list = await this.http.request<GroupProps[]>(
      'GET',
      '/api/v1/groups/me'
    );
    return list.map((dto) => new Group(dto));
  }

  async leave(id: GroupId): Promise<void> {
    await this.http.request(
      'DELETE',
      `/api/v1/groups/${encodeURIComponent(id)}/members/me`
    );
  }
}
