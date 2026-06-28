// METAR raw-text parser. Tokenizes the report body into a structured `Metar`.
// Designed to never throw: unknown tokens are ignored, the raw text is always kept.
// See docs/spec.md §4.3 and docs/initial-idea.md §7.1.

import type { CloudCover, Coord, Metar, Weather, Wind } from './types';
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
const WIND_RE = /^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS|KMH)$/;
const VAR_RE = /^(\d{3})V(\d{3})$/;
const VIS_M_RE = /^(\d{4})(?:NDV)?$/;
const VIS_SM_RE = /^(M|P)?(\d{1,2})(?:\/(\d{1,2}))?SM$/;
const FRACTION_SM_RE = /^(\d{1,2})\/(\d{1,2})SM$/;
const RVR_RE = /^R\d{2}[LCR]?\//;
const CLOUD_RE = /^(FEW|SCT|BKN|OVC|VV)(\d{3}|\/{3})(CB|TCU)?$/;
const TEMP_RE = /^(M?\d{1,2})\/(M?\d{1,2})?$/;
const QNH_RE = /^Q(\d{3,4})$/;
const ALTIM_RE = /^A(\d{4})$/;

const signed = (s: string): number =>
  s.startsWith('M') ? -parseInt(s.slice(1), 10) : parseInt(s, 10);

function parseWind(m: RegExpMatchArray): Wind {
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

function parseWeatherToken(tok: string): Weather | null {
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

    if (SKY_CLEAR.has(tok)) {
      metar.clouds.push(makeCloudLayer(tok as CloudCover, null));
      continue;
    }
    if ((m = tok.match(CLOUD_RE))) {
      const cover = m[1] as CloudCover;
      const baseFt = m[2] === '///' ? null : parseInt(m[2], 10) * 100;
      metar.clouds.push(
        makeCloudLayer(cover, baseFt, { cb: m[3] === 'CB', tcu: m[3] === 'TCU' }),
      );
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

// ----- weather-phenomenon predicates (used by icing & risk) -----
export const hasFog = (m: Metar): boolean => m.weather.some((w) => w.phenomena.includes('FG'));
export const hasMist = (m: Metar): boolean => m.weather.some((w) => w.phenomena.includes('BR'));
export const hasSnow = (m: Metar): boolean => m.weather.some((w) => w.phenomena.includes('SN'));
export const hasPrecip = (m: Metar): boolean =>
  m.weather.some((w) => w.phenomena.some((p) => PRECIP.has(p)));
export const hasFreezing = (m: Metar): boolean => m.weather.some((w) => w.descriptor === 'FZ');
export const hasFreezingFog = (m: Metar): boolean =>
  m.weather.some((w) => w.descriptor === 'FZ' && w.phenomena.includes('FG'));
export const hasFreezingPrecip = (m: Metar): boolean =>
  m.weather.some(
    (w) => w.descriptor === 'FZ' && (w.phenomena.includes('RA') || w.phenomena.includes('DZ')),
  );
export const hasThunderstorm = (m: Metar): boolean =>
  m.weather.some((w) => w.descriptor === 'TS') || m.clouds.some((c) => c.cb);

/** Number of cloud layers reported as CB or TCU. */
export const hasConvectiveCloud = (m: Metar): boolean => m.clouds.some((c) => c.cb || c.tcu);
