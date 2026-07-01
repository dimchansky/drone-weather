# Drone Weather — Decision-first UX proposal

> Status: **Iterations 1–3 landed (2026-07-01).** This doc records the information architecture;
> the function-level contracts live in [spec.md](spec.md) (see §8).

## Why

The app had all the right data but read like a **weather briefing** — a stack of equal-weight,
always-expanded cards. A pilot deciding *from home* had to read the whole page to answer: **is it
worth going out now, and if not, why?** The verdict already existed inside `assessRisk()`; it was
just never distilled to a single dominant reason with the practical magnitude and a suggested
action, and the technical detail was never tucked away.

This restructures the app into three glance-able layers, without weakening the honest,
**decision-support-only** stance: never an overconfident "safe to fly", never a legal authorizer;
sources always labelled; the raw METAR always available verbatim.

## Information architecture (three layers)

**Layer 1 — Decision** (`DecisionBanner`)
- Big **GOOD / CAUTION / HIGH / NO FLY** verdict.
- **Main issue** — the single dominant weather driver with its magnitude, e.g. *"Gusts — 25 kt
  (+10 kt)"*, *"Wind — 4.6 m/s from WNW"*. Hidden when GOOD (nothing to name).
- **Advice** — short, hedged, action-oriented ("start outbound into the wind, return with the
  wind"; "expect a wet airframe…"). Never asserts safety.
- **Reduced confidence** note when the brief is stale/far.
- A reserved secondary line for the Iteration-2 daylight and Iteration-3 forecast strips.

**Layer 2 — Decision support** (compact, always visible)
- `StatusStrip` — data confidence in one line: station · distance · METAR age · fetch time ·
  **QNH** (hPa + inHg). Colored by confidence. Model-only briefs show *"Model only · no nearby
  METAR · model time … · fetched …"* and **never** show QNH (a METAR-derived altimeter setting).
- `PrecipNowPill` — is it (going to be) wet? Source-explicit: *"No precipitation reported now"* /
  *"METAR: rain now"* / *"Model: rain likely"* / *"Model: 70% precip chance"*. A model probability
  never reads as observed.
- `RiskFactors` — the seven weather factors (wind, gust, visibility, **precipitation**, moisture,
  ceiling, icing), each with its own reason. Never a black box.
- `VerticalHazardStrip` — the ops-band conclusion in one line (*"Ops band 0–120 m: low vertical
  hazard · cloud base above ops ceiling"*), so the app's unique vertical signal stays visible even
  though the full chart is collapsed below.
- `ForecastStrip` *(Iteration 3)* — short-term **model** forecast: *"Next 3h (model): wind steady ·
  gusts to 15 kt · no rain expected"* / *"…rain likely in ~45m"*. Colored by the forecast advisory
  (CAUTION when rain/rising wind ahead). Always labelled "model" so it never reads as observed.
- `TafStrip` — the **aviation TAF** near-term hazards in plain language: *"TAF EDDB · airport
  forecast: thunderstorms possible at times 11:00–17:00 (08:00–14:00 UTC)"*. Jargon expanded
  (TEMPO → "possible at times", PROB30 → "30% chance", BECMG → "becoming", FM → "from"); windows are
  **device-local primary, UTC secondary**; adjacent same-kind hazards are aggregated; overflow shows
  an explicit "+N more". Labelled airport-forecast (not your exact site), advisory-only. Separate
  from the model `ForecastStrip`; the raw TAF stays verbatim in the Raw card.
- `DaylightStrip` *(Iteration 2)* — sunrise/sunset · daylight remaining · golden-hour window, or a
  night/twilight advisory. Colored by the daylight severity (CAUTION in twilight/night, never
  NO-FLY). Times are in the **flight-site local time** (Open-Meteo `LocationTime`, device-local
  fallback) and the strip names the zone.
- `WindCompass` — the wind visualization + route advice.

**Layer 3 — Technical detail** (collapsible `Card`, collapsed by default; one tap to open)
- Vertical Hazard Analyzer (full chart), Cloud & ceiling, Temperature & moisture, Station, and
  **Raw METAR/TAF**. Collapsed content stays mounted (`forceMount`), so the raw report is always
  present verbatim and one tap away; the Copy button never toggles the panel.

## What generates the decision

`assessRisk()` (pure) already aggregates weakest-link severity + confidence. Iteration 1 adds two
derived fields to its `RiskSummary` output:
- `primary` — the worst-severity **weather** component, tie-broken by the existing priority order
  (wind → gust → visibility → moisture → ceiling → icing); `null` when GOOD.
- `advice` — a short hedged sentence keyed off `primary`.

The banner shows the magnitude from the component's own `value` (+ compass direction for wind).
Confidence factors (freshness/distance) drive the `StatusStrip`, not the main issue.

## Guardrails

- No "safe to fly"; GOOD stays hedged; the disclaimer stays; reduced confidence always surfaced;
  key station/data-confidence facts stay visible (not buried in a collapsed card).
- All sources labelled honestly (observed METAR vs model vs estimate vs device-local time).
- Compact and mobile-first: Layer 2 is single-line strips; heavy detail collapses.
- Pure domain layer stays dependency-light and table-tested; UI formats, domain decides.

## Roadmap

- **Iteration 1 (done):** the three layers, dominant reason + advice with magnitude, compact QNH,
  source-explicit precip-now, visible confidence + vertical-hazard summaries.
- **Iteration 2 (done):** daylight / sunrise-sunset / civil twilight / golden hour — a pure
  `domain/sun.ts` (NOAA solar equations, offline, device-local time labelled as such, tz-swappable),
  a Layer-2 `DaylightStrip` + the banner secondary line. Twilight/night raise a CAUTION **advisory**
  (colored strip + banner line), never auto-NO-FLY; the weather verdict chip stays weather-only.
- **Iteration 3 (done):** short-term forecast (next 1–3 h) — Open-Meteo hourly look-ahead
  (`forecast_days=2`, + `wind_gusts_10m`), a pure `domain/forecast.ts` trend summary
  (wind/gust trend + rain onset), a Layer-2 `ForecastStrip` + a banner note when notable. Model
  forecast, labelled as such; the observed METAR still drives the verdict.

- **Dedicated precipitation risk (done 2026-07-01):** `precipRisk` (`domain/risk.ts`) is a
  first-class weather factor — rain/drizzle/snow, freezing precip, thunderstorm (METAR), else model
  amount/probability — its own `RiskFactors` row **before** Moisture, and it can be the banner's
  "Main issue". Split out of `moistureRisk` (which now owns fog/dew/near-saturation only → no
  double-count); shares the type label + thresholds with `PrecipNowPill`; source-labelled (METAR vs
  model).

- **TAF parsing (done 2026-07-01):** pure `domain/taf.ts` parses the raw TAF (BASE/FM/BECMG/TEMPO/
  PROB, wind+gusts/vis/weather/clouds) with a `warnings` partial-parse signal for unsupported
  tokens; `summarizeTaf` surfaces near-term hazards (TS, low ceiling/vis, gusts, rain/snow) as a
  Layer-2 `TafStrip` (**airport forecast**, UTC windows, CAUTION-capped advisory) + a banner note
  for thunderstorms. Kept **separate** from the Open-Meteo point forecast — both shown,
  source-labelled; TAF never changes the observed-weather verdict.

- **True location timezone (done 2026-07-01):** the flight-site timezone comes from Open-Meteo
  (`timezone=auto` → `utc_offset_seconds` + IANA name), stored on the Brief as `LocationTime` (no
  bundled tz dataset, no new dependency). Daylight and TAF-local windows now display in the **site's
  local time** with the zone named (e.g. "times America/Chicago"); TAF keeps UTC as the secondary.
  Graceful **device-local fallback** when the model timezone is unavailable (labelled "device local
  time"). The Open-Meteo forecast strip shows only relative durations, so it needed no change.
  Every non-raw clock time follows this rule — the `StatusStrip` (fetch/model time) and `StationCard`
  (METAR observed + fetch time) also render in the flight-site zone; the raw METAR/TAF stay verbatim.

- **TAF period-by-period detail card (done 2026-07-01):** a Layer-3 collapsible `TafDetailsCard`
  between the compact `TafStrip` and the raw TAF — one decoded section per parsed period (human
  type, local + UTC window, unit-aware wind/gusts/visibility, plain-English weather, clouds/ceiling,
  raw group text), with an airport-forecast note and a partial-parse warning. A decoded helper; the
  raw TAF stays verbatim and it never changes the verdict.

### Later / optional (no near-term priority)

- **Aircraft profiles** (Generic / C0 / custom) — **deprioritized** (the raw numbers + generic
  guidance are enough for now); revisit only if there's a clear need.
- Model surface pressure (labelled "Model pressure", never "QNH"); dedicated offline station index;
  richer icing model; localizing the StatusStrip fetch/observed times is done.
