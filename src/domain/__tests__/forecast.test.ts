import { describe, it, expect } from 'vitest';
import { summarizeForecast } from '../forecast';
import type { ForecastHour } from '../types';

const NOW = new Date('2026-06-28T12:00:00Z');
const hour = (
  minsFromNow: number,
  v: { wind?: number; gust?: number; mm?: number; prob?: number },
): ForecastHour => ({
  time: new Date(NOW.getTime() + minsFromNow * 60000),
  windKt: v.wind ?? null,
  gustKt: v.gust ?? null,
  precipMm: v.mm ?? null,
  precipProb: v.prob ?? null,
});

describe('summarizeForecast', () => {
  it('is unavailable for an empty window', () => {
    expect(summarizeForecast(NOW, []).available).toBe(false);
  });

  it('reads steady wind + no rain as GOOD', () => {
    const f = summarizeForecast(NOW, [hour(0, { wind: 8 }), hour(60, { wind: 8 }), hour(120, { wind: 8 }), hour(180, { wind: 8 })]);
    expect(f.available).toBe(true);
    expect(f.windTrend).toBe('steady');
    expect(f.rainOnsetMin).toBeNull();
    expect(f.severity).toBe('GOOD');
    expect(f.horizonH).toBe(3);
  });

  it('flags rising wind (to the HIGH band) as CAUTION', () => {
    const f = summarizeForecast(NOW, [hour(0, { wind: 8 }), hour(60, { wind: 12 }), hour(120, { wind: 18 })]);
    expect(f.windTrend).toBe('rising');
    expect(f.windPeakKt).toBe(18);
    expect(f.severity).toBe('CAUTION');
  });

  it('reads easing wind (all light) as GOOD', () => {
    const f = summarizeForecast(NOW, [hour(0, { wind: 12 }), hour(60, { wind: 8 }), hour(120, { wind: 6 })]);
    expect(f.windTrend).toBe('easing');
    expect(f.severity).toBe('GOOD');
  });

  it('detects rain onset by probability and reports the minutes ahead', () => {
    const f = summarizeForecast(NOW, [
      hour(0, { wind: 6, prob: 10 }),
      hour(60, { wind: 6, prob: 70 }),
      hour(120, { wind: 6, prob: 80 }),
    ]);
    expect(f.rainOnsetMin).toBe(60);
    expect(f.rainProbPeak).toBe(80);
    expect(f.severity).toBe('CAUTION');
  });

  it('detects rain onset by amount', () => {
    const f = summarizeForecast(NOW, [hour(0, { wind: 5, mm: 0 }), hour(60, { wind: 5, mm: 0 }), hour(120, { wind: 5, mm: 0.5 })]);
    expect(f.rainOnsetMin).toBe(120);
    expect(f.rainAmountPeak).toBe(0.5);
  });

  it('flags building gusts as CAUTION', () => {
    const f = summarizeForecast(NOW, [hour(0, { wind: 8, gust: 22 }), hour(60, { wind: 8, gust: 20 })]);
    expect(f.gustRising).toBe(true);
    expect(f.gustPeakKt).toBe(22);
    expect(f.severity).toBe('CAUTION');
  });
});
