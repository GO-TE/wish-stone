import { Stone, type StoneShape } from '../../domain/entities/Stone.ts';
import {
  Tower,
  type TowerStats,
  type TowerStoneItem,
} from '../../domain/entities/Tower.ts';
import { type WishStatus } from '../../domain/entities/Wish.ts';
import { type TowerRepository } from '../../domain/ports/repositories.ts';
import { type BloomType } from '../../domain/value-objects/BloomType.ts';
import { type CheerLevelValue } from '../../domain/value-objects/CheerLevel.ts';
import { Pose, type PoseJSON } from '../../domain/value-objects/Pose.ts';
import { type CategoryCode, TowerKey } from '../../domain/value-objects/TowerKey.ts';
import { MsaHttpClient } from './MsaHttpClient.ts';

interface TowerStoneDto {
  id: string;
  content?: string | null;
  categoryCode?: CategoryCode | null;
  stoneShape: StoneShape;
  stoneColor: string;
  pose?: PoseJSON | null;
  status: string;
  bloomType: BloomType | null;
  cheerCount?: number;
  cheerLevel: CheerLevelValue;
  isMine?: boolean;
  nickname: string | null;
  createdAt?: string;
}

interface TowerResponseDto {
  towerKey: string;
  stones: TowerStoneDto[];
  hasMore: boolean;
}

/**
 * Spring Boot MSA (`wish-tower-service` :8082 + Redis `tower:stats`) 돌탑 조회 어댑터
 * 근거: API 명세서.md API-03, API-04
 */
export class MsaTowerRepository implements TowerRepository {
  private readonly http: MsaHttpClient;

  constructor(http: MsaHttpClient) {
    this.http = http;
  }

  async get(key: TowerKey, limit = 200): Promise<Tower> {
    const encodedKey = encodeURIComponent(key.toString());
    const [towerDto, statsDto] = await Promise.all([
      this.http.request<TowerResponseDto>(
        'GET',
        `/api/v1/towers/${encodedKey}?limit=${limit}`
      ),
      this.http.request<TowerStats>(
        'GET',
        `/api/v1/towers/${encodedKey}/stats`
      ),
    ]);

    const items: TowerStoneItem[] = towerDto.stones.map((s) => {
      const normalizedStatus = (s.status ?? 'active').toLowerCase() as Extract<
        WishStatus,
        'active' | 'fulfilled'
      >;
      return {
        id: s.id,
        content: s.content ?? undefined,
        category: s.categoryCode ?? undefined,
        stone: new Stone({
          shape: s.stoneShape ?? 'round',
          color: s.stoneColor ?? '#A89F91',
          pose: s.pose ? Pose.fromJSON(s.pose) : Pose.identity(),
        }),
        status: normalizedStatus,
        bloom: s.bloomType,
        cheerCount: s.cheerCount ?? 0,
        cheerLevel: s.cheerLevel ?? 0,
        isMine: s.isMine ?? false,
        nickname: s.nickname,
        createdAt: s.createdAt ? new Date(s.createdAt) : undefined,
      };
    });

    return new Tower(key, items, statsDto);
  }
}
