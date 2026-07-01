# METAR/TAF parser library — research & recommendation

> **Status: research only (2026-07-01). No production change.** The in-house parser
> (`src/domain/metar.ts`, `src/domain/taf.ts`) is unchanged and remains the source of truth.
> This document evaluates whether to replace it with a third-party library. Reproducible spike
> code + captured output live in [`research/parser-libraries/`](../research/parser-libraries/)
> (isolated `package.json`, **not** part of the app bundle).
>
> **TL;DR — Recommendation: keep our parser (Option D).** Neither maintained library is a clear
> win for this app: both can *throw* on live global reports (ours never does), neither exposes the
> partial-parse `warnings` signal our UI relies on, and both require an adapter that re-does the
> unit normalisation we already have. The strongest candidate, `metar-taf-parser` (aeharding), is
> kept on file as the choice **if** we ever adopt one — but only behind a hybrid adapter with a
> fall-back to our parser (Option E), and only to unlock a concrete future need (structured
> WS/turbulence/icing). The spike found **zero** cases our parser mishandles. **No approval to
> migrate is requested.**

---

## 1. Goal & method

Decide whether to replace the in-house METAR/TAF parser with a library to make parsing "more
reliable and less fragile", **without** breaking the decision logic or UX. Method:

1. Mapped every parsed field the app depends on (§3) by reading `metar.ts`, `taf.ts`, their tests,
   the data adapter (`data/noaa.ts`), and all consumers (risk, icing, clouds, precip, profile,
   TAF summary/details, UI).
2. Deep-dived the candidates from npm/GitHub source, types, issues (§2, §4).
3. **Ran real spikes** (`research/parser-libraries/`) that parse the same tricky examples with
   *both* the library and our parser, side by side, plus robustness probing (§5).
4. Assessed migration risk and options A–E (§6) and recommended a path (§7).

## 2. Candidates

| Library | npm | METAR | TAF | TS types | Module | Last release | DL/wk | ★ | License | Verdict |
|---|---|:--:|:--:|:--:|---|---|--:|--:|---|---|
| **metar-taf-parser** (aeharding) | `metar-taf-parser` | ✅ | ✅ | native, bundled `.d.ts` | ESM-only | 2026-03-17 (9.1.3) | ~4,244 | 59 | MIT | **Best library** — mature, rich, but can throw; no warnings API |
| **@squawk/weather** (neilcochran) | `@squawk/weather` | ✅ | ✅ | native | ESM (`./browser` export) | 2026-06-22 (0.6.0) | ~243 | 8 | MIT | Clean model, but **pre-1.0** + **drops MPS/`///`** + throws on trivial input |
| **fboes/metar-parser** | `aewx-metar-parser` ⚠️ | ✅ | ❌ | native | ESM-only | 2026-06-20 (3.0.1) | ~134 | 23 | MIT | **Disqualified** — METAR-only, no CB/TCU, no CAVOK flag |
| `metar` / `metarjs`, `metar-js`, `metar-plot`, `ts-metar-parser`, `metar-decoder`, `@cristianob/metar-parser` | various | ✅ | ❌ | mixed | mixed | 2022–2026 | <45 | — | MIT/ISC | Skip — METAR-only and/or stale/no types |
| `metar-taf` (kovnick) | `metar-taf` | fetch | prose | native | ESM+CJS | 2026-06 | low | — | MIT | Skip — a NOAA fetch + English-prose decoder, not a structured parser |
| `metceptron`, `node-metar` | — | — | — | — | — | — | — | — | — | Do not exist as npm parser packages |

> ⚠️ **Naming trap:** the GitHub repo `fboes/metar-parser` publishes to npm as **`aewx-metar-parser`**.
> `npm i metar-parser` installs an unrelated, abandoned package (Raideer, 2022). Not the same thing.

Only **two** libraries parse TAF change groups at all: aeharding and `@squawk/weather`. Everything
else is METAR-only (can't satisfy the TAF need) or not a structured parser. So the real contest is
**our parser vs. aeharding vs. @squawk**.

## 3. What the app actually needs (the compatibility rows)

Both parsers sit behind **one call site each**, which is the natural adapter seam:
- `parseMetar` → only in `data/noaa.ts` `buildMetar()` (which already injects ICAO/coords/name/elev
  from the NOAA JSON and **overrides** `observedAt` with NOAA's authoritative `obsTime`).
- `parseTaf` → only in `App.tsx` (memoised over `brief.taf.raw`).

Downstream, the weather predicates (`hasThunderstorm`, `hasFreezingPrecip`, …) are **structural**
over `WeatherFields = { weather: Weather[]; clouds: CloudLayer[] }`, shared by METAR and TAF
periods. So any replacement must produce our `Weather` (`{raw,intensity,descriptor,phenomena[]}`)
and `CloudLayer` (`{cover,baseFt,baseM,cb,tcu}`) shapes, or every predicate/consumer must be
rewritten.

### Compatibility matrix

Legend: ✅ present & directly usable · ⚠️ present but needs normalisation/adaptation · ❌ absent.

| Required app field | Our parser | aeharding `metar-taf-parser` | `@squawk/weather` | Notes |
|---|:--:|:--:|:--:|---|
| **METAR** | | | | |
| Station ICAO | ✅ `icao` | ✅ `station` | ✅ `stationId` | We inject ICAO from NOAA JSON anyway |
| Observation time | ✅ `observedAt: Date` | ⚠️ `day/hour/minute` (Date only via `{issued}`) | ⚠️ `DayTime` | Moot — we override with NOAA `obsTime` |
| Wind dir/speed/gust | ✅ knots | ⚠️ `{speed,gust,unit}` (KT/**MPS**/KMH) | ⚠️ `speedKt` but **MPS unhandled** | We normalise to knots; @squawk drops MPS (see §5) |
| Variable wind (VRB + sector) | ✅ `variable`,`varFrom/ToDeg` | ✅ `degrees?`,`min/maxVariation` | ✅ `isVariable`,`variableFrom/ToDeg` | |
| Visibility | ✅ metres, ≥10 km→10000 | ⚠️ `{value,unit,indicator}` (SM/m, P/M) | ⚠️ `{visibilitySm,visibilityM,isMoreThan}` | Both need our SM→m + clamp logic |
| CAVOK | ✅ `cavok`+vis 10000 | ✅ `cavok` (vis P9999) | ✅ `isCavok` (vis unset) | @squawk needs vis derived |
| Weather phenomena | ✅ `{raw,intensity,descriptor,phenomena[]}` | ⚠️ `{intensity,descriptive,phenomenons[]}` **no per-wx raw** | ✅ incl. per-wx `raw` | aeharding lacks per-group raw (open issue #57) |
| Rain/snow/DZ/FZ/TS/FG/BR detection | ✅ predicates | ⚠️ via enums (rewrite predicates) | ⚠️ via enums/raw | Adapter must feed our predicate shape |
| Cloud layers | ✅ `{cover,baseFt,baseM,cb,tcu}` | ⚠️ `{quantity,height,type}` | ⚠️ `{coverage,altitudeFtAgl,type}` | height already in ft in both |
| Cloud base | ✅ (`resolveCloudBase`) | ✅ from `height` | ✅ from `altitudeFtAgl` | |
| CB / TCU | ✅ `cb`/`tcu` bools | ✅ `type`/`secondaryType` | ✅ `type: 'CB'\|'TCU'` | |
| Ceiling | ✅ `ceilingFt()` (BKN/OVC/VV) | ❌ **not computed** | ❌ not computed | We keep our helper either way |
| Vertical visibility (VV) | ✅ as a `cover:'VV'` layer | ⚠️ `verticalVisibility` (separate) | ⚠️ `verticalVisibilityFtAgl` (separate) | Adapter must **synthesize a VV layer** for our ceiling logic |
| QNH / altimeter | ✅ `qnhHpa` (inHg→hPa) | ⚠️ `{value,unit}` | ✅ `{hPa,inHg}` | Adapter converts inHg→hPa |
| Temp / dewpoint | ✅ | ✅ | ✅ | |
| `///` automated markers | ✅ base kept, type dropped | ✅ base kept | ❌ **whole layer dropped** | @squawk regresses (see §5) |
| Statute-mile fractions (`1 1/2SM`) | ✅ | ✅ | ✅ | |
| **TAF** | | | | |
| Station + issue time | ✅ (NOAA JSON) | ✅ | ✅ | |
| Validity window | ✅ `validFrom/To: Date` | ⚠️ `{startDay…}`, Date via `{issued}` | ⚠️ `DayTime` | |
| Periods | ✅ `periods[]` (BASE explicit) | ⚠️ base on root + `trends[]` | ⚠️ `forecast[]` (base = `forecast[0]`) | Adapter maps base→BASE period |
| Change type | ✅ `BASE/FM/BECMG/TEMPO/PROB` | ⚠️ `FM/BECMG/TEMPO/INTER/PROB` | ⚠️ `FM/TEMPO/BECMG` (**no PROB type**) | |
| PROB / PROB TEMPO | ✅ `changeType:'PROB'`+`tempo` | ⚠️ `type:TEMPO`+`probability` | ⚠️ `changeType:TEMPO`+`probability` | Both fold PROB into TEMPO+prob; adapter remaps to our shape |
| Probability value | ✅ `probPct` | ✅ `probability` | ✅ `probability: 30\|40` | |
| Per-period wind/vis/clouds/wx | ✅ | ✅ | ✅ | |
| Raw group text per period | ✅ `raw` | ✅ `trend.raw` | ⚠️ (base has none; groups via reconstruct) | Needed by `TafDetailsCard` |
| WS / TX·TN / turbulence / icing | ⚠️ → `warnings[]` | ✅ structured (`windShear`,`maxTemperature`,`icing`,`turbulence`) | ✅ structured | **Library win** — but not decision-critical for us today |
| **Parser warnings / partial-parse flag** | ✅ `warnings[]` → `partial` UI note | ❌ none (issue #100 open) | ❌ none | We'd have to diff tokens to reconstruct |
| **Never throws** | ✅ by design | ❌ throws (incl. valid reports, #124) | ❌ throws (incl. `TypeError` on empty) | The key robustness gap |

## 4. Packaging & maintenance (both TAF-capable libraries)

- **aeharding `metar-taf-parser` 9.1.3** — MIT, **zero runtime deps**, TS-native + bundled `.d.ts`,
  **ESM-only**, ~14 KB gzipped, no Node APIs → browser/Vite-safe. i18n (en/de/fr/it/pl/zh-CN).
  ~4,244 dl/wk, 59★, solo maintainer, a few releases/year. **Not** marked `sideEffects:false`
  (you pull the whole parser). Port of the Python `python-metar-taf-parser`. Open bugs of note:
  **#124** (a valid ICAO METAR `…4000E -SHRA` throws `UnexpectedParseError`), **#101** (variable
  winds), **#100/#57** (no decoded-element / per-field-raw list — confirms no warnings API).
- **@squawk/weather 0.6.0** — MIT, one **types-only** dep (`@squawk/types`), TS-native, ESM with a
  dedicated `./browser` export → excellent Vite fit. Broad scope (also SIGMET/AIRMET/PIREP). But
  **pre-1.0** (API may churn), ~243 dl/wk, 8★.

## 5. Spike results (real, reproducible)

Ran `research/parser-libraries/spike.ts` (ours vs aeharding) and `spike-squawk.ts` (@squawk) over
the tricky examples. Full captured output: `spike-output.txt`, `spike-squawk-output.txt`.

**Field parity — aeharding matched our parser on every METAR/TAF example**, including CAVOK,
SCT/BKN/OVC, CB, TCU, `+TSRA`, `FZRA`, fog/mist, `VRB…G…` gusts, low vis, QNH, `///` markers, MPS,
and TAF FM/BECMG/TEMPO/PROB30-TEMPO/multi-hazard. Differences were representational (units, VV as a
field, PROB-as-TEMPO+prob) — all adaptable. It even **structurally parsed** the KDEN
`WS020/… TX35/… TNM01/…` groups our parser records as `warnings`.

**@squawk regressions found in the spike (decision-relevant):**
- **MPS wind dropped:** `UUEE … 27006MPS …` → `wind=undefined` and the parse degraded (temp/QNH
  also empty). Global CIS/Russia stations report MPS. Our parser and aeharding handle it.
- **`///` automated markers drop the layer:** `ESSA … BKN014/// //////CB …` → `clouds=[]`. Ours and
  aeharding keep `BKN1400`. Automated stations are common.

**Robustness — the decisive axis:**

| Input | Our parser | aeharding | @squawk |
|---|:--:|:--:|:--:|
| `""` (empty) | ✅ no throw | ❌ `InvalidWeatherStatementError` | ❌ `TypeError` |
| `"METAR"` (header only) | ✅ no throw | ❌ `InvalidWeatherStatementError` | ❌ `TypeError` |
| `"GARBAGE not a metar"` | ✅ no throw | ✅ no throw | ❌ `Error: Invalid observation time` |
| junk token mid-body (`QQQ999`) | ✅ no throw | ✅ no throw | ✅ no throw |
| **valid** `FIMP …4000E -SHRA…` (aeharding #124) | ✅ no throw | ❌ **throws** (known bug) | ✅ no throw |

Our parser **never throws** on any input — a deliberate design property that matters for a PWA
consuming arbitrary live global METAR/TAF. Both libraries throw on some inputs; aeharding throws on
a *valid* real-world report (#124); @squawk throws raw `TypeError`s on trivial malformed input.

## 6. Migration options & risk

**What a library would make simpler:** structured WS/TX-TN/turbulence/icing (we drop to
`warnings`), optional RMK decoding, offloading tokenizer maintenance.

**What gets harder / what we'd lose:**
- **Robustness regression:** we'd expose the app to library throws on live data unless every call is
  wrapped in try/catch — and on throw we get *nothing* (no partial parse), whereas today we degrade
  and flag `partial`.
- **Lose the `warnings[]`/`partial` signal** that drives the honest "parsed partially — check the
  raw" UI note. Neither library exposes it (aeharding #100 open).
- **Adapter is mandatory:** to preserve UI/risk we must convert library output → our `Metar`/
  `TafPeriod`/`Weather`/`CloudLayer` (units→knots/metres/hPa, synthesize a VV cloud layer, remap
  PROB-TEMPO→our `changeType:'PROB'`+`tempo`, keep `ceilingFt`/predicates/`summarizeTaf`). This is
  the same normalisation our parser already does — so a library mostly *moves* the work, not removes
  it.
- **@squawk specifically** would **lose data** (MPS, `///`) our parser keeps.

Options considered:

- **A — Replace both with one library.** ❌ Highest risk; exposes risk engine + UI to throws and to
  the PROB/VV/units remapping at once. No library is enough of a win to justify it.
- **B — Replace TAF only.** ❌ Our TAF parser already handles FM/BECMG/TEMPO/PROB correctly (spike
  parity) and feeds a bespoke `summarizeTaf`/worst-overlap engine keyed on our `TafPeriod` shape.
  A library's `trends[]` (base-on-root, PROB-as-TEMPO, no PROB enum in @squawk) would need remapping
  for no correctness gain.
- **C — Replace METAR only.** ❌ Our METAR parser is at parity with aeharding on every spike case and
  strictly more robust (never throws, keeps MPS/`///`). No gain.
- **D — Keep our parser; borrow ideas / harden tests.** ✅ **Recommended.** Lowest risk, keeps the
  never-throw guarantee, the `warnings` signal, and zero new dependency.
- **E — Hybrid adapter (library first-pass → our domain types).** ✅ **Recommended *design on file***
  for the future. If we ever adopt a library, do it as: aeharding behind an adapter at the
  `buildMetar`/App-TAF seam, wrapped in try/catch that **falls back to our parser on throw**
  (preserving never-throw), normalising into our existing types so UI/risk never see the library
  shape. Staged (one of METAR/TAF at a time), fully test-mirrored before cutover. Only worth it to
  unlock a concrete need (e.g. structured icing/turbulence/WS), which we don't have today.

## 7. Recommendation

**Adopt Option D now: keep the in-house parser.** Rationale, grounded in the spike:

1. **No correctness gap to fix.** The spike found zero tricky inputs our parser mishandles; aeharding
   matched us, and @squawk was *worse* (dropped MPS and `///`). "More reliable" isn't achieved by
   swapping to a library that throws on live data and loses tokens.
2. **We'd lose two safety properties** the app is built on: never-throwing on arbitrary live reports,
   and the `warnings`/`partial` honesty signal. Neither library offers either.
3. **A library mostly relocates work** (unit normalisation, VV synthesis, PROB remap, ceiling
   derivation) into a mandatory adapter, rather than removing it — so the maintenance win is smaller
   than it looks, against real migration risk to a tested, shipping decision path (371 tests).

**Concrete low-risk follow-ups (Option D "borrow"):**
- Harden our test corpus with edge cases surfaced here (e.g. `4000E` directional visibility;
  `//////CB`; `P6SM`/`M1/4SM`; INTER groups) so our parser stays robust.
- *Optionally, later:* parse `WS`/`TX`·`TN`/turbulence/icing structurally (today they go to
  `warnings`) **only if** a feature needs them — this is the one genuine capability gap vs the
  libraries.
- Keep this evaluation on file. **If** a future need justifies a library, use **Option E with
  `metar-taf-parser` (aeharding)** — the mature, MIT, zero-dep, browser-safe choice — behind an
  adapter with our-parser fallback. Not `@squawk` (pre-1.0 + coverage regressions), not
  `aewx-metar-parser` (METAR-only).

## 8. Risks & rollback

- **This research changed no production code.** Rollback = delete `research/parser-libraries/` and
  this doc; nothing else is affected. The isolated sandbox has its own `package.json`/`node_modules`
  and is not referenced by the app, Vite config, or CI.
- If Option E is pursued later, the rollback story is built into the design: the adapter falls back
  to our parser on any library throw, and our parser stays in-tree, so a library regression can be
  disabled by a one-line flip at the `buildMetar`/App-TAF seam.

## 9. Final answers (as asked)

- **Best candidate library:** `metar-taf-parser` (aeharding) — mature, MIT, zero-dep, TS-native,
  browser/Vite-safe, full METAR+TAF. `@squawk/weather` is the only other TAF-capable option but is
  pre-1.0 and *regressed* on MPS/`///` in our spike. `aewx-metar-parser` (fboes) is METAR-only.
- **Does the best candidate support both METAR and TAF well enough?** Yes for fields (spike parity),
  **but** it does not compute ceilings, exposes no partial-parse warnings, and **throws on some valid
  reports** (#124) — so it cannot be dropped in without an adapter + try/catch + our-parser fallback.
- **Browser/Vite?** Yes — ESM, zero runtime deps, no Node APIs, ~14 KB gz. (So is @squawk.)
- **Recommended migration path:** **Option D (keep our parser)** now; **Option E (hybrid adapter,
  aeharding, staged, with fallback)** held in reserve for a concrete future need.
- **Remaining risks:** if we ever migrate — library throws on live data, loss of the `warnings`
  signal, and adapter mapping bugs (VV, PROB-TEMPO, units). All mitigated by the Option-E fallback
  design. Doing nothing carries no new risk.
- **Do you need my approval before implementing a migration?** **Yes — and none is requested here.**
  This is research only; the recommendation is *not to migrate now*. If you want to proceed with
  Option E anyway, that needs your explicit go-ahead and would be a separate, staged, test-first PR.
