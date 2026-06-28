# Drone Weather — Initial Idea & Specification

> Status: **Draft v0.1** · Last updated: 2026-06-28 · Owner: project lead
>
> This is the foundational product/idea document. It captures *how the idea is
> understood*, the goals and non-goals, assumptions, risks, the weather domain
> concepts the app must support, the data-source research, a first MVP scope, and
> the roadmap. It is intentionally written before any application code. It will be
> kept up to date as architecture and design decisions are made (see
> [Open questions](#15-open-questions--decisions-to-confirm)).

---

## 1. Purpose & vision

**Drone Weather** is a pre-flight, weather-based **decision-support** tool for drone
(UAS) pilots. It is *not* "yet another METAR viewer" and it is *not* an automatic
legal flight authorizer.

The goal is to help a pilot, in the minutes before a flight, answer questions like:

- Is it reasonable to fly *right now* from where I am standing?
- How will the wind affect my route — which way will the drone drift, and which way
  should I fly out vs. come back?
- What altitude band looks safer from a weather point of view?
- Where might moisture, low cloud, or **icing** risk appear, especially in the
  0–120 m band most drones operate in?
- *Why* is the app telling me "good" / "caution" / "high risk" / "no fly"?

The core principle is **transparency over automation**: the app always shows the
raw METAR, the decoded values, and the reasoning behind every warning. The pilot
makes the final decision; the app makes that decision better-informed.

---

## 2. Goals

1. **Work anywhere** — any GPS location, not one hard-coded city.
2. **Start from authoritative aviation data** — METAR (and TAF when available) as the
   primary source, with the raw text always visible for verification.
3. **Find the nearest usable observation** automatically from GPS, with manual
   override (enter/select coordinates, switch between nearby stations).
4. **Decode and explain** weather in drone-relevant terms (wind source vs. drift,
   gusts, visibility, cloud base, temperature/dew point/humidity, icing).
5. **Build a rough vertical profile** (temperature, estimated cloud base, icing band)
   for the low-altitude drone envelope, clearly labelled as a model, not a sounding.
6. **Provide a summarized risk indicator** that is never a black box — every
   component risk has a short, plain-language explanation.
7. **Be a great PWA** — installable, responsive, mobile-first, usable quickly before a
   flight, with a reliable auto-update story.
8. **Stay (mostly) static** — deployable like a static site / GitHub Pages, with at
   most a thin, keyless proxy for the one data source that needs it.

---

## 3. Non-goals (for now)

These are explicitly **out of scope for the first core**, but may come later:

- **Legal flight authorization.** No UAS geographic zones, NOTAMs, airspace classes,
  maximum legal altitude enforcement, or remote-ID / permission checks. The app must
  never imply a flight is *legal* — only comment on *weather*.
- **Per-drone hard limits.** The app does **not** hard-code one model's wind/temperature
  limits. It surfaces the exact numbers + interpretation; the pilot applies their own
  aircraft's limits. (Configurable thresholds are a later improvement.)
- **Flight logging / live telemetry / map mission planning.** This is a pre-flight
  weather brief, not a ground control station.
- **Precision micro-forecasting.** The vertical profile is an approximation for
  decision support, not a numerical weather prediction product.
- **Accounts / cloud sync / multi-user.** No backend user data in the MVP.

---

## 4. Target users & primary workflow

**Primary user:** a hobby/prosumer drone pilot about to fly, often outdoors on a
phone, who wants a fast, honest "should I be worried?" read.

**Primary workflow:**

1. Open the app (ideally from the home screen as an installed PWA).
2. App requests **GPS** coordinates; if denied/unavailable, the user enters or selects
   coordinates manually.
3. App finds the **nearest METAR-capable station** (and lists alternatives nearby).
4. App fetches and decodes **METAR**, plus **TAF** if available.
5. App shows: **raw METAR**, **decoded weather**, and **drone-oriented interpretation**.
6. App builds a **rough vertical weather profile**.
7. App visualizes: **wind** (compass + drift), **cloud base**, **temperature profile**,
   **humidity / dew point** situation, **icing risk band**, and a **summarized risk**.
8. App **explains the reasons** behind every warning.

---

## 5. Assumptions

- METAR from a station a few km away is a **useful approximation** for the flight site,
  *with caveats surfaced* (distance, bearing, age). It is not the truth at the exact spot.
- The pilot is competent and legally responsible; the app advises, it does not decide.
- A modern mobile browser is available (Geolocation API, Service Worker, `fetch`).
- Network is available at brief-time; **full offline forecasting is impossible** (we can
  only cache the last successful brief and the app shell — see PWA section).
- Free, keyless or thin-proxy data sources are sufficient for the MVP (see §9).
- Units: pilot may think in **knots, m/s, or km/h** for wind; **feet and meters** for
  altitude; **°C** for temperature; **hPa** for pressure. The app shows multiple units.

---

## 6. Key risks & mitigations

| Risk | Type | Mitigation |
|---|---|---|
| **Safety/liability** — pilot over-trusts a "GOOD" verdict and flies into trouble | Product/safety | Persistent disclaimer; never claim legality; always show reasoning + data age/distance; conservative wording; "decision support, not authorization". |
| METAR station too far / METAR stale → misleading | Data quality | Show distance, bearing, **age**; warn above thresholds; degrade verdict confidence; offer station switch. |
| **CORS**: canonical METAR API (NOAA) blocks browser calls | Technical | Thin keyless CORS proxy (Cloudflare Worker) for METAR/TAF; keep frontend fully static. Document clearly (see §9). |
| API rate limits / outages | Technical | Cache last good response; proxy-side caching; graceful fallback to Open-Meteo; show "data may be stale". |
| Vertical profile is *modeled*, not measured → false confidence | Product | Label everything "estimate/model"; prefer real upper-air data (Open-Meteo pressure levels) when available; show assumptions (lapse rate). |
| Icing logic oversimplified → dangerous false "low" | Safety | Combine T + moisture + phenomena (not temperature alone); bias toward caution near 0 °C and in moist/precip conditions; explain inputs. |
| API key leakage if a keyed provider is used | Security | Prefer keyless sources; if a key is ever needed, keep it server/proxy-side only — never in frontend bundle (see §9.4). |
| Geolocation denied / inaccurate indoors | UX | Manual coordinate entry / map pick / last-used location fallback. |
| Scope creep into airspace/legal features | Product | Keep §3 non-goals firm for MVP; airspace is a separate, later module. |

---

## 7. Weather domain concepts (functional core)

This section is the heart of the spec — the meteorology the app must implement and
explain. Formulas are given so implementation and tests can be written against them.

### 7.1 METAR as the primary source

METAR (Meteorological Aerodrome Report) is the starting point. From a METAR the app
must decode **at least**:

- Station **ICAO** code
- **Observation time** (and derived **age**)
- **Wind**: direction, speed, **gusts**, **variable** sector (e.g. `280V350`)
- **Visibility**
- **Significant weather** phenomena (e.g. `RA`, `BR`, `FZFG`, `+SN`, `TS`)
- **Cloud layers** (`FEW/SCT/BKN/OVC`, and `VV` vertical visibility)
- **CAVOK**
- **Temperature** and **dew point**
- **QNH** (`Qxxxx` hPa or `Axxxx` inHg)
- **Trend / recent** info if present (e.g. `NOSIG`, `RERA`)

> Example wind group `28009KT` → wind **from 280°** at **9 kt**.
> Example temp/dew `23/07` → **23 °C / dew point 7 °C**.

**The raw METAR text must always remain visible** so advanced users can verify the
app's interpretation.

> **Implementation note (from research):** the NOAA `aviationweather.gov` Data API
> already returns a *semi-decoded* JSON object (`temp`, `dewp`, `wdir`, `wspd`,
> `wgst`, `visib`, `altim`, `clouds[]`, `fltCat`, `rawOb`, station `lat/lon/elev`,
> `name`). We can lean on this and still do our own decoding of `rawOb` for fields it
> doesn't expand (variable wind sector, weather phenomena codes, trend). Owning a raw
> METAR parser also lets us support keyed providers or offline cached text later.

### 7.2 Nearest airport / aerodrome by GPS

The app must find the nearest METAR-reporting station for the user's location.

- **MVP approach (no shipped DB needed):** NOAA's METAR endpoint supports a
  **bounding-box geographic query** (verified: `?bbox=lat1,lon1,lat2,lon2` returns all
  reporting stations in the box with `lat/lon`). Query a box around the user, compute
  great-circle distance to each returned station, pick the nearest, and offer the rest
  as a switchable list.
- **Optional bundled station index:** a compact JSON of METAR-capable stations
  (derived at build time from OurAirports + a METAR station list) for offline/manual
  selection and faster first paint.

The UI must show, for the selected station:

- Station **ICAO** + name
- **Distance** from the user
- **Bearing** from the user
- METAR **age / freshness**
- A **warning** if the station is too far away or the METAR is stale.

Great-circle helpers (haversine for distance, initial bearing) — note this overlaps
with [azimuth-ledger](#14-reference-azimuth-ledger)'s navigation math and may be reused.

### 7.3 Wind block

Wind is one of the most important drone factors, and the **direction convention is a
common source of confusion** — the app must make it unmistakable:

> **METAR wind direction is where the wind comes *from*, not where it goes.**

For `28009KT` the app shows:

- **Wind source direction**: *from 280°* (W).
- **Drift direction**: the drone is pushed *toward 100°* (= source + 180°).
- **Speed** in **knots, m/s, and km/h** (1 kt = 0.514444 m/s = 1.852 km/h).
- **Gusts** if present (e.g. `28009G18KT`).
- **Variable sector** if present (e.g. `VRB`, or `280V350`).
- A **compass-style visualization** (source arrow + drift arrow + variable arc).
- **Practical route advice:** generally **fly outbound *into* the wind and return
  *with* the wind**, so the harder (slower, higher-power) leg happens while the battery
  is fresh — reducing the risk of not making it home.

The app must **not** impose a single drone's wind limit. It gives the exact numbers and
interpretation; the pilot applies their aircraft's tolerance. (Configurable wind/gust
thresholds: later improvement.)

### 7.4 Temperature, dew point, humidity

METAR usually gives `T/Td` directly (e.g. `23/07`). The app calculates and shows:

- **Temperature** (T)
- **Dew point** (Td)
- **Relative humidity** (RH) when derivable
- **Dew point spread** = T − Td

**Magnus formula** (constants a = 17.625, b = 243.04 °C):

- If T and RH are known but Td is missing:
  - `γ = ln(RH/100) + (a·T)/(b+T)`
  - `Td = (b·γ) / (a − γ)`
- RH from T and Td (for display when only T/Td are known):
  - `RH = 100 · exp( (a·Td)/(b+Td) − (a·T)/(b+T) )`

**Dew point spread** interpretation:

- **Large spread** → drier air → lower fog/condensation, lower cloud/icing risk.
- **Small spread** → air near saturation → higher fog/cloud/moisture risk.

> Example: `23/07` → spread **16 °C** → relatively dry air.

### 7.5 Cloud base & METAR cloud layers

METAR cloud groups and their meaning (cover = oktas):

| Code | Meaning | Oktas |
|---|---|---|
| `FEW` | Few | 1–2 |
| `SCT` | Scattered | 3–4 |
| `BKN` | Broken | 5–7 |
| `OVC` | Overcast | 8 |
| `VV`  | Vertical visibility (sky obscured) | — |

Heights are in **hundreds of feet AGL** (e.g. `FEW020` = 2000 ft AGL). The app shows
each layer in **feet AGL and meters AGL** (1 ft = 0.3048 m).

> Example: `FEW020 SCT035 BKN080` → 2000/3500/8000 ft → ~610/1067/2438 m.

**Operational ceiling** = lowest `BKN`/`OVC` layer, or `VV` height if reported.

**CAVOK** ("Ceiling And Visibility OK") means **all** of:

- Visibility ≥ **10 km**,
- **No** significant weather,
- **No** cloud below **5000 ft AGL** (≈ 1500 m) and no cloud below the highest minimum
  sector altitude,
- **No** CB (cumulonimbus) or TCU (towering cumulus).

**Estimated cloud base** when no explicit layer is reported (Espy's rule):

```
estimated cloud base (m) ≈ 125 × (T − Td)
```

> Example: T 23 °C, Td 7 °C, spread 16 °C → ≈ **2000 m**.

**Priority for the "cloud base" the app shows:**

1. **Actual** METAR cloud layers (most authoritative).
2. **CAVOK** interpretation (no significant cloud below 5000 ft).
3. **Estimated** base from dew point spread (clearly labelled "estimate").

The app must **visually distinguish** these three so the pilot knows what is measured
vs. modeled.

### 7.6 Vertical temperature profile

From surface temperature, build a rough profile using the **standard environmental
lapse rate**:

```
−6.5 °C / 1000 m   (= −0.65 °C / 100 m)
T(h) = T_surface − 0.0065 × h      (h in metres AGL)
```

> Example (T_surface = 23 °C):
> 0 m → 23.0 · 50 m → 22.7 · 120 m → 22.2 · 300 m → 21.0 · 500 m → 19.8 · 1000 m → 16.5 °C

This is a **first approximation only**. The app must state it is a *model*, not a
measured sounding. (Real, modeled lapse can differ — inversions, dry/moist adiabatic
ranges 5–10 °C/km. When Open-Meteo pressure-level data is available we prefer it over
this naive lapse — see §9.)

### 7.7 Dew point / humidity with altitude

**Caution:** dew point and humidity **cannot be reliably extrapolated** from a single
surface METAR. Temperature can be roughly lapsed; moisture cannot.

- The app *may* show a simple approximation for visualization, but it **must be clearly
  labelled "approximate"** and weighted low in any risk logic.
- Real vertical moisture should come from a model (Open-Meteo pressure levels) or
  forecast soundings — a later improvement / progressive enhancement.

### 7.8 Icing risk

Icing is a top hazard for small drones — even thin propeller ice sharply reduces lift
and efficiency. **The risk is temperature *plus* moisture (liquid / supercooled liquid
water), not cold alone.**

Key facts the logic must encode:

- Highest risk is often **near 0 °C**; most dangerous roughly **−1 to +1 °C**, broader
  caution **+2 to −5 °C**.
- At **−5 to −10 °C** risk may be *lower* **if dry** (no cloud/fog/precip) — less liquid
  water — but **not zero** if there is freezing fog, cloud, drizzle, wet snow, or
  supercooled droplets.

Inputs to combine: surface T, estimated **vertical T profile**, **humidity / dew point
spread**, METAR **weather phenomena**, **cloud layers**, **CAVOK**, **precipitation**,
and **fog/mist/freezing-fog** indicators.

**First-version icing risk bands:**

- **LOW**
  - T > +5 °C and no precip/fog/cloud concern; **or**
  - T < −10 °C and dry conditions.
- **MODERATE**
  - +2 to +5 °C with high humidity; **or**
  - −10 to −2 °C with high humidity, cloud, or precipitation.
- **HIGH**
  - −2 to +2 °C, especially with high RH / small spread / fog / cloud / precipitation.
- **VERY HIGH / NO-FLY-style**
  - Freezing fog (`FZFG`), freezing drizzle/rain (`FZDZ`/`FZRA`), wet snow near 0 °C,
    any explicit freezing precipitation, or high humidity with T near 0 °C.

Icing is visualized as a **vertical hazard band** keyed to the temperature profile:

> Example band: 0 m +3 °C medium · 50 m +1 °C high · 120 m −1 °C high ·
> 300 m −3 °C medium · 500 m −6 °C (lower if dry, caution if cloud/moisture).

### 7.9 Vertical hazard analyzer (key differentiator)

A combined per-altitude view, at least approximately, showing:

- Altitude
- Temperature (from profile)
- Dew point / moisture indicator if available (labelled approximate)
- Estimated cloud base
- Actual cloud layers if present
- Icing risk band
- Safe / caution / high-risk altitude zones

**Altitudes of interest:** `0, 30, 50, 100, 120, 150, 300, 500, 1000 m`.

The app should let the pilot **focus on the low band (0–120 m)** — where most drones
fly — while still showing the broader profile for context. (120 m ≈ 400 ft, a common
legal ceiling, is a natural emphasis line — purely visual, not a legal claim.)

### 7.10 Summarized risk indicator

A final status — **never a black box**. Statuses:

- **GOOD**
- **CAUTION**
- **HIGH RISK**
- **NO FLY / NOT RECOMMENDED**

The summary is composed from independent **component risks**, each with its own short
explanation and contribution:

- Wind risk
- Gust risk
- Visibility risk
- Moisture / fog risk
- Cloud / ceiling risk
- Icing risk
- METAR **freshness** risk
- Station **distance** risk

The overall status is driven by the worst meaningful component (a "weakest-link" model,
not a simple average — one NO-FLY component should dominate), and the UI lists each
component with its rating and reason.

> Example summary:
> *"CAUTION: wind is moderate, gusts are present, dew point spread is small, and
> temperature is close to 0 °C. Icing risk is elevated below 120 m."*

---

## 8. Decision-support, not authorization (safety stance)

A short but load-bearing principle, repeated for emphasis because it shapes copy,
defaults, and UI:

- The app comments on **weather only**. It does **not** assess legality, airspace, or
  permissions.
- A persistent, plain disclaimer is always reachable.
- Wording is conservative; uncertainty (stale data, far station, modeled values) is
  always surfaced, never hidden behind a green badge.
- The pilot is always shown **why**, with the raw data one tap away.

---

## 9. Data sources & API research

Research date: **2026-06-28**. The central constraint for a static PWA is **CORS** —
whether a browser can call the API directly without a backend. Findings were verified
empirically (live header checks), not just from documentation.

### 9.1 Candidate sources (summary)

| Source | Data | Key needed? | CORS (browser-direct)? | Notes |
|---|---|---|---|---|
| **NOAA `aviationweather.gov` Data API** | METAR, TAF, station info; bbox geo-query; semi-decoded JSON | **No key** | **❌ No** `Access-Control-Allow-Origin` (verified) | Best free METAR/TAF source; needs a proxy for browser use. ~100 req/min limit; custom user-agent recommended. |
| **Open-Meteo** | NWP forecast incl. **pressure-level** temp/RH/wind/cloud + **geopotential height**; surface fields | **No key** | **✅ Yes** `access-control-allow-origin: *` (verified) | Model data, *not* METAR. Excellent for the **vertical profile** and as a static fallback. Non-commercial free tier. |
| **CheckWX** | Fully decoded METAR/TAF/stations JSON | **Yes (key)** | n/a for static (key can't be exposed) | Free tier ~3000/day; key must stay server-side. |
| **AVWX (avwx.rest)** | Parsed METAR/TAF JSON | **Yes (token)** | n/a for static | Free basic tier; token must stay server-side. |
| **OurAirports `airports.csv`** | Global airport DB (lat/lon, ICAO/IATA, elevation, type) | No | n/a (static file) | ~12 MB; use at **build time** to generate a compact station index. Updated nightly. |

### 9.2 The CORS problem and the recommended solution

The single most important finding:

- **NOAA returns rich data but no CORS header** → a GitHub-Pages-style static frontend
  **cannot call it directly** from the browser.
- **Open-Meteo is fully CORS-enabled** → callable directly, no key, and it natively
  serves real upper-air data.

**Recommended architecture (keeps the frontend fully static):**

1. **METAR / TAF (primary):** route through a **thin, keyless CORS proxy** — a small
   **Cloudflare Worker** (free tier) that forwards to `aviationweather.gov`, adds the
   `Access-Control-Allow-Origin` header, sets a stable user-agent, and optionally
   caches responses for ~1–5 min (helps rate limits + speed). NOAA needs **no API key**,
   so the proxy hides nothing secret — it only solves CORS and adds caching/politeness.
   The frontend stays 100% static and deploys exactly like azimuth-ledger.
2. **Vertical profile (enhancement):** call **Open-Meteo directly** from the browser for
   pressure-level temperature / RH / wind / cloud / geopotential height. This is *real
   modeled* upper-air data — a genuine differentiator vs. naive lapse-rate guessing —
   and requires no proxy.
3. **Static fallback:** if the proxy/NOAA is unavailable, or no nearby METAR station
   exists, fall back to **Open-Meteo surface + profile** data so the app still gives a
   useful (clearly-labelled "model, no METAR") brief.

> A public/generic CORS proxy is possible but **not recommended** (reliability,
> privacy, rate limits). The self-hosted Worker is small and far more dependable.

### 9.3 Nearest-station strategy

- **MVP:** NOAA **bbox query** (verified working) → compute haversine distance to each
  returned station → pick nearest + list alternatives. No shipped DB required.
- **Enhancement:** bundle a compact station index generated at build time from
  OurAirports for offline/manual selection and instant first paint.

### 9.4 Secrets & configuration policy

- **Prefer keyless sources** (NOAA via proxy, Open-Meteo).
- **Never put an API key in frontend code** — anything in the bundle is public. If a
  keyed provider (CheckWX/AVWX) is ever added, the key lives **only** in the Worker/proxy
  environment, and the frontend talks to the proxy.
- Document in the README exactly what is and isn't exposed.

---

## 10. Architecture overview (proposed)

Mirrors the proven [azimuth-ledger](#14-reference-azimuth-ledger) stack so we reuse its
PWA/deploy/update machinery.

- **Frontend:** Vite + React + TypeScript.
- **State:** Zustand with `persist` middleware → `localStorage` (last location, last
  brief, unit preferences, selected station).
- **Styling:** CSS Modules + a small global stylesheet + theme tokens; dark mode.
- **Visualization:** SVG/Canvas for the wind compass and the vertical hazard analyzer
  (azimuth-ledger uses Konva for its map; for static charts SVG may be simpler — TBD).
- **PWA:** `vite-plugin-pwa` with `registerType: 'prompt'` + a `ReloadPrompt` toast
  ("A new version is available → Reload").
- **Domain layer (pure, unit-tested):** METAR parser, Magnus/RH, cloud-base estimate,
  lapse profile, icing logic, risk aggregation, geo (haversine/bearing). Pure functions
  = easy Vitest coverage; this is where correctness matters most.
- **Data layer:** adapters for NOAA-via-proxy (METAR/TAF) and Open-Meteo (profile), with
  caching + graceful degradation.
- **Thin proxy:** Cloudflare Worker (separate tiny deploy) — the only non-static piece.
- **Build/deploy:** multi-stage Dockerfile (deps → test → build → serve) + Makefile,
  GitHub Actions → GitHub Pages, `base: '/drone-weather/'`.
- **Testing:** Vitest + Testing Library; heavy unit coverage on the domain layer
  (decoding and risk logic must be provably correct).

```
Browser (static PWA, GitHub Pages)
   ├── Open-Meteo  ───────────────► (CORS ✓, no key) upper-air profile + fallback
   └── Cloudflare Worker (proxy) ──► aviationweather.gov  (METAR / TAF / bbox)
```

---

## 11. PWA / mobile / desktop / deploy / update expectations

- **Responsive, mobile-first** layout that also works well on desktop.
- **Installable**: web app manifest, icons (192 / 512 / 512-maskable), `standalone`
  display, scoped `start_url`.
- **Add-to-home-screen** support (incl. iOS Safari "Add to Home Screen").
- **Service worker**: offline **app shell**; cache the **last successful brief** so an
  installed user at least sees their most recent data offline (with a clear "offline /
  stale" indicator — fresh weather inherently needs the network).
- **Auto-update**: `prompt` strategy — when a new version is detected, show a
  non-intrusive "new version available → Reload" toast (reuse azimuth-ledger's
  `ReloadPrompt`). Reliable update is important for a safety-adjacent tool.
- **Version/build info** visible somewhere (e.g. footer/about) so users and bug reports
  can reference a build.

---

## 12. MVP scope (v0.1)

**In scope:**

- GPS location + manual coordinate entry/override.
- Nearest METAR station via NOAA bbox query (through the proxy) + nearby-station switch.
- Fetch + display **raw METAR**; fetch **TAF** raw if available.
- Decode core METAR fields (§7.1) — leaning on NOAA's JSON + our own `rawOb` parsing
  for variable wind, phenomena, trend.
- **Wind block**: source vs. drift, kt/m·s/km·h, gusts, variable sector, compass viz,
  outbound-into-wind advice.
- **Temp / dew point / humidity / spread**, with Magnus fallback.
- **Cloud**: actual layers (ft + m), ceiling, CAVOK interpretation, estimated base
  fallback — with the three clearly distinguished.
- **Vertical temperature profile** (standard lapse), labelled as a model.
- **Icing risk** (first-version band logic, §7.8).
- **Vertical hazard analyzer** (focus 0–120 m, broader context).
- **Summarized risk** with per-component explanations (§7.10).
- Station **distance / bearing / age** + stale/far warnings.
- **PWA**: manifest, service worker, offline shell, prompt-update, last-brief cache.
- **Docs**: this file kept current; README; SPEC; TODO checklist.

**Out of scope for v0.1** (→ §13): Open-Meteo upper-air integration (planned as the
*second* milestone), configurable per-drone thresholds, bundled offline station DB,
airspace/legal, history/trends, multi-language.

> **Decision (2026-06-28):** Open-Meteo is **pulled into v0.1** as the vertical-profile
> source (keyless + CORS-clean = low risk; materially improves §7.7/§7.9 over naive
> extrapolation). The naive lapse-rate profile remains as the offline/fallback model and
> for stations where upper-air data is unavailable. See §15.

---

## 13. Later improvements (roadmap)

1. **Real upper-air data** via Open-Meteo pressure levels (temp/RH/wind/cloud +
   geopotential height) → replace naive lapse/moisture extrapolation; wind-aloft display.
2. **Configurable thresholds** per drone (wind, gust, temperature, RH) → personalized
   GOOD/CAUTION/NO-FLY.
3. **Bundled offline station index** (OurAirports-derived) for manual selection + faster
   first paint + partial offline.
4. **TAF-aware "fly later?"** — use the forecast to suggest a better window.
5. **Airspace / legal module** (separate, clearly delineated): UAS zones, NOTAMs, max
   legal altitude, remote-ID hints. Never blended with the weather verdict.
6. **Trends/history**, multi-language, additional providers (CheckWX/AVWX via proxy) and
   provider fallback chains.
7. **Richer icing model** (supercooled-water indices, freezing-level from profile).

---

## 14. Reference: azimuth-ledger

The previous PWA **[azimuth-ledger](https://github.com/dimchansky/azimuth-ledger)**
(live: https://dimchansky.github.io/azimuth-ledger/) was reviewed as a reference for
**structure, deployment, and update behavior**. It should be *adapted*, not blindly
copied. Reusable ideas already identified:

- **Project structure:** `src/{domain,store,hooks,components,theme,utils}` with a pure,
  unit-tested **domain layer** separated from UI. Directly applicable here (our domain =
  METAR decoding + risk logic + geo).
- **Stack:** Vite + React 19 + TypeScript, Zustand (`persist`), CSS Modules, Vitest +
  Testing Library, Radix UI primitives for accessible dialogs.
- **PWA setup:** `vite-plugin-pwa` with `registerType: 'prompt'`, workbox
  `globPatterns`, a complete manifest (icons incl. maskable, `standalone`, scoped
  `start_url`), and a no-flash theme bootstrap in `main.tsx`.
- **Auto-update:** the `ReloadPrompt` component using `useRegisterSW` from
  `virtual:pwa-register/react` → "new version available → Reload" toast. Reuse directly.
- **Deploy:** GitHub Actions → GitHub Pages, building inside a **multi-stage Dockerfile**
  (`deps → test → build → serve`); CI runs the `test` target, then builds, copies
  `dist`, and deploys via `actions/deploy-pages`. `base: '/<repo>/'` for the Pages
  subpath. Reuse the workflow with names changed to `drone-weather`.
- **Local workflow:** a **Makefile** wrapping Docker (`make dev/test/build/clean`) so no
  global Node is required; Node 22 fallback documented.
- **Docs conventions:** `README.md` (overview/features/dev/deploy/PWA), `SPEC.md`
  (functional spec), `TODO.md` (implementation checklist). We mirror this set.
- **Geo math overlap:** azimuth-ledger has azimuth/bearing/normalization helpers; our
  station distance/bearing needs the same primitives — adapt rather than reinvent.

**What does *not* carry over:** the dead-reckoning map/Konva canvas, the route/segment
domain, and the magnetic-declination model — different problem domain.

---

## 15. Decisions & open questions

**Decided (2026-06-28):**

1. ✅ **Proxy host: Cloudflare Worker** — thin, keyless CORS proxy for NOAA METAR/TAF;
   frontend stays 100% static. (Was: Worker vs. public proxy vs. other serverless.)
2. ✅ **Open-Meteo in v0.1** — real upper-air pressure-level data is included in the MVP
   for the vertical profile; naive lapse remains the offline/fallback model.
3. ✅ **Sequence:** write detailed `SPEC` + `TODO` first, then scaffold the project.

**Still open (to confirm during SPEC/implementation):**

4. **Visualization tech:** SVG (simpler for charts/compass) vs. Konva (reuse from
   azimuth-ledger). Lean **SVG** for the hazard chart + compass.
5. **Icing thresholds:** confirm the exact band boundaries and the "high humidity"
   definition (RH % / spread °C cutoffs) with a domain sanity check before coding.
6. **Risk aggregation:** confirm "weakest-link" overall status + how distance/freshness
   downgrade confidence vs. status.
7. **Default units** and which to show prominently (kt vs m/s; ft vs m) per region.
8. **Disclaimer copy** and where it must always appear.

---

## 16. Glossary

- **METAR** — routine aerodrome weather observation (current conditions).
- **TAF** — Terminal Aerodrome Forecast.
- **AGL / AMSL** — Above Ground Level / Above Mean Sea Level.
- **CAVOK** — Ceiling And Visibility OK (see §7.5).
- **QNH** — altimeter setting (sea-level pressure), hPa or inHg.
- **Dew point spread** — T − Td; proxy for how close the air is to saturation.
- **Lapse rate** — rate temperature falls with altitude (standard ≈ 6.5 °C/km).
- **Oktas** — eighths of sky covered (cloud amount).
- **FEW/SCT/BKN/OVC/VV** — cloud amount codes / vertical visibility.
- **CB / TCU** — Cumulonimbus / Towering Cumulus.
- **Ceiling** — lowest BKN/OVC layer (or VV).
- **Supercooled water** — liquid water below 0 °C; primary icing driver.
- **PWA** — Progressive Web App (installable, offline-capable web app).
- **CORS** — Cross-Origin Resource Sharing; governs browser-to-API calls across origins.

---

*Sources consulted (2026-06-28):*
[NOAA Aviation Weather Data API](https://aviationweather.gov/data/api/) ·
[Open-Meteo docs](https://open-meteo.com/en/docs) ·
[Open-Meteo upper-air](https://openmeteo.substack.com/p/upper-air-weather-forecasts-via-api) ·
[OurAirports open data](https://ourairports.com/data/) ·
[CheckWX](https://www.checkwxapi.com/) ·
[AVWX](https://info.avwx.rest/) — plus live header/endpoint verification of NOAA
(CORS-disabled, bbox query, TAF) and Open-Meteo (CORS `*`).
