const FORBIDDEN_WORDS = ['관리자', '운영자', 'admin', 'system', 'stonewish'];
const TAG_REGEX = /^[a-zA-Z0-9가-힣]{2,10}$/;

/**
 * 사용자 닉네임#태그 값 객체 (배틀태그 방식: 닉네임 2~12자 + #태그 2~10자)
 * 근거: D-015, DB-001, API-01
 */
export class Nickname {
  readonly value: string;
  readonly tag: string;
  readonly hasExplicitTag: boolean;

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

    const isExplicit = tagPart.length > 0;
    if (!isExplicit) {
      tagPart = '0000';
    } else if (!TAG_REGEX.test(tagPart)) {
      throw new Error('TAG_INVALID');
    }

    this.value = nickPart;
    this.tag = tagPart;
    this.hasExplicitTag = isExplicit;
  }

  /**
   * 서버(API-01)로 전송할 요청 문자열:
   * - 사용자가 태그를 명시적으로 입력한 경우 `닉네임#태그` 전송
   * - 태그를 생략한 경우 `닉네임`만 전송하여 백엔드가 4자리 숫자 태그를 자동 생성하도록 위임 (D-015)
   */
  toRequestPayload(): string {
    return this.hasExplicitTag ? this.displayName : this.value;
  }

  get displayName(): string {
    return `${this.value}#${this.tag}`;
  }

  toString(): string {
    return this.displayName;
  }
}
