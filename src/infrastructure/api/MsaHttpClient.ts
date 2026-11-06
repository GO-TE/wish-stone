export interface ApiErrorPayload {
  readonly code: string;
  readonly message: string;
}

export class MsaApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

export type FetchLike = (
  input: string,
  init?: RequestInit
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

/**
 * Spring Cloud Gateway (:8080) 통신용 공통 HTTP 클라이언트
 * Authorization Bearer JWT 헤더 자동 첨부 및 표준 에러(`{ code, message }`) 변환을 담당한다.
 * 근거: API 명세서.md, 기술 스택.md 3장
 */
export class MsaHttpClient {
  private readonly baseUrl: string;
  private readonly fetchFn: FetchLike;
  private accessToken: string | null = null;

  constructor(
    baseUrl = 'http://localhost:8080',
    fetchFn?: FetchLike
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetchFn = (input, init) => {
      const fn = fetchFn || (globalThis.fetch as unknown as FetchLike);
      return fn.call(globalThis, input, init);
    };

    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem('wishstone_access_token');
        if (saved) {
          this.accessToken = saved;
        }
      } catch {
        // Non-blocking fallback
      }
    }
  }

  setAccessToken(token: string | null): void {
    this.accessToken = token;
    if (typeof localStorage !== 'undefined') {
      try {
        if (token) {
          localStorage.setItem('wishstone_access_token', token);
        } else {
          localStorage.removeItem('wishstone_access_token');
        }
      } catch {
        // Non-blocking fallback
      }
    }
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      let errPayload: ApiErrorPayload = {
        code: 'UNKNOWN_ERROR',
        message: `HTTP ${response.status}`,
      };
      try {
        errPayload = (await response.json()) as ApiErrorPayload;
      } catch {
        // JSON 파싱 실패 시 기본 에러 유지
      }
      throw new MsaApiError(response.status, errPayload.code, errPayload.message);
    }

    if (response.status === 204) {
      return undefined as unknown as T;
    }

    return (await response.json()) as T;
  }
}
