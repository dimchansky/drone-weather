// Risk model: independent component risks aggregated into a transparent summary.
// Every component carries its own reason — the summary is never a black box.
// Thresholds are conservative DEFAULTS (see docs/spec.md §5); they will become
// user-configurable. Wind/gust guidance is generic, not a specific aircraft's limit.

import type {
  Confidence,
  Metar,
  RiskComponent,
  RiskSummary,
  Severity,
} from './types';
import { ktToMs, mToFt, round } from './units';
import { ceilingFt } from './clouds';
import { hasFog, hasMist, hasFreezingFog } from './metar';
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
export function windRisk(speedKt: number, dirDeg: number | null): RiskComponent {
  const ms = ktToMs(speedKt);
  const severity = windSeverity(ms);
  const from = dirDeg == null ? 'variable' : `${dirDeg}°`;
  const qual = { GOOD: 'light', CAUTION: 'moderate', HIGH: 'strong', NOFLY: 'very strong' }[
    severity
  ];
  return {
    key: 'wind',
    label: 'Wind',
    severity,
    value: `${round(speedKt)} kt (${round(ms, 1)} m/s)`,
    reason: `${qual[0].toUpperCase()}${qual.slice(1)} wind ${round(speedKt)} kt (~${round(ms, 1)} m/s) from ${from}. General guidance — apply your aircraft's wind limit.`,
  };
}

export function gustRisk(speedKt: number, gustKt: number | null): RiskComponent {
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
    value: `${round(gustKt)} kt (+${round(spread)} kt)`,
    reason: `Gusts to ${round(gustKt)} kt, ${round(spread)} kt above the sustained wind. Gust spread raises loss-of-control risk.`,
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

export function moistureRisk(metar: Metar): RiskComponent {
  if (hasFreezingFog(metar)) {
    return { key: 'moisture', label: 'Moisture/fog', severity: 'NOFLY', reason: 'Freezing fog — severe moisture and icing hazard.' };
  }
  const t = metar.tempC;
  const td = metar.dewpC;
  const spread = t != null && td != null ? t - td : null;

  let severity: Severity = 'GOOD';
  if (hasFog(metar)) severity = 'HIGH';
  else if (spread != null) severity = spread < 2 ? 'HIGH' : spread <= 5 ? 'CAUTION' : 'GOOD';
  if (hasMist(metar)) severity = maxSeverity([severity, 'CAUTION']);

  const reason =
    spread != null
      ? `Dew point spread ${round(spread)} °C${hasFog(metar) ? ', fog present' : hasMist(metar) ? ', mist present' : ''} — ${spread < 2 || hasFog(metar) ? 'air near saturation, fog/condensation risk' : 'relatively dry'}.`
      : 'Dew point not reported.';
  return {
    key: 'moisture',
    label: 'Moisture/fog',
    severity,
    value: spread != null ? `${round(spread)} °C spread` : undefined,
    reason,
  };
}

export function ceilingRisk(metar: Metar, opsCeilingM = DEFAULT_OPS_CEILING_M): RiskComponent {
  if (metar.cavok) {
    return { key: 'ceiling', label: 'Cloud ceiling', severity: 'GOOD', reason: 'CAVOK — no significant cloud below 5000 ft AGL.' };
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
      ? `Ceiling ${ceil} ft AGL is below your ${round(opsCeilingM)} m operating band — you would be in or above cloud.`
      : `Ceiling ${ceil} ft AGL.`;
  return { key: 'ceiling', label: 'Cloud ceiling', severity, value: `${ceil} ft`, reason };
}

export function icingRiskComponent(worst: Severity, reason: string): RiskComponent {
  return { key: 'icing', label: 'Icing', severity: worst, reason };
}

export function freshness(ageMin: number): { confidence: Confidence; component: RiskComponent } {
  const confidence: Confidence = ageMin <= 60 ? 'OK' : ageMin <= 120 ? 'REDUCED' : 'LOW';
  const reason =
    confidence === 'OK'
      ? `METAR is ${ageMin} min old.`
      : `METAR is ${ageMin} min old — may not reflect current conditions.`;
  return {
    confidence,
    component: { key: 'freshness', label: 'METAR freshness', severity: confToSeverity[confidence], value: `${ageMin} min`, reason },
  };
}

export function distance(distanceKm: number | null): { confidence: Confidence; component: RiskComponent } {
  if (distanceKm == null) {
    return {
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
}

export function assessRisk(inputs: RiskInputs): RiskSummary {
  const { metar, icingWorst, icingReason, distanceKm, opsCeilingM } = inputs;

  const weather: RiskComponent[] = [
    windRisk(metar.wind.speedKt, metar.wind.dirDeg),
    gustRisk(metar.wind.speedKt, metar.wind.gustKt),
    visibilityRisk(metar.visibilityM),
    moistureRisk(metar),
    ceilingRisk(metar, opsCeilingM),
    icingRiskComponent(icingWorst, icingReason),
  ];

  const fresh = freshness(metar.ageMin);
  const dist = distance(distanceKm);
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
