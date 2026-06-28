// Tiny TTL cache over localStorage for JSON GET requests, with graceful fallback to a
// stale entry when the network fails. See docs/spec.md §6.4.

const PREFIX = 'dw-cache:';

interface Entry<T> {
  t: number;
  data: T;
}

interface FetchLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function readCache<T>(key: string): Entry<T> | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as Entry<T>) : null;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, data: T, nowMs: number): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(PREFIX + key, JSON.stringify({ t: nowMs, data }));
  } catch {
    /* ignore quota errors */
  }
}

export interface CacheOptions {
  fetchImpl?: (url: string) => Promise<FetchLike>;
  now?: () => number;
}

/**
 * GET JSON with a TTL cache. Fresh cache hits skip the network; on a network failure a
 * stale cached value is returned if present (graceful degradation), otherwise it throws.
 */
export async function cachedFetchJson<T = unknown>(
  url: string,
  ttlMs: number,
  opts: CacheOptions = {},
): Promise<T> {
  const doFetch = opts.fetchImpl ?? ((u: string) => fetch(u) as unknown as Promise<FetchLike>);
  const nowMs = (opts.now ?? Date.now)();

  const cached = readCache<T>(url);
  if (cached && nowMs - cached.t < ttlMs) return cached.data;

  try {
    const res = await doFetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as T;
    writeCache(url, data, nowMs);
    return data;
  } catch (err) {
    if (cached) return cached.data; // serve stale rather than nothing
    throw err;
  }
}
