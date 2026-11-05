import { Stone, type StoneShape } from '../../domain/entities/Stone.ts';
import {
  Wish,
  type WishId,
  type WishStatus,
} from '../../domain/entities/Wish.ts';
import {
  type NewWishInput,
  type ReportReason,
  type WishRepository,
} from '../../domain/ports/repositories.ts';
import { type BloomType } from '../../domain/value-objects/BloomType.ts';
import {
  CheerLevel,
  type CheerLevelValue,
} from '../../domain/value-objects/CheerLevel.ts';
import { Pose, type PoseJSON } from '../../domain/value-objects/Pose.ts';
import {
  type CategoryCode,
  TowerKey,
} from '../../domain/value-objects/TowerKey.ts';
import { MsaHttpClient } from './MsaHttpClient.ts';

interface WishDto {
  id: string;
  content: string;
  categoryCode: CategoryCode;
  groupId: string | null;
  stoneShape: StoneShape;
  stoneColor: string;
  pose: PoseJSON;
  status: WishStatus;
  bloomType: BloomType | null;
  cheerLevel: CheerLevelValue;
  cheerCount?: number;
  cheeredByMe?: boolean;
  isMine: boolean;
  nickname?: string | null;
  createdAt: string;
  fulfilledAt?: string | null;
}

/**
 * Spring Boot MSA (`wish-tower-service` :8082 & `interaction-service` :8083 via Gateway :8080) 소원 저장소 어댑터
 * 근거: API 명세서.md API-05 ~ API-11
 */
export class MsaWishRepository implements WishRepository {
  private readonly http: MsaHttpClient;

  constructor(http: MsaHttpClient) {
    this.http = http;
  }

  async create(input: NewWishInput): Promise<WishId> {
    const groupId = input.scope.type === 'group' ? input.scope.value : null;
    const res = await this.http.request<{ id: string; createdAt: string }>(
      'POST',
      '/api/v1/wishes',
      {
        content: input.content,
        categoryCode: input.category,
        groupId,
        stoneShape: input.stone.shape,
        stoneColor: input.stone.color,
        pose: input.stone.pose.toJSON(),
      }
    );
    return res.id;
  }

  async updateCategory(id: WishId, category: CategoryCode): Promise<void> {
    await this.http.request(
      'PATCH',
      `/api/v1/wishes/${encodeURIComponent(id)}/category`,
      { categoryCode: category }
    );
  }

  async random(
    count: number,
    excludeIds: readonly WishId[]
  ): Promise<Wish[]> {
    const query = new URLSearchParams({
      count: String(count),
      excludeIds: excludeIds.join(','),
    });
    const list = await this.http.request<WishDto[]>(
      'GET',
      `/api/v1/wishes/random?${query.toString()}`
    );
    return list.map((dto) => this.toDomain(dto));
  }

  async getById(id: WishId): Promise<Wish | null> {
    const dto = await this.http.request<WishDto | null>(
      'GET',
      `/api/v1/wishes/${encodeURIComponent(id)}`
    );
    return dto ? this.toDomain(dto) : null;
  }

  async mine(filter?: WishStatus): Promise<Wish[]> {
    const query = filter ? `?status=${encodeURIComponent(filter)}` : '';
    const list = await this.http.request<WishDto[]>(
      'GET',
      `/api/v1/wishes/me${query}`
    );
    return list.map((dto) => this.toDomain(dto));
  }

  async cheer(
    id: WishId
  ): Promise<{ level: CheerLevel; levelUp: boolean }> {
    const res = await this.http.request<{
      cheerLevel: CheerLevelValue;
      levelUp: boolean;
    }>('POST', `/api/v1/wishes/${encodeURIComponent(id)}/cheers`);

    return {
      level: CheerLevel.of(res.cheerLevel),
      levelUp: res.levelUp,
    };
  }

  async report(id: WishId, reason: ReportReason): Promise<void> {
    await this.http.request(
      'POST',
      `/api/v1/wishes/${encodeURIComponent(id)}/reports`,
      { reason }
    );
  }

  async reportWish(id: WishId, reason: ReportReason): Promise<void> {
    return this.report(id, reason);
  }

  async fulfill(id: WishId, bloom?: BloomType): Promise<BloomType> {
    const res = await this.http.request<{ bloomType: BloomType }>(
      'PATCH',
      `/api/v1/wishes/${encodeURIComponent(id)}/fulfill`,
      { bloomType: bloom ?? null }
    );
    return res.bloomType;
  }

  async remove(id: WishId): Promise<void> {
    await this.http.request(
      'DELETE',
      `/api/v1/wishes/${encodeURIComponent(id)}`
    );
  }

  private toDomain(dto: WishDto): Wish {
    const scope = dto.groupId
      ? TowerKey.group(dto.groupId)
      : TowerKey.global();

    return new Wish({
      id: dto.id,
      authorNickname: dto.nickname ?? null,
      isMine: dto.isMine,
      content: dto.content,
      category: dto.categoryCode,
      scope,
      stone: new Stone({
        shape: dto.stoneShape,
        color: dto.stoneColor,
        pose: Pose.fromJSON(dto.pose),
      }),
      status: dto.status,
      bloom: dto.bloomType,
      cheerCount: dto.cheerCount ?? 0,
      cheerLevel: CheerLevel.of(dto.cheerLevel),
      cheeredByMe: dto.cheeredByMe ?? false,
      createdAt: new Date(dto.createdAt),
      fulfilledAt: dto.fulfilledAt ? new Date(dto.fulfilledAt) : null,
    });
  }
}
