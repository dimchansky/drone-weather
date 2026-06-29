// Risk model: independent component risks aggregated into a transparent summary.
// Every component carries its own reason — the summary is never a black box.
// Thresholds are conservative DEFAULTS (see docs/spec.md §5); they will become
// user-configurable. Wind/gust guidance is generic, not a specific aircraft's limit.

import type {
  Confidence,
  Metar,
  ModelConditions,
  RiskComponent,
  RiskSummary,
  Severity,
  VerticalProfile,
} from './types';
import { ktToMs, mToFt, round, fmtWindSpeed, fmtAlt, fmtAltFt, type WindUnit, type AltUnit } from './units';
import { ceilingFt } from './clouds';
import { envSaturationHeightM } from './saturation';
import { rhFromDewPoint } from './humidity';
import {
  hasFog,
  hasMist,
  hasFreezingFog,
  hasFreezingPrecip,
  hasPrecip,
  hasThunderstorm,
} from './metar';
import { bumpSeverity, maxSeverity, severityRank } from './severity';

export const DEFAULT_OPS_CEILING_M = 120;

// ----- helpers -----
const windSeverity = (ms: number): Severity =>
  ms < 5 ? 'GOOD' : ms < 8 ? 'CAUTION' : ms <= 11 ? 'HIGH' : 'NOFLY';

const OVERALL_WORD: Record<Severity, string> = {
  GOOD: 'Good',
  CAUTION: 'Caution',
  HIGH: 'High risk',
  NOFLY: 'Not recommended',
};

const confToSeverity: Record<Confidence, Severity> = {
  OK: 'GOOD',
  REDUCED: 'CAUTION',
  LOW: 'HIGH',
};

const worseConfidence = (a: Confidence, b: Confidence): Confidence => {
  const order: Confidence[] = ['OK', 'REDUCED', 'LOW'];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
};

// ----- component risks -----
// Display wind in the user's unit; append the canonical knots as secondary context (only
// when the chosen unit isn't already knots).
const windWithKt = (speedKt: number, unit: WindUnit): string =>
  unit === 'kt' ? fmtWindSpeed(speedKt, 'kt') : `${fmtWindSpeed(speedKt, unit)} (${round(speedKt)} kt)`;

export function windRisk(speedKt: number, dirDeg: number | null, unit: WindUnit = 'kt'): RiskComponent {
  const severity = windSeverity(ktToMs(speedKt));
  const from = dirDeg == null ? 'variable' : `${dirDeg}°`;
  const qual = { GOOD: 'light', CAUTION: 'moderate', HIGH: 'strong', NOFLY: 'very strong' }[
    severity
  ];
  return {
    key: 'wind',
    label: 'Wind',
    severity,
    value: fmtWindSpeed(speedKt, unit),
    reason: `${qual[0].toUpperCase()}${qual.slice(1)} wind ${windWithKt(speedKt, unit)} from ${from}. General guidance — apply your aircraft's wind limit.`,
  };
}

export function gustRisk(speedKt: number, gustKt: number | null, unit: WindUnit = 'kt'): RiskComponent {
  if (gustKt == null) {
    return { key: 'gust', label: 'Gusts', severity: 'GOOD', reason: 'No gusts reported.' };
  }
  const spread = gustKt - speedKt;
  let severity = windSeverity(ktToMs(gustKt));
  if (spread >= 10) severity = maxSeverity([severity, 'HIGH']);
  else if (spread >= 5) severity = maxSeverity([severity, 'CAUTION']);
  return {
    key: 'gust',
    label: 'Gusts',
    severity,
    value: `${fmtWindSpeed(gustKt, unit)} (+${fmtWindSpeed(spread, unit)})`,
    reason: `Gusts to ${windWithKt(gustKt, unit)}, ${fmtWindSpeed(spread, unit)} above the sustained wind. Gust spread raises loss-of-control risk.`,
  };
}

export function visibilityRisk(visibilityM: number | null): RiskComponent {
  if (visibilityM == null) {
    return { key: 'visibility', label: 'Visibility', severity: 'CAUTION', reason: 'Visibility not reported.' };
  }
  const severity: Severity =
    visibilityM >= 5000 ? 'GOOD' : visibilityM >= 1500 ? 'CAUTION' : visibilityM >= 800 ? 'HIGH' : 'NOFLY';
  const display = visibilityM >= 10000 ? '≥10 km' : `${round(visibilityM / 1000, 1)} km`;
  return {
    key: 'visibility',
    label: 'Visibility',
    severity,
    value: display,
    reason: `Visibility ${display}. Keep the drone within sight (VLOS).`,
  };
}

export interface MoistureInputs {
  model?: ModelConditions | null;
  cloudBaseM?: number | null;
  opsCeilingM?: number;
  /** Vertical profile for the coarse model elevated near-saturation supplement. */
  profile?: VerticalProfile | null;
  /** Altitude display unit for cloud-base / layer heights in the reason text. */
  altUnit?: AltUnit;
  now?: Date;
}

const isNightOrMorning = (now: Date): boolean => {
  const h = now.getHours();
  return h >= 20 || h < 9;
};

/**
 * Moisture & wetness exposure: will the drone fly into wet air (precip, fog, cloud
 * immersion) or get wet from dew/condensation? Separate from icing (freezing-specific) —
 * wetness is a hazard for non-waterproof drones even above freezing. Worst driver wins.
 */
export function moistureRisk(metar: Metar, opts: MoistureInputs = {}): RiskComponent {
  const label = 'Moisture & wetness';
  const opsCeilingM = opts.opsCeilingM ?? DEFAULT_OPS_CEILING_M;
  const model = opts.model ?? null;
  const altUnit = opts.altUnit ?? 'm';
  const now = opts.now ?? new Date();

  const candidates: { severity: Severity; reason: string; value?: string }[] = [];

  // Freezing / convective — most severe.
  if (hasFreezingFog(metar) || hasFreezingPrecip(metar)) {
    candidates.push({ severity: 'NOFLY', reason: 'Freezing fog/precipitation — wet airframe and severe icing hazard.', value: 'freezing' });
  }
  if (hasThunderstorm(metar)) {
    candidates.push({ severity: 'NOFLY', reason: 'Thunderstorm in the area.', value: 'TS' });
  }

  // Precipitation (observed METAR, else model).
  if (hasPrecip(metar)) {
    candidates.push({ severity: 'HIGH', reason: 'Precipitation reported (METAR) — the drone will get wet.', value: 'precip' });
  } else if (model?.precipMm != null && model.precipMm >= 0.1) {
    candidates.push({ severity: 'HIGH', reason: `Model: ~${round(model.precipMm, 1)} mm/h precipitation expected.`, value: `${round(model.precipMm, 1)} mm` });
  } else if (model?.precipProb != null && model.precipProb >= 60) {
    candidates.push({ severity: 'CAUTION', reason: `Model: ${round(model.precipProb)}% chance of precipitation.`, value: `${round(model.precipProb)}%` });
  }

  // Fog / mist.
  if (hasFog(metar)) {
    candidates.push({ severity: 'HIGH', reason: 'Fog — flying in fog wets the airframe and optics.', value: 'fog' });
  } else if (hasMist(metar)) {
    candidates.push({ severity: 'CAUTION', reason: 'Mist (BR) — damp air near the surface.', value: 'mist' });
  }

  // Cloud immersion — resolved cloud base within / just above the ops band.
  const baseM = opts.cloudBaseM;
  if (baseM != null && baseM <= opsCeilingM) {
    candidates.push({ severity: 'HIGH', reason: `Cloud base ~${fmtAlt(baseM, altUnit)} is within your ${fmtAlt(opsCeilingM, altUnit)} ops band — you would fly into cloud.`, value: `base ${fmtAlt(baseM, altUnit)}` });
  } else if (baseM != null && baseM <= opsCeilingM + 150) {
    candidates.push({ severity: 'CAUTION', reason: `Cloud base ~${fmtAlt(baseM, altUnit)} is just above your ops band.`, value: `base ${fmtAlt(baseM, altUnit)}` });
  }

  // Near-saturation / dew / condensation.
  const t = metar.tempC ?? model?.tempC2m ?? null;
  const td = metar.dewpC ?? model?.dewp2m ?? null;
  const spread = t != null && td != null ? t - td : null;
  const rh = t != null && td != null ? rhFromDewPoint(t, td) : (model?.rh2m ?? null);
  const windKt = metar.wind.calm ? 0 : metar.wind.speedKt || model?.windKt || 0;
  const nearSat = (rh != null && rh >= 97) || (spread != null && spread <= 1);
  if (nearSat) {
    const lowWind = windKt < 6;
    const clearSky = model?.cloudCoverPct != null && model.cloudCoverPct < 40;
    const rhTxt = rh != null ? `RH ~${round(rh)}%` : 'air near saturation';
    if (lowWind && clearSky && isNightOrMorning(now)) {
      candidates.push({ severity: 'HIGH', reason: `Clear, calm, ${now.getHours() < 12 ? 'early morning' : 'overnight'} with ${rhTxt} — dew likely on the airframe.`, value: 'dew' });
    } else if (lowWind) {
      candidates.push({ severity: 'HIGH', reason: `${rhTxt} in calm air — condensation/dew likely.`, value: 'condensation' });
    } else {
      candidates.push({ severity: 'CAUTION', reason: `${rhTxt} — condensation possible (wind keeps it lower).`, value: 'near-sat' });
    }
  }

  // Coarse model supplement: a near-saturated layer just within/above the climb that the surface
  // obs may miss. ADDITIVE only (CAUTION) — worst-wins means it can never suppress a stronger
  // surface/METAR-driven warning. Strict thresholds keep false alarms low given coarse resolution.
  // The model under-detects shallow low layers (docs/cloud-base-research.md §3.2), so this only
  // adds a flag when the model positively sees moisture; it never lowers the surface verdict.
  const profile = opts.profile;
  if (profile?.source === 'model') {
    const satM = envSaturationHeightM(profile.levels, {
      minM: 30, // skip the surface band — handled by the near-saturation block above
      capM: opsCeilingM + 200,
      spreadThresh: 1,
      rhThresh: 95,
    });
    if (satM != null) {
      candidates.push({
        severity: 'CAUTION',
        reason: `Model: near-saturated layer ~${fmtAlt(satM, altUnit)} AGL (coarse) — damp air within your climb.`,
        value: `~${fmtAlt(satM, altUnit)}`,
      });
    }
  }

  if (candidates.length === 0) {
    return {
      key: 'moisture',
      label,
      severity: 'GOOD',
      value: spread != null ? `${round(spread)} °C spread` : undefined,
      reason: spread != null ? `Dry air (dew point spread ${round(spread)} °C) — low wetness risk.` : 'Low wetness risk.',
    };
  }

  const worst = maxSeverity(candidates.map((c) => c.severity));
  const driver = candidates.find((c) => c.severity === worst)!; // earliest = highest priority
  return { key: 'moisture', label, severity: worst, value: driver.value, reason: driver.reason };
}

export function ceilingRisk(
  metar: Metar,
  opsCeilingM = DEFAULT_OPS_CEILING_M,
  altUnit: AltUnit = 'm',
): RiskComponent {
  if (metar.cavok) {
    return { key: 'ceiling', label: 'Cloud ceiling', severity: 'GOOD', reason: `CAVOK — no significant cloud below ${fmtAltFt(5000, altUnit)} AGL.` };
  }
  const ceil = ceilingFt(metar.clouds);
  if (ceil == null) {
    return { key: 'ceiling', label: 'Cloud ceiling', severity: 'GOOD', reason: 'No broken/overcast ceiling reported.' };
  }
  const opsFt = mToFt(opsCeilingM);
  const severity: Severity =
    ceil < opsFt ? 'NOFLY' : ceil < opsFt + 300 ? 'HIGH' : ceil < 1500 ? 'CAUTION' : 'GOOD';
  const reason =
    severity === 'NOFLY'
      ? `Ceiling ${fmtAltFt(ceil, altUnit)} AGL is below your ${fmtAlt(opsCeilingM, altUnit)} operating band — you would be in or above cloud.`
      : `Ceiling ${fmtAltFt(ceil, altUnit)} AGL.`;
  return { key: 'ceiling', label: 'Cloud ceiling', severity, value: fmtAltFt(ceil, altUnit), reason };
}

export function icingRiskComponent(worst: Severity, reason: string): RiskComponent {
  return { key: 'icing', label: 'Icing', severity: worst, reason };
}

export type SourceMode = 'metar' | 'model';

export function freshness(
  ageMin: number,
  source: SourceMode = 'metar',
): { confidence: Confidence; component: RiskComponent } {
  const confidence: Confidence = ageMin <= 60 ? 'OK' : ageMin <= 120 ? 'REDUCED' : 'LOW';
  // Don't call it "METAR" when there is no METAR — model-only briefs use forecast data.
  const label = source === 'model' ? 'Data freshness' : 'METAR freshness';
  const noun = source === 'model' ? 'Forecast model data is' : 'METAR is';
  const reason =
    confidence === 'OK'
      ? `${noun} ${ageMin} min old.`
      : `${noun} ${ageMin} min old — may not reflect current conditions.`;
  return {
    confidence,
    component: { key: 'freshness', label, severity: confToSeverity[confidence], value: `${ageMin} min`, reason },
  };
}

export function distance(
  distanceKm: number | null,
  source: SourceMode = 'metar',
): { confidence: Confidence; component: RiskComponent } {
  if (distanceKm == null) {
    // No station distance: model-only briefs have no station at all — say so coherently.
    return source === 'model'
      ? {
          confidence: 'OK',
          component: {
            key: 'distance',
            label: 'Data source',
            severity: 'GOOD',
            reason: 'No nearby METAR station — using forecast model data for this location.',
          },
        }
      : {
          confidence: 'OK',
          component: { key: 'distance', label: 'Station distance', severity: 'GOOD', reason: 'Station distance unknown.' },
        };
  }
  const confidence: Confidence = distanceKm < 15 ? 'OK' : distanceKm <= 40 ? 'REDUCED' : 'LOW';
  const reason =
    confidence === 'OK'
      ? `Station is ${round(distanceKm)} km away — a good local approximation.`
      : `Station is ${round(distanceKm)} km away — may not represent your exact site.`;
  return {
    confidence,
    component: { key: 'distance', label: 'Station distance', severity: confToSeverity[confidence], value: `${round(distanceKm)} km`, reason },
  };
}

// ----- aggregation -----
export interface RiskInputs {
  metar: Metar;
  icingWorst: Severity;
  icingReason: string;
  distanceKm: number | null;
  opsCeilingM?: number;
  /** Surface model conditions for the moisture/wetness component. */
  model?: ModelConditions | null;
  /** Resolved cloud base (m AGL) for cloud-immersion detection. */
  cloudBaseM?: number | null;
  /** Vertical profile for the coarse model elevated near-saturation supplement. */
  profile?: VerticalProfile | null;
  /** Data source: 'metar' (observed) or 'model' (Open-Meteo only). Drives freshness wording. */
  source?: SourceMode;
  /** Display unit for wind/gust values + reasons (UI preference). Canonical stays in knots. */
  windUnit?: WindUnit;
  /** Display unit for altitude values in ceiling/cloud reasons (UI preference). */
  altUnit?: AltUnit;
  /** Reference time for freshness + the dew time-of-day amplifier; defaults to now. */
  now?: Date;
}

export function assessRisk(inputs: RiskInputs): RiskSummary {
  const { metar, icingWorst, icingReason, distanceKm, opsCeilingM } = inputs;
  const now = inputs.now ?? new Date();

  const windUnit = inputs.windUnit ?? 'kt';
  const altUnit = inputs.altUnit ?? 'm';
  const weather: RiskComponent[] = [
    windRisk(metar.wind.speedKt, metar.wind.dirDeg, windUnit),
    gustRisk(metar.wind.speedKt, metar.wind.gustKt, windUnit),
    visibilityRisk(metar.visibilityM),
    moistureRisk(metar, { model: inputs.model, cloudBaseM: inputs.cloudBaseM, profile: inputs.profile, opsCeilingM, altUnit, now }),
    ceilingRisk(metar, opsCeilingM, altUnit),
    icingRiskComponent(icingWorst, icingReason),
  ];

  // Compute age from the absolute observation timestamp + live `now` so it stays
  // correct as the page ages, rather than freezing the value captured at fetch.
  const ageMin = Math.max(0, Math.round((now.getTime() - metar.observedAt.getTime()) / 60000));
  const sourceMode = inputs.source ?? 'metar';
  const fresh = freshness(ageMin, sourceMode);
  const dist = distance(distanceKm, sourceMode);
  const confidence = worseConfidence(fresh.confidence, dist.confidence);
  const uncertain = confidence !== 'OK';

  let overall = maxSeverity(weather.map((c) => c.severity));
  if (uncertain && severityRank(overall) < severityRank('HIGH')) {
    overall = bumpSeverity(overall, 'HIGH');
  }

  return {
    overall,
    confidence,
    uncertain,
    components: [...weather, fresh.component, dist.component],
    headline: buildHeadline(overall, weather, uncertain),
  };
}

function buildHeadline(overall: Severity, weather: RiskComponent[], uncertain: boolean): string {
  const tail = uncertain ? ' Data confidence is reduced (see station distance / METAR age).' : '';
  if (overall === 'GOOD') {
    return `Conditions look reasonable from a weather standpoint.${tail}`;
  }
  const concerns = weather
    .filter((c) => severityRank(c.severity) >= severityRank('CAUTION'))
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .map((c) => {
      const tag = c.severity === 'NOFLY' ? ' (no-fly)' : c.severity === 'HIGH' ? ' (high)' : '';
      return `${c.label.toLowerCase()}${tag}`;
    });
  return `${OVERALL_WORD[overall]}: ${concerns.join(', ')}.${tail}`;
}
