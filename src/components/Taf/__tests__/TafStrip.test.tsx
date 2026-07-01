import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TafStrip } from '../TafStrip';
import { parseTaf, summarizeTaf } from '../../../domain/taf';
import type { LocationTime } from '../../../domain/types';

const REF = new Date('2026-07-01T08:00:00Z');
const UTC: LocationTime = { utcOffsetSeconds: 0, timezone: 'UTC', source: 'open-meteo' };
const s = (raw: string, nowISO: string) => summarizeTaf(parseTaf(raw, { reference: REF }), new Date(nowISO));

describe('TafStrip', () => {
  it('renders a benign one-liner when there are no hazards', () => {
    render(
      <TafStrip
        summary={s('TAF EGLL 010500Z 0106/0212 22010KT 9999 SCT035', '2026-07-01T09:00:00Z')}
        windUnit="kt"
        altUnit="ft"
        locationTime={UTC}
      />,
    );
    expect(screen.getByText(/TAF EGLL · airport forecast · times UTC: no significant change/)).toBeInTheDocument();
  });

  it('renders one line per hazard type (all shown, no "+N more", no "possible at times") + worst window', () => {
    const raw =
      'TAF EYVI 011000Z 0112/0212 22010KT 9999 SCT030 TEMPO 0112/0121 TSRA BKN020CB TEMPO 0120/0203 0800 BKN002 TEMPO 0112/0203 3000 BR';
    render(<TafStrip summary={s(raw, '2026-07-01T19:00:00Z')} windUnit="kt" altUnit="ft" locationTime={UTC} />);
    const txt = document.body.textContent ?? '';
    expect(txt).toMatch(/Thunderstorms —/);
    expect(txt).toMatch(/Low cloud —/);
    expect(txt).toMatch(/Visibility —/);
    expect(txt).toMatch(/⚠ Worst ~/);
    expect(txt).not.toMatch(/\+\d+ more/); // never a bare "+N more"
    expect(txt).not.toMatch(/possible at times/); // qualifier not repeated per item
  });

  it('renders nothing when no TAF is available', () => {
    const { container } = render(
      <TafStrip
        summary={{ available: false, severity: 'GOOD', hazards: [], worstWindow: null, hazardSpan: null, partial: false, icao: '', horizonH: 6 }}
        windUnit="kt"
        altUnit="ft"
        locationTime={UTC}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
