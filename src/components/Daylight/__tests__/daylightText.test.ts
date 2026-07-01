import { describe, it, expect } from 'vitest';
import { daylight } from '../../../domain/sun';
import { daylightStripText, daylightBannerLine } from '../daylightText';

const eq = { lat: 0, lon: 0 };
const DAY = new Date('2026-03-20T12:07:00Z'); // equator, ~solar noon → day
const NIGHT = new Date('2026-03-20T00:00:00Z'); // equator, ~midnight → night

describe('daylight text', () => {
  const dayDl = daylight(DAY, eq);
  const nightDl = daylight(NIGHT, eq);

  it('strip (day) shows sunrise/sunset, daylight left, and the device-local note', () => {
    const s = daylightStripText(dayDl);
    expect(s).toMatch(/Sunrise/);
    expect(s).toMatch(/sunset/);
    expect(s).toMatch(/daylight left/);
    expect(s).toMatch(/device-local/);
  });

  it('strip (night) flags little usable light and to check daylight rules', () => {
    const s = daylightStripText(nightDl);
    expect(s).toMatch(/Night/);
    expect(s).toMatch(/check daylight rules/);
    expect(s).toMatch(/device-local/);
  });

  it('banner (day) is "Daylight OK" with sunset countdown', () => {
    expect(daylightBannerLine(dayDl, DAY)).toMatch(/Daylight OK · sunset in/);
  });

  it('banner (night) warns about low light and gives the next sunrise', () => {
    const line = daylightBannerLine(nightDl, NIGHT);
    expect(line).toMatch(/Low light/);
    expect(line).toMatch(/next sunrise/);
  });
});
