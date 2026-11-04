const FORBIDDEN_WORDS = ['관리자', '운영자', 'admin', 'system', 'stonewish'];
const TAG_REGEX = /^[a-zA-Z0-9가-힣]{2,10}$/;

/**
 * 사용자 닉네임#태그 값 객체 (배틀태그 방식: 닉네임 2~12자 + #태그 2~10자)
 * 근거: D-015, DB-001, API-01
 */
export class Nickname {
  readonly value: string;
  readonly tag: string;

  constructor(rawInput: string, explicitTag?: string) {
    const trimmed = rawInput.trim();
    let nickPart = trimmed;
    let tagPart = explicitTag?.trim() ?? '';

    const hashIdx = trimmed.indexOf('#');
    if (hashIdx !== -1) {
      nickPart = trimmed.slice(0, hashIdx).trim();
      tagPart = trimmed.slice(hashIdx + 1).trim();
    }

    if (nickPart.length < 2 || nickPart.length > 12) {
      throw new Error('NICKNAME_INVALID');
    }
    const lower = nickPart.toLowerCase();
    if (FORBIDDEN_WORDS.some((word) => lower.includes(word))) {
      throw new Error('NICKNAME_INVALID');
    }

    if (tagPart.length === 0) {
      tagPart = '0000';
    } else if (!TAG_REGEX.test(tagPart)) {
      throw new Error('TAG_INVALID');
    }

    this.value = nickPart;
    this.tag = tagPart;
  }

  get displayName(): string {
    return `${this.value}#${this.tag}`;
  }

  toString(): string {
    return this.displayName;
  }
}
