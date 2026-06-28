# METAR/TAF CORS proxy (Cloudflare Worker)

A thin, **keyless** proxy that forwards METAR/TAF requests to NOAA
`aviationweather.gov` and adds the CORS headers that the upstream API omits, so the
static frontend can call it from the browser. See [`../docs/spec.md` §6](../docs/spec.md).

## Why this exists

NOAA's Data API is free and needs no key, but it does **not** send
`Access-Control-Allow-Origin`, so browser `fetch` from another origin is blocked. This
Worker solves only CORS (plus a stable User-Agent and light caching). It stores no
secrets.

## Endpoints

Mirrors the upstream paths, returning JSON by default:

- `GET /metar?ids=KMCI` — METAR for a station
- `GET /metar?bbox=lat1,lon1,lat2,lon2` — all reporting stations in a box (nearest-station discovery)
- `GET /taf?ids=KMCI` — TAF for a station

Forwarded query allowlist: `ids, bbox, format, hours, taf, date`.

## Deploy

Requires a (free) Cloudflare account.

```bash
cd proxy
npx wrangler login
npx wrangler deploy
```

After deploy, copy the printed `*.workers.dev` URL into the frontend's
`VITE_METAR_PROXY_URL` (and the GitHub repo variable `METAR_PROXY_URL` for CI).

## Local test

```bash
cd proxy
npx wrangler dev
# then: curl "http://localhost:8787/metar?ids=KMCI"
```
