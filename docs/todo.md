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

## Post-v0.1 enhancements (shipped)
- [x] Robust paste-coordinates parser (`parseCoordinatePair`) + Paste workflow
      (clipboard one-tap + inline fallback field)
- [x] Refresh action (force/revalidate through the cache) with `Refreshing…` state
- [x] Persistence hardened: `partialize` on location/settings; `pasted` source;
      documented startup behavior (see spec §7.1)
- [x] METAR observed time + live-updating age; locale comma-decimal input
- [x] Defensive empty/204 response handling (model fallback for station-less sites)

## Decision-first roadmap (post v0.1) — see [ux-proposal.md](ux-proposal.md)
- [x] Iteration 1 — decision-first 3-layer dashboard (banner + strips + collapsible detail)
- [x] Iteration 2 — daylight / sunrise-sunset / civil twilight / golden hour (`domain/sun.ts`)
- [x] Iteration 3 — short-term 1–3 h forecast (`domain/forecast.ts` + ForecastStrip)

### Next up (prioritized 2026-07-01)
- [x] **Dedicated precipitation risk** — `precipRisk` is a first-class weather factor (own
      `RiskFactors` row before Moisture + verdict/Main-issue contribution); split out of
      `moistureRisk` (no double-count); shares thresholds/labels with `PrecipNowPill`; source-labelled.
- [x] **TAF parsing** — pure `domain/taf.ts` (BASE/FM/BECMG/TEMPO/PROB + wind/gusts/vis/weather/
      clouds, `warnings` partial-parse); `summarizeTaf` near-term hazards → Layer-2 `TafStrip`
      (airport forecast, UTC, CAUTION-cap advisory) + TS banner note; separate from Open-Meteo.
- [x] **True location timezone** — Open-Meteo `timezone=auto` → `LocationTime` on the Brief;
      daylight + TAF-local windows shown in the flight-site zone (UTC secondary for TAF); device
      fallback. No bundled tz dataset.
- [x] **Cloud & ceiling readability (Option D)** — pure `components/Clouds/cloudText.ts` turns
      aviation codes into plain language: human layer labels + "how much sky", height "above
      ground", raw code as a dim secondary tag; `CEILING` tag on BKN/OVC/VV; explained
      severity-coloured CB (NO-FLY) / TCU (CAUTION, card-only) callouts; a drone-relevance line
      vs the 120 m ops band + a ceiling-vs-base explainer. Presentation only — no parser/verdict
      change; raw METAR verbatim. Verified live at LSZB (plain), SBCH (TCU), LSZH (CB).
- [x] **Parser-library evaluation → keep ours (Option D)** — researched `metar-taf-parser`
      (aeharding), `@squawk/weather`, `aewx-metar-parser` + others with real spikes
      (`research/parser-libraries/`, isolated). Kept the in-house parser: libraries can throw on
      valid live reports, expose no partial-parse warnings, and `@squawk` drops MPS/`///`. Full
      write-up + compatibility matrix in [parser-library-research.md](parser-library-research.md).
- [x] **Parser hardening (never-throw, no data loss)** — characterization tests
      (`domain/__tests__/parserHardening.test.ts`) lock never-throw + raw-verbatim + honest
      `warnings`. Plus three small fixes: (B1) automated `//////CB`/`//////TCU` now register as
      convective cloud (feeds `hasThunderstorm`/`hasConvectiveCloud` + the Cloud card; new `'///'`
      unknown-amount cover); (B2) directional visibility `4000E` captured as prevailing metres when
      none set (METAR + TAF); (B3) TAF `INTER` treated as a TEMPO-like group (origin kept in raw).
      WS/TX/TN/turbulence/icing still degrade to `warnings`.

## Backlog / later (see idea doc §13)
- [ ] **Wire TCU / convective cloud into the risk engine as CAUTION** — today a towering-cumulus
      (TCU) layer with no CB and no `TS` group produces no risk signal (`hasConvectiveCloud` in
      `domain/metar.ts` is defined but unused); it is only explained in the Cloud & ceiling card.
      Developing convection is relevant for drones, so TCU should probably become at least a
      CAUTION-level factor (verdict-affecting) — deferred from the presentation-only clouds pass.
- [ ] Aircraft profiles / configurable per-drone thresholds — **deprioritized (optional)**
- [ ] Bundled offline station index (OurAirports-derived)
- [ ] Airspace / legal module (separate, clearly delineated)
- [x] TAF period-by-period detail card (`TafDetailsCard`, Layer 3, decoded helper)
- [ ] Trends/history, i18n, provider fallback chain (CheckWX/AVWX via proxy)
- [ ] Richer icing model (freezing level, supercooled-water indices)
- [ ] Model surface pressure (labelled "Model pressure", never "QNH")
