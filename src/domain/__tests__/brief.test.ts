import { describe, it, expect } from 'vitest';
import { assembleBrief } from '../brief';
import { parseMetar } from '../metar';
import type { ProfileLevel } from '../types';

const NOW = new Date('2026-06-28T13:00:00Z');
const metar = parseMetar('EGLL 281250Z 28009KT 9999 FEW035 BKN050 23/07 Q1013 NOSIG', { now: NOW });

describe('assembleBrief', () => {
  it('uses the lapse profile when no model levels are given', () => {
    const b = assembleBrief({ coord: { lat: 51.5, lon: -0.1 }, source: 'metar', metar, modelLevels: [], now: NOW });
    expect(b.profile.source).toBe('lapse');
    expect(b.profile.levels[0].tempC).toBeCloseTo(23, 4);
    expect(b.risk.components.map((c) => c.key)).toContain('icing');
    expect(b.risk.overall).toBeDefined();
    expect(b.cloudBase.kind).toBe('actual');
  });

  it('uses the model profile when levels are provided', () => {
    const model: ProfileLevel[] = [
      { altM: 0, tempC: 23, dewpC: 7, rhPct: 35, source: 'model' },
      { altM: 500, tempC: 19, dewpC: 6, rhPct: 45, source: 'model' },
      { altM: 1000, tempC: 16, dewpC: 5, rhPct: 50, source: 'model' },
    ];
    const b = assembleBrief({ coord: { lat: 51.5, lon: -0.1 }, source: 'metar', metar, modelLevels: model, now: NOW });
    expect(b.profile.source).toBe('model');
  });

  it('passes station distance into the risk confidence', () => {
    const b = assembleBrief({
      coord: { lat: 51.5, lon: -0.1 },
      source: 'metar',
      metar,
      modelLevels: [],
      station: { icao: 'EGLL', coord: { lat: 51.48, lon: -0.46 }, distanceKm: 55, bearingDeg: 270 },
      now: NOW,
    });
    expect(b.risk.confidence).toBe('LOW'); // 55 km > 40 km threshold
    expect(b.risk.uncertain).toBe(true);
  });
});
