const STORAGE_KEY = 'wishstone_wish_contents_v2';
const MEMORY_CACHE = new Map<string, string>();
let isHydrated = false;

function hydrateFromStorage(): void {
  if (isHydrated) return;
  isHydrated = true;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, string>;
        if (parsed && typeof parsed === 'object') {
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === 'string' && v.trim().length > 0 && !MEMORY_CACHE.has(k)) {
              MEMORY_CACHE.set(k, v);
            }
          }
        }
      }
    }
  } catch {
    // Non-blocking fallback for SSR / restricted storage
  }
}

function persistToStorage(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const obj: Record<string, string> = {};
      for (const [k, v] of MEMORY_CACHE.entries()) {
        obj[k] = v;
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    }
  } catch {
    // Non-blocking fallback
  }
}

export function setCachedWishContent(
  wishId: string | null | undefined,
  content: string | null | undefined
): void {
  if (!wishId || !content || typeof content !== 'string' || content.trim().length === 0) {
    return;
  }
  hydrateFromStorage();
  MEMORY_CACHE.set(wishId, content);
  persistToStorage();
}

export function getCachedWishContent(wishId: string | null | undefined): string | undefined {
  if (!wishId) return undefined;
  hydrateFromStorage();
  return MEMORY_CACHE.get(wishId);
}
