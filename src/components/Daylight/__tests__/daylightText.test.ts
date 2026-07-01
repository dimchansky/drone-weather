import { describe, it, expect } from 'vitest';
import { daylight } from '../../../domain/sun';
import { daylightStripText, daylightBannerLine } from '../daylightText';
import type { LocationTime } from '../../../domain/types';

const eq = { lat: 0, lon: 0 };
const DAY = new Date('2026-03-20T12:07:00Z'); // equator, ~solar noon → day
const NIGHT = new Date('2026-03-20T00:00:00Z'); // equator, ~midnight → night

const UTC: LocationTime = { utcOffsetSeconds: 0, timezone: 'UTC', source: 'open-meteo' };
const VILNIUS: LocationTime = { utcOffsetSeconds: 3 * 3600, timezone: 'Europe/Vilnius', source: 'open-meteo' };
const DEVICE: LocationTime = { utcOffsetSeconds: 0, timezone: null, source: 'device-fallback' };

describe('daylight text', () => {
  const dayDl = daylight(DAY, eq);
  const nightDl = daylight(NIGHT, eq);

  it('strip (day) shows sunrise/sunset, daylight left, and the zone label', () => {
    const s = daylightStripText(dayDl, UTC);
    expect(s).toMatch(/Sunrise \d{2}:\d{2}/);
    expect(s).toMatch(/sunset/);
    expect(s).toMatch(/daylight left/);
    expect(s).toMatch(/times UTC$/);
  });

  it('labels the IANA zone name, or "device local time" on fallback', () => {
    expect(daylightStripText(dayDl, VILNIUS)).toMatch(/times Europe\/Vilnius$/);
    expect(daylightStripText(dayDl, DEVICE)).toMatch(/times device local time$/);
  });

  it('formats sunrise in the location zone (offset applied)', () => {
    // equator equinox sunrise ≈ 06:0x UTC → +3 h in Vilnius zone ≈ 09:0x
    expect(daylightStripText(dayDl, VILNIUS)).toMatch(/Sunrise 09:\d{2}/);
  });

  it('strip (night) flags little usable light and to check daylight rules', () => {
    const s = daylightStripText(nightDl, UTC);
    expect(s).toMatch(/Night/);
    expect(s).toMatch(/check daylight rules/);
    expect(s).toMatch(/times UTC$/);
  });

  it('banner (day) is "Daylight OK" with sunset countdown', () => {
    expect(daylightBannerLine(dayDl, DAY, UTC)).toMatch(/Daylight OK · sunset in/);
  });

  it('banner (night) warns about low light and gives the next sunrise', () => {
    const line = daylightBannerLine(nightDl, NIGHT, UTC);
    expect(line).toMatch(/Low light/);
    expect(line).toMatch(/next sunrise \d{2}:\d{2}/);
  });
});
