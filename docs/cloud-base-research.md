# Cloud-base & wet-layer research

Status: **research note + implementation proposal** — no production logic changed yet.
Date: 2026-06-29. Author of evidence: `research/cloud-base/` (reproducible harness + fixtures).

The current fallback cloud-base estimate is Espy's law:

```
cloud_base ≈ 125 m × (T − Td)        # src/domain/clouds.ts estimatedCloudBaseM()
```

This note answers: what does that formula actually estimate, what better approximations the
Open-Meteo profile makes possible, how they compare against real METARs, and what the app
should do. The real objective is **not** one pretty cloud-base number — it is *"will the drone
climb into wet air (cloud, fog, near-saturation, precip, dew) and roughly where?"*

---

## 0. How this was researched (reproducible)

Everything below is backed by a script you can re-run:

| File | Purpose |
|------|---------|
| `research/cloud-base/fetch.mjs` | Snapshots METAR (aviationweather.gov) + Open-Meteo profiles for a 39-station, climate/timezone-diverse sample → `fixtures/*.json`. |
| `research/cloud-base/methods.ts` | Pure candidate estimators (A–D), isolated so the harness and a future production port share one definition. |
| `research/cloud-base/cloudBase.research.test.ts` | Reuses the **real app domain code** (`parseMetar`, `parseProfile`, `resolveCloudBase`, Magnus dew point, inversion detector) against the fixtures; runs all methods; prints the tables in `RESULTS.txt`. |
| `research/cloud-base/RESULTS.txt` | Captured output (the tables quoted below). |
| `research/cloud-base/fixtures/` | Raw upstream JSON for each station — the analysis is deterministic against these. |

Run the analysis (skipped in the normal suite, like the live smoke test):

```bash
node research/cloud-base/fetch.mjs            # refresh fixtures (live network)
RESEARCH=1 npx vitest run research/cloud-base/cloudBase.research.test.ts
```

Sample captured at ~09:00Z 2026-06-29: marine-layer inversions (KSFO, KMRY, KSMX, KACV),
NW-Europe low stratus/drizzle (EGPF, EIDW, BIKF), desert CAVOK (OMDB, OERK, KPHX), tropical
convection (RPLL CB, WSSS TCU, VTBS), high-elevation (SLLP ~4000 m, KDEN, KABQ), fog
(SLLP BCFG, KSMX BR), monsoon mist (VABB), and clear/NCD (KATL, NZAA).

**Validation caveat (honest):** a METAR cloud base is itself a ceilometer estimate at a point;
the model is a grid-cell forecast valid on the hour. Differences below are *indicative*, not
ground truth, and the sample is one snapshot. We look for **mechanisms and failure modes**, not
a leaderboard, and we deliberately do not overfit to 39 rows.

---

## 1. What does `125 × (T − Td)` actually estimate?

It estimates the **parcel Lifting Condensation Level (LCL)**: the height to which a parcel of
*surface* air must be lifted, cooling dry-adiabatically, before it saturates and a cloud forms.

Derivation of the coefficient:

- A rising unsaturated parcel cools at the **dry adiabatic lapse rate** ≈ **9.8 °C/km**.
- Its **dew point** falls much more slowly as pressure drops, ≈ **1.8 °C/km**.
- So the temperature–dew-point spread closes at ≈ 9.8 − 1.8 = **8 °C/km**.
- Height to close a 1 °C surface spread = 1 / 8 km = **125 m per °C**. ∎

What it assumes — and therefore where it is valid:

1. A **parcel lifted from the surface** (convective / well-mixed boundary layer).
2. **Dry-adiabatic** ascent (no entrainment) until saturation.
3. A **fixed** dew-point lapse — independent of the actual air above.

Crucially, **Espy describes the parcel, not the environment.** It says nothing about whether
the air the drone is actually climbing through is wet. Those coincide *only* when the boundary
layer is well-mixed (environment ≈ dry adiabat). They diverge exactly in the cases the brief
cares about most — mornings, inversions, stratus, fog.

### Four quantities that must not be conflated

| # | Quantity | What it answers | Source |
|---|----------|-----------------|--------|
| A | **Parcel LCL** (Espy 125×spread) | Where would a lifted *surface* parcel make cloud? (≈ cumulus base) | surface T/Td |
| B | **Environmental saturation height** | Where is the *ambient* air already near-saturated? (what wets a climbing drone / stratus & fog) | model T+RH profile |
| D | **Model cloud layer** | Lowest model level the forecast paints as cloudy | model cloud-cover profile |
| — | **METAR observed ceiling/base** | What a sensor actually measured over the station | observation |

A, B, D answer *different physical questions*. The app's job is to pick the right one per
situation and label it honestly — not to average them into one false number.

---

## 2. Methods evaluated

- **A — Espy / parcel LCL.** `max(0, 125 × spread)` from surface T/Td. Baseline & fallback.
- **B — Environmental saturation height.** Walk model levels (surface→aloft), dew point per
  level from T+RH via Magnus; lowest height where spread ≤ 1 °C **or** RH ≥ 95 %, with linear
  interpolation of the spread between bracketing levels. **Scans all levels — no monotonic
  assumption**, so it survives inversions (a level can re-saturate above a dry layer). Evaluated
  at the app's level set and with **975 hPa added** (~300 m, which the app currently skips).
- **C — Profile-aware LCL.** `z = spread₀ / (Γ_T − Γ_Td)` using the model's *actual* low-level T
  and Td gradients instead of the fixed 8 °C/km. Investigated as "can we improve the 125
  coefficient?"
- **D — Model cloud-cover profile.** Lowest pressure level with cloud cover ≥ 50 %.
- **E — Source-priority (the app today).** `resolveCloudBase`: observed layers → CAVOK → model
  cloud tier → Espy estimate.

---

## 3. Results

Full tables in `research/cloud-base/RESULTS.txt`. Key extracts (heights m AGL):

### 3.1 Cloud-base error vs METAR lowest reported layer (n = 22 with a measurable layer)

```
method                      n    MAE(m)   bias(m)
A  Espy 125×spread          22    528      -345
B  env-sat (app levels)      7    237       -67
B  env-sat (+975 levels)     8    364       +74
D  model cloud≥50%           8    678      -125
E  app resolveCloudBase     22      0         0   ← trivially 0: echoes the observed layer
```

Read this carefully:

- **E ≈ 0 MAE is not a victory, it's a tautology.** Every one of the 22 measurable stations
  *reported* a layer, so `resolveCloudBase` returned the observation. This just confirms the app
  correctly prefers observation — and that **the cases where we actually need an estimate (no
  reported layer) are exactly the cases where METAR gives no base to validate against.** That
  asymmetry is the central honesty problem of cloud-base estimation.
- **B (environmental saturation) only fires when the model finds a near-saturated layer** (7–8
  of 22). When it fires for *stratus over a moist boundary layer* it is good: EGPF 461 vs 518
  observed, EIDW 487 vs 549, VABB 389 vs 549. When the cloud is *convective cumulus*, B answers
  the wrong question — it finds an elevated moist layer, not the cumulus base: RJTT 1204 vs 610,
  RPLL 1861 vs 701.
- **A (Espy) is the only universal estimator** and is a *reasonable order-of-magnitude* guide for
  cumulus base in a mixed layer (RJTT 500 vs 610, RPLL 750 vs 701, VTBS 1000 vs 610) but carries
  a large spread of errors and a low bias.
- **Adding 975 hPa barely moved cloud-base accuracy** (n only 7→8). Its real value is *vertical
  resolution* in the 100–500 m gap for the analyzer/icing display and the model cloud tier — a
  modest, optional improvement, **not** an accuracy fix.

### 3.2 The decisive finding — the drone-wetness objective

Only **1 / 39** stations had wet air strictly inside the ≤120 m ops band (SLLP, freezing fog at
La Paz) — too thin to score. Widening to a **drone-relevant low wet layer (≤ 500 m)** gives
7 true cases (the marine-layer / fog / low-stratus cluster):

```
LOW WET LAYER ≤500 m detection   (truth: 7/39)
A  Espy ≤500 m                 TP 6   FN 1   FP 8   TN 24
B  env-sat(+975) ≤500 m        TP 3   FN 4   FP 3   TN 29
D  model cloud≥50% ≤500 m      TP 2   FN 5   FP 4   TN 28
```

**The coarse model under-detects the shallow, surface-based saturation that actually wets a
drone.** B and D miss 4–5 of the 7 low wet layers; the **surface dew-point signal (A / spread)
catches 6 of 7.** Concretely:

- **KSFO** — METAR `FEW008` (244 m) marine stratus. Surface spread 2 °C → Espy 250 m (excellent).
  The model's low cloud cover was **3 %** and B found **no** saturated layer — it smoothed the
  shallow marine layer away.
- **KACV / SLLP** — overcast 366 m / fog 61 m; B = "—" (model misses it), Espy = 125 m / 0 m.
- **KSMX** — `BR BKN009 11/11`, spread 0 → both A and B = 0 (surface saturated). Correct: near-fog.

The mechanism: Open-Meteo's usable low levels here are surface → ~100 m → ~300 m, then grid
smoothing dilutes a 100–200 m moist layer. **For the low band, the point observation (METAR T/Td,
or model 2 m as fallback) beats the model profile.** This is the opposite of the intuition that
"more vertical data = better," and it is the single most important result for this app.

> High-elevation corollary: at SLLP (~4000 m) most 1000–850 hPa pressure levels are *below
> ground*, so the model profile is even thinner (`profileAwareLCL` returned "insufficient
> levels"). Surface observation is essential there.

### 3.3 Where Espy fails badly — false precision in clear/dry air

Espy **always emits a number**, even when the sky is clear:

```
KPHX  CLR    T29/Td−6  spread 35  → Espy "cloud base" 4375 m   (sky clear)
OERK  CAVOK  T41/Td−6  spread 47  → Espy 5875 m                (CAVOK)
KATL  CLR    T25/Td22  spread  3  → Espy 375 m                 (sky clear — but low!)
```

- For **clear/dry** air Espy invents a precise-looking 4–6 km base that does not exist. The
  honest statement is "no low cloud / clear," which **B correctly produces** (returns "no
  saturated layer") and **CAVOK already encodes** (`≥ 1500 m` lower bound — validated: the app's
  CAVOK tier is the right behaviour, the per-station Espy numbers for CAVOK rows are pure noise).
- KATL is the trap: low spread → low Espy base (375 m) even though the sky is reported clear.
  Espy's number must never be shown as a confident low cloud without corroboration.

### 3.4 Inversions break the *physics* of Espy — and method C

**17 / 39 stations showed a low-level inversion.** In an inversion the environmental spread
usually *widens* with height, so `profileAwareLCL` (method C) has no solution and correctly
returns **invalid** ("spread not closing with height") for 14 of the divergence cases. Examples:

```
KPHX  inv +1.1°C@152m   A=4375   C: invalid
KSFO  inv +7.4°C@764m   A=250    C: 1861 m (665 m/°C)   ← env coefficient 5× the textbook 125
KMRY  inv +2.9°C@719m   A=375    C:  130 m ( 77 m/°C)   ← env coefficient 0.6× textbook
```

Two conclusions:

1. **Do not "improve" the 125 coefficient with environmental lapse rates.** The implied
   coefficient ranges from 77 to 665 m/°C and is *undefined* in inversions. 125 m/°C is a correct
   property of the *lifted parcel*; the environment's lapse rate governs *stability* (whether the
   parcel keeps rising), not the LCL. Method C is therefore **rejected as an estimator** — but its
   `invalid` flag is valuable as an **honesty signal**: "spread is not closing with height →
   cloud-base-by-lifting is unreliable here."
2. Espy can still be numerically *lucky* for shallow surface-based stratus under an inversion
   (KSFO 250 vs 244) because that cloud forms at the top of the thin saturated surface layer,
   near where surface spread → 0. But under a **dry** surface layer beneath an inversion
   (KPHX, KABQ) the same formula yields multi-km nonsense. The differentiator is **surface RH /
   spread**, not the formula.

---

## 4. Answers to the success-criteria questions

1. **What does 125×spread estimate?** The parcel LCL — cumulus base for a lifted *surface*
   parcel. A property of the parcel, not of the air the drone climbs through.
2. **When is it good enough?** Convective / well-mixed boundary layers with moderate spread
   (fair-weather cumulus): order-of-magnitude correct. And, by luck, shallow surface-saturated
   stratus where surface spread ≈ 0.
3. **When does it fail badly?** (a) Clear/dry air — invents a precise multi-km base (KPHX 4375 m,
   OERK 5875 m). (b) Inversions with a dry surface layer — same. (c) It cannot distinguish "low
   cloud you'll fly into" from "clear sky" when spread is small-but-clear (KATL).
4. **Does the Open-Meteo cloud/RH profile improve results?** For **stratus / elevated moist
   layers**, modestly yes (B: EGPF/EIDW/VABB within ~60 m). For the **shallow low band that wets
   drones, no** — the model under-detects it (misses 4–5 of 7); the surface observation wins.
   975 hPa improves *display resolution*, not cloud-base accuracy.
5. **Should cloud base and wetness be separate outputs?** **Yes — emphatically.** They answer
   different questions and the validation shows they need different data (cloud base ← layered
   priority incl. model; wetness ← surface-saturation + observed wx + cloud-immersion). The app
   already separates them; this research confirms the split is correct.
6. **How should confidence be labelled?** `observed` (METAR layer) ≫ `observed: CAVOK lower
   bound` > `model (coarse)` > `estimate (rough)` > `no low cloud (clear/high base)`. Never a bare
   number without a source tag.

---

## 5. Recommended algorithm

Keep the app's two-output design; the research **validates the existing source priority** and
asks for targeted honesty refinements rather than a rewrite.

### Output 1 — Cloud base (one labelled estimate). Priority unchanged, two refinements:

1. **Observed METAR layers** → lowest base. Label `observed`. *(authority — never overridden)*
2. **CAVOK** → "≥ 1500 m (no cloud below 5000 ft)". Label `observed: CAVOK lower bound`.
3. **Model cloud profile** (lowest level cloud ≥ 50 %, optionally + RH ≥ 90 %) → label
   `model · coarse`. Only when it actually finds low cloud below the cap.
4. **Espy spread estimate** → label `estimate · rough`, **but gated** (this is the new part):
   - If spread is large / the implied base is high (e.g. ≳ 1000–1500 m) **and** the model shows
     no significant low cloud **and** the surface is not near-saturated → present as
     **"no significant low cloud (clear / high base ≳ X)"**, not a hard number. This kills the
     KPHX-4375 m / OERK-5875 m false precision.
   - When an inversion + dry surface is detected (method C `invalid` and surface spread large),
     attach the honesty note: *"temperature inversion aloft — spread-based base is unreliable."*

### Output 2 — Wet-air / moisture exposure (the real objective; the app's moisture risk)

Drive primarily off **near-surface saturation + observed weather**, because §3.2 shows that is
what's reliable for the low band. Worst driver wins (the app already does this):

1. **Observed wx** (fog / freezing fog / precip / mist) — METAR authority. *(highest)*
2. **Near-surface saturation** — surface spread/RH/dew (METAR T/Td first, model 2 m fallback).
   This is the validated workhorse for the low band (caught 6/7). Keep the dew amplifier.
3. **Cloud immersion** — Output-1 cloud base within / just above the ops band.
4. **Model supplements (coarse, additive only):** precip probability, low-cloud cover, and —
   new — an **elevated near-saturated layer** from method B (e.g. "model shows a near-saturated
   layer ~900 m you'd climb into"). Model signals may **add** a caution but must **never suppress**
   a surface-driven one (they miss shallow layers).

Espy stays as the **last-resort fallback number** for Output 1 only, always labelled approximate
and gated as above. It is never used to *lower* a wetness assessment.

---

## 6. UI labelling (anti-false-precision)

- Cloud base always shows its kind: `reported` / `CAVOK ≥` / `model · coarse` / `est · rough` /
  `no low cloud`. Never a bare number.
- The estimate tier shows a band or "≈", not a 4-digit metre value, and flips to qualitative
  ("clear / high base") when gated off.
- Wetness reason names the source: "METAR: light rain" vs "model: 0.3 mm/h, 70 %" vs
  "near-saturation RH 98 %, calm — dew likely" vs "model: near-saturated layer ~900 m".
- Surface vs model is explicit; "coarse (model-level resolution)" stays on any model-derived base.
- Inversion honesty note surfaces where spread-based reasoning is unreliable.

---

## 7. Limitations for drone pilots (state in UI/notes)

- **The 0–150 m band is the model's blind spot.** Open-Meteo's usable low levels are ~surface,
  ~100 m, ~300 m; grid smoothing erases shallow fog / marine stratus (KSFO, KACV). Sub-150 m
  truth comes from **nearby METAR + surface dew/RH**, not the profile.
- **A spread-based cloud base is an estimate, not an observation** — wrong by hundreds of metres
  and physically invalid in inversions/clear air.
- **Model grid ≠ your microclimate** — lakes, forests, valleys, coastlines make local fog/dew the
  model never sees. Precip *probability* ≠ precip *occurrence*.
- **High-elevation sites have even thinner model profiles** (pressure levels below ground).
- **The dew amplifier uses the device clock** as a night/morning proxy.
- Wetness below ~120 m matters more to a non-waterproof drone than a theoretical 900 m base; the
  app prioritises the low band accordingly.

---

## 8. Implementation plan (proposal — do **not** start until approved)

Small, surgical changes; the architecture and priority order stay. Domain stays pure & tested.

### 8.1 Domain logic
- **`src/domain/clouds.ts`** — promote the candidate estimators from `research/cloud-base/methods.ts`
  into the domain (`envSaturationHeight`, optional `profileAwareLCL` *diagnostic only*). Gate the
  `estimate` tier in `resolveCloudBase`: when Espy base is high **and** no model low cloud **and**
  surface not near-saturated → return a new `kind: 'none-low'` / "no significant low cloud
  (clear/high base)" instead of a confident metre value. Add an `unreliable`/`note` flag when an
  inversion is present (reuse `detectInversion`).
- **`src/domain/risk.ts`** — `moistureRisk`: add a **coarse, additive** elevated-near-saturation
  caution from the model profile (method B over `profile.levels`), clearly labelled `model`.
  Keep surface-saturation as the dominant low-band driver; model never downgrades it.
- **`src/data/openMeteo.ts`** — *optional*: add `975` to `LEVELS` for 100–500 m resolution
  (helps the analyzer + model cloud tier; ~no accuracy change). Low risk, low payoff — flag as
  optional.
- Keep **icing** unchanged (freezing-specific).

### 8.2 UI / source labels
- `CloudsCard` — render the new `none-low` state and the inversion-unreliable note; show the
  estimate tier as a band/≈, not a 4-digit value.
- `RiskSummary` / moisture row — when the driver is a model elevated layer, show the `model ·
  coarse` tag and height.
- `VerticalAnalyzer` — if 975 hPa is added, the existing 300 m tick gains a real model level.

### 8.3 Tests to add
- `methods`/clouds unit tests: `envSaturationHeight` — surface-saturated → 0; inversion
  re-saturation; none-below-cap → null; interpolation. `profileAwareLCL` — `invalid` on
  inversion. (Port the research cases as fixtures.)
- `resolveCloudBase` gating: clear/dry → `none-low` (KPHX/OERK-like); CAVOK lower bound; model
  tier fires only with low cloud; inversion note.
- `moistureRisk`: elevated model near-saturation adds a caution; a shallow surface-saturated case
  still dominates over an absent model layer (KSFO-like).

### 8.4 Fallback behaviour (unchanged guarantees)
- Observed METAR layers and CAVOK always win over any model/estimate.
- Model-derived base always carries `coarse`; estimate always carries `rough` and is gated.
- Espy never lowers a wetness verdict; it is a display fallback for Output 1 only.

### 8.5 Out of scope
- Replacing the 125 coefficient with environmental lapse rates (method C as estimator — rejected).
- Pretending sub-150 m model resolution exists.
- Fetching additional pressure levels beyond the optional 975 hPa.
