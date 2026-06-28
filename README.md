# Drone Weather

Pre-flight **weather decision-support** PWA for drone pilots. It finds the nearest
aviation weather station from your location, decodes **METAR** (and **TAF**), and turns
it into a drone-oriented brief: wind & drift, cloud base, a low-altitude vertical hazard
profile, icing risk, and a transparent risk summary — always showing *why*.

> **Decision support only — not a legal flight authorization.** It does not assess
> airspace, UAS zones, NOTAMs, or maximum legal altitude. Always verify the raw METAR and
> apply your own aircraft limits and local regulations.

Design docs: [docs/initial-idea.md](docs/initial-idea.md) ·
[docs/spec.md](docs/spec.md) · [docs/todo.md](docs/todo.md)

## Status

🚧 Early development. The project skeleton (PWA, tests, CI) is in place; the weather
features are being implemented against [docs/spec.md](docs/spec.md).

## Architecture (short version)

- **Static frontend** (Vite + React + TypeScript), deployed to GitHub Pages — installable PWA.
- **METAR/TAF** come from NOAA `aviationweather.gov`, which **blocks browser CORS**, so
  requests go through a tiny **keyless Cloudflare Worker proxy** ([`proxy/`](proxy/)) that
  only adds CORS + light caching. No API keys anywhere.
- **Upper-air vertical profile** comes from **Open-Meteo** (CORS-enabled, keyless) — real
  modeled temp/RH/wind aloft, with a naive lapse-rate model as offline fallback.

See [docs/spec.md §1](docs/spec.md) for the full picture.

## Prerequisites

**Docker (primary)** — no global Node install required. Or **Node 22+** as a fallback.

## Development

### Docker workflow (primary)

```bash
make dev       # Vite dev server on http://localhost:5173/
make test      # Unit tests
make build     # Produce dist/ for deployment
make clean     # Remove dist/ and Docker artifacts
```

### Non-Docker fallback

```bash
npm install
npm run dev        # Dev server
npm test           # Unit tests
npm run build      # Production build (typecheck + vite build)
npm run typecheck  # Types only
```

## Configuration

Copy `.env.example` to `.env` and set:

| Var | Purpose |
|---|---|
| `VITE_METAR_PROXY_URL` | Base URL of your deployed Cloudflare Worker (see [`proxy/`](proxy/)) |
| `VITE_APP_VERSION` | Build stamp shown in the footer (CI sets this to the git SHA) |

No secrets live in the frontend bundle. Open-Meteo needs no key; the NOAA proxy needs none either.

## Deploy

- **Frontend:** automatic via GitHub Actions on push to `main` (Settings → Pages →
  Source: **GitHub Actions**). Set the repo variable `METAR_PROXY_URL` so the build wires
  the proxy. Live at `https://dimchansky.github.io/drone-weather/`.
- **Proxy:** deploy the Cloudflare Worker once — see [`proxy/README.md`](proxy/README.md).

## Offline / PWA

Once loaded, the app shell works offline and the last successful brief is cached (clearly
marked stale — fresh weather needs the network). On iOS: Safari → Share → "Add to Home
Screen". New versions show a "Reload" prompt.
