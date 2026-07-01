import { describe, it, expect } from 'vitest';
import {
  windRisk,
  gustRisk,
  visibilityRisk,
  moistureRisk,
  ceilingRisk,
  freshness,
  distance,
  assessRisk,
} from '../risk';
import { parseMetar } from '../metar';
import type { ProfileLevel, VerticalProfile } from '../types';

const NOW = new Date('2026-06-28T13:00:00Z');
const m = (raw: string) => parseMetar(raw, { now: NOW });

const modelProfile = (rows: Partial<ProfileLevel>[]): VerticalProfile => ({
  source: 'model',
  note: '',
  levels: rows
    .map((r) => ({ altM: 0, tempC: 15, dewpC: null, rhPct: null, cloudPct: null, source: 'model' as const, ...r }))
    .sort((a, b) => a.altM - b.altM),
});

describe('windRisk', () => {
  it('bands by m/s (kt input)', () => {
    expect(windRisk(8, 280).severity).toBe('GOOD'); // ~4.1 m/s
    expect(windRisk(13, 280).severity).toBe('CAUTION'); // ~6.7 m/s
    expect(windRisk(18, 280).severity).toBe('HIGH'); // ~9.3 m/s
    expect(windRisk(25, 280).severity).toBe('NOFLY'); // ~12.9 m/s
  });
});

describe('gustRisk', () => {
  it('is GOOD when no gusts', () => {
    expect(gustRisk(10, null).severity).toBe('GOOD');
  });
  it('escalates with gust spread', () => {
    expect(gustRisk(8, 14).severity).toBe('CAUTION'); // spread 6
    expect(gustRisk(8, 20).severity).toBe('HIGH'); // spread 12
  });
});

describe('wind/gust display unit', () => {
  it('windRisk formats the value in the chosen unit (kt default)', () => {
    expect(windRisk(15, 190).value).toBe('15 kt');
    expect(windRisk(15, 190, 'ms').value).toBe('7.7 m/s');
    expect(windRisk(15, 190, 'ms').reason).toMatch(/7\.7 m\/s \(15 kt\)/); // canonical kt as secondary
    expect(windRisk(15, 190, 'kmh').value).toBe('27.8 km/h');
  });

  it('gustRisk value + spread use the chosen unit', () => {
    expect(gustRisk(15, 25).value).toBe('25 kt (+10 kt)');
    const ms = gustRisk(15, 25, 'ms');
    expect(ms.value).toBe('12.9 m/s (+5.1 m/s)');
    expect(ms.value).not.toMatch(/kt/);
  });

  it('assessRisk threads windUnit into wind & gust components', () => {
    const r = assessRisk({
      metar: m('KMCI 281200Z 19015G25KT CAVOK 20/05 Q1016'),
      icingWorst: 'GOOD',
      icingReason: 'low',
      distanceKm: 5,
      windUnit: 'ms',
      now: NOW,
    });
    const wind = r.components.find((c) => c.key === 'wind')!;
    const gust = r.components.find((c) => c.key === 'gust')!;
    expect(wind.value).toMatch(/m\/s$/);
    expect(gust.value).toMatch(/m\/s \(\+[\d.]+ m\/s\)/);
  });
});

describe('altitude display unit (ceiling / cloud-base reasons)', () => {
  const lowCeil = () => m('EGLL 281200Z 24008KT 4000 BKN003 10/09 Q1008'); // BKN003 = 300 ft

  it('ceilingRisk formats ceiling + ops band in the chosen unit', () => {
    expect(ceilingRisk(lowCeil()).reason).toMatch(/91 m AGL/); // default m
    expect(ceilingRisk(lowCeil()).value).toBe('91 m');
    const ft = ceilingRisk(lowCeil(), 120, 'ft');
    expect(ft.reason).toMatch(/300 ft AGL/);
    expect(ft.reason).toMatch(/394 ft operating band/);
    expect(ft.value).toBe('300 ft');
  });

  it('ceilingRisk CAVOK note respects the unit', () => {
    const cavok = m('LFPG 281200Z 27005KT CAVOK 23/07 Q1015');
    expect(ceilingRisk(cavok).reason).toMatch(/below 1524 m AGL/);
    expect(ceilingRisk(cavok, 120, 'ft').reason).toMatch(/below 5000 ft AGL/);
  });

  it('moistureRisk cloud-immersion reason uses the chosen unit', () => {
    const base = m('EGLL 281200Z 27006KT 9999 SCT004 12/11 Q1010');
    expect(moistureRisk(base, { cloudBaseM: 90, opsCeilingM: 120 }).reason).toMatch(/~90 m is within your 120 m/);
    const ft = moistureRisk(base, { cloudBaseM: 90, opsCeilingM: 120, altUnit: 'ft' });
    expect(ft.reason).toMatch(/~295 ft is within your 394 ft/);
  });

  it('assessRisk threads altUnit into the ceiling component', () => {
    const r = assessRisk({ metar: lowCeil(), icingWorst: 'GOOD', icingReason: 'low', distanceKm: 5, altUnit: 'ft', now: NOW });
    expect(r.components.find((c) => c.key === 'ceiling')!.value).toBe('300 ft');
  });
});

describe('visibilityRisk', () => {
  it('bands by metres', () => {
    expect(visibilityRisk(10000).severity).toBe('GOOD');
    expect(visibilityRisk(3000).severity).toBe('CAUTION');
    expect(visibilityRisk(1000).severity).toBe('HIGH');
    expect(visibilityRisk(500).severity).toBe('NOFLY');
  });
});

describe('moistureRisk (moisture & wetness)', () => {
  const NIGHT = new Date('2026-06-28T03:00:00Z'); // device-local hour used by the dew amplifier

  it('is GOOD for dry air (large spread)', () => {
    expect(moistureRisk(m('LFPG 281200Z 27005KT CAVOK 23/07 Q1015')).severity).toBe('GOOD');
  });

  it('is CAUTION for near-saturation in a breeze', () => {
    // RH ~100% but 8 kt wind keeps condensation lower
    expect(moistureRisk(m('EHAM 281200Z 21008KT 6000 09/09 Q1011')).severity).toBe('CAUTION');
  });

  it('is HIGH for precipitation', () => {
    expect(moistureRisk(m('EGLL 281200Z 24010KT 6000 -RA BKN015 12/11 Q1008')).severity).toBe('HIGH');
  });

  it('is HIGH for fog', () => {
    expect(moistureRisk(m('EGLL 281200Z 02003KT 0400 FG 08/08 Q1012')).severity).toBe('HIGH');
  });

  it('is NO-FLY for freezing fog', () => {
    expect(moistureRisk(m('BIKF 281200Z 03010KT 0300 FZFG M02/M03 Q0995')).severity).toBe('NOFLY');
  });

  it('flags cloud immersion when the resolved base is within the ops band', () => {
    const r = moistureRisk(m('EGLL 281200Z 27006KT 9999 SCT004 12/11 Q1010'), {
      cloudBaseM: 90,
      opsCeilingM: 120,
    });
    expect(r.severity).toBe('HIGH');
    expect(r.reason).toMatch(/into cloud/i);
  });

  it('flags morning dew: near-saturation + calm + clear sky + early morning', () => {
    const r = moistureRisk(m('EFHK 281200Z 00000KT 9999 14/14 Q1018'), {
      model: { tempC2m: 14, dewp2m: 14, rh2m: 100, windKt: 1, precipMm: 0, precipProb: 0, cloudCoverPct: 5, cloudCoverLowPct: 0 },
      now: NIGHT,
    });
    expect(r.severity).toBe('HIGH');
    expect(r.reason).toMatch(/dew/i);
  });

  it('uses model precipitation probability when METAR has no precip', () => {
    const r = moistureRisk(m('LFPG 281200Z 27006KT CAVOK 18/06 Q1015'), {
      model: { tempC2m: 18, dewp2m: 6, rh2m: 46, windKt: 6, precipMm: 0, precipProb: 70, cloudCoverPct: 60, cloudCoverLowPct: 30 },
    });
    expect(r.severity).toBe('CAUTION');
    expect(r.reason).toMatch(/70%/);
  });

  it('adds a coarse model elevated near-saturation caution (dry surface)', () => {
    const profile = modelProfile([
      { altM: 0, tempC: 20, dewpC: 8, rhPct: 46 }, // dry surface (spread 12)
      { altM: 250, tempC: 18, dewpC: 17.5, rhPct: 97 }, // near-saturated layer within the climb
    ]);
    const r = moistureRisk(m('LFPG 281200Z 27006KT 9999 20/08 Q1015'), { profile, opsCeilingM: 120 });
    expect(r.severity).toBe('CAUTION');
    expect(r.reason).toMatch(/near-saturated layer/i);
    expect(r.reason).toMatch(/model/i);
  });

  it('surface saturation dominates even when the model profile misses it', () => {
    // Saturated calm surface → HIGH condensation; a dry model profile must NOT downgrade it.
    const profile = modelProfile([
      { altM: 0, tempC: 11, dewpC: 11, rhPct: 100 },
      { altM: 300, tempC: 9, dewpC: -2, rhPct: 40 }, // dry aloft — model sees no low moisture
    ]);
    const r = moistureRisk(m('EFHK 281200Z 00000KT 9999 11/11 Q1018'), { profile, opsCeilingM: 120 });
    expect(r.severity).toBe('HIGH');
    expect(r.reason).not.toMatch(/model/i); // surface-driven reason wins, not the model layer
  });
});

describe('ceilingRisk', () => {
  it('is GOOD for CAVOK', () => {
    expect(ceilingRisk(m('LFPG 281200Z 27005KT CAVOK 23/07 Q1015')).severity).toBe('GOOD');
  });
  it('is NO-FLY when the ceiling is below the ops band', () => {
    // BKN003 = 300 ft < 120 m (394 ft)
    expect(ceilingRisk(m('EGLL 281200Z 24008KT 4000 BKN003 10/09 Q1008')).severity).toBe('NOFLY');
  });
  it('is GOOD for a high ceiling', () => {
    expect(ceilingRisk(m('EGLL 281200Z 24008KT 9999 BKN060 18/05 Q1020')).severity).toBe('GOOD');
  });
});

describe('confidence contributors', () => {
  it('freshness degrades with age', () => {
    expect(freshness(30).confidence).toBe('OK');
    expect(freshness(90).confidence).toBe('REDUCED');
    expect(freshness(180).confidence).toBe('LOW');
  });
  it('distance degrades with range', () => {
    expect(distance(5).confidence).toBe('OK');
    expect(distance(25).confidence).toBe('REDUCED');
    expect(distance(60).confidence).toBe('LOW');
  });
});

describe('assessRisk aggregation', () => {
  it('is GOOD overall for benign conditions', () => {
    const metar = m('LFPG 281200Z 27006KT CAVOK 20/05 Q1016');
    const r = assessRisk({ metar, icingWorst: 'GOOD', icingReason: 'low', distanceKm: 5, now: NOW });
    expect(r.overall).toBe('GOOD');
    expect(r.confidence).toBe('OK');
    expect(r.uncertain).toBe(false);
    expect(r.headline).toMatch(/reasonable/i);
  });

  it('takes the worst weather component (weakest-link)', () => {
    // strong wind drives HIGH despite otherwise fine conditions
    const metar = m('LFPG 281200Z 27018KT CAVOK 20/05 Q1016');
    const r = assessRisk({ metar, icingWorst: 'GOOD', icingReason: 'low', distanceKm: 5, now: NOW });
    expect(r.overall).toBe('HIGH');
  });

  it('a NO-FLY component dominates', () => {
    const metar = m('BIKF 281200Z 03010KT 0300 FZFG M02/M03 Q0995');
    const r = assessRisk({ metar, icingWorst: 'NOFLY', icingReason: 'freezing fog', distanceKm: 5, now: NOW });
    expect(r.overall).toBe('NOFLY');
    expect(r.headline).toMatch(/no-fly/i);
  });

  it('reduced confidence bumps a GOOD up to CAUTION but never to NO-FLY', () => {
    const metar = m('LFPG 281200Z 27006KT CAVOK 20/05 Q1016');
    const farStale = assessRisk({ metar, icingWorst: 'GOOD', icingReason: 'low', distanceKm: 60, now: NOW });
    expect(farStale.confidence).toBe('LOW');
    expect(farStale.overall).toBe('CAUTION'); // bumped from GOOD, not beyond
    expect(farStale.uncertain).toBe(true);
  });

  it('includes freshness and distance as visible components', () => {
    const metar = m('LFPG 281200Z 27006KT CAVOK 20/05 Q1016');
    const r = assessRisk({ metar, icingWorst: 'GOOD', icingReason: 'low', distanceKm: 5, now: NOW });
    const keys = r.components.map((c) => c.key);
    expect(keys).toEqual(['wind', 'gust', 'visibility', 'moisture', 'ceiling', 'icing', 'freshness', 'distance']);
    expect(r.components.every((c) => c.reason.length > 0)).toBe(true);
  });
});

describe('assessRisk live freshness (age derived from observedAt + now)', () => {
  // Observation fixed at 12:00Z; vary `now` to age the report.
  const metar = parseMetar('LFPG 281200Z 27006KT CAVOK 20/05 Q1016', {
    now: new Date('2026-06-28T12:00:00Z'),
  });
  const at = (iso: string) =>
    assessRisk({ metar, icingWorst: 'GOOD', icingReason: 'low', distanceKm: 5, now: new Date(iso) });
  const freshnessOf = (iso: string) =>
    at(iso).components.find((c) => c.key === 'freshness')!;

  it('is OK and reports the live age at +30 min', () => {
    const r = at('2026-06-28T12:30:00Z');
    expect(r.confidence).toBe('OK');
    expect(freshnessOf('2026-06-28T12:30:00Z').value).toBe('30 min');
  });

  it('degrades to REDUCED and bumps GOOD→CAUTION once the report ages past an hour', () => {
    const r = at('2026-06-28T13:30:00Z'); // 90 min
    expect(r.confidence).toBe('REDUCED');
    expect(r.overall).toBe('CAUTION');
    expect(freshnessOf('2026-06-28T13:30:00Z').value).toBe('90 min');
  });

  it('degrades to LOW when very stale', () => {
    expect(at('2026-06-28T14:10:00Z').confidence).toBe('LOW'); // 130 min
  });
});

describe('freshness/distance wording by data source', () => {
  it('labels freshness for a METAR brief', () => {
    const f = freshness(28, 'metar');
    expect(f.component.label).toBe('METAR freshness');
    expect(f.component.reason).toMatch(/^METAR is 28 min old/);
  });

  it('labels freshness for a model-only brief (no METAR)', () => {
    const f = freshness(28, 'model');
    expect(f.component.label).toBe('Data freshness');
    expect(f.component.reason).toMatch(/^Forecast model data is 28 min old/);
  });

  it('relabels the distance row as "Data source" for a model-only brief', () => {
    const d = distance(null, 'model');
    expect(d.component.label).toBe('Data source');
    expect(d.component.reason).toMatch(/No nearby METAR station/);
  });

  it('assessRisk for a model brief never says "METAR" in freshness/distance', () => {
    const metar = m('LFPG 281200Z 27006KT CAVOK 20/05 Q1016');
    const r = assessRisk({ metar, icingWorst: 'GOOD', icingReason: 'low', distanceKm: null, source: 'model', now: NOW });
    const fresh = r.components.find((c) => c.key === 'freshness')!;
    const dist = r.components.find((c) => c.key === 'distance')!;
    expect(fresh.label).toBe('Data freshness');
    expect(dist.label).toBe('Data source');
    expect(`${fresh.reason} ${dist.reason}`).not.toMatch(/METAR is/);
  });
});

describe('dominant reason + advice (decision banner)', () => {
  const base = { icingWorst: 'GOOD' as const, icingReason: 'low', distanceKm: 5, now: NOW };

  it('wind reason names the compass point of the source direction', () => {
    expect(windRisk(15, 290).reason).toMatch(/290° \(WNW\)/);
    // canonical speed substring still present (existing behaviour unchanged)
    expect(windRisk(15, 290, 'ms').reason).toMatch(/7\.7 m\/s \(15 kt\)/);
  });

  it('primary is null and advice is hedged GOOD copy for benign conditions', () => {
    const r = assessRisk({ metar: m('LFPG 281200Z 27006KT CAVOK 20/05 Q1016'), ...base });
    expect(r.primary).toBeNull();
    expect(r.advice).toMatch(/short local VLOS/i);
    expect(r.advice).not.toMatch(/safe to fly/i);
  });

  it('primary is the worst weather component (wind) carrying its magnitude value', () => {
    const r = assessRisk({ metar: m('LFPG 281200Z 29018KT CAVOK 20/05 Q1016'), ...base });
    expect(r.primary?.key).toBe('wind');
    expect(r.primary?.value).toBe('18 kt');
    expect(r.advice).toMatch(/into the wind/i);
  });

  it('NO-FLY advice leads with "Not recommended"', () => {
    const r = assessRisk({
      metar: m('BIKF 281200Z 03010KT 0300 FZFG M02/M03 Q0995'),
      icingWorst: 'NOFLY',
      icingReason: 'freezing fog',
      distanceKm: 5,
      now: NOW,
    });
    expect(r.overall).toBe('NOFLY');
    expect(r.advice).toMatch(/^Not recommended/);
  });

  it('reduced confidence appends a verify-the-METAR note', () => {
    const r = assessRisk({
      metar: m('LFPG 281200Z 29018KT CAVOK 20/05 Q1016'),
      icingWorst: 'GOOD',
      icingReason: 'low',
      distanceKm: 60,
      now: NOW,
    });
    expect(r.uncertain).toBe(true);
    expect(r.primary?.key).toBe('wind');
    expect(r.advice).toMatch(/Reduced confidence — verify against the raw METAR/);
  });

  it('ties break by priority order (wind before an equal-severity later factor)', () => {
    // 29018KT → HIGH wind; 1200 m → HIGH visibility. Wind is earlier in the priority order.
    const r = assessRisk({ metar: m('LFPG 281200Z 29018KT 1200 20/05 Q1016'), ...base });
    expect(r.overall).toBe('HIGH');
    expect(r.primary?.key).toBe('wind');
  });
});
