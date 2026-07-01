import { describe, it, expect } from 'vitest';
import { forecastStripText, forecastBannerNote } from '../forecastText';
import type { ForecastSummary } from '../../../domain/forecast';

const base: ForecastSummary = {
  available: true,
  horizonH: 3,
  windTrend: 'steady',
  windNowKt: 8,
  windPeakKt: 8,
  windLowKt: 8,
  gustPeakKt: null,
  gustRising: false,
  rainOnsetMin: null,
  rainProbPeak: null,
  rainAmountPeak: null,
  severity: 'GOOD',
};

describe('forecastStripText', () => {
  it('reads steady + no rain', () => {
    expect(forecastStripText(base, 'kt')).toBe('Next 3h (model): wind steady · no rain expected');
  });

  it('formats rising wind in the chosen unit and reports rain onset', () => {
    const f: ForecastSummary = { ...base, windTrend: 'rising', windPeakKt: 18, rainOnsetMin: 45, severity: 'CAUTION' };
    const s = forecastStripText(f, 'ms');
    expect(s).toMatch(/wind rising to 9\.3 m\/s/);
    expect(s).toMatch(/rain likely in ~45m/);
  });

  it('notes building gusts', () => {
    const f: ForecastSummary = { ...base, gustPeakKt: 24, gustRising: true, severity: 'CAUTION' };
    expect(forecastStripText(f, 'kt')).toMatch(/gusts to 24 kt/);
  });
});

describe('forecastBannerNote', () => {
  it('is null for a benign forecast', () => {
    expect(forecastBannerNote(base, 'kt')).toBeNull();
  });

  it('warns about imminent rain', () => {
    const f: ForecastSummary = { ...base, rainOnsetMin: 45, severity: 'CAUTION' };
    expect(forecastBannerNote(f, 'kt')).toBe('Model: rain likely in ~45m');
  });

  it('warns about rising wind with a value', () => {
    const f: ForecastSummary = { ...base, windTrend: 'rising', windPeakKt: 18, severity: 'CAUTION' };
    expect(forecastBannerNote(f, 'kt')).toMatch(/wind rising to 18 kt/);
  });
});
