// Tiny TTL cache over localStorage for JSON GET requests, with defensive parsing and a
// graceful fallback to a stale entry when the network fails. See docs/spec.md §6.4.

const PREFIX = 'dw-cache:';

interface Entry<T> {
  t: number;
  data: T;
}

interface FetchLike {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

/** Error carrying the endpoint, HTTP status and a body preview for diagnosis. */
export class FetchError extends Error {
  constructor(
    public url: string,
    public status: number,
    public bodyPreview: string,
    message: string,
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

const preview = (text: string): string => text.slice(0, 200).replace(/\s+/g, ' ').trim();

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
 * GET JSON with a TTL cache and defensive parsing.
 *
 * - Fresh cache hits skip the network.
 * - A non-OK status, an unparseable body, or a network failure throws a `FetchError`
 *   (carrying status + body preview) — unless a cached value exists, which is returned.
 * - An empty body (e.g. NOAA's HTTP 204 when a bbox has no stations) resolves to
 *   `undefined` rather than throwing "Unexpected end of JSON input"; callers treat that
 *   as "no data".
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

  let res: FetchLike;
  try {
    res = await doFetch(url);
  } catch (err) {
    if (cached) return cached.data;
    throw err; // genuine network failure
  }

  const text = await res.text().catch(() => '');

  if (!res.ok) {
    if (cached) return cached.data;
    console.warn('[drone-weather] request failed', shortUrl(url), res.status, preview(text));
    throw new FetchError(
      url,
      res.status,
      preview(text),
      `Request to ${shortUrl(url)} failed (HTTP ${res.status}).`,
    );
  }

  if (text.trim() === '') {
    // No content — e.g. NOAA returns 204 with an empty body when a bbox has no stations.
    return undefined as unknown as T;
  }

  try {
    const data = JSON.parse(text) as T;
    writeCache(url, data, nowMs);
    return data;
  } catch {
    if (cached) return cached.data;
    console.warn('[drone-weather] non-JSON response', shortUrl(url), res.status, preview(text));
    throw new FetchError(
      url,
      res.status,
      preview(text),
      `Response from ${shortUrl(url)} was not valid JSON.`,
    );
  }
}
