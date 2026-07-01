# Drone Weather — Decision-first UX proposal

> Status: **Iteration 1 landed (2026-07-01).** Iterations 2–3 are planned. This doc records the
> information architecture; the function-level contracts live in [spec.md](spec.md) (see §8).

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
- `RiskFactors` — the six weather factors (wind, gust, visibility, moisture, ceiling, icing), each
  with its own reason. Never a black box.
- `VerticalHazardStrip` — the ops-band conclusion in one line (*"Ops band 0–120 m: low vertical
  hazard · cloud base above ops ceiling"*), so the app's unique vertical signal stays visible even
  though the full chart is collapsed below.
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
- **Iteration 2:** daylight / sunrise-sunset / civil twilight / golden hour — a pure `domain/sun.ts`
  (NOAA solar equations, offline, device-local time labelled as such, tz-swappable), a Layer-2
  `DaylightStrip` + the reserved banner line. Darkness raises CAUTION (usable light), never
  auto-NO-FLY.
- **Iteration 3:** short-term forecast (next 1–3 h) — Open-Meteo hourly look-ahead (+ `wind_gusts_10m`),
  a pure `domain/forecast.ts` trend summary, a Layer-2 `ForecastStrip` + the reserved banner line.
- **Future (unscheduled):** aircraft profiles (Generic / C0 / custom), true location timezone, a
  dedicated precipitation risk component, model surface pressure (labelled "Model pressure", never
  "QNH").
