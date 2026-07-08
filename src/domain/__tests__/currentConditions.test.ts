import { describe, it, expect } from 'vitest';
import { currentConditions, modelConditionIcon } from '../currentConditions';
import { parseMetar } from '../metar';
import type { ModelConditions } from '../types';

const NOW = new Date('2026-06-28T13:00:00Z');
const m = (raw: string) => parseMetar(raw, { now: NOW });
const model = (p: Partial<ModelConditions>): ModelConditions => ({
  tempC2m: 15,
  dewp2m: 10,
  rh2m: 70,
  windKt: 5,
  precipMm: 0,
  precipProb: 0,
  cloudCoverPct: null,
  cloudCoverLowPct: null,
  ...p,
});
const day = (raw: string, mc: ModelConditions | null = null) =>
  currentConditions(m(raw), mc, 'day', 'metar');
const night = (raw: string, mc: ModelConditions | null = null) =>
  currentConditions(m(raw), mc, 'night', 'metar');

describe('currentConditions — observed METAR weather', () => {
  it('thunderstorm', () => {
    expect(day('KMCI 281200Z 18010KT 9999 TSRA BKN020CB 25/20 Q1010')).toEqual({
      icon: 'thunder', label: 'Thunderstorm', source: 'metar',
    });
  });

  it('TS intensity qualifies the precipitation, never the storm itself', () => {
    expect(day('KMCI 281200Z 18010KT 4000 +TSRA BKN020CB 25/20 Q1010')).toEqual({
      icon: 'thunder', label: 'Thunderstorm, heavy rain', source: 'metar',
    });
    expect(day('KMCI 281200Z 18010KT 6000 -TSRA BKN025CB 25/20 Q1010').label).toBe(
      'Thunderstorm, light rain',
    );
  });

  it('thunderstorm beats rain and cloud cover', () => {
    const r = day('KMCI 281200Z 18010KT 5000 TSRA OVC008 20/18 Q1005');
    expect(r.icon).toBe('thunder');
    expect(r.label).toBe('Thunderstorm');
  });

  it('CB cloud without a TS weather group reads as storm clouds, not an observed storm', () => {
    const r = day('EYVI 281200Z 18010KT 9999 BKN020CB 20/15 Q1012');
    expect(r).toEqual({ icon: 'thunder', label: 'Storm clouds (CB)', source: 'metar' });
  });

  it('freezing rain', () => {
    expect(day('EYVI 281200Z 18010KT 6000 FZRA OVC010 00/M01 Q1005')).toEqual({
      icon: 'rain', label: 'Freezing rain', source: 'metar',
    });
  });

  it('freezing drizzle', () => {
    expect(day('EYVI 281200Z 18010KT 6000 FZDZ OVC010 00/M01 Q1005').label).toBe(
      'Freezing drizzle',
    );
  });

  it('freezing fog', () => {
    expect(day('EYVI 281200Z 00000KT 0300 FZFG VV001 M02/M02 Q1030')).toEqual({
      icon: 'fog', label: 'Freezing fog', source: 'metar',
    });
  });

  it('light snow', () => {
    expect(day('EYVI 281200Z 36008KT 4000 -SN OVC015 M01/M03 Q1010')).toEqual({
      icon: 'snow', label: 'Light snow', source: 'metar',
    });
  });

  it('heavy snow', () => {
    expect(day('EYVI 281200Z 36008KT 1000 +SN OVC010 M02/M04 Q1008').label).toBe('Heavy snow');
  });

  it('mixed rain and snow', () => {
    expect(day('EYVI 281200Z 36008KT 3000 -RASN OVC012 00/M01 Q1009')).toEqual({
      icon: 'snow', label: 'Rain and snow', source: 'metar',
    });
  });

  it('light rain', () => {
    expect(day('EGLL 281200Z 24010KT 6000 -RA BKN015 12/11 Q1008')).toEqual({
      icon: 'rain', label: 'Light rain', source: 'metar',
    });
  });

  it('drizzle', () => {
    expect(day('EGLL 281200Z 24006KT 5000 DZ OVC008 11/10 Q1009').label).toBe('Drizzle');
  });

  it('rain showers', () => {
    expect(day('EGLL 281200Z 24012KT 8000 SHRA SCT030 15/10 Q1010').label).toBe('Rain showers');
  });

  it('hail', () => {
    expect(day('EGLL 281200Z 24015KT 5000 GR OVC025 14/09 Q1006').label).toBe('Hail');
  });

  it('fog', () => {
    expect(day('EYVI 281200Z 00000KT 0200 FG VV001 10/10 Q1020')).toEqual({
      icon: 'fog', label: 'Fog', source: 'metar',
    });
  });

  it('mist', () => {
    expect(day('EYVI 281200Z 00000KT 3000 BR FEW002 10/10 Q1020').label).toBe('Mist');
  });

  it('fog beats generic cloud cover', () => {
    const r = day('EYVI 281200Z 00000KT 0400 FG BKN002 09/09 Q1021');
    expect(r).toMatchObject({ icon: 'fog', label: 'Fog' });
  });

  it('haze and smoke map to the fog icon', () => {
    expect(day('OMDB 281200Z 27010KT 4000 HZ NSC 38/18 Q0998')).toMatchObject({
      icon: 'fog', label: 'Haze',
    });
    expect(day('UUEE 281200Z 27004KT 3500 FU SKC 22/10 Q1013').label).toBe('Smoke');
  });
});

describe('currentConditions — sky state from METAR clouds', () => {
  it('CAVOK day is clear with a sun', () => {
    expect(day('LFPG 281200Z 27006KT CAVOK 18/06 Q1015')).toEqual({
      icon: 'sun', label: 'Clear', source: 'metar',
    });
  });

  it('CAVOK night is clear with a moon', () => {
    expect(night('LFPG 281200Z 27006KT CAVOK 18/06 Q1015')).toEqual({
      icon: 'moon', label: 'Clear night', source: 'metar',
    });
  });

  it('overcast', () => {
    expect(day('EYVI 281200Z 18008KT 9999 OVC010 15/12 Q1012')).toEqual({
      icon: 'cloud', label: 'Overcast', source: 'metar',
    });
  });

  it('broken is mostly cloudy', () => {
    expect(day('EYVI 281200Z 18008KT 9999 BKN020 15/12 Q1012').label).toBe('Mostly cloudy');
  });

  it('scattered day is partly cloudy with cloud-sun', () => {
    expect(day('EYVI 281200Z 18008KT 9999 SCT030 18/10 Q1014')).toEqual({
      icon: 'cloud-sun', label: 'Partly cloudy', source: 'metar',
    });
  });

  it('scattered night uses cloud-moon', () => {
    expect(night('EYVI 281200Z 18008KT 9999 SCT030 18/10 Q1014').icon).toBe('cloud-moon');
  });

  it('few clouds is mostly clear', () => {
    expect(day('EYVI 281200Z 18008KT 9999 FEW040 20/08 Q1016').label).toBe('Mostly clear');
  });

  it('worst layer wins (FEW below OVC)', () => {
    expect(day('EYVI 281200Z 18008KT 9999 FEW010 OVC030 15/12 Q1012').label).toBe('Overcast');
  });

  it('explicit sky-clear codes are clear', () => {
    expect(day('KJFK 281200Z 24006KT 10SM SKC 22/12 A3005').label).toBe('Clear');
    expect(night('EYVI 281200Z 18004KT 9999 NSC 14/10 Q1015')).toMatchObject({
      icon: 'moon', label: 'Clear night',
    });
  });
});

describe('currentConditions — model fallback', () => {
  const dry = 'EYVI 281200Z 18004KT 9999 15/10 Q1015'; // no weather, no clouds

  it('model rain amount reads "Rain likely", never observed-style "Rain"', () => {
    expect(day(dry, model({ precipMm: 0.5 }))).toEqual({
      icon: 'rain', label: 'Rain likely', source: 'model',
    });
  });

  it('model probability reads "Rain possible"', () => {
    expect(day(dry, model({ precipProb: 70 }))).toEqual({
      icon: 'rain', label: 'Rain possible', source: 'model',
    });
  });

  it('model cloud cover tiers', () => {
    expect(day(dry, model({ cloudCoverPct: 90 }))).toEqual({
      icon: 'cloud', label: 'Overcast', source: 'model',
    });
    expect(day(dry, model({ cloudCoverPct: 60 })).label).toBe('Mostly cloudy');
    expect(day(dry, model({ cloudCoverPct: 30 }))).toMatchObject({
      icon: 'cloud-sun', label: 'Partly cloudy', source: 'model',
    });
    expect(day(dry, model({ cloudCoverPct: 5 }))).toEqual({
      icon: 'sun', label: 'Clear', source: 'model',
    });
  });

  it('observed METAR clouds beat model cloud cover', () => {
    const r = day('EYVI 281200Z 18008KT 9999 OVC010 15/12 Q1012', model({ cloudCoverPct: 5 }));
    expect(r).toMatchObject({ label: 'Overcast', source: 'metar' });
  });

  it('a model-only brief never claims a METAR source, even with weather tokens', () => {
    // Model briefs synthesize a Metar; if it somehow carried weather/cloud tokens they must not
    // surface as observations.
    const synthetic = m('EYVI 281200Z 18010KT 5000 -RA OVC008 15/12 Q1010');
    const r = currentConditions(synthetic, model({ cloudCoverPct: 90 }), 'day', 'model');
    expect(r.source).toBe('model');
    expect(r.label).not.toBe('Light rain');
    const all = [
      currentConditions(synthetic, null, 'day', 'model'),
      currentConditions(synthetic, model({}), 'night', 'model'),
    ];
    for (const c of all) expect(c.source).not.toBe('metar');
  });
});

describe('modelConditionIcon — per-hour timeline icon', () => {
  it('uses the same precip thresholds as the model branch', () => {
    expect(modelConditionIcon(0.5, null, 10, false)).toBe('rain');
    expect(modelConditionIcon(null, 70, 10, false)).toBe('rain');
    expect(modelConditionIcon(0, 30, 10, false)).toBe('sun');
  });

  it('cloud tiers with day/night variants', () => {
    expect(modelConditionIcon(0, 0, 95, false)).toBe('cloud');
    expect(modelConditionIcon(0, 0, 60, true)).toBe('cloud');
    expect(modelConditionIcon(0, 0, 30, false)).toBe('cloud-sun');
    expect(modelConditionIcon(0, 0, 30, true)).toBe('cloud-moon');
    expect(modelConditionIcon(0, 0, 5, true)).toBe('moon');
  });

  it('null everything → clear day/night (no fabricated weather)', () => {
    expect(modelConditionIcon(null, null, null, false)).toBe('sun');
    expect(modelConditionIcon(null, null, null, true)).toBe('moon');
  });
});

describe('currentConditions — fallback & night behavior', () => {
  const dry = 'EYVI 281200Z 18004KT 9999 15/10 Q1015';

  it('no data at all', () => {
    expect(day(dry, null)).toEqual({ icon: 'sun', label: 'No data', source: 'none' });
    expect(night(dry, null)).toEqual({ icon: 'moon', label: 'No data', source: 'none' });
  });

  it('twilight phases keep day icons', () => {
    const r = currentConditions(m('LFPG 281200Z 27006KT CAVOK 18/06 Q1015'), null, 'civilTwilight', 'metar');
    expect(r.icon).toBe('sun');
    const g = currentConditions(m('LFPG 281200Z 27006KT CAVOK 18/06 Q1015'), null, 'golden', 'metar');
    expect(g.icon).toBe('sun');
  });
});
