import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { StationCard } from '../StationCard';
import { assembleBrief, type StationRef } from '../../../domain/brief';
import { parseMetar } from '../../../domain/metar';
import type { LocationTime } from '../../../domain/types';

const NOW = new Date('2026-06-28T13:00:00Z'); // 13:00 UTC (fetch time)
const near: StationRef = { icao: 'EGLL', coord: { lat: 51.48, lon: -0.46 }, distanceKm: 6, bearingDeg: 270 };
const CHICAGO: LocationTime = { utcOffsetSeconds: -5 * 3600, timezone: 'America/Chicago', source: 'open-meteo' };
const DEVICE: LocationTime = { utcOffsetSeconds: 0, timezone: null, source: 'device-fallback' };

// METAR observed 28 12:50Z.
const brief = (locationTime?: LocationTime) =>
  assembleBrief({
    coord: { lat: 51.5, lon: -0.1 },
    source: 'metar',
    metar: parseMetar('EGLL 281250Z 27006KT CAVOK 20/07 Q1013', { now: NOW }),
    modelLevels: [],
    station: near,
    locationTime,
    now: NOW,
  });

describe('StationCard', () => {
  it('shows observed + fetch times in the location zone and names it (no "LT")', () => {
    render(<StationCard brief={brief(CHICAGO)} now={NOW} />);
    const txt = document.body.textContent ?? '';
    expect(txt).toContain('07:50'); // observed 12:50Z → Chicago (−5 h)
    expect(txt).toContain('fetched 08:00'); // fetched 13:00Z → 08:00
    expect(txt).toContain('times America/Chicago');
    expect(txt).not.toContain(' LT');
  });

  it('falls back to device-local time, labelled as such', () => {
    render(<StationCard brief={brief(DEVICE)} now={NOW} />);
    expect(document.body.textContent).toContain('times device local time');
  });
});
