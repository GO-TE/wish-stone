const FORBIDDEN_WORDS = ['관리자', '운영자', 'admin', 'system'];

/**
 * 사용자 닉네임 값 객체 (2~12자, 금칙어 필터)
 * 근거: API 명세서 API-01, DB-001, D-008
 */
export class Nickname {
  readonly value: string;

  constructor(raw: string) {
    const trimmed = raw.trim();
    if (trimmed.length < 2 || trimmed.length > 12) {
      throw new Error('NICKNAME_INVALID');
    }
    const lower = trimmed.toLowerCase();
    if (FORBIDDEN_WORDS.some((word) => lower.includes(word))) {
      throw new Error('NICKNAME_INVALID');
    }
    this.value = trimmed;
  }

  toString(): string {
    return this.value;
  }
}
