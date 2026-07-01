import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TafDetailsCard } from '../TafDetailsCard';
import { parseTaf } from '../../../domain/taf';
import type { LocationTime } from '../../../domain/types';

const REF = new Date('2026-07-01T08:00:00Z');
const UTC: LocationTime = { utcOffsetSeconds: 0, timezone: 'UTC', source: 'open-meteo' };
const PLUS7: LocationTime = { utcOffsetSeconds: 7 * 3600, timezone: 'Asia/Ho_Chi_Minh', source: 'open-meteo' };
const parse = (raw: string) => parseTaf(raw, { reference: REF });

describe('TafDetailsCard', () => {
  it('renders nothing when there is no TAF', () => {
    const { container } = render(<TafDetailsCard taf={null} windUnit="kt" altUnit="ft" locationTime={UTC} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders each period with a human type, local/UTC window, and decoded conditions', () => {
    const taf = parse('TAF EDDB 010800Z 0108/0212 24008KT 9999 SCT035 FM011400 27015G25KT 9999 BKN030 TEMPO 0110/0114 28015G30KT 3000 TSRA BKN013CB');
    render(<TafDetailsCard taf={taf} windUnit="kt" altUnit="ft" locationTime={PLUS7} />);
    const txt = document.body.textContent ?? '';
    expect(txt).toContain('Initial forecast');
    expect(txt).toContain('From');
    expect(txt).toContain('Temporary — possible at times');
    expect(txt).toContain('17:00–21:00 (10:00–14:00 UTC)'); // TEMPO 10–14Z → +7
    expect(txt).toContain('thunderstorm with rain');
    expect(txt).toContain('gusts to 30 kt');
    expect(txt).toContain('broken 1300 ft CB');
    expect(txt).toContain('airport forecast');
  });

  it('shows the raw group text for a period (accessible verbatim)', () => {
    const taf = parse('TAF EDDB 010800Z 0108/0212 24008KT 9999 SCT035 TEMPO 0110/0114 3000 TSRA');
    render(<TafDetailsCard taf={taf} windUnit="kt" altUnit="ft" locationTime={UTC} />);
    expect(screen.getByText('TEMPO 0110/0114 3000 TSRA')).toBeInTheDocument();
  });

  it('reacts to unit selection (m/s + metres)', () => {
    const taf = parse('TAF EDDB 010800Z 0108/0212 24008KT 9999 SCT035 TEMPO 0110/0114 28015G30KT BKN013CB');
    render(<TafDetailsCard taf={taf} windUnit="ms" altUnit="m" locationTime={UTC} />);
    const txt = document.body.textContent ?? '';
    expect(txt).toContain('gusts to 15.4 m/s');
    expect(txt).toContain('broken 396 m');
  });

  it('shows a partial-parse note (not an error) when the parser recorded warnings', () => {
    const taf = parse('TAF EDDB 010800Z 0108/0212 24008KT 9999 SCT035 WS020/24045KT');
    expect(taf.warnings.length).toBeGreaterThan(0);
    render(<TafDetailsCard taf={taf} windUnit="kt" altUnit="ft" locationTime={UTC} />);
    expect(screen.getByText(/parsed partially/i)).toBeInTheDocument();
  });
});
