import { type CategoryCode } from './TowerKey.ts';

const CATEGORY_KEYWORDS: Record<CategoryCode, readonly string[]> = {
  job: ['취업', '합격', '면접', '이직', '출근', '퇴사', '연봉', '회사', '자소서', '채용', '공채'],
  study: ['수능', '시험', '학점', '공부', '자격증', '장학금', '대학', '성적', '만점', '중간고사', '기말고사'],
  health: ['건강', '수술', '아프', '완치', '병원', '회복', '다이어트', '체력', '장수', '쾌유'],
  relation: ['연애', '사랑', '가족', '친구', '부모님', '엄마', '아빠', '결혼', '화해', '인연', '행복'],
  etc: [],
};

/**
 * 소원 본문 기반 카테고리 자동 분류기 (클라이언트 실시간 프리뷰 & 서버 기본 분류 규칙 동기화)
 * 근거: D-016, DB-004
 */
export const CategoryAutoClassifier = {
  classify(content: string): CategoryCode {
    const trimmed = content.trim();
    if (!trimmed) return 'etc';

    let bestCategory: CategoryCode = 'etc';
    let maxMatches = 0;

    for (const code of ['job', 'study', 'health', 'relation'] as const) {
      let matches = 0;
      for (const kw of CATEGORY_KEYWORDS[code]) {
        if (trimmed.includes(kw)) {
          matches += 1;
        }
      }
      if (matches > maxMatches) {
        maxMatches = matches;
        bestCategory = code;
      }
    }

    return bestCategory;
  },
} as const;
