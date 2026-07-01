import { describe, it, expect } from 'vitest';
import { hazardGroupLine, worstWindowLine, tafStripHeader, tafBannerNote } from '../tafText';
import type { TafHazard, TafSummary } from '../../../domain/taf';
import type { LocationTime } from '../../../domain/types';

const PLUS7: LocationTime = { utcOffsetSeconds: 7 * 3600, timezone: 'Asia/Ho_Chi_Minh', source: 'open-meteo' };
const hz = (h: Partial<TafHazard> & { kind: TafHazard['kind'] }): TafHazard => ({
  changeType: 'TEMPO',
  tempo: true,
  from: null,
  to: null,
  ...h,
});
const win = (fromZ: string, toZ?: string) => ({ from: new Date(fromZ), to: toZ ? new Date(toZ) : null });
const summary = (hazards: TafHazard[], over: Partial<TafSummary> = {}): TafSummary => ({
  available: true,
  severity: hazards.length ? 'CAUTION' : 'GOOD',
  hazards,
  worstWindow: null,
  hazardSpan: null,
  partial: false,
  icao: 'EYVI',
  horizonH: 6,
  ...over,
});

describe('hazardGroupLine', () => {
  it('renders a scannable "Label — value · window" with no "possible at times"', () => {
    expect(hazardGroupLine(hz({ kind: 'thunderstorm', ...win('2026-07-01T08:00:00Z', '2026-07-01T14:00:00Z') }), 'kt', 'ft', PLUS7))
      .toBe('Thunderstorms — 15:00–21:00');
    expect(hazardGroupLine(hz({ kind: 'lowCeiling', ceilingFt: 200, ...win('2026-07-01T16:00:00Z', '2026-07-01T23:00:00Z') }), 'kt', 'ft', PLUS7))
      .toBe('Low cloud — ceiling 200 ft · 23:00–06:00');
    expect(hazardGroupLine(hz({ kind: 'lowVis', visM: 800, ...win('2026-07-01T08:00:00Z', '2026-07-01T23:00:00Z') }), 'kt', 'ft', PLUS7))
      .toBe('Visibility — down to 0.8 km · 15:00–06:00');
    expect(hazardGroupLine(hz({ kind: 'gusts', gustKt: 30, ...win('2026-07-01T08:00:00Z', '2026-07-01T11:00:00Z') }), 'kt', 'ft', PLUS7))
      .toBe('Gusts — to 30 kt · 15:00–18:00');
  });

  it('shows PROB inline, not "possible at times"', () => {
    const line = hazardGroupLine(hz({ kind: 'thunderstorm', changeType: 'PROB', probPct: 30, ...win('2026-07-01T11:00:00Z', '2026-07-01T15:00:00Z') }), 'kt', 'ft', PLUS7);
    expect(line).toBe('Thunderstorms (30% chance) — 18:00–22:00');
    expect(line).not.toMatch(/possible at times/);
  });

  it('formats gusts in the chosen wind unit', () => {
    expect(hazardGroupLine(hz({ kind: 'gusts', gustKt: 30, ...win('2026-07-01T08:00:00Z', '2026-07-01T11:00:00Z') }), 'ms', 'ft', PLUS7)).toMatch(/to 15\.4 m\/s/);
  });
});

describe('worstWindowLine', () => {
  it('shows the worst overlap window and the whole hazard span', () => {
    const s = summary([hz({ kind: 'thunderstorm' }), hz({ kind: 'lowVis' })], {
      worstWindow: { from: new Date('2026-07-01T20:00:00Z'), to: new Date('2026-07-01T21:00:00Z'), kinds: ['thunderstorm', 'lowVis'] },
      hazardSpan: { from: new Date('2026-07-01T12:00:00Z'), to: new Date('2026-07-02T03:00:00Z'), kinds: ['thunderstorm', 'lowVis'] },
    });
    expect(worstWindowLine(s, PLUS7)).toBe('⚠ Worst ~03:00–04:00 · hazards 19:00–10:00');
  });

  it('is null for a single hazard with no overlap', () => {
    expect(worstWindowLine(summary([hz({ kind: 'thunderstorm' })]), PLUS7)).toBeNull();
  });
});

describe('tafStripHeader', () => {
  it('names the station, airport forecast, and zone', () => {
    expect(tafStripHeader(summary([]), PLUS7)).toBe('TAF EYVI · airport forecast · times Asia/Ho_Chi_Minh');
  });
});

describe('tafBannerNote', () => {
  it('is the single worst serious hazard, one clause, no "at times"', () => {
    const s = summary([hz({ kind: 'thunderstorm', ...win('2026-07-01T08:00:00Z', '2026-07-01T14:00:00Z') })]);
    const note = tafBannerNote(s, PLUS7, 'ft')!;
    expect(note).toBe('TAF: thunderstorms possible 15:00–21:00');
    expect(note).not.toMatch(/at times/);
  });

  it('uses "N% chance of" for PROB and includes the ceiling for low cloud', () => {
    const s1 = summary([hz({ kind: 'thunderstorm', changeType: 'PROB', probPct: 30, ...win('2026-07-01T11:00:00Z', '2026-07-01T15:00:00Z') })]);
    expect(tafBannerNote(s1, PLUS7, 'ft')).toBe('TAF: 30% chance of thunderstorms 18:00–22:00');
    const s2 = summary([hz({ kind: 'lowCeiling', ceilingFt: 200, ...win('2026-07-01T16:00:00Z', '2026-07-01T23:00:00Z') })]);
    expect(tafBannerNote(s2, PLUS7, 'ft')).toBe('TAF: low cloud (ceiling 200 ft) possible 23:00–06:00');
  });

  it('is null when there is no serious hazard (e.g. only gusts)', () => {
    expect(tafBannerNote(summary([hz({ kind: 'gusts', gustKt: 30 })]), PLUS7, 'ft')).toBeNull();
  });
});
