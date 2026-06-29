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

const NOW = new Date('2026-06-28T13:00:00Z');
const m = (raw: string) => parseMetar(raw, { now: NOW });

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

describe('visibilityRisk', () => {
  it('bands by metres', () => {
    expect(visibilityRisk(10000).severity).toBe('GOOD');
    expect(visibilityRisk(3000).severity).toBe('CAUTION');
    expect(visibilityRisk(1000).severity).toBe('HIGH');
    expect(visibilityRisk(500).severity).toBe('NOFLY');
  });
});

describe('moistureRisk', () => {
  it('is GOOD for a large spread', () => {
    expect(moistureRisk(m('LFPG 281200Z 27005KT CAVOK 23/07 Q1015')).severity).toBe('GOOD');
  });
  it('is HIGH for a tiny spread', () => {
    expect(moistureRisk(m('EHAM 281200Z 21008KT 6000 09/09 Q1011')).severity).toBe('HIGH');
  });
  it('is NO-FLY for freezing fog', () => {
    expect(moistureRisk(m('BIKF 281200Z 03010KT 0300 FZFG M02/M03 Q0995')).severity).toBe('NOFLY');
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
