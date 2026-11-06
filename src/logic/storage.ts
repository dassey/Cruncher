/** Key-value storage abstraction: localStorage in the browser, memory in tests. */
export interface KV {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export class MemoryKV implements KV {
  readonly data = new Map<string, string>();
  get(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  set(key: string, value: string): void {
    this.data.set(key, value);
  }
  remove(key: string): void {
    this.data.delete(key);
  }
}

/** localStorage wrapper that never throws (private mode, quota, disabled storage). */
export class BrowserKV implements KV {
  private fallback = new MemoryKV();
  get(key: string): string | null {
    try {
      return globalThis.localStorage?.getItem(key) ?? this.fallback.get(key);
    } catch {
      return this.fallback.get(key);
    }
  }
  set(key: string, value: string): void {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      /* ignore */
    }
    this.fallback.set(key, value);
  }
  remove(key: string): void {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      /* ignore */
    }
    this.fallback.remove(key);
  }
}

export function readJSON(kv: KV, key: string): unknown {
  const raw = kv.get(key);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function writeJSON(kv: KV, key: string, value: unknown): void {
  kv.set(key, JSON.stringify(value));
}
