// Current-conditions mapper for the visual dashboard: turns METAR + model + daylight phase into
// one icon + short label ("Light rain", "Partly cloudy", "Clear night"). Display-only — it never
// joins risk aggregation. Sourcing is conservative: observed-style labels ("Rain", "Thunderstorm")
// come only from a real METAR; model output is always hedged ("Rain likely" / "Rain possible") and
// tagged `source: 'model'` so the tile can show a subtle badge. Model precip thresholds are the
// same as precipNow (precip.ts) so this card and the precip pill never disagree.

import type { CloudCover, Metar, ModelConditions, Weather } from './types';
import type { DaylightPhase } from './sun';
import {
  hasFog,
  hasFreezingFog,
  hasFreezingPrecip,
  hasMist,
  hasPrecip,
  hasSnow,
  hasThunderstorm,
} from './metar';
import { precipTypeLabel } from './precip';

export type ConditionIcon =
  | 'sun'
  | 'moon'
  | 'cloud-sun'
  | 'cloud-moon'
  | 'cloud'
  | 'rain'
  | 'snow'
  | 'thunder'
  | 'fog';

export interface CurrentConditions {
  icon: ConditionIcon;
  label: string;
  source: 'metar' | 'model' | 'none';
}

// Rank cloud covers by how much sky they hide; sky-clear codes rank 0. `///` (amount unknown)
// also ranks 0 — it only reaches the Metar when flagging CB/TCU, which the weather branch handles.
const COVER_RANK: Record<CloudCover, number> = {
  OVC: 4, VV: 4, BKN: 3, SCT: 2, FEW: 1,
  SKC: 0, CLR: 0, NSC: 0, NCD: 0, '///': 0,
};

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** The weather group that drives the label: worst first (TS > FZ > precip > obscuration). */
const groupWeight = (w: Weather): number => {
  if (w.descriptor === 'TS') return 4;
  if (w.descriptor === 'FZ') return 3;
  if (w.phenomena.some((p) => ['DZ', 'RA', 'SN', 'SG', 'IC', 'PL', 'GR', 'GS', 'UP'].includes(p))) return 2;
  return 1;
};

const intensityPrefix = (i: '-' | '+' | ''): string => (i === '-' ? 'Light ' : i === '+' ? 'Heavy ' : '');

function skyLabel(rank: number, isNight: boolean): CurrentConditions | null {
  switch (rank) {
    case 4:
      return { icon: 'cloud', label: 'Overcast', source: 'metar' };
    case 3:
      return { icon: 'cloud', label: 'Mostly cloudy', source: 'metar' };
    case 2:
      return { icon: isNight ? 'cloud-moon' : 'cloud-sun', label: 'Partly cloudy', source: 'metar' };
    case 1:
      return { icon: isNight ? 'cloud-moon' : 'cloud-sun', label: 'Mostly clear', source: 'metar' };
    default:
      return null; // clear — caller decides sun/moon
  }
}

const clear = (isNight: boolean, source: CurrentConditions['source']): CurrentConditions => ({
  icon: isNight ? 'moon' : 'sun',
  label: isNight ? 'Clear night' : 'Clear',
  source,
});

// Model thresholds — shared with the per-hour timeline icon so a forecast hour and the "Now"
// tile can never disagree about the same numbers. Precip mirrors precipNow (precip.ts).
const MODEL_RAIN_MM = 0.1;
const MODEL_RAIN_PROB = 60;
const CLOUD_OVERCAST = 85;
const CLOUD_MOSTLY = 50;
const CLOUD_PARTLY = 20;

/**
 * Icon for one model forecast hour (visual timeline) — same tiers as the model branches of
 * currentConditions. Model-sourced by construction; the timeline lane label carries the sourcing.
 */
export function modelConditionIcon(
  precipMm: number | null,
  precipProb: number | null,
  cloudCoverPct: number | null,
  isNight: boolean,
): ConditionIcon {
  if (precipMm != null && precipMm >= MODEL_RAIN_MM) return 'rain';
  if (precipProb != null && precipProb >= MODEL_RAIN_PROB) return 'rain';
  if (cloudCoverPct != null) {
    if (cloudCoverPct >= CLOUD_MOSTLY) return 'cloud';
    if (cloudCoverPct >= CLOUD_PARTLY) return isNight ? 'cloud-moon' : 'cloud-sun';
  }
  return isNight ? 'moon' : 'sun';
}

/**
 * Map current observations to one icon + label. `briefSource` gates the METAR branches: a
 * model-only brief synthesizes a Metar, and that must never be presented as an observation.
 */
export function currentConditions(
  metar: Metar,
  model: ModelConditions | null,
  phase: DaylightPhase,
  briefSource: 'metar' | 'model',
): CurrentConditions {
  const isNight = phase === 'night'; // twilight keeps day icons; the Daylight tile owns twilight
  const isMetar = briefSource === 'metar';

  // 1. Observed weather phenomena (real METAR only).
  if (isMetar && (metar.weather.length > 0 || hasThunderstorm(metar))) {
    const wx = [...metar.weather].sort((a, b) => groupWeight(b) - groupWeight(a))[0];
    const intensity = wx ? intensityPrefix(wx.intensity) : '';

    if (hasThunderstorm(metar)) {
      // A CB cloud layer without a TS weather group is convective cloud, not an observed storm.
      if (!metar.weather.some((w) => w.descriptor === 'TS')) {
        return { icon: 'thunder', label: 'Storm clouds (CB)', source: 'metar' };
      }
      // METAR intensity on a TS group qualifies the PRECIPITATION, not the storm — "-TSRA" is a
      // thunderstorm with light rain, never a "light thunderstorm".
      const label = hasPrecip(metar) && intensity
        ? `Thunderstorm, ${intensity.toLowerCase()}${precipTypeLabel(metar)}`
        : 'Thunderstorm';
      return { icon: 'thunder', label, source: 'metar' };
    }
    if (hasFreezingFog(metar)) return { icon: 'fog', label: 'Freezing fog', source: 'metar' };
    if (hasFreezingPrecip(metar)) {
      return { icon: 'rain', label: `Freezing ${precipTypeLabel(metar)}`, source: 'metar' };
    }
    if (hasSnow(metar)) {
      const mixed = metar.weather.some((w) => w.phenomena.includes('RA'));
      const base = mixed ? 'rain and snow' : `${intensity}snow`;
      return { icon: 'snow', label: cap(base.trim()), source: 'metar' };
    }
    if (hasPrecip(metar)) {
      const showers = metar.weather.some((w) => w.descriptor === 'SH');
      const type = precipTypeLabel(metar);
      const base = showers ? `${intensity}${type} showers` : `${intensity}${type}`;
      return { icon: 'rain', label: cap(base.trim()), source: 'metar' };
    }
    if (hasFog(metar)) return { icon: 'fog', label: 'Fog', source: 'metar' };
    if (hasMist(metar)) return { icon: 'fog', label: 'Mist', source: 'metar' };
    const codes = metar.weather.flatMap((w) => w.phenomena);
    if (codes.includes('HZ')) return { icon: 'fog', label: 'Haze', source: 'metar' };
    if (codes.includes('FU')) return { icon: 'fog', label: 'Smoke', source: 'metar' };
    // Unrecognised group (e.g. dust, squalls) — fall through to sky state.
  }

  // 2. Model precipitation — hedged wording, never observed-style.
  if (model?.precipMm != null && model.precipMm >= MODEL_RAIN_MM) {
    return { icon: 'rain', label: 'Rain likely', source: 'model' };
  }
  if (model?.precipProb != null && model.precipProb >= MODEL_RAIN_PROB) {
    return { icon: 'rain', label: 'Rain possible', source: 'model' };
  }

  // 3. Sky state: real METAR first, then model cloud cover.
  if (isMetar && metar.cavok) return clear(isNight, 'metar');
  if (isMetar && metar.clouds.length > 0) {
    const rank = Math.max(...metar.clouds.map((c) => COVER_RANK[c.cover] ?? 0));
    const sky = skyLabel(rank, isNight);
    return sky ?? clear(isNight, 'metar');
  }
  if (model?.cloudCoverPct != null) {
    const pct = model.cloudCoverPct;
    const rank = pct >= CLOUD_OVERCAST ? 4 : pct >= CLOUD_MOSTLY ? 3 : pct >= CLOUD_PARTLY ? 2 : 0;
    const sky = skyLabel(rank, isNight);
    return sky ? { ...sky, source: 'model' } : clear(isNight, 'model');
  }

  // 4. Nothing usable.
  return { icon: isNight ? 'moon' : 'sun', label: 'No data', source: 'none' };
}
