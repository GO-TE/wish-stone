export const BLOOM_TYPES = ['flower', 'sprout', 'moss'] as const;
export type BloomType = (typeof BLOOM_TYPES)[number];

/**
 * 소원이 이루어졌을 때 돌 위에 피어나는 연출 종류 (DB-020, D-012)
 * 기본값은 랜덤이며 사용자가 직접 선택할 수도 있다.
 */
export const Bloom = {
  isValid(value: string): value is BloomType {
    return (BLOOM_TYPES as readonly string[]).includes(value);
  },

  random(randomFn: () => number = Math.random): BloomType {
    const idx = Math.floor(randomFn() * BLOOM_TYPES.length);
    return BLOOM_TYPES[Math.min(idx, BLOOM_TYPES.length - 1)];
  },
} as const;
