import { describe, it, expect } from 'vitest';
import { ageMinutes, fmtLocalTime, fmtUtcTime } from '../time';

describe('ageMinutes', () => {
  const observed = new Date('2026-06-28T12:50:00Z');
  it('computes whole minutes between observation and now', () => {
    expect(ageMinutes(observed, new Date('2026-06-28T13:14:00Z'))).toBe(24);
    expect(ageMinutes(observed, new Date('2026-06-28T13:50:00Z'))).toBe(60);
  });
  it('clamps to 0 when now is before the observation', () => {
    expect(ageMinutes(observed, new Date('2026-06-28T12:40:00Z'))).toBe(0);
  });
  it('updates as now advances (dynamic age)', () => {
    expect(ageMinutes(observed, new Date('2026-06-28T13:14:00Z'))).toBe(24);
    expect(ageMinutes(observed, new Date('2026-06-28T13:15:00Z'))).toBe(25);
  });
});

describe('fmtUtcTime', () => {
  it('formats UTC as HH:MMZ with zero padding', () => {
    expect(fmtUtcTime(new Date('2026-06-28T12:50:00Z'))).toBe('12:50Z');
    expect(fmtUtcTime(new Date('2026-06-28T09:05:00Z'))).toBe('09:05Z');
  });
});

describe('fmtLocalTime', () => {
  it('produces a zero-padded HH:MM string (zone-dependent value)', () => {
    expect(fmtLocalTime(new Date('2026-06-28T12:50:00Z'))).toMatch(/^\d{2}:\d{2}$/);
  });
});
