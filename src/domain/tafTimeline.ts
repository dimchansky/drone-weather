// Resolve a parsed TAF into a visual timeline band: prevailing-state SEGMENTS over a horizon
// (what the airport forecast says will be), plus TEMPO/PROB OVERLAYS (temporary or probabilistic
// deviations that must never look continuous or certain). Pure — the UI draws segments as solid
// blocks and overlays as hatched spans on the same time axis.
//
// TAF semantics honored here:
//   FM     — a complete new prevailing forecast from an instant (weather/clouds fully replaced;
//            wind/visibility carried forward when the group omits them — defensive).
//   BECMG  — a gradual change over (from, to): the listed elements amend the prevailing state at
//            `to`; DURING the window the segment is marked 'becoming' and carries the union of
//            old+new hazards (conservative — the change may happen any time in the window).
//   TEMPO / PROB / PROB TEMPO — overlays with their own window, probability and hazards; they
//            never mutate the prevailing state.
//   NSW    — clears the weather groups in a BECMG/TEMPO amendment (the parser keeps it in `raw`).
//   CAVOK  — clears weather and clouds, sets visibility ≥10 km.

import type { CloudLayer, Weather, Wind } from './types';
import type { ParsedTaf, TafHazardKind, TafPeriod } from './taf';
import {
  TAF_GUST_KT,
  TAF_GUST_SPREAD_KT,
  TAF_STRONG_WIND_KT,
  TAF_LOW_CEIL_FT,
  TAF_LOW_VIS_M,
} from './taf';
import { ceilingFt } from './clouds';
import { hasPrecip, hasSnow, hasThunderstorm } from './metar';

const HOUR = 3600000;

export interface TafBandSegment {
  from: Date;
  to: Date;
  /** 'becoming' = inside a BECMG transition window (conditions changing, exact time unknown). */
  kind: 'prevailing' | 'becoming';
  hazards: TafHazardKind[];
  /** Worst supporting values across the segment (for compact UI chips). */
  gustKt?: number;
  ceilingFt?: number;
  visM?: number;
  /** Weather group codes active in the state (e.g. ['-SHRA']). */
  wxRaw: string[];
}

export interface TafBandOverlay {
  from: Date;
  to: Date;
  probPct?: number; // PROB30 / PROB40
  tempo: boolean; // TEMPO or PROB TEMPO ("at times")
  hazards: TafHazardKind[];
  gustKt?: number;
  ceilingFt?: number;
  visM?: number;
  wxRaw: string[];
}

export interface TafTimeline {
  /** False when there is no TAF or its validity doesn't overlap the horizon. */
  available: boolean;
  from: Date;
  to: Date;
  /** The TAF's validity ends before the requested horizon (the band should say so). */
  endsBeforeHorizon: boolean;
  segments: TafBandSegment[];
  overlays: TafBandOverlay[];
}

/** The prevailing airport state as it evolves through the TAF's change groups. */
interface TafState {
  wind: Wind | undefined;
  visibilityM: number | null | undefined;
  weather: Weather[];
  clouds: CloudLayer[];
}

interface StateHazards {
  hazards: TafHazardKind[];
  gustKt?: number;
  ceilingFt?: number;
  visM?: number;
  wxRaw: string[];
}

/** Same hazard bands as summarizeTaf, evaluated on a (possibly merged) prevailing state. */
function stateHazards(state: TafState): StateHazards {
  const out: StateHazards = { hazards: [], wxRaw: state.weather.map((w) => w.raw) };
  const fields = { weather: state.weather, clouds: state.clouds };
  const storm = hasThunderstorm(fields);
  if (storm) out.hazards.push('thunderstorm');
  const ceil = ceilingFt(state.clouds);
  if (ceil != null && ceil < TAF_LOW_CEIL_FT) {
    out.hazards.push('lowCeiling');
    out.ceilingFt = ceil;
  }
  if (state.visibilityM != null && state.visibilityM < TAF_LOW_VIS_M) {
    out.hazards.push('lowVis');
    out.visM = state.visibilityM;
  }
  if (state.wind) {
    const g = state.wind.gustKt;
    const s = state.wind.speedKt;
    if (g != null && (g >= TAF_GUST_KT || g - s >= TAF_GUST_SPREAD_KT)) {
      out.hazards.push('gusts');
      out.gustKt = g;
    } else if (s >= TAF_STRONG_WIND_KT) {
      out.hazards.push('strongWind');
    }
  }
  if (!storm) {
    if (hasSnow(fields)) out.hazards.push('snow');
    else if (hasPrecip(fields)) out.hazards.push('rain');
  }
  return out;
}

const hasNsw = (pd: TafPeriod): boolean => pd.raw.split(/\s+/).includes('NSW');

/** FM: a complete new forecast — weather/clouds fully replaced; wind/vis carried when omitted. */
function applyFm(state: TafState, pd: TafPeriod): TafState {
  return {
    wind: pd.wind ?? state.wind,
    visibilityM: pd.cavok ? 10000 : (pd.visibilityM ?? state.visibilityM),
    weather: pd.cavok ? [] : pd.weather,
    clouds: pd.cavok ? [] : pd.clouds,
  };
}

/** BECMG: only the mentioned elements amend the prevailing state (NSW/CAVOK clear theirs). */
function applyBecmg(state: TafState, pd: TafPeriod): TafState {
  return {
    wind: pd.wind ?? state.wind,
    visibilityM: pd.cavok ? 10000 : (pd.visibilityM ?? state.visibilityM),
    weather: pd.cavok || hasNsw(pd) ? [] : pd.weather.length > 0 ? pd.weather : state.weather,
    clouds: pd.cavok ? [] : pd.clouds.length > 0 ? pd.clouds : state.clouds,
  };
}

/** Merge two hazard evaluations conservatively (union of kinds, worst supporting values). */
function unionHazards(a: StateHazards, b: StateHazards): StateHazards {
  return {
    hazards: [...new Set([...a.hazards, ...b.hazards])],
    gustKt: a.gustKt == null ? b.gustKt : b.gustKt == null ? a.gustKt : Math.max(a.gustKt, b.gustKt),
    ceilingFt:
      a.ceilingFt == null ? b.ceilingFt : b.ceilingFt == null ? a.ceilingFt : Math.min(a.ceilingFt, b.ceilingFt),
    visM: a.visM == null ? b.visM : b.visM == null ? a.visM : Math.min(a.visM, b.visM),
    wxRaw: [...new Set([...a.wxRaw, ...b.wxRaw])],
  };
}

const sameHazards = (a: TafBandSegment, b: StateHazards, kind: TafBandSegment['kind']): boolean =>
  a.kind === kind &&
  a.hazards.join() === b.hazards.join() &&
  a.gustKt === b.gustKt &&
  a.ceilingFt === b.ceilingFt &&
  a.visM === b.visM &&
  a.wxRaw.join() === b.wxRaw.join();

/**
 * Resolve the TAF's prevailing state and overlays over [now, now+horizonH], clipped to the TAF's
 * validity. Segments cover the clipped horizon exactly (no gaps, no overlaps).
 */
export function resolveTafTimeline(taf: ParsedTaf | null, now: Date, horizonH = 12): TafTimeline {
  const empty: TafTimeline = {
    available: false,
    from: now,
    to: now,
    endsBeforeHorizon: false,
    segments: [],
    overlays: [],
  };
  if (!taf || taf.periods.length === 0) return empty;

  const validFrom = taf.validFrom ?? taf.issuedAt ?? now;
  const horizonEnd = new Date(now.getTime() + horizonH * HOUR);
  const validTo = taf.validTo ?? horizonEnd;
  const from = new Date(Math.max(now.getTime(), validFrom.getTime()));
  const to = new Date(Math.min(horizonEnd.getTime(), validTo.getTime()));
  if (to.getTime() <= from.getTime()) return empty;
  const endsBeforeHorizon = validTo.getTime() < horizonEnd.getTime();

  // Prevailing-state change events, in document order (the TAF lists them chronologically).
  const base = taf.periods[0];
  const initial: TafState = {
    wind: base.wind,
    visibilityM: base.cavok ? 10000 : base.visibilityM,
    weather: base.weather,
    clouds: base.clouds,
  };
  type Ev = { t: number; apply: (s: TafState) => TafState };
  const events: Ev[] = [];
  const becmgWindows: { from: number; to: number; pd: TafPeriod }[] = [];
  for (const pd of taf.periods) {
    if (pd.changeType === 'FM' && pd.from) {
      events.push({ t: pd.from.getTime(), apply: (s) => applyFm(s, pd) });
    } else if (pd.changeType === 'BECMG' && pd.from && pd.to) {
      becmgWindows.push({ from: pd.from.getTime(), to: pd.to.getTime(), pd });
      events.push({ t: pd.to.getTime(), apply: (s) => applyBecmg(s, pd) });
    }
  }

  // Interval boundaries: horizon edges + every state change or BECMG window edge inside.
  const cuts = new Set<number>([from.getTime(), to.getTime()]);
  for (const e of events) if (e.t > from.getTime() && e.t < to.getTime()) cuts.add(e.t);
  for (const w of becmgWindows) {
    if (w.from > from.getTime() && w.from < to.getTime()) cuts.add(w.from);
    if (w.to > from.getTime() && w.to < to.getTime()) cuts.add(w.to);
  }
  const bounds = [...cuts].sort((a, b) => a - b);

  const segments: TafBandSegment[] = [];
  let state = initial;
  let evIdx = 0;
  for (let bi = 0; bi < bounds.length - 1; bi++) {
    const a = bounds[bi];
    const b = bounds[bi + 1];
    // Apply every state change effective at or before this interval's start.
    while (evIdx < events.length && events[evIdx].t <= a) state = events[evIdx++].apply(state);

    let hz = stateHazards(state);
    let kind: TafBandSegment['kind'] = 'prevailing';
    for (const w of becmgWindows) {
      if (w.from <= a && b <= w.to) {
        // Inside the transition: conditions are somewhere between old and new — union, marked.
        kind = 'becoming';
        hz = unionHazards(hz, stateHazards(applyBecmg(state, w.pd)));
      }
    }

    const prev = segments[segments.length - 1];
    if (prev && prev.to.getTime() === a && sameHazards(prev, hz, kind)) {
      prev.to = new Date(b); // extend — identical adjacent intervals merge into one segment
    } else {
      segments.push({ from: new Date(a), to: new Date(b), kind, ...hz });
    }
  }

  // TEMPO / PROB overlays clipped to the horizon; evaluated on their own listed elements.
  const overlays: TafBandOverlay[] = [];
  for (const pd of taf.periods) {
    const isOverlay = pd.changeType === 'TEMPO' || pd.changeType === 'PROB';
    if (!isOverlay || !pd.from || !pd.to) continue;
    const oa = Math.max(pd.from.getTime(), from.getTime());
    const ob = Math.min(pd.to.getTime(), to.getTime());
    if (ob <= oa) continue;
    const hz = stateHazards({
      wind: pd.wind,
      visibilityM: pd.cavok ? 10000 : pd.visibilityM,
      weather: pd.weather,
      clouds: pd.clouds,
    });
    overlays.push({
      from: new Date(oa),
      to: new Date(ob),
      probPct: pd.probPct,
      tempo: pd.tempo ?? false,
      ...hz,
    });
  }
  overlays.sort((x, y) => x.from.getTime() - y.from.getTime());

  return { available: true, from, to, endsBeforeHorizon, segments, overlays };
}
