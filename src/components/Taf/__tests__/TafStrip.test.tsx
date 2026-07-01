import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TafStrip } from '../TafStrip';
import { parseTaf, summarizeTaf } from '../../../domain/taf';
import type { LocationTime } from '../../../domain/types';

const REF = new Date('2026-07-01T08:00:00Z');
const UTC: LocationTime = { utcOffsetSeconds: 0, timezone: 'UTC', source: 'open-meteo' };
const s = (raw: string, nowISO: string) => summarizeTaf(parseTaf(raw, { reference: REF }), new Date(nowISO));

describe('TafStrip', () => {
  it('renders the airport-forecast summary', () => {
    render(
      <TafStrip
        summary={s('TAF EGLL 010500Z 0106/0212 22010KT 9999 SCT035', '2026-07-01T09:00:00Z')}
        windUnit="kt"
        altUnit="ft"
        locationTime={UTC}
      />,
    );
    expect(screen.getByText(/TAF EGLL · airport forecast: no significant change/)).toBeInTheDocument();
  });

  it('renders nothing when no TAF is available', () => {
    const { container } = render(
      <TafStrip
        summary={{ available: false, severity: 'GOOD', hazards: [], partial: false, icao: '', horizonH: 6 }}
        windUnit="kt"
        altUnit="ft"
        locationTime={UTC}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
