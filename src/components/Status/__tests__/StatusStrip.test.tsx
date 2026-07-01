import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { StatusStrip } from '../StatusStrip';
import { assembleBrief, type StationRef } from '../../../domain/brief';
import { parseMetar } from '../../../domain/metar';
import type { LocationTime } from '../../../domain/types';

const NOW = new Date('2026-06-28T13:00:00Z'); // 13:00 UTC
const near: StationRef = { icao: 'EGLL', coord: { lat: 51.48, lon: -0.46 }, distanceKm: 6, bearingDeg: 270 };
const CHICAGO: LocationTime = { utcOffsetSeconds: -5 * 3600, timezone: 'America/Chicago', source: 'open-meteo' };
const DEVICE: LocationTime = { utcOffsetSeconds: 0, timezone: null, source: 'device-fallback' };

const metarBrief = (raw: string, locationTime?: LocationTime) =>
  assembleBrief({
    coord: { lat: 51.5, lon: -0.1 },
    source: 'metar',
    metar: parseMetar(raw, { now: NOW }),
    modelLevels: [],
    station: near,
    locationTime,
    now: NOW,
  });

describe('StatusStrip', () => {
  it('shows station, distance, age, fetch time and QNH for a METAR brief', () => {
    render(<StatusStrip brief={metarBrief('EGLL 281250Z 27006KT CAVOK 20/07 Q1013')} now={NOW} />);
    const txt = document.body.textContent ?? '';
    expect(txt).toContain('EGLL');
    expect(txt).toContain('6 km');
    expect(txt).toMatch(/METAR \d+ min old/);
    expect(txt).toContain('QNH 1013 hPa');
    expect(txt).toMatch(/inHg/);
  });

  it('omits QNH when the METAR carries no altimeter setting', () => {
    render(<StatusStrip brief={metarBrief('EGLL 281250Z 27006KT CAVOK 20/07')} now={NOW} />);
    expect(document.body.textContent).not.toContain('QNH');
  });

  it('never shows QNH for a model-only brief and labels it "Model only"', () => {
    // The synthetic METAR even carries Q1015 — the model branch must still not surface it as QNH.
    const b = assembleBrief({
      coord: { lat: 55.6, lon: 26.43 },
      source: 'model',
      metar: parseMetar('MODEL 281100Z 04004KT 9999 18/14 Q1015', { now: NOW }),
      modelLevels: [],
      now: NOW,
    });
    render(<StatusStrip brief={b} now={NOW} />);
    const txt = document.body.textContent ?? '';
    expect(txt).toContain('Model only');
    expect(txt).toContain('model time');
    expect(txt).not.toContain('QNH');
  });

  it('shows the fetch time in the location timezone and names the zone', () => {
    // fetchedAt = NOW = 13:00 UTC → America/Chicago (−5 h) = 08:00
    render(<StatusStrip brief={metarBrief('EGLL 281250Z 27006KT CAVOK 20/07 Q1013', CHICAGO)} now={NOW} />);
    const txt = document.body.textContent ?? '';
    expect(txt).toContain('fetched 08:00');
    expect(txt).toContain('times America/Chicago');
  });

  it('falls back to device-local time, labelled as such', () => {
    render(<StatusStrip brief={metarBrief('EGLL 281250Z 27006KT CAVOK 20/07 Q1013', DEVICE)} now={NOW} />);
    expect(document.body.textContent).toContain('times device local time');
  });
});
