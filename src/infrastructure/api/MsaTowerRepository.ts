import { Stone, type StoneShape } from '../../domain/entities/Stone.ts';
import {
  Tower,
  type TowerStats,
  type TowerStoneItem,
} from '../../domain/entities/Tower.ts';
import { type TowerRepository } from '../../domain/ports/repositories.ts';
import { type BloomType } from '../../domain/value-objects/BloomType.ts';
import { type CheerLevelValue } from '../../domain/value-objects/CheerLevel.ts';
import { Pose, type PoseJSON } from '../../domain/value-objects/Pose.ts';
import { TowerKey } from '../../domain/value-objects/TowerKey.ts';
import { MsaHttpClient } from './MsaHttpClient.ts';

interface TowerStoneDto {
  id: string;
  stoneShape: StoneShape;
  stoneColor: string;
  pose: PoseJSON;
  status: 'active' | 'fulfilled';
  bloomType: BloomType | null;
  cheerLevel: CheerLevelValue;
  isMine: boolean;
  nickname: string | null;
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

    const items: TowerStoneItem[] = towerDto.stones.map((s) => ({
      id: s.id,
      stone: new Stone({
        shape: s.stoneShape,
        color: s.stoneColor,
        pose: Pose.fromJSON(s.pose),
      }),
      status: s.status,
      bloom: s.bloomType,
      cheerLevel: s.cheerLevel,
      isMine: s.isMine,
      nickname: s.nickname,
    }));

    return new Tower(key, items, statsDto);
  }
}
