import { describe, it, expect } from 'vitest';
import { precipNow } from '../precip';
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
  cloudCoverPct: 40,
  cloudCoverLowPct: 10,
  ...p,
});

describe('precipNow', () => {
  it('reports observed METAR rain with a METAR source', () => {
    const r = precipNow(m('EGLL 281200Z 24010KT 6000 -RA BKN015 12/11 Q1008'), null);
    expect(r).toMatchObject({ raining: true, source: 'metar' });
    expect(r.text).toMatch(/METAR:.*rain.*now/i);
  });

  it('reports an observed thunderstorm', () => {
    const r = precipNow(m('KMCI 281200Z 18010KT 9999 TSRA 25/20 Q1010'), null);
    expect(r.source).toBe('metar');
    expect(r.text).toMatch(/thunderstorm/i);
  });

  it('labels model rain amount as Model (not observed) when the METAR is dry', () => {
    const r = precipNow(m('LFPG 281200Z 27006KT CAVOK 18/06 Q1015'), model({ precipMm: 0.5 }));
    expect(r).toMatchObject({ raining: true, source: 'model' });
    expect(r.text).toMatch(/^Model:/);
  });

  it('reports a model probability without implying observed rain', () => {
    const r = precipNow(m('LFPG 281200Z 27006KT CAVOK 18/06 Q1015'), model({ precipProb: 70 }));
    expect(r).toMatchObject({ raining: false, source: 'model' });
    expect(r.text).toMatch(/Model: 70% precip chance/);
  });

  it('reports no precipitation for dry conditions', () => {
    const r = precipNow(m('LFPG 281200Z 27006KT CAVOK 18/06 Q1015'), model({}));
    expect(r).toMatchObject({ raining: false, source: 'none' });
    expect(r.text).toMatch(/no precipitation/i);
  });
});
