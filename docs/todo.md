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

## Phase 4 — Data layer
- [ ] `data/cache.ts` (TTL localStorage + last-good brief)
- [ ] `data/noaa.ts` (getMetar, getTaf, nearestStations via bbox)
- [ ] `data/openMeteo.ts` (pressure-level profile, surface fallback)
- [ ] Degradation chain + fixtures captured from live APIs

## Phase 5 — State
- [ ] `locationStore` (GPS/manual, selected station, nearby list)
- [ ] `briefStore` (current brief, fetchedAt, loading/error/stale)
- [ ] `settingsStore` (units, ops ceiling, theme, thresholds)

## Phase 6 — UI (mobile-first)
- [ ] App shell + responsive layout + disclaimer/version footer
- [ ] `Location` (GPS button, manual coords, nearby-station picker)
- [ ] `Station` (distance/bearing/age + far/stale warnings)
- [ ] `RiskSummary` (status chip + headline + component chips w/ reasons + uncertain badge)
- [ ] `Wind` (SVG compass: source + drift + variable arc, units, gust, route advice)
- [ ] `VerticalAnalyzer` (SVG: temp line, cloud base, icing band, zones, 0–120 m focus)
- [ ] `Clouds` (layers ft+m, ceiling, CAVOK/estimate tagging)
- [ ] `ThermoMoisture` (T/Td/RH/spread + interpretation)
- [ ] `RawData` (collapsible raw METAR + TAF, copy)
- [ ] `ReloadPrompt` (reuse)
- [ ] Loading / error / empty / stale / offline states

## Phase 7 — Polish, test, deploy
- [ ] Component tests (risk render, raw-METAR visibility)
- [ ] Accessibility pass (color-not-only, text equivalents, Radix dialogs)
- [ ] Lighthouse/PWA install check on mobile + desktop
- [ ] Deploy Worker (Cloudflare) + frontend (GitHub Pages); verify end-to-end
- [ ] Update README + docs with live URLs

## Backlog / later (see idea doc §13)
- [ ] Configurable per-drone thresholds
- [ ] Bundled offline station index (OurAirports-derived)
- [ ] TAF-aware "fly later?" window suggestion
- [ ] Airspace / legal module (separate, clearly delineated)
- [ ] Trends/history, i18n, provider fallback chain (CheckWX/AVWX via proxy)
- [ ] Richer icing model (freezing level, supercooled-water indices)
