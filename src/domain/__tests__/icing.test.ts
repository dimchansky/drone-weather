import { describe, it, expect } from 'vitest';
import { icingBand } from '../icing';
import { parseMetar } from '../metar';
import { lapseProfile } from '../profile';
import { maxSeverity, severityRank } from '../severity';

const NOW = new Date('2026-06-28T13:00:00Z');
const m = (raw: string) => parseMetar(raw, { now: NOW });

describe('icingBand', () => {
  it('is low for warm dry air (CAVOK, large spread)', () => {
    const metar = m('LFPG 281200Z 27005KT CAVOK 15/02 Q1015');
    const band = icingBand(lapseProfile(metar.tempC!), metar);
    expect(band.worst).toBe('GOOD');
    expect(band.reason).toMatch(/low icing risk/i);
  });

  it('is low for cold but DRY air (key: cold alone is not the risk)', () => {
    const metar = m('CYYZ 281200Z 30010KT CAVOK M06/M20 Q1020');
    const band = icingBand(lapseProfile(metar.tempC!), metar);
    expect(band.worst).toBe('GOOD');
  });

  it('is moderate for cold MOIST air (overcast, small spread)', () => {
    const metar = m('CYYZ 281200Z 30010KT 8000 OVC010 M06/M07 Q1010');
    const band = icingBand(lapseProfile(metar.tempC!), metar);
    expect(band.worst).toBe('CAUTION');
  });

  it('escalates to HIGH when the profile crosses the 0 °C band in moist air', () => {
    // Surface +3 °C with low broken cloud; lapse takes it through -2..+2 °C aloft.
    const metar = m('EGLL 281200Z 24008KT 6000 BKN006 03/02 Q1008');
    const band = icingBand(lapseProfile(metar.tempC!), metar);
    expect(band.worst).toBe('HIGH');
    const highLevel = band.levels.find((l) => l.severity === 'HIGH');
    expect(highLevel).toBeDefined();
  });

  it('is NO-FLY when freezing fog is reported', () => {
    const metar = m('BIKF 281200Z 03010KT 0300 FZFG M02/M03 Q0995');
    const band = icingBand(lapseProfile(metar.tempC!), metar);
    expect(band.worst).toBe('NOFLY');
    expect(band.reason).toMatch(/freezing fog/i);
  });

  it('is NO-FLY for freezing drizzle', () => {
    const metar = m('CYYZ 281200Z 09010KT 2000 -FZDZ OVC004 M01/M02 Q1000');
    const band = icingBand(lapseProfile(metar.tempC!), metar);
    expect(band.worst).toBe('NOFLY');
  });

  it('worst severity never decreases below any single level', () => {
    const metar = m('EGLL 281200Z 24008KT 6000 BKN006 03/02 Q1008');
    const band = icingBand(lapseProfile(metar.tempC!), metar);
    expect(severityRank(band.worst)).toBe(
      severityRank(maxSeverity(band.levels.map((l) => l.severity))),
    );
  });
});
