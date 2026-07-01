# Drone Weather — Functional & Technical Specification

> Status: **Draft v0.1** · Last updated: 2026-06-28
>
> Implementation-oriented companion to [initial-idea.md](initial-idea.md). Where the
> idea doc explains *what and why*, this doc pins down *how*: architecture, module
> boundaries, function contracts, exact thresholds, data/proxy contracts, UI states, and
> testing. Numbers here are **heuristic defaults** — conservative, clearly labelled in
> the UI as general guidance (not your aircraft's limits), and **configurable later**.

---

## 1. Architecture

Strict one-way dependency flow; the **domain layer is pure** (no I/O, no React) so it is
trivially unit-testable and is where correctness is enforced.

```
 ui (React components)
   │  uses
   ▼
 store (Zustand)  ──uses──►  data (adapters: fetch + cache + degrade)
   │                              │ uses
   │  uses                        ▼
   └──────────────────────►  domain (PURE: parse, math, risk)  ◄── tests
```

- **domain** — no imports from `data`/`store`/`ui`; only pure TS + maybe tiny utils.
- **data** — depends on `domain` (types) only; performs `fetch`, caching, fallback.
- **store** — orchestrates `data` + `domain`, holds app state, persists to localStorage.
- **ui** — renders from `store`; no business logic beyond presentation.

The only non-static runtime piece is the **Cloudflare Worker** proxy (separate deploy).

---

## 2. Project structure (target)

Mirrors azimuth-ledger conventions.

```
drone-weather/
├── docs/                       # initial-idea.md, spec.md, todo.md (+ ADRs later)
├── proxy/                      # Cloudflare Worker (METAR/TAF CORS proxy)
│   ├── src/worker.ts
│   ├── wrangler.toml
│   └── README.md
├── public/                     # icons, favicon, manifest assets
├── src/
│   ├── domain/                 # PURE logic + __tests__
│   │   ├── types.ts
│   │   ├── geo.ts              # haversine, bearing, compass point
│   │   ├── units.ts           # kt/ms/kmh, ft/m, pressure
│   │   ├── metar.ts           # raw METAR text → Metar
│   │   ├── humidity.ts        # Magnus: Td↔RH, spread
│   │   ├── clouds.ts          # layers, ceiling, CAVOK, estimated base
│   │   ├── profile.ts         # vertical temperature profile, altitude grid
│   │   ├── icing.ts           # icing risk per level + band
│   │   └── risk.ts            # component risks + aggregation
│   ├── data/
│   │   ├── noaa.ts            # METAR/TAF/nearest-station via proxy
│   │   ├── openMeteo.ts       # pressure-level profile + surface fallback
│   │   └── cache.ts          # localStorage TTL cache, last-good brief
│   ├── store/
│   │   ├── locationStore.ts   # GPS / manual coords, selected station
│   │   ├── briefStore.ts      # current brief (metar, taf, profile, risk)
│   │   └── settingsStore.ts   # units, ops ceiling, theme, thresholds
│   ├── components/             # UI (mobile-first), CSS Modules
│   │   ├── Location/ Station/ Wind/ Clouds/ ThermoMoisture/
│   │   ├── VerticalAnalyzer/ RiskSummary/ RawData/ ReloadPrompt/ common/
│   ├── hooks/  theme/  utils/
│   ├── App.tsx  main.tsx  global.css
├── Dockerfile  Makefile  .dockerignore  .gitignore
├── index.html  vite.config.ts  tsconfig.json  package.json
└── .github/workflows/deploy.yml
```

---

## 3. Domain types (`domain/types.ts`)

```ts
// ----- units & geo -----
export type Coord = { lat: number; lon: number };           // degrees
export type SpeedKt = number;                               // canonical speed unit: knots

// ----- METAR -----
export type CloudCover = 'FEW' | 'SCT' | 'BKN' | 'OVC' | 'VV' | 'NSC' | 'NCD' | 'SKC' | 'CLR';
export interface CloudLayer {
  cover: CloudCover;
  baseFt: number | null;   // ft AGL (null for VV with unknown, or sky-clear codes)
  baseM: number | null;    // derived
  cb: boolean;             // cumulonimbus
  tcu: boolean;            // towering cumulus
}
export interface Wind {
  dirDeg: number | null;   // FROM direction; null when variable (VRB)
  variable: boolean;       // VRB or present variable sector
  varFromDeg?: number;     // e.g. 280V350 → 280
  varToDeg?: number;       // → 350
  speedKt: number;
  gustKt: number | null;
  calm: boolean;
}
export interface Weather { raw: string; intensity: '-' | '+' | ''; descriptor?: string; phenomena: string[] }
export interface Metar {
  icao: string;
  stationName?: string;
  station: Coord;
  elevationM?: number;
  observedAt: Date;        // from obsTime / report time
  ageMin: number;          // derived at read time
  wind: Wind;
  visibilityM: number | null;   // metres; 9999/'10+' → 10000 (≥10km)
  cavok: boolean;
  weather: Weather[];
  clouds: CloudLayer[];
  tempC: number | null;
  dewpC: number | null;
  qnhHpa: number | null;
  trend?: string;          // NOSIG, etc.
  raw: string;             // rawOb — ALWAYS preserved
}
export interface Taf { icao: string; issuedAt: Date; validFrom: Date; validTo: Date; raw: string }

// ----- vertical profile -----
export interface ProfileLevel {
  altM: number;            // AGL
  tempC: number;
  dewpC: number | null;    // from model (Open-Meteo) when available; else null/approx
  rhPct: number | null;
  windDirDeg?: number | null;
  windKt?: number | null;
  cloudPct?: number | null;
  source: 'model' | 'lapse';   // model = Open-Meteo; lapse = naive extrapolation
}
export interface VerticalProfile { levels: ProfileLevel[]; source: 'model' | 'lapse'; note: string }

// ----- risk -----
export type Severity = 'GOOD' | 'CAUTION' | 'HIGH' | 'NOFLY';
export type Confidence = 'OK' | 'REDUCED' | 'LOW';
export interface RiskComponent { key: string; label: string; severity: Severity; reason: string; value?: string }
export interface RiskSummary {
  overall: Severity;
  confidence: Confidence;
  components: RiskComponent[];
  headline: string;        // one-line plain-language summary
  uncertain: boolean;      // true when confidence < OK
  primary: RiskComponent | null; // dominant weather driver (banner "Main issue"); null when GOOD
  advice: string;          // short hedged pilot advice keyed off `primary`
}
```

---

## 4. Domain function contracts

All pure. Each gets focused Vitest coverage (see §11).

### 4.1 `geo.ts`
```ts
haversineKm(a: Coord, b: Coord): number          // great-circle distance
initialBearingDeg(from: Coord, to: Coord): number // 0..360, true bearing
compassPoint(deg: number): string                // 'N','NNE',... 16-point
```

### 4.2 `units.ts`
```ts
ktToMs(kt: number): number    // × 0.514444
ktToKmh(kt: number): number   // × 1.852
ftToM(ft: number): number     // × 0.3048
mToFt(m: number): number
// formatting helpers return strings with chosen unit(s)
```

### 4.3 `metar.ts`
```ts
parseMetar(raw: string, hints?: Partial<Metar>): Metar
```
- Tokenizes `rawOb`. `hints` carries NOAA's pre-decoded JSON fields (temp/dewp/wind/
  clouds/visib/altim/station) so we don't re-derive what the API already gives; the
  parser fills the gaps NOAA doesn't expand: **variable wind sector** (`dddVddd`,
  `VRB`), **weather phenomena** codes, **trend** (`NOSIG`/`TEMPO`/`BECMG`), `CAVOK`,
  `CB`/`TCU` flags, and `VV`.
- Visibility normalization: `10+`/`9999`/`P6SM` → 10000 m (≥10 km). SM → m.
- `ageMin` computed against current time at call site (pass a clock for tests).
- Must never throw on odd input — unknown tokens are collected, not fatal.

### 4.4 `humidity.ts`  (Magnus; a = 17.625, b = 243.04)
```ts
dewPointFromRH(tempC: number, rhPct: number): number
rhFromDewPoint(tempC: number, dewpC: number): number   // 100·exp(a·Td/(b+Td) − a·T/(b+T))
dewPointSpread(tempC: number, dewpC: number): number    // T − Td
```

### 4.5 `clouds.ts`
```ts
ceilingFt(layers: CloudLayer[]): number | null          // lowest BKN/OVC (or VV)
estimatedCloudBaseM(tempC: number, dewpC: number): number // 125 × (T − Td), clamped ≥0
interpretCavok(): { visibilityMinM: 10000; noSigWeather: true; noCloudBelowFt: 5000; noCbTcu: true }
// resolveCloudBase picks display source by priority: actual layers → CAVOK → estimate
resolveCloudBase(metar: Metar): { kind: 'actual' | 'cavok' | 'estimate'; baseM: number | null; note: string }
```

### 4.6 `profile.ts`  (standard lapse 6.5 °C/km)
```ts
DEFAULT_ALTS_M = [0, 30, 50, 100, 120, 150, 300, 500, 1000]
lapseProfile(surfaceTempC: number, alts?: number[]): VerticalProfile   // source: 'lapse'
mergeModelProfile(model: ProfileLevel[], alts?: number[]): VerticalProfile // source: 'model', interpolated to alts
// dew point/RH only populated when source === 'model'; lapse leaves them null (per §7.7 caution)
```

### 4.7 `icing.ts`
```ts
icingAtLevel(level: ProfileLevel, ctx: { weather: Weather[]; nearSaturation: boolean }): Severity
icingBand(profile: VerticalProfile, metar: Metar): { levels: { altM:number; severity:Severity }[]; worst: Severity; reason: string }
```
Logic per §7.8 (see thresholds in §5.6). "Liquid water present" is inferred from: cloud
in/near the band, fog/mist phenomena, precipitation, or small dew-point spread / high RH.

### 4.8 `risk.ts`
```ts
windRisk(speedKt, dirDeg), gustRisk(speedKt, gustKt), visibilityRisk(visM),
moistureRisk(metar), ceilingRisk(metar, opsCeilingM),
icingRiskComponent(worst, reason): RiskComponent
freshness(ageMin): { confidence; component }    // confidence contributor + display row
distance(distanceKm): { confidence; component }  // confidence contributor + display row
assessRisk({ metar, icingWorst, icingReason, distanceKm, opsCeilingM }): RiskSummary
```
> Implemented as `assessRisk` (orchestrator) rather than a bare `aggregateRisk` — it
> builds the six weather components, derives confidence from freshness+distance, applies
> the weakest-link + one-step confidence bump, and returns all eight components for
> display. Ordering helpers live in `severity.ts` (shared with `icing.ts`).

---

## 5. Risk model (default thresholds)

> All thresholds are **defaults**, conservative, and will become user-configurable.
> Wind/gust defaults assume a typical consumer drone; the UI states this explicitly and
> shows the raw number so pilots apply their own aircraft limits.

Severity ordering: `GOOD(0) < CAUTION(1) < HIGH(2) < NOFLY(3)`.

### 5.1 Wind (sustained)
| Severity | Sustained |
|---|---|
| GOOD | < 5 m/s (≈ <10 kt) |
| CAUTION | 5–8 m/s (≈ 10–16 kt) |
| HIGH | 8–11 m/s (≈ 16–21 kt) |
| NOFLY | > 11 m/s (≈ >21 kt) |

### 5.2 Gust
- If gusts reported, severity = max(wind-band-of-gust, escalation by **gust spread**):
  spread = gust − sustained. CAUTION if spread ≥ 5 kt; HIGH if spread ≥ 10 kt.
- Reason always names both numbers and the drift direction implication.

### 5.3 Visibility (VLOS-oriented)
| Severity | Visibility |
|---|---|
| GOOD | ≥ 5 km |
| CAUTION | 1.5–5 km |
| HIGH | 0.8–1.5 km |
| NOFLY | < 0.8 km |

### 5.4 Moisture / fog
| Severity | Condition |
|---|---|
| GOOD | spread > 5 °C, no fog/mist |
| CAUTION | spread 2–5 °C, or `BR` (mist) |
| HIGH | spread < 2 °C, or `FG` present |
| NOFLY | `FZFG` (freezing fog) — also forces icing NOFLY |

### 5.5 Cloud / ceiling (relative to ops ceiling, default **120 m / 400 ft**)
Let `R` = configured ops ceiling.
| Severity | Ceiling |
|---|---|
| GOOD | none below 1500 ft, or CAVOK |
| CAUTION | ceiling between R+300 ft and 1500 ft |
| HIGH | ceiling between R and R+300 ft (cloud just above ops band) |
| NOFLY | ceiling < R (you'd be operating in/above cloud) |

### 5.6 Icing (evaluated across the ops band; worst level wins)
| Severity | Condition (T = level temp; "moist" = cloud/fog/precip/RH high/small spread) |
|---|---|
| GOOD/LOW | T > +5 °C and dry; **or** T < −10 °C and dry |
| CAUTION/MOD | +2…+5 °C & moist; **or** −10…−2 °C & moist |
| HIGH | −2…+2 °C, especially moist |
| NOFLY | FZFG / FZDZ / FZRA / wet snow near 0 °C / explicit freezing precip / high-RH near 0 °C |

### 5.7 Freshness → confidence (not a weather severity)
| Confidence | METAR age |
|---|---|
| OK | ≤ 60 min |
| REDUCED | 60–120 min |
| LOW | > 120 min |

### 5.8 Distance → confidence
| Confidence | Station distance |
|---|---|
| OK | < 15 km |
| REDUCED | 15–40 km |
| LOW | > 40 km |

### 5.9 Aggregation rule
1. `overall = max severity` across the **weather** components (5.1–5.6).
2. `confidence = worst of` freshness & distance confidence (OK/REDUCED/LOW).
3. If `confidence !== OK` and `overall < HIGH`, **bump overall up one step** (GOOD→CAUTION)
   and set `uncertain = true`. Confidence **never** by itself yields NOFLY — a far/stale
   station means *uncertain*, not *dangerous*.
4. `headline` = templated plain-language sentence naming the driving components
   (example in idea doc §7.10).

---

## 6. Data layer & proxy contract

### 6.1 Cloudflare Worker proxy (`proxy/`)
- Routes (thin pass-through to `aviationweather.gov/api/data/*`):
  - `GET /metar?ids=KMCI&format=json`
  - `GET /metar?bbox=lat1,lon1,lat2,lon2&format=json`  (nearest-station discovery)
  - `GET /taf?ids=KMCI&format=json`
- Behavior: forward query, set `User-Agent: drone-weather (+repo url)`, add
  `Access-Control-Allow-Origin: *`, **cache** upstream responses ~120 s
  (Cache API / `cf: { cacheTtl }`), pass through status. No secrets, no key.
- Frontend base URL configured via `VITE_METAR_PROXY_URL` (build-time env).

### 6.2 `data/noaa.ts`
```ts
getMetar(icao: string): Promise<Metar>
getTaf(icao: string): Promise<Taf | null>
nearestStations(at: Coord, radiusKm?: number): Promise<{ metar: Metar; distanceKm: number; bearingDeg: number }[]>
  // builds a bbox around `at`, fetches, sorts by haversine, returns nearest-first
```

### 6.3 `data/openMeteo.ts`  (browser-direct, CORS-clean, no key)
```ts
getProfile(at: Coord): Promise<ProfileLevel[]>   // pressure levels → temp/RH/wind/cloud + geopotential height → altM AGL
getSurfaceFallback(at: Coord): Promise<Partial<Metar>>  // when no nearby METAR exists
```
- Endpoint: `api.open-meteo.com/v1/forecast` with `hourly` pressure-level vars
  (`temperature_<hPa>`, `relative_humidity_<hPa>`, wind, `geopotential_height_<hPa>`)
  for the levels covering 0–1500 m AGL; convert geopotential height − station elevation
  → AGL; interpolate to `DEFAULT_ALTS_M`. Pick the hour nearest "now".

### 6.4 `data/cache.ts`
- TTL `localStorage` cache keyed by request; METAR/TAF TTL ~10 min, profile ~30 min.
- Persist the **last good full brief** for offline display (clearly flagged stale).

### 6.5 Degradation chain
1. METAR via proxy (primary). 2. On failure → last cached brief (flag stale).
3. No nearby METAR station → Open-Meteo surface + profile (flag "model, no METAR").
4. Profile: Open-Meteo model preferred; on failure → naive lapse (flag "estimate").

---

## 7. State (Zustand)

| Store | Persisted (localStorage key) | Notes |
|---|---|---|
| `locationStore` | **yes** — `drone-weather-location`; `partialize` → `coord`, `source` (`gps`/`manual`/`pasted`), `selectedIcao` | `setCoord` resets `selectedIcao` so a new location re-picks nearest |
| `settingsStore` | **yes** — `drone-weather-settings`; `partialize` → `windUnit`, `altUnit`, `opsCeilingM`, `theme` | no-flash theme bootstrap in `main.tsx` |
| `briefStore` | **no** (transient) | `status`/`brief`/`nearby`/`error`/`offline`; offline relies on the HTTP cache (§6.4), not on persisting the brief |

### 7.1 Location input, refresh & startup
- **Input sources** all funnel through `setCoord(coord, source)`: GPS (`navigator.geolocation`),
  manual two-field entry (`parseLatitudeInput`/`parseLongitudeInput`), and **paste** (a
  single field parsed by `parseCoordinatePair`, with a best-effort `navigator.clipboard.readText`
  one-tap path and an always-available inline fallback field). Malformed/ambiguous input is
  rejected with a helpful example (`Try: 54.6651, 25.2169`).
- **Refresh** re-runs `briefStore.load(coord, { selectedIcao, opsCeilingM, force: true })` for
  the current stored coord (never re-acquires GPS, never mutates the coord). `force` threads to
  the cache to bypass the TTL and revalidate; a failed refresh keeps the last good brief
  (existing "couldn't refresh" banner) and shows `Refreshing…` while in flight.
- **Startup:** persisted coord/settings hydrate synchronously → the location is shown
  immediately → `useBriefLoader` auto-fetches the brief (normal cache) → the visible Refresh
  offers an explicit force-revalidate. A persisted `selectedIcao` that is no longer in range
  falls back to the nearest station.

---

## 8. UI structure & states

**Layout (decision-first, 2026-07-01):** mobile-first single column, three glance-able layers
(full rationale in [ux-proposal.md](ux-proposal.md)). Order top→bottom:

1. **Decision** — `DecisionBanner`.
2. **Decision support** (compact strips, always visible) — `StatusStrip` → `PrecipNowPill` →
   `RiskFactors` → `VerticalHazardStrip` → `WindCompass`; reserved slots for the Iteration-2
   daylight and Iteration-3 forecast strips.
3. **Technical detail** (collapsible `Card`, collapsed by default) — `VerticalAnalyzer` →
   `Clouds` → `ThermoMoisture` → `Station` → **Raw METAR/TAF** → disclaimer/version footer.

**Components:**
- `DecisionBanner` — big status chip (GOOD/CAUTION/HIGH/NOFLY) + single **Main issue** (dominant
  weather driver + magnitude, hidden when GOOD) + short hedged **advice** + `uncertain` badge.
  Reads `RiskSummary.primary`/`advice` (derived in `assessRisk`).
- `RiskFactors` — the six weather component rows (wind, gust, visibility, moisture, ceiling,
  icing), each with its reason. Freshness/distance are shown by `StatusStrip`, not here.
- `StatusStrip` — one-line data confidence: station · distance · METAR age · fetch time · QNH
  (hPa + inHg, **METAR only** — never synthesized for a model-only brief). Colored by confidence.
- `PrecipNowPill` — source-explicit precip-now (`precipNow`): "No precipitation reported now" /
  "METAR: …" / "Model: …". Model probability never rendered as observed.
- `VerticalHazardStrip` — one-line ops-band conclusion (`opsBandHazard`): worst icing in the band
  + cloud-base-vs-ops. Keeps the vertical signal visible while the full chart is collapsed.
- `WindCompass` — SVG compass: **source arrow** + **drift arrow** (opposite) + variable arc;
  speed in all three units; gust; `routeAdvice` (shared with the banner).
- `VerticalAnalyzer` — SVG chart: altitude axis (focus 0–120 m, toggle to 1000 m),
  temperature line, cloud-base marker(s), icing band coloring, safe/caution/high zones.
- `Clouds` — layers (ft + m), ceiling, CAVOK note, or estimated-base note (source tagged).
- `ThermoMoisture` — T, Td, RH, spread, with interpretation (QNH promoted to `StatusStrip`).
- `Station` — ICAO/name, distance, bearing + compass point, METAR age, far/stale warning.
- `RawData` — collapsed-by-default raw METAR + TAF (monospace, `forceMount` so it stays verbatim
  in the DOM), copy button (a header sibling of the trigger, so it never toggles the panel).
- `Location` — GPS button, manual lat/lon entry, nearby-station picker.
- `ReloadPrompt` — reused from azimuth-ledger (prompt update toast).

**Cross-cutting states:** loading (skeleton), error (retry + last-cached fallback),
empty (no location yet → prompt for GPS/manual), **stale** (amber banner: data age +
"refresh"), **offline** (show last brief, disable refresh, explain).

**Accessibility:** Radix primitives for dialogs/collapsibles; color is never the only
risk signal (icon + text label too); compass/chart have text equivalents.

---

## 9. Units & display conventions

- Canonical internal speed = **knots**; display kt + m/s + km/h (user picks primary).
- Canonical internal altitude/height = **metres**; display m + ft.
- Temperature °C; pressure hPa (show inHg secondary).
- Directions: degrees + 16-point compass; always label wind as **FROM**; drift as **TO**.

---

## 10. PWA specifics

- `vite-plugin-pwa`, `registerType: 'prompt'`, workbox precache of app shell.
- Manifest: name "Drone Weather", short_name "DroneWx", `standalone`, scoped
  `start_url: '/drone-weather/'`, icons 192/512/512-maskable, theme/background colors.
- `base: '/drone-weather/'`. Runtime-cache strategy: app shell precache; data requests
  are network-first with the localStorage last-good brief as the real offline story.
- Build/version stamp (git sha + build time) surfaced in footer/about.

---

## 11. Testing strategy

- **Domain = the test priority.** Table-driven Vitest for: METAR parsing (real-world raw
  strings incl. `VRB`, gusts, `FZFG`, `CAVOK`, `VV`, SM visibility, CB/TCU), Magnus
  (round-trip Td↔RH), cloud base + ceiling + priority resolution, lapse profile values,
  icing bands across the matrix in §5.6, risk aggregation incl. confidence downgrade.
- Geo: known city-pair distances/bearings (reuse azimuth-ledger fixtures where apt).
- Data adapters: tested with mocked `fetch` (fixture JSON captured from live NOAA/Open-Meteo).
- A few component tests (Testing Library) for risk rendering + raw-METAR visibility.
- CI runs the Docker `test` target before build (same gate as azimuth-ledger).

---

## 12. Config & environment

| Var | Where | Purpose |
|---|---|---|
| `VITE_METAR_PROXY_URL` | frontend build | base URL of the Cloudflare Worker |
| `VITE_APP_VERSION` | frontend build | git sha / build stamp for footer |
| (Worker) `UPSTREAM` | worker env | `https://aviationweather.gov/api/data` |

No secrets in the frontend bundle (§9.4 of idea doc). Open-Meteo needs none.

---

## 13. Definition of done (v0.1)

- All §4 domain functions implemented + green Vitest, including the §5 thresholds.
- NOAA-via-proxy + Open-Meteo adapters working with caching + degradation.
- All §8 components rendering a real brief on mobile + desktop, with stale/offline/error
  states and the always-visible raw METAR + disclaimer.
- PWA installable, prompt-update working, last-brief offline.
- Deployed: frontend to GitHub Pages, Worker to Cloudflare. README/SPEC/TODO current.
