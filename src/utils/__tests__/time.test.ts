import { describe, it, expect } from 'vitest';
import { ageMinutes, fmtLocalTime, fmtUtcTime, fmtDuration, fmtTimeInZone, timeSourceLabel } from '../time';
import type { LocationTime } from '../../domain/types';

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

describe('fmtDuration', () => {
  it('formats hours+minutes, dropping the hours when under an hour', () => {
    expect(fmtDuration(380)).toBe('6h 20m');
    expect(fmtDuration(45)).toBe('45m');
    expect(fmtDuration(60)).toBe('1h 0m');
    expect(fmtDuration(-5)).toBe('0m');
  });
});

describe('fmtTimeInZone', () => {
  const lt = (utcOffsetSeconds: number): LocationTime => ({ utcOffsetSeconds, timezone: null, source: 'open-meteo' });
  const at = new Date('2026-07-01T08:00:00Z');

  it('applies a positive offset (UTC+7)', () => {
    expect(fmtTimeInZone(at, lt(7 * 3600))).toBe('15:00');
  });

  it('applies a negative offset (UTC−7)', () => {
    expect(fmtTimeInZone(at, lt(-7 * 3600))).toBe('01:00');
  });

  it('wraps across midnight', () => {
    expect(fmtTimeInZone(new Date('2026-07-01T23:00:00Z'), lt(2 * 3600))).toBe('01:00'); // next day 01:00
    expect(fmtTimeInZone(new Date('2026-07-01T01:00:00Z'), lt(-3 * 3600))).toBe('22:00'); // prev day 22:00
  });
});

describe('timeSourceLabel', () => {
  it('names the IANA zone, falls back to "location time", or "device local time"', () => {
    expect(timeSourceLabel({ utcOffsetSeconds: 7200, timezone: 'Europe/Vilnius', source: 'open-meteo' })).toBe('Europe/Vilnius');
    expect(timeSourceLabel({ utcOffsetSeconds: 7200, timezone: null, source: 'open-meteo' })).toBe('location time');
    expect(timeSourceLabel({ utcOffsetSeconds: 0, timezone: null, source: 'device-fallback' })).toBe('device local time');
  });
});
