import { describe, it, expect } from 'vitest';
import { tafStripText, tafBannerNote } from '../tafText';
import type { TafHazard, TafSummary } from '../../../domain/taf';

const hz = (h: Partial<TafHazard> & { kind: TafHazard['kind'] }): TafHazard => ({
  changeType: 'TEMPO',
  from: null,
  to: null,
  ...h,
});
const summary = (hazards: TafHazard[], over: Partial<TafSummary> = {}): TafSummary => ({
  available: true,
  severity: hazards.length ? 'CAUTION' : 'GOOD',
  hazards,
  partial: false,
  icao: 'EDDB',
  horizonH: 6,
  ...over,
});

describe('tafStripText', () => {
  it('says no significant change when there are no hazards', () => {
    expect(tafStripText(summary([]), 'kt', 'ft')).toBe(
      'TAF EDDB · airport forecast: no significant change next 6 h',
    );
  });

  it('formats hazards with change prefix, unit-aware values, and UTC windows', () => {
    const s = summary([
      hz({ kind: 'rain', changeType: 'TEMPO', from: new Date('2026-07-01T08:00:00Z'), to: new Date('2026-07-01T12:00:00Z') }),
      hz({ kind: 'gusts', changeType: 'FM', from: new Date('2026-07-01T14:00:00Z'), to: null, gustKt: 25 }),
    ]);
    const txt = tafStripText(s, 'kt', 'ft');
    expect(txt).toMatch(/TEMPO rain 08–12Z/);
    expect(txt).toMatch(/gusts to 25 kt from 14Z/);
  });

  it('renders gusts in the chosen wind unit', () => {
    const s = summary([hz({ kind: 'gusts', changeType: 'FM', from: new Date('2026-07-01T14:00:00Z'), gustKt: 25 })]);
    expect(tafStripText(s, 'ms', 'ft')).toMatch(/gusts to 12\.9 m\/s/);
  });

  it('flags a partial parse', () => {
    expect(tafStripText(summary([], { partial: true }), 'kt', 'ft')).toMatch(/parsed partially — check raw/);
  });
});

describe('tafBannerNote', () => {
  it('is null without a thunderstorm', () => {
    expect(tafBannerNote(summary([hz({ kind: 'rain' })]))).toBeNull();
  });

  it('warns about a probable thunderstorm with its window', () => {
    const s = summary([
      hz({ kind: 'thunderstorm', changeType: 'PROB', probPct: 30, from: new Date('2026-07-01T18:00:00Z'), to: new Date('2026-07-01T22:00:00Z') }),
    ]);
    expect(tafBannerNote(s)).toBe('TAF: PROB30 possible thunderstorms 18–22Z');
  });
});
