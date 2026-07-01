// METAR raw-text parser. Tokenizes the report body into a structured `Metar`.
// Designed to never throw: unknown tokens are ignored, the raw text is always kept.
// See docs/spec.md §4.3 and docs/initial-idea.md §7.1.

import type { CloudCover, CloudLayer, Coord, Metar, Weather, Wind } from './types';
import { makeCloudLayer } from './clouds';
import { msToKt, kmhToKt, inhgToHpa } from './units';

export interface ParseMetarOptions {
  /** Reference "now" for computing observation age (defaults to current time). */
  now?: Date;
  icao?: string;
  station?: Coord;
  stationName?: string;
  elevationM?: number;
}

const REPORT_TYPES = new Set(['METAR', 'SPECI', 'TAF']);
const MODIFIERS = new Set(['AUTO', 'COR', 'AMD', 'NIL', 'CCA', 'CCB', 'CCC']);
const TREND_KEYWORDS = new Set(['NOSIG', 'TEMPO', 'BECMG']);
const SKY_CLEAR = new Set(['SKC', 'CLR', 'NSC', 'NCD']);
const DESCRIPTORS = new Set(['MI', 'PR', 'BC', 'DR', 'BL', 'SH', 'TS', 'FZ']);
const PHENOMENA = new Set([
  'DZ', 'RA', 'SN', 'SG', 'IC', 'PL', 'GR', 'GS', 'UP',
  'BR', 'FG', 'FU', 'VA', 'DU', 'SA', 'HZ', 'PO', 'SQ', 'FC', 'SS', 'DS',
]);
const PRECIP = new Set(['DZ', 'RA', 'SN', 'SG', 'IC', 'PL', 'GR', 'GS', 'UP']);

const ICAO_RE = /^[A-Z][A-Z0-9]{3}$/;
const OBS_TIME_RE = /^(\d{6})Z$/;
// Shared token patterns/parsers — also reused by the TAF parser (domain/taf.ts).
export const WIND_RE = /^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS|KMH)$/;
export const VAR_RE = /^(\d{3})V(\d{3})$/;
export const VIS_M_RE = /^(\d{4})(?:NDV)?$/;
// Directional minimum visibility, e.g. `4000E` / `1400SW` (metres + a compass direction). Basic
// handling only: capture the value as prevailing visibility when no better prevailing vis is set.
export const DIR_VIS_RE = /^(\d{4})[NSEW]{1,2}$/;
export const VIS_SM_RE = /^(M|P)?(\d{1,2})(?:\/(\d{1,2}))?SM$/;
export const FRACTION_SM_RE = /^(\d{1,2})\/(\d{1,2})SM$/;
const RVR_RE = /^R\d{2}[LCR]?\//;
// A trailing `///` is an automated station's "cloud type unavailable" marker
// (e.g. FEW024///). Allow it so the base height is still captured; type → none.
// A leading `///` cover is an automated "amount unknown" marker (e.g. //////CB) — allow it so a
// CB/TCU hazard flag on an otherwise-unknown layer is not lost (see parseCloudToken).
const CLOUD_RE = /^(FEW|SCT|BKN|OVC|VV|\/{3})(\d{3}|\/{3})(CB|TCU|\/{3})?$/;
const TEMP_RE = /^(M?\d{1,2})\/(M?\d{1,2})?$/;
const QNH_RE = /^Q(\d{3,4})$/;
const ALTIM_RE = /^A(\d{4})$/;

const signed = (s: string): number =>
  s.startsWith('M') ? -parseInt(s.slice(1), 10) : parseInt(s, 10);

export function parseWind(m: RegExpMatchArray): Wind {
  const [, dir, spd, gust, unit] = m;
  const toKt = (v: number): number =>
    unit === 'MPS' ? msToKt(v) : unit === 'KMH' ? kmhToKt(v) : v;
  const speedKt = Math.round(toKt(parseInt(spd, 10)) * 10) / 10;
  const variable = dir === 'VRB';
  const calm = !variable && parseInt(dir, 10) === 0 && parseInt(spd, 10) === 0;
  return {
    dirDeg: variable ? null : parseInt(dir, 10),
    variable,
    speedKt,
    gustKt: gust ? Math.round(toKt(parseInt(gust, 10)) * 10) / 10 : null,
    calm,
  };
}

export function parseWeatherToken(tok: string): Weather | null {
  let s = tok;
  let intensity: '-' | '+' | '' = '';
  if (s.startsWith('+')) {
    intensity = '+';
    s = s.slice(1);
  } else if (s.startsWith('-')) {
    intensity = '-';
    s = s.slice(1);
  }
  if (s.startsWith('VC')) s = s.slice(2); // vicinity — kept in raw

  let descriptor: string | undefined;
  if (s.length >= 2 && DESCRIPTORS.has(s.slice(0, 2))) {
    descriptor = s.slice(0, 2);
    s = s.slice(2);
  }
  const phenomena: string[] = [];
  while (s.length >= 2 && PHENOMENA.has(s.slice(0, 2))) {
    phenomena.push(s.slice(0, 2));
    s = s.slice(2);
  }
  if (s.length !== 0) return null; // leftover characters -> not a clean weather group
  if (descriptor === undefined && phenomena.length === 0) return null;
  return { raw: tok, intensity, descriptor, phenomena };
}

/** Parse a single cloud token (sky-clear code or `COVERbbb[CB|TCU]`) → CloudLayer, else null. */
export function parseCloudToken(tok: string): CloudLayer | null {
  if (SKY_CLEAR.has(tok)) return makeCloudLayer(tok as CloudCover, null);
  const m = tok.match(CLOUD_RE);
  if (!m) return null;
  const cover = m[1] as CloudCover;
  const baseFt = m[2] === '///' ? null : parseInt(m[2], 10) * 100;
  const cb = m[3] === 'CB';
  const tcu = m[3] === 'TCU';
  // A bare `//////` (amount + type both unknown) carries no useful signal — skip it. Keep an
  // unknown-cover layer only when it flags a CB/TCU hazard (e.g. //////CB from an automated
  // station), so the convective signal reaches hasThunderstorm/hasConvectiveCloud + the cloud card.
  if (cover === '///' && !cb && !tcu) return null;
  return makeCloudLayer(cover, baseFt, { cb, tcu });
}

function resolveObsTime(ddhhmm: string, now: Date): Date {
  const day = +ddhhmm.slice(0, 2);
  const hh = +ddhhmm.slice(2, 4);
  const mm = +ddhhmm.slice(4, 6);
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();
  let candidate = new Date(Date.UTC(year, month, day, hh, mm));
  // If the candidate sits more than a day in the future, it belongs to last month.
  if (candidate.getTime() - now.getTime() > 24 * 3600 * 1000) {
    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
    candidate = new Date(Date.UTC(year, month, day, hh, mm));
  }
  return candidate;
}

export function parseMetar(raw: string, opts: ParseMetarOptions = {}): Metar {
  const now = opts.now ?? new Date();
  const cleaned = raw.trim().replace(/=+$/, '');
  const allTokens = cleaned.split(/\s+/).filter((t) => t && t !== '$');

  const rmkIdx = allTokens.indexOf('RMK');
  const head = rmkIdx >= 0 ? allTokens.slice(0, rmkIdx) : allTokens;

  const trendIdx = head.findIndex((t) => TREND_KEYWORDS.has(t));
  const bodyEnd = trendIdx >= 0 ? trendIdx : head.length;
  const trend = trendIdx >= 0 ? head.slice(trendIdx).join(' ') : undefined;

  const metar: Metar = {
    icao: opts.icao ?? '',
    stationName: opts.stationName,
    station: opts.station ?? { lat: 0, lon: 0 },
    elevationM: opts.elevationM,
    observedAt: now,
    ageMin: 0,
    wind: { dirDeg: null, variable: false, speedKt: 0, gustKt: null, calm: true },
    visibilityM: null,
    cavok: false,
    weather: [],
    clouds: [],
    tempC: null,
    dewpC: null,
    qnhHpa: null,
    trend,
    raw: raw.trim(),
  };

  let sawWind = false;
  let observedSet = false;

  for (let i = 0; i < bodyEnd; i++) {
    const tok = head[i];
    let m: RegExpMatchArray | null;

    if (REPORT_TYPES.has(tok) || MODIFIERS.has(tok)) continue;

    if ((m = tok.match(OBS_TIME_RE))) {
      metar.observedAt = resolveObsTime(m[1], now);
      observedSet = true;
      continue;
    }

    if (!sawWind && !metar.icao && ICAO_RE.test(tok)) {
      metar.icao = tok;
      continue;
    }

    if ((m = tok.match(WIND_RE))) {
      metar.wind = parseWind(m);
      sawWind = true;
      continue;
    }

    if ((m = tok.match(VAR_RE))) {
      metar.wind.variable = true;
      metar.wind.varFromDeg = parseInt(m[1], 10);
      metar.wind.varToDeg = parseInt(m[2], 10);
      continue;
    }

    if (tok === 'CAVOK') {
      metar.cavok = true;
      metar.visibilityM = 10000;
      continue;
    }

    if (RVR_RE.test(tok)) continue; // runway visual range — not used yet

    // Visibility in statute miles, possibly "1 1/2SM" across two tokens.
    if (/^\d{1,2}$/.test(tok) && i + 1 < bodyEnd && FRACTION_SM_RE.test(head[i + 1])) {
      const frac = head[i + 1].match(FRACTION_SM_RE)!;
      const miles = parseInt(tok, 10) + parseInt(frac[1], 10) / parseInt(frac[2], 10);
      metar.visibilityM = Math.min(10000, Math.round(miles * 1609.344));
      i += 1;
      continue;
    }
    if ((m = tok.match(VIS_SM_RE))) {
      const whole = parseInt(m[2], 10);
      const miles = m[3] ? whole / parseInt(m[3], 10) : whole;
      metar.visibilityM = m[1] === 'P' ? 10000 : Math.min(10000, Math.round(miles * 1609.344));
      continue;
    }

    if (metar.visibilityM == null && (m = tok.match(VIS_M_RE))) {
      const meters = parseInt(m[1], 10);
      metar.visibilityM = meters >= 9999 ? 10000 : meters;
      continue;
    }
    // Directional minimum visibility (4000E, 1400SW): use its value only when no prevailing
    // visibility has been captured, so we don't lose a low-visibility signal.
    if (metar.visibilityM == null && (m = tok.match(DIR_VIS_RE))) {
      const meters = parseInt(m[1], 10);
      metar.visibilityM = meters >= 9999 ? 10000 : meters;
      continue;
    }

    const cloud = parseCloudToken(tok);
    if (cloud) {
      metar.clouds.push(cloud);
      continue;
    }

    if ((m = tok.match(TEMP_RE))) {
      metar.tempC = signed(m[1]);
      metar.dewpC = m[2] != null ? signed(m[2]) : null;
      continue;
    }

    if ((m = tok.match(QNH_RE))) {
      metar.qnhHpa = parseInt(m[1], 10);
      continue;
    }
    if ((m = tok.match(ALTIM_RE))) {
      metar.qnhHpa = Math.round(inhgToHpa(parseInt(m[1], 10) / 100) * 10) / 10;
      continue;
    }

    const wx = parseWeatherToken(tok);
    if (wx) metar.weather.push(wx);
    // anything else is ignored but preserved in `raw`
  }

  if (observedSet) {
    metar.ageMin = Math.max(0, Math.round((now.getTime() - metar.observedAt.getTime()) / 60000));
  }

  return metar;
}

// ----- weather-phenomenon predicates (used by icing, risk, and the TAF summarizer) -----
// Typed structurally so they work on both a full Metar and a TAF period (both carry weather+clouds).
export type WeatherFields = { weather: Weather[]; clouds: CloudLayer[] };

export const hasFog = (m: WeatherFields): boolean => m.weather.some((w) => w.phenomena.includes('FG'));
export const hasMist = (m: WeatherFields): boolean => m.weather.some((w) => w.phenomena.includes('BR'));
export const hasSnow = (m: WeatherFields): boolean => m.weather.some((w) => w.phenomena.includes('SN'));
export const hasPrecip = (m: WeatherFields): boolean =>
  m.weather.some((w) => w.phenomena.some((p) => PRECIP.has(p)));
export const hasFreezing = (m: WeatherFields): boolean => m.weather.some((w) => w.descriptor === 'FZ');
export const hasFreezingFog = (m: WeatherFields): boolean =>
  m.weather.some((w) => w.descriptor === 'FZ' && w.phenomena.includes('FG'));
export const hasFreezingPrecip = (m: WeatherFields): boolean =>
  m.weather.some(
    (w) => w.descriptor === 'FZ' && (w.phenomena.includes('RA') || w.phenomena.includes('DZ')),
  );
export const hasThunderstorm = (m: WeatherFields): boolean =>
  m.weather.some((w) => w.descriptor === 'TS') || m.clouds.some((c) => c.cb);

/** Whether any cloud layer is reported as CB or TCU. */
export const hasConvectiveCloud = (m: WeatherFields): boolean => m.clouds.some((c) => c.cb || c.tcu);
