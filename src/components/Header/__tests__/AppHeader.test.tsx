import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AppHeader, stationDisplayName } from '../AppHeader';
import { assembleBrief, type StationRef } from '../../../domain/brief';
import { parseMetar } from '../../../domain/metar';
import type { LocationTime } from '../../../domain/types';

const NOW = new Date('2026-06-28T13:00:00Z');
const VILNIUS_TZ: LocationTime = { utcOffsetSeconds: 3 * 3600, timezone: 'Europe/Vilnius', source: 'open-meteo' };
const station: StationRef = {
  icao: 'EYVI',
  name: 'Vilnius Intl, VL, LT',
  coord: { lat: 54.6369, lon: 25.2858 },
  distanceKm: 5,
  bearingDeg: 90,
};

describe('stationDisplayName', () => {
  it('keeps only the airport name before region/country suffixes', () => {
    expect(stationDisplayName('Vilnius Intl, VL, LT')).toBe('Vilnius Intl');
    expect(stationDisplayName('Vilnius Intl Arpt, LT')).toBe('Vilnius Intl Arpt');
    expect(stationDisplayName('Heathrow')).toBe('Heathrow');
  });
});

describe('AppHeader', () => {
  it('shows station · distance · updated (fetch time in location tz) for a METAR brief', () => {
    const brief = assembleBrief({
      coord: { lat: 54.63, lon: 25.28 },
      source: 'metar',
      metar: parseMetar('EYVI 281250Z 27006KT CAVOK 20/07 Q1013', { now: NOW }),
      modelLevels: [],
      station,
      locationTime: VILNIUS_TZ,
      now: NOW,
    });
    render(<AppHeader brief={brief} />);
    const txt = document.body.textContent ?? '';
    expect(txt).toMatch(/Drone\sWeather/); // title uses a non-breaking space
    expect(txt).toContain('EYVI Vilnius Intl');
    expect(txt).not.toContain(', VL');
    expect(txt).toContain('5 km');
    expect(txt).toContain('Updated 16:00'); // 13:00 UTC + 3 h
  });

  it('labels a model-only brief as a model forecast', () => {
    const brief = assembleBrief({
      coord: { lat: 54.63, lon: 25.28 },
      source: 'model',
      metar: parseMetar('MODEL 281250Z 18006KT 9999 18/14 Q1015', { now: NOW }),
      modelLevels: [],
      now: NOW,
    });
    render(<AppHeader brief={brief} />);
    const txt = document.body.textContent ?? '';
    expect(txt).toContain('Model forecast');
    expect(txt).toContain('no nearby METAR');
  });

  it('falls back to the tagline when no brief is loaded', () => {
    render(<AppHeader brief={null} />);
    expect(document.body.textContent).toContain('Pre-flight weather decision support');
  });
});
