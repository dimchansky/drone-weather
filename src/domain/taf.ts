// TAF (Terminal Aerodrome Forecast) parser — pure, MVP. Parses the raw TAF text into change
// periods, reusing the METAR token parsers (wind/visibility/weather/clouds). Designed to NEVER
// throw: unsupported or unknown tokens (WS, TX/TN, turbulence/icing groups, junk) are recorded in
// `warnings` so the UI can flag a partial parse and point the pilot at the verbatim raw TAF.
//
// Scope (MVP): BASE, FM, BECMG, TEMPO, PROB / PROB TEMPO; INTER (intermittent) is treated as
// TEMPO-like (its origin stays visible in the group's raw text); wind + gusts, visibility, weather,
// clouds/ceiling, CAVOK. Times are UTC (aviation convention). Out of scope: temps (TX/TN), wind
// shear (WS), turbulence/icing groups — all flow into `warnings`.

import type { CloudLayer, Severity, Weather, Wind } from './types';
import { ceilingFt } from './clouds';
import {
  WIND_RE,
  VAR_RE,
  VIS_M_RE,
  DIR_VIS_RE,
  VIS_SM_RE,
  FRACTION_SM_RE,
  parseWind,
  parseWeatherToken,
  parseCloudToken,
  hasPrecip,
  hasSnow,
  hasThunderstorm,
} from './metar';

export type TafChangeType = 'BASE' | 'FM' | 'BECMG' | 'TEMPO' | 'PROB';

export interface TafPeriod {
  changeType: TafChangeType;
  from: Date | null;
  to: Date | null; // null for FM (prevails until the next FM / validity end)
  probPct?: number; // PROB / PROB TEMPO
  tempo?: boolean; // TEMPO or PROB TEMPO — temporary/conditional fluctuation
  wind?: Wind;
  visibilityM?: number | null;
  cavok?: boolean;
  weather: Weather[];
  clouds: CloudLayer[];
  raw: string; // this group's verbatim text
}

export interface ParsedTaf {
  icao: string;
  issuedAt: Date | null;
  validFrom: Date | null;
  validTo: Date | null;
  periods: TafPeriod[];
  /** Unsupported / unknown tokens encountered — non-empty means a PARTIAL parse (check the raw). */
  warnings: string[];
  raw: string;
}

export interface ParseTafOptions {
  /** Anchor for resolving day/hour groups to absolute UTC instants (defaults to now). */
  reference?: Date;
}

const ICAO_RE = /^[A-Z][A-Z0-9]{3}$/;
const ISSUE_RE = /^(\d{6})Z$/; // ddhhmmZ
const PERIOD_RE = /^(\d{4})\/(\d{4})$/; // ddhh/ddhh
const FM_RE = /^FM(\d{6})$/; // FMddhhmm
const PROB_RE = /^PROB(\d{2})$/;
const DAY = 86400000;

/** Resolve a day/hour(/minute) to an absolute UTC Date near `ref` (handles month rollover; hh=24 → next 00Z). */
function resolveTime(day: number, hh: number, mm: number, ref: Date): Date {
  let year = ref.getUTCFullYear();
  let month = ref.getUTCMonth();
  let d = new Date(Date.UTC(year, month, day, hh, mm)); // Date.UTC normalises hh=24 → next day 00
  if (d.getTime() - ref.getTime() > 20 * DAY) {
    // Candidate is far ahead → it actually belongs to the previous month.
    if (--month < 0) { month = 11; year -= 1; }
    d = new Date(Date.UTC(year, month, day, hh, mm));
  } else if (ref.getTime() - d.getTime() > 20 * DAY) {
    // Candidate is far behind → next month.
    if (++month > 11) { month = 0; year += 1; }
    d = new Date(Date.UTC(year, month, day, hh, mm));
  }
  return d;
}

const ddhh = (s: string, ref: Date): Date => resolveTime(+s.slice(0, 2), +s.slice(2, 4), 0, ref);
const ddhhmm = (s: string, ref: Date): Date =>
  resolveTime(+s.slice(0, 2), +s.slice(2, 4), +s.slice(4, 6), ref);

const emptyPeriod = (changeType: TafChangeType, from: Date | null, to: Date | null): TafPeriod => ({
  changeType,
  from,
  to,
  weather: [],
  clouds: [],
  raw: '',
});

export function parseTaf(raw: string, opts: ParseTafOptions = {}): ParsedTaf {
  const ref0 = opts.reference ?? new Date();
  const cleaned = raw.trim().replace(/=+$/, '');
  const tokens = cleaned.split(/\s+/).filter((t) => t && t !== 'TAF' && t !== 'AMD' && t !== 'COR');
  const warnings: string[] = [];

  const out: ParsedTaf = {
    icao: '',
    issuedAt: null,
    validFrom: null,
    validTo: null,
    periods: [],
    warnings,
    raw: cleaned,
  };

  let i = 0;
  if (i < tokens.length && ICAO_RE.test(tokens[i]) && !WIND_RE.test(tokens[i])) {
    out.icao = tokens[i++];
  }
  let m: RegExpMatchArray | null;
  if (i < tokens.length && (m = tokens[i].match(ISSUE_RE))) {
    out.issuedAt = ddhhmm(m[1], ref0);
    i++;
  }
  if (i < tokens.length && (m = tokens[i].match(PERIOD_RE))) {
    out.validFrom = ddhh(m[1], ref0);
    out.validTo = ddhh(m[2], ref0);
    i++;
  }

  const ref = out.validFrom ?? out.issuedAt ?? ref0;

  const periods: TafPeriod[] = [];
  let current = emptyPeriod('BASE', out.validFrom, out.validTo);
  let rawParts: string[] = [];
  const open = (p: TafPeriod) => {
    current.raw = rawParts.join(' ');
    periods.push(current);
    current = p;
    rawParts = [];
  };

  for (; i < tokens.length; i++) {
    const tok = tokens[i];

    // ---- change-group headers ----
    if ((m = tok.match(FM_RE))) {
      open(emptyPeriod('FM', ddhhmm(m[1], ref), null));
      rawParts.push(tok);
      continue;
    }
    // INTER (intermittent, chiefly Australian) is a temporary fluctuation like TEMPO — map it to a
    // TEMPO period; the raw group text keeps "INTER" so its origin stays visible.
    if (tok === 'BECMG' || tok === 'TEMPO' || tok === 'INTER') {
      const pm = tokens[i + 1]?.match(PERIOD_RE);
      open(
        emptyPeriod(
          tok === 'BECMG' ? 'BECMG' : 'TEMPO',
          pm ? ddhh(pm[1], ref) : null,
          pm ? ddhh(pm[2], ref) : null,
        ),
      );
      if (tok === 'TEMPO' || tok === 'INTER') current.tempo = true;
      rawParts.push(tok);
      if (pm) rawParts.push(tokens[++i]);
      continue;
    }
    if ((m = tok.match(PROB_RE))) {
      const prob = +m[1];
      const parts = [tok];
      let j = i + 1;
      let tempo = false;
      if (tokens[j] === 'TEMPO') { tempo = true; parts.push(tokens[j]); j++; }
      const pm = tokens[j]?.match(PERIOD_RE);
      if (pm) parts.push(tokens[j]);
      open(emptyPeriod('PROB', pm ? ddhh(pm[1], ref) : null, pm ? ddhh(pm[2], ref) : null));
      current.probPct = prob;
      if (tempo) current.tempo = true;
      rawParts.push(...parts);
      i = pm ? j : j - 1;
      continue;
    }

    // ---- field tokens within the current group ----
    rawParts.push(tok);
    if ((m = tok.match(WIND_RE))) {
      current.wind = parseWind(m);
      continue;
    }
    if ((m = tok.match(VAR_RE))) {
      if (current.wind) {
        current.wind.variable = true;
        current.wind.varFromDeg = +m[1];
        current.wind.varToDeg = +m[2];
      }
      continue;
    }
    if (tok === 'CAVOK') {
      current.cavok = true;
      current.visibilityM = 10000;
      continue;
    }
    if (tok === 'NSW') continue; // "no significant weather" — recognised, nothing to store
    // Visibility in statute miles, possibly "1 1/2SM" across two tokens.
    if (/^\d{1,2}$/.test(tok) && FRACTION_SM_RE.test(tokens[i + 1] ?? '')) {
      const frac = tokens[i + 1].match(FRACTION_SM_RE)!;
      const miles = parseInt(tok, 10) + parseInt(frac[1], 10) / parseInt(frac[2], 10);
      current.visibilityM = Math.min(10000, Math.round(miles * 1609.344));
      rawParts.push(tokens[++i]);
      continue;
    }
    if ((m = tok.match(VIS_SM_RE))) {
      const whole = parseInt(m[2], 10);
      const miles = m[3] ? whole / parseInt(m[3], 10) : whole;
      current.visibilityM = m[1] === 'P' ? 10000 : Math.min(10000, Math.round(miles * 1609.344));
      continue;
    }
    if (current.visibilityM == null && (m = tok.match(VIS_M_RE))) {
      const meters = parseInt(m[1], 10);
      current.visibilityM = meters >= 9999 ? 10000 : meters;
      continue;
    }
    // Directional minimum visibility (4000E) — value only, when no prevailing vis is set for the group.
    if (current.visibilityM == null && (m = tok.match(DIR_VIS_RE))) {
      const meters = parseInt(m[1], 10);
      current.visibilityM = meters >= 9999 ? 10000 : meters;
      continue;
    }
    const cloud = parseCloudToken(tok);
    if (cloud) {
      current.clouds.push(cloud);
      continue;
    }
    const wx = parseWeatherToken(tok);
    if (wx) {
      current.weather.push(wx);
      continue;
    }
    // Unsupported/unknown token (WS, TX/TN, turbulence/icing, junk) — record for a partial-parse flag.
    warnings.push(tok);
  }

  current.raw = rawParts.join(' ');
  periods.push(current);
  out.periods = periods;
  return out;
}

// ----- near-term hazard summary (advisory) -----

export type TafHazardKind =
  | 'thunderstorm'
  | 'lowCeiling'
  | 'lowVis'
  | 'gusts'
  | 'strongWind'
  | 'rain'
  | 'snow';

export interface TafHazard {
  kind: TafHazardKind;
  changeType: TafChangeType;
  probPct?: number;
  tempo?: boolean; // temporary/at-times fluctuation (TEMPO or PROB TEMPO)
  from: Date | null;
  to: Date | null;
  gustKt?: number;
  windKt?: number;
  ceilingFt?: number;
  visM?: number;
}

/** A time window with the hazard kinds active in it (worst-overlap / whole hazard span). */
export interface TafWindow {
  from: Date;
  to: Date;
  kinds: TafHazardKind[];
}

export interface TafSummary {
  available: boolean; // a TAF was parsed
  severity: Severity; // GOOD (no near-term hazard) or CAUTION — advisory only, capped at CAUTION
  hazards: TafHazard[];
  /** Peak hazard-overlap window (≥2 hazards); null when at most one hazard has a window. */
  worstWindow: TafWindow | null;
  /** Earliest hazard start → latest hazard end (the whole hazardous span); null when none timed. */
  hazardSpan: TafWindow | null;
  partial: boolean; // unsupported tokens were present (check the raw)
  icao: string;
  horizonH: number;
}

const HORIZON_H = 6;
// Hazard thresholds — exported so the visual TAF timeline (tafTimeline.ts) colors segments with
// the exact same bands as this summary; a single source of truth.
export const TAF_GUST_KT = 22;
export const TAF_GUST_SPREAD_KT = 8;
export const TAF_STRONG_WIND_KT = 22;
export const TAF_LOW_CEIL_FT = 1000;
export const TAF_LOW_VIS_M = 5000;
const GUST_KT = TAF_GUST_KT;
const GUST_SPREAD_KT = TAF_GUST_SPREAD_KT;
const STRONG_WIND_KT = TAF_STRONG_WIND_KT;
const LOW_CEIL_FT = TAF_LOW_CEIL_FT;
const LOW_VIS_M = TAF_LOW_VIS_M;

/** Display/priority order — most decision-relevant first. */
const HAZARD_ORDER: TafHazardKind[] = ['thunderstorm', 'lowCeiling', 'lowVis', 'gusts', 'strongWind', 'rain', 'snow'];

function periodHazards(pd: TafPeriod): TafHazard[] {
  const base = { changeType: pd.changeType, probPct: pd.probPct, tempo: pd.tempo, from: pd.from, to: pd.to };
  const hz: TafHazard[] = [];
  const storm = hasThunderstorm(pd);
  if (storm) hz.push({ ...base, kind: 'thunderstorm' });
  const ceil = ceilingFt(pd.clouds);
  if (ceil != null && ceil < LOW_CEIL_FT) hz.push({ ...base, kind: 'lowCeiling', ceilingFt: ceil });
  if (pd.visibilityM != null && pd.visibilityM < LOW_VIS_M) hz.push({ ...base, kind: 'lowVis', visM: pd.visibilityM });
  if (pd.wind) {
    const g = pd.wind.gustKt;
    const s = pd.wind.speedKt;
    if (g != null && (g >= GUST_KT || g - s >= GUST_SPREAD_KT)) hz.push({ ...base, kind: 'gusts', gustKt: g, windKt: s });
    else if (s >= STRONG_WIND_KT) hz.push({ ...base, kind: 'strongWind', windKt: s });
  }
  if (!storm) {
    // A thunderstorm already implies precipitation; otherwise call out snow/rain separately.
    if (hasSnow(pd)) hz.push({ ...base, kind: 'snow' });
    else if (hasPrecip(pd)) hz.push({ ...base, kind: 'rain' });
  }
  return hz;
}

const maxDef = (a?: number, b?: number): number | undefined => (a == null ? b : b == null ? a : Math.max(a, b));
const minDef = (a?: number, b?: number): number | undefined => (a == null ? b : b == null ? a : Math.min(a, b));

/**
 * Merge adjacent/overlapping hazards of the SAME kind into one spanning window (e.g. two
 * consecutive TEMPO thunderstorm periods → one "thunderstorms 08–14Z"), so the summary reads as
 * conditions rather than raw TAF groups. Mixed qualifiers collapse to a temporary "at times" flag.
 */
function aggregateHazards(hazards: TafHazard[]): TafHazard[] {
  const byKind = new Map<TafHazardKind, TafHazard[]>();
  for (const h of hazards) {
    const list = byKind.get(h.kind);
    if (list) list.push(h);
    else byKind.set(h.kind, [h]);
  }
  const merged: TafHazard[] = [];
  for (const list of byKind.values()) {
    const sorted = [...list].sort((a, b) => (a.from?.getTime() ?? 0) - (b.from?.getTime() ?? 0));
    for (const h of sorted) {
      const prev = merged[merged.length - 1];
      const adjacent =
        prev &&
        prev.kind === h.kind &&
        (prev.to == null || h.from == null || h.from.getTime() <= prev.to.getTime() + 3600000);
      if (adjacent) {
        prev.from = prev.from && h.from ? new Date(Math.min(prev.from.getTime(), h.from.getTime())) : prev.from ?? h.from;
        prev.to = prev.to && h.to ? new Date(Math.max(prev.to.getTime(), h.to.getTime())) : null;
        prev.gustKt = maxDef(prev.gustKt, h.gustKt);
        prev.windKt = maxDef(prev.windKt, h.windKt);
        prev.ceilingFt = minDef(prev.ceilingFt, h.ceilingFt);
        prev.visM = minDef(prev.visM, h.visM);
        if (prev.changeType !== h.changeType || prev.probPct !== h.probPct) {
          prev.changeType = 'TEMPO';
          prev.probPct = undefined;
          prev.tempo = true;
        }
      } else {
        merged.push({ ...h });
      }
    }
  }
  return merged.sort((a, b) => HAZARD_ORDER.indexOf(a.kind) - HAZARD_ORDER.indexOf(b.kind));
}

/** Severity weight for the overlap computation — most decision-relevant kinds weigh more. */
const hazardWeight = (kind: TafHazardKind): number => HAZARD_ORDER.length - HAZARD_ORDER.indexOf(kind);

type TimedHazard = { from: Date; to: Date; kind: TafHazardKind };
const timed = (hazards: TafHazard[]): TimedHazard[] =>
  hazards.filter((h): h is TafHazard & { from: Date; to: Date } => h.from != null && h.to != null)
    .map((h) => ({ from: h.from, to: h.to, kind: h.kind }));

/** Whole hazardous span: earliest hazard start → latest end. */
function computeSpan(hazards: TafHazard[]): TafWindow | null {
  const iv = timed(hazards);
  if (iv.length === 0) return null;
  const from = new Date(Math.min(...iv.map((h) => h.from.getTime())));
  const to = new Date(Math.max(...iv.map((h) => h.to.getTime())));
  return { from, to, kinds: [...new Set(iv.map((h) => h.kind))] };
}

/**
 * Peak hazard-overlap window: the slice of time where the most (weighted) hazards coincide — the
 * "worst" period to avoid. Sweep-line over hazard interval boundaries; null when <2 hazards overlap.
 */
function computeWorstWindow(hazards: TafHazard[]): TafWindow | null {
  const iv = timed(hazards);
  if (iv.length < 2) return null;
  const points = [...new Set(iv.flatMap((h) => [h.from.getTime(), h.to.getTime()]))].sort((a, b) => a - b);
  let best: TafWindow | null = null;
  let bestWeight = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (b <= a) continue;
    const mid = (a + b) / 2;
    const active = iv.filter((h) => h.from.getTime() <= mid && h.to.getTime() > mid);
    if (active.length < 2) continue;
    const weight = active.reduce((s, h) => s + hazardWeight(h.kind), 0);
    if (weight > bestWeight) {
      bestWeight = weight;
      best = { from: new Date(a), to: new Date(b), kinds: active.map((h) => h.kind) };
    }
  }
  return best;
}

/**
 * Summarize the TAF's near-term hazards (default next 6 h) as an ADVISORY — never NO-FLY, never a
 * verdict driver. Includes any period whose window overlaps [now, now+horizon], aggregates adjacent
 * same-kind hazards, and computes the worst-overlap window + the whole hazardous span so the pilot
 * can see when it's worst and when it's clear. `partial` mirrors the parser warnings.
 */
export function summarizeTaf(taf: ParsedTaf, now: Date, opts: { horizonH?: number } = {}): TafSummary {
  const horizonH = opts.horizonH ?? HORIZON_H;
  const end = new Date(now.getTime() + horizonH * 3600000);
  const nearTerm = taf.periods.filter(
    (pd) => (pd.from == null || pd.from <= end) && (pd.to == null || pd.to >= now),
  );
  const hazards = aggregateHazards(nearTerm.flatMap(periodHazards));
  return {
    available: taf.periods.length > 0,
    severity: hazards.length ? 'CAUTION' : 'GOOD',
    hazards,
    worstWindow: computeWorstWindow(hazards),
    hazardSpan: computeSpan(hazards),
    partial: taf.warnings.length > 0,
    icao: taf.icao,
    horizonH,
  };
}
