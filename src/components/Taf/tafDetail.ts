// Presentation helpers for the per-period TAF details card: human period-type labels, plain-English
// weather/cloud descriptions, and the detail "bits" (wind/gusts, visibility, weather, clouds) in the
// user's units. Reuses the shared time/unit formatters; the parser stays untouched.

import type { CloudLayer, Weather } from '../../domain/types';
import type { TafPeriod } from '../../domain/taf';
import { compassPoint } from '../../domain/geo';
import { fmtWindSpeed, fmtAltFt, round, type WindUnit, type AltUnit } from '../../domain/units';

/** Human label for a period's change type. */
export function periodTypeLabel(pd: TafPeriod): string {
  switch (pd.changeType) {
    case 'BASE':
      return 'Initial forecast';
    case 'FM':
      return 'From';
    case 'BECMG':
      return 'Becoming';
    case 'TEMPO':
      return 'Temporary — possible at times';
    case 'PROB':
      return pd.probPct != null
        ? `${pd.probPct}% chance${pd.tempo ? ', at times' : ''}`
        : 'Probable';
  }
}

const DESC_WORD: Record<string, string> = {
  MI: 'shallow',
  PR: 'partial',
  BC: 'patches of',
  DR: 'low drifting',
  BL: 'blowing',
};
const PHEN_WORD: Record<string, string> = {
  DZ: 'drizzle',
  RA: 'rain',
  SN: 'snow',
  SG: 'snow grains',
  IC: 'ice crystals',
  PL: 'ice pellets',
  GR: 'hail',
  GS: 'small hail',
  UP: 'unknown precipitation',
  BR: 'mist',
  FG: 'fog',
  FU: 'smoke',
  VA: 'volcanic ash',
  DU: 'dust',
  SA: 'sand',
  HZ: 'haze',
  PO: 'dust/sand whirls',
  SQ: 'squalls',
  FC: 'funnel cloud',
  SS: 'sandstorm',
  DS: 'duststorm',
};

/** Plain-English description of a weather group, e.g. "-RA" → "light rain", "TSRA" → "thunderstorm with rain". */
export function describeWeather(w: Weather): string {
  const intensity = w.intensity === '-' ? 'light ' : w.intensity === '+' ? 'heavy ' : '';
  const phen = w.phenomena.map((p) => PHEN_WORD[p] ?? p.toLowerCase()).join(' and ');
  const desc = w.descriptor;

  if (desc === 'TS') return `${intensity}thunderstorm${phen ? ` with ${phen}` : ''}`.trim();
  if (desc === 'SH') return `${intensity}showers of ${phen}`.trim();
  if (desc === 'FZ') return `${intensity}freezing ${phen}`.trim();
  const descWord = desc ? `${DESC_WORD[desc] ?? desc.toLowerCase()} ` : '';
  return `${intensity}${descWord}${phen}`.trim() || w.raw;
}

const COVER_WORD: Record<string, string> = {
  FEW: 'few',
  SCT: 'scattered',
  BKN: 'broken',
  OVC: 'overcast',
  VV: 'sky obscured',
  SKC: 'clear',
  CLR: 'clear',
  NSC: 'no significant cloud',
  NCD: 'no cloud detected',
};

/** Plain-English cloud layer, e.g. "broken 1200 ft CB" (in the chosen altitude unit). */
export function describeCloud(c: CloudLayer, altUnit: AltUnit): string {
  const cover = COVER_WORD[c.cover] ?? c.cover;
  const base = c.baseFt != null ? ` ${fmtAltFt(c.baseFt, altUnit)}` : '';
  const type = c.cb ? ' CB' : c.tcu ? ' TCU' : '';
  return `${cover}${base}${type}`;
}

/** The detail "bits" for a period (wind/gusts, visibility, weather, clouds), in the user's units. */
export function periodDetailBits(pd: TafPeriod, windUnit: WindUnit, altUnit: AltUnit): string[] {
  const bits: string[] = [];

  if (pd.wind) {
    const w = pd.wind;
    if (w.calm) {
      bits.push('wind calm');
    } else {
      const from = w.dirDeg != null ? `${w.dirDeg}° (${compassPoint(w.dirDeg)})` : 'variable';
      const gust = w.gustKt != null ? `, gusts to ${fmtWindSpeed(w.gustKt, windUnit)}` : '';
      bits.push(`wind ${fmtWindSpeed(w.speedKt, windUnit)} from ${from}${gust}`);
    }
  }

  if (pd.cavok) {
    bits.push('CAVOK (good visibility, no significant cloud)');
  } else if (pd.visibilityM != null) {
    bits.push(pd.visibilityM >= 10000 ? 'visibility ≥10 km' : `visibility ${round(pd.visibilityM / 1000, 1)} km`);
  }

  for (const w of pd.weather) bits.push(describeWeather(w));
  for (const c of pd.clouds) bits.push(describeCloud(c, altUnit));

  return bits;
}
