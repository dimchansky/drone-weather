# Drone Weather — Implementation Checklist

> Status tracker for the build. Mirrors azimuth-ledger's TODO convention.
> Specs: [initial-idea.md](initial-idea.md) · [spec.md](spec.md). Last updated 2026-06-28.

## Phase 0 — Documentation & decisions
- [x] `docs/initial-idea.md` — idea, goals, weather concepts, data research, MVP, roadmap
- [x] Data-source research + CORS verification (NOAA blocked, Open-Meteo open)
- [x] Reference review of azimuth-ledger (structure, PWA, deploy, auto-update)
- [x] Decisions locked: Cloudflare Worker proxy · Open-Meteo upper-air in v0.1 · docs-first
- [x] `docs/spec.md` — architecture, types, function contracts, thresholds, UI states
- [x] `docs/todo.md` — this checklist
- [ ] (later) ADRs for any reversed decision

## Phase 1 — Scaffold ✅ (builds green: typecheck + 8 tests + vite/PWA build)
- [x] Vite + React 19 + TypeScript project, `base: '/drone-weather/'`
- [x] `vite-plugin-pwa` (registerType `prompt`) + manifest + icons (192/512/512-maskable)
- [x] Zustand, Vitest + Testing Library, CSS Modules, global.css + theme tokens (light/dark)
- [x] Multi-stage `Dockerfile` (deps→test→build→serve) + `Makefile` + `.dockerignore`
- [x] `.github/workflows/deploy.yml` (test → build → GitHub Pages)
- [x] `index.html` meta tags, no-flash theme bootstrap in `main.tsx`
- [x] `README.md` (overview, dev, deploy, PWA, disclaimer) + `.env.example`

## Phase 2 — Proxy
- [x] Cloudflare Worker: pass-through to aviationweather.gov, CORS header, user-agent, cache
- [x] `wrangler.toml` + `proxy/README.md` (deploy steps)
- [~] Wire `VITE_METAR_PROXY_URL` — build-arg + `.env.example` + CI var done; frontend
      consumption lands in Phase 4 (data layer). Worker not yet deployed (needs Cloudflare acct).

## Phase 3 — Domain layer (pure) + tests ✅ (72 tests green, typecheck + build clean)
- [x] `domain/types.ts`
- [x] `geo.ts` (haversine, bearing, compass point) + tests
- [x] `units.ts` (kt/ms/kmh, ft/m, pressure, round) + tests
- [x] `humidity.ts` (Magnus Td↔RH, spread) + tests
- [x] `clouds.ts` (layers, ceiling, CAVOK, estimated base, priority resolve) + tests
- [x] `metar.ts` (raw parse: wind incl. VRB/var sector, phenomena, CAVOK, VV, CB/TCU, vis) + tests
- [x] `profile.ts` (lapse profile, alt grid, model merge/interpolate) + tests
- [x] `icing.ts` (per-level + band per §5.6) + tests
- [x] `risk.ts` (component risks + `assessRisk` aggregation + confidence downgrade) + tests
- [x] `severity.ts` (shared ordering helpers — added during impl; used by icing + risk)

## Phase 4 — Data layer ✅ (88 tests green incl. fixtures; live smoke test passing)
- [x] `data/cache.ts` (TTL localStorage cache + stale-on-error fallback)
- [x] `data/noaa.ts` (getMetar, getTaf, nearestStations via bbox; obsTime-authoritative age)
- [x] `data/openMeteo.ts` (pressure-level profile in AGL, surface fallback)
- [x] Fixtures captured from live APIs + gated `live.test.ts` (run with `LIVE=1`)
- [x] Worker URL wired: `.env` (local) + CI variable `METAR_PROXY_URL`
- [~] Degradation chain: building blocks done (cache stale fallback, lapse + surface
      fallbacks); the try-METAR→fallback orchestration is wired in Phase 5 (store)

## Phase 5 — State
- [ ] `locationStore` (GPS/manual, selected station, nearby list)
- [ ] `briefStore` (current brief, fetchedAt, loading/error/stale)
- [ ] `settingsStore` (units, ops ceiling, theme, thresholds)

## Phase 6 — UI (mobile-first) ✅ (verified in-browser with live KMCI data)
- [x] App shell + responsive layout + disclaimer/version footer
- [x] `Location` (GPS button + manual coords) and `SettingsBar` (units/theme)
- [x] `Station` (distance/bearing/age + nearby switcher + far/stale warnings)
- [x] `RiskSummary` (overall chip + headline + per-component reasons + uncertain badge)
- [x] `Wind` (SVG compass: source vs drift arrow, variable arc, units, gust, route advice)
- [x] `VerticalAnalyzer` (SVG icing bands + temps + cloud base + ops ceiling, 0–150/1000 m toggle)
- [x] `Clouds` (layers ft+m, ceiling, CAVOK/estimate tagging)
- [x] `Thermo` (T/Td/RH/spread + interpretation + QNH)
- [x] `RawData` (raw METAR + TAF, copy)
- [x] `ReloadPrompt` (reused)
- [x] Loading / error / empty / offline states

## Phase 7 — Polish, test, deploy
- [x] Component tests (risk renders every reason; raw METAR always visible)
- [x] Accessibility basics (severity = colour dot + text label; SVGs have role/aria-label;
      native accessible `select`/form controls)
- [~] PWA: manifest + service worker + offline shell + prompt-update verified in build;
      full Lighthouse audit on devices = later
- [x] Worker deployed (Cloudflare) + frontend (GitHub Pages); end-to-end verified in-browser
- [x] README + docs updated with live URL

## Backlog / later (see idea doc §13)
- [ ] Configurable per-drone thresholds
- [ ] Bundled offline station index (OurAirports-derived)
- [ ] TAF-aware "fly later?" window suggestion
- [ ] Airspace / legal module (separate, clearly delineated)
- [ ] Trends/history, i18n, provider fallback chain (CheckWX/AVWX via proxy)
- [ ] Richer icing model (freezing level, supercooled-water indices)
