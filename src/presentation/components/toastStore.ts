export type ToastVariant = 'cheer' | 'wish_deleted' | 'quota_charged' | 'network_error' | 'info';

export interface ToastMessage {
  readonly id: string;
  readonly variant: ToastVariant;
  readonly text: string;
  readonly durationMs: number;
  readonly createdAt: number;
}

export type ToastListener = (toasts: readonly ToastMessage[]) => void;

export const EMOTIONAL_TOAST_PRESETS: Record<
  Exclude<ToastVariant, 'info'>,
  { readonly text: string; readonly durationMs: number }
> = {
  cheer: {
    text: '누군가의 마음에 불꽃이 닿았습니다 🔥',
    durationMs: 2600,
  },
  wish_deleted: {
    text: '마음을 담은 돌을 조용히 내려놓았습니다 🪨',
    durationMs: 2800,
  },
  quota_charged: {
    text: '오늘 돌을 올릴 수 있는 새로운 마음이 채워졌습니다 ✨',
    durationMs: 2800,
  },
  network_error: {
    text: '바람이 잠시 멈추었어요. 연결 상태를 확인한 뒤 다시 시도해 주세요 🍃',
    durationMs: 3600,
  },
};

/**
 * 감성 미니멀 토스트 알림 스토어 (`SCR-01 ~ SCR-18` 공용)
 * 외부 라이브러리 의존성 없이 순수 TypeScript 옵저버 패턴으로 동작하여 단위 테스트 및 React 컴포넌트 양쪽에서 사용 가능하다.
 */
export class ToastStore {
  private toasts: ToastMessage[] = [];
  private readonly listeners = new Set<ToastListener>();
  private seq = 0;

  getToasts(): readonly ToastMessage[] {
    return this.toasts;
  }

  subscribe(listener: ToastListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  show(
    variant: ToastVariant,
    customText?: string,
    customDurationMs?: number
  ): ToastMessage {
    const preset =
      variant !== 'info'
        ? EMOTIONAL_TOAST_PRESETS[variant]
        : { text: customText ?? '', durationMs: 2500 };

    const msg: ToastMessage = {
      id: `toast-${++this.seq}`,
      variant,
      text: customText ?? preset.text,
      durationMs: customDurationMs ?? preset.durationMs,
      createdAt: Date.now(),
    };

    this.toasts = [...this.toasts, msg];
    this.notify();
    return msg;
  }

  showCheerSuccess(): ToastMessage {
    return this.show('cheer');
  }

  showWishDeleted(): ToastMessage {
    return this.show('wish_deleted');
  }

  showQuotaCharged(bonusAmount = 1): ToastMessage {
    return this.show(
      'quota_charged',
      `오늘 돌을 올릴 수 있는 새로운 마음이 +${bonusAmount}회 채워졌습니다 ✨`
    );
  }

  showNetworkError(customDetail?: string): ToastMessage {
    return this.show('network_error', customDetail);
  }

  dismiss(id: string): void {
    const next = this.toasts.filter((t) => t.id !== id);
    if (next.length !== this.toasts.length) {
      this.toasts = next;
      this.notify();
    }
  }

  clear(): void {
    if (this.toasts.length > 0) {
      this.toasts = [];
      this.notify();
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.toasts);
    }
  }
}

export const defaultToastStore = new ToastStore();
