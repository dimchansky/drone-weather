// Icing hazard analysis. Risk is temperature PLUS moisture (liquid / supercooled
// water), not cold alone. See docs/spec.md §5.6 and docs/initial-idea.md §7.8.

import type { Metar, Severity, VerticalProfile } from './types';
import { rhFromDewPoint } from './humidity';
import { fmtAlt, type AltUnit } from './units';
import { maxSeverity } from './severity';
import { hasFog, hasMist, hasPrecip, hasSnow, hasFreezingFog, hasFreezingPrecip } from './metar';

interface IcingContext {
  freezing: boolean; // freezing fog or freezing precipitation reported
  wetSnow: boolean; // snow with moist air (wet snow)
  saturated: boolean; // fog, or essentially saturated air (RH >= 98%)
  surfaceMoist: boolean; // moisture proxy for levels without model RH
  rh: number | null;
  spread: number | null;
}

const ICING_LABEL: Record<Severity, string> = {
  GOOD: 'Low',
  CAUTION: 'Moderate',
  HIGH: 'High',
  NOFLY: 'Severe',
};

function buildContext(metar: Metar): IcingContext {
  const t = metar.tempC;
  const td = metar.dewpC;
  const spread = t != null && td != null ? t - td : null;
  const rh = t != null && td != null ? rhFromDewPoint(t, td) : null;
  const lowCloud = metar.clouds.some((c) => c.cover === 'BKN' || c.cover === 'OVC');

  const surfaceMoist =
    (rh != null && rh >= 85) ||
    (spread != null && spread <= 2) ||
    hasFog(metar) ||
    hasMist(metar) ||
    hasPrecip(metar) ||
    lowCloud;

  return {
    freezing: hasFreezingFog(metar) || hasFreezingPrecip(metar),
    wetSnow: hasSnow(metar) && surfaceMoist,
    saturated: hasFog(metar) || (rh != null && rh >= 98),
    surfaceMoist,
    rh,
    spread,
  };
}

/** Icing severity at a single level given its temperature and moisture state. */
export function icingAtLevel(tempC: number, moist: boolean, ctx: IcingContext): Severity {
  const nearZero = tempC >= -1 && tempC <= 1;
  if (ctx.freezing && tempC <= 1) return 'NOFLY';
  if (ctx.wetSnow && nearZero) return 'NOFLY';
  if (ctx.saturated && nearZero) return 'NOFLY';

  if (tempC > 5) return 'GOOD';
  if (tempC > 2) return moist ? 'CAUTION' : 'GOOD'; // (+2, +5]
  if (tempC >= -2) return moist ? 'HIGH' : 'CAUTION'; // [-2, +2]
  if (tempC >= -10) return moist ? 'CAUTION' : 'GOOD'; // [-10, -2)
  return moist ? 'CAUTION' : 'GOOD'; // < -10
}

export interface IcingLevel {
  altM: number;
  tempC: number;
  severity: Severity;
}

export interface IcingBand {
  levels: IcingLevel[];
  worst: Severity;
  reason: string;
}

function worstRange(levels: IcingLevel[], worst: Severity): { lo: number; hi: number } | null {
  const alts = levels.filter((l) => l.severity === worst).map((l) => l.altM);
  return alts.length ? { lo: Math.min(...alts), hi: Math.max(...alts) } : null;
}

/** Evaluate icing risk across the vertical profile. */
export function icingBand(profile: VerticalProfile, metar: Metar, altUnit: AltUnit = 'm'): IcingBand {
  const ctx = buildContext(metar);
  const levels: IcingLevel[] = profile.levels.map((l) => {
    const moist = l.rhPct != null ? l.rhPct >= 85 : ctx.surfaceMoist;
    return { altM: l.altM, tempC: l.tempC, severity: icingAtLevel(l.tempC, moist, ctx) };
  });
  const worst = maxSeverity(levels.map((l) => l.severity));
  return { levels, worst, reason: buildReason(levels, worst, ctx, altUnit) };
}

function buildReason(levels: IcingLevel[], worst: Severity, ctx: IcingContext, altUnit: AltUnit): string {
  const range = worstRange(levels, worst);
  const top = levels.length ? levels[levels.length - 1].altM : 0;

  if (worst === 'GOOD') {
    return `Low icing risk across 0–${fmtAlt(top, altUnit)} AGL (temperature/moisture not conducive).`;
  }

  const where =
    range == null
      ? ''
      : range.lo === range.hi
        ? ` at ${fmtAlt(range.lo, altUnit)} AGL`
        : ` between ${fmtAlt(range.lo, altUnit)} and ${fmtAlt(range.hi, altUnit)} AGL`;

  let driver: string;
  if (ctx.freezing) driver = 'freezing fog/precipitation reported';
  else if (ctx.wetSnow) driver = 'wet snow near 0 °C';
  else if (ctx.saturated) driver = 'saturated air near 0 °C';
  else driver = 'temperatures near the 0 °C band in moist air';

  return `${ICING_LABEL[worst]} icing risk${where}: ${driver}.`;
}
