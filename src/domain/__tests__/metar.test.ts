import { describe, it, expect } from 'vitest';
import {
  parseMetar,
  hasFreezingFog,
  hasFreezingPrecip,
  hasSnow,
  hasPrecip,
  hasFog,
  hasMist,
} from '../metar';

const NOW = new Date('2026-06-28T13:10:00Z');
const parse = (raw: string) => parseMetar(raw, { now: NOW });

describe('parseMetar — core fields', () => {
  it('parses a US METAR with gusts, SM visibility and inHg altimeter', () => {
    const m = parse('METAR KMCI 281253Z 19017G26KT 10SM FEW060 26/22 A2971 NOSIG');
    expect(m.icao).toBe('KMCI');
    expect(m.wind).toMatchObject({ dirDeg: 190, speedKt: 17, gustKt: 26, calm: false });
    expect(m.visibilityM).toBe(10000); // 10 SM -> capped to the >=10km marker
    expect(m.clouds).toEqual([
      expect.objectContaining({ cover: 'FEW', baseFt: 6000, baseM: 1829 }),
    ]);
    expect(m.tempC).toBe(26);
    expect(m.dewpC).toBe(22);
    expect(m.qnhHpa).toBeCloseTo(1006.1, 0); // 29.71 inHg
    expect(m.trend).toBe('NOSIG');
    expect(m.ageMin).toBe(17); // 12:53Z observed vs 13:10Z now
  });

  it('parses a European METAR with variable wind sector and Q pressure', () => {
    const m = parse('EGLL 281250Z 28009KT 250V310 9999 FEW035 BKN012 23/07 Q1013 NOSIG');
    expect(m.icao).toBe('EGLL');
    expect(m.wind).toMatchObject({ dirDeg: 280, speedKt: 9, variable: true, varFromDeg: 250, varToDeg: 310 });
    expect(m.visibilityM).toBe(10000);
    expect(m.clouds.map((c) => c.cover)).toEqual(['FEW', 'BKN']);
    expect(m.tempC).toBe(23);
    expect(m.dewpC).toBe(7);
    expect(m.qnhHpa).toBe(1013);
  });

  it('parses CAVOK', () => {
    const m = parse('LFPG 281200Z 27010KT CAVOK 24/10 Q1015 NOSIG');
    expect(m.cavok).toBe(true);
    expect(m.visibilityM).toBe(10000);
    expect(m.clouds).toEqual([]);
    expect(m.tempC).toBe(24);
  });

  it('parses calm wind', () => {
    const m = parse('KXYZ 281200Z 00000KT 10SM CLR 18/05 A3002');
    expect(m.wind.calm).toBe(true);
    expect(m.wind.speedKt).toBe(0);
    expect(m.wind.dirDeg).toBe(0);
    expect(m.clouds[0].cover).toBe('CLR');
  });

  it('parses VRB wind, snow and metre visibility', () => {
    const m = parse('ENGM 281200Z VRB02KT 9999 -SN OVC008 M01/M03 Q1001');
    expect(m.wind.variable).toBe(true);
    expect(m.wind.dirDeg).toBeNull();
    expect(m.wind.speedKt).toBe(2);
    expect(m.tempC).toBe(-1);
    expect(m.dewpC).toBe(-3);
    expect(m.clouds[0]).toMatchObject({ cover: 'OVC', baseFt: 800 });
    expect(hasSnow(m)).toBe(true);
    expect(hasPrecip(m)).toBe(true);
  });

  it('converts wind reported in MPS to knots', () => {
    const m = parse('UUEE 281200Z 18004MPS 9999 BKN020 12/08 Q1009');
    expect(m.wind.speedKt).toBeCloseTo(7.8, 1); // 4 m/s
  });

  it('parses fractional statute-mile visibility', () => {
    const m = parse('KSFO 281256Z 09006KT 1/2SM FG OVC002 14/13 A3001');
    expect(m.visibilityM).toBe(Math.round(0.5 * 1609.344)); // 805 m
    expect(hasFog(m)).toBe(true);
  });
});

describe('parseMetar — phenomenon predicates', () => {
  it('detects freezing fog', () => {
    const m = parse('BIKF 281200Z 03015G25KT 0300 FZFG M02/M03 Q0995');
    expect(hasFreezingFog(m)).toBe(true);
    expect(m.visibilityM).toBe(300);
    expect(m.wind.gustKt).toBe(25);
    expect(m.tempC).toBe(-2);
  });

  it('detects freezing drizzle as freezing precip', () => {
    const m = parse('CYYZ 281200Z 09010KT 2000 -FZDZ OVC004 M01/M02 Q1000');
    expect(hasFreezingPrecip(m)).toBe(true);
  });

  it('detects mist (BR)', () => {
    const m = parse('EHAM 281200Z 21008KT 6000 BR SCT003 09/08 Q1011');
    expect(hasMist(m)).toBe(true);
    expect(m.visibilityM).toBe(6000);
  });
});

describe('parseMetar — robustness', () => {
  it('never throws on garbage and preserves raw', () => {
    const raw = 'NOT A VALID METAR ¯\\_(ツ)_/¯';
    const m = parseMetar(raw, { now: NOW });
    expect(m.raw).toBe(raw);
  });

  it('uses NOAA-style hints for station metadata', () => {
    const m = parseMetar('KMCI 281253Z 19017KT 10SM 26/22 A2971', {
      now: NOW,
      station: { lat: 39.3, lon: -94.73 },
      stationName: 'Kansas City Intl',
      elevationM: 308,
    });
    expect(m.station).toEqual({ lat: 39.3, lon: -94.73 });
    expect(m.stationName).toBe('Kansas City Intl');
  });
});
