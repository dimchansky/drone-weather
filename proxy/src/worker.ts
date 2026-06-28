/**
 * Drone Weather — METAR/TAF CORS proxy (Cloudflare Worker).
 *
 * NOAA's aviationweather.gov Data API returns rich, keyless JSON but sends NO
 * `Access-Control-Allow-Origin` header, so a browser on another origin cannot call it.
 * This Worker is a thin, keyless pass-through that:
 *   - forwards a small allowlist of query params to the upstream endpoint,
 *   - adds permissive CORS headers,
 *   - sets a stable User-Agent (NOAA asks for one),
 *   - caches responses briefly to be polite and fast.
 *
 * It hides nothing secret (NOAA needs no key) — it only solves CORS + caching, keeping
 * the frontend 100% static. See docs/spec.md §6.
 */

interface Env {
  /** Override the upstream base (defaults to NOAA). */
  UPSTREAM?: string;
}

const DEFAULT_UPSTREAM = 'https://aviationweather.gov/api/data';
const ALLOWED_ENDPOINTS = new Set(['metar', 'taf']);
const ALLOWED_PARAMS = ['ids', 'bbox', 'format', 'hours', 'taf', 'date'];
const CACHE_SECONDS = 120;
const USER_AGENT = 'drone-weather (+https://github.com/dimchansky/drone-weather)';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return withCors(new Response(null, { status: 204 }));
    }
    if (request.method !== 'GET') {
      return withCors(new Response('Method Not Allowed', { status: 405 }));
    }

    const url = new URL(request.url);
    const endpoint = url.pathname.replace(/^\/+/, '').split('/')[0];
    if (!ALLOWED_ENDPOINTS.has(endpoint)) {
      return withCors(new Response('Not Found', { status: 404 }));
    }

    const upstream = new URL(`${env.UPSTREAM ?? DEFAULT_UPSTREAM}/${endpoint}`);
    for (const key of ALLOWED_PARAMS) {
      const value = url.searchParams.get(key);
      if (value != null) upstream.searchParams.set(key, value);
    }
    if (!upstream.searchParams.has('format')) {
      upstream.searchParams.set('format', 'json');
    }

    let resp: Response;
    try {
      resp = await fetch(upstream.toString(), {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
      });
    } catch {
      return withCors(new Response('Upstream fetch failed', { status: 502 }));
    }

    const body = await resp.text();
    const out = new Response(body, {
      status: resp.status,
      headers: {
        'Content-Type': resp.headers.get('Content-Type') ?? 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
      },
    });
    return withCors(out);
  },
};

function withCors(resp: Response): Response {
  resp.headers.set('Access-Control-Allow-Origin', '*');
  resp.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  resp.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  resp.headers.set('Access-Control-Max-Age', '86400');
  return resp;
}
