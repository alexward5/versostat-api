const DEFAULT_TTL_MS = 1_800_000; // 30 min

interface Entry<T> {
    value: T;
    expiresAt: number;
}

export function createCache<T>(ttlMs: number = DEFAULT_TTL_MS) {
    let entry: Entry<T> | null = null;

    return {
        get(): T | null {
            if (!entry || Date.now() > entry.expiresAt) return null;
            return entry.value;
        },
        set(value: T): void {
            entry = { value, expiresAt: Date.now() + ttlMs };
        },
        invalidate(): void {
            entry = null;
        },
    };
}
