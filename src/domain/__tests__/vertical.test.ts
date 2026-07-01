import { describe, it, expect } from 'vitest';
import { opsBandHazard } from '../vertical';
import type { IcingLevel } from '../icing';
import type { Severity } from '../types';

const lvls = (rows: [number, Severity][]): IcingLevel[] =>
  rows.map(([altM, severity]) => ({ altM, tempC: 5, severity }));

describe('opsBandHazard', () => {
  it('is low with the cloud base above the ops ceiling', () => {
    const r = opsBandHazard(lvls([[0, 'GOOD'], [120, 'GOOD'], [500, 'CAUTION']]), 1500, 120);
    expect(r.severity).toBe('GOOD');
    expect(r.text).toMatch(/Ops band 0–120 m: low vertical hazard/);
    expect(r.text).toMatch(/above ops ceiling/);
  });

  it('ignores hazards above the ops band', () => {
    const r = opsBandHazard(lvls([[0, 'GOOD'], [120, 'GOOD'], [500, 'HIGH']]), null, 120);
    expect(r.severity).toBe('GOOD');
    expect(r.text).not.toMatch(/cloud base/); // no base info given
  });

  it('flags icing within the ops band using icing vocabulary', () => {
    const r = opsBandHazard(lvls([[0, 'GOOD'], [60, 'CAUTION'], [120, 'GOOD']]), null, 120);
    expect(r.severity).toBe('CAUTION');
    expect(r.text).toMatch(/moderate icing risk/);
  });

  it('flags a cloud base within the ops band as immersion (HIGH)', () => {
    const r = opsBandHazard(lvls([[0, 'GOOD'], [120, 'GOOD']]), 90, 120);
    expect(r.severity).toBe('HIGH');
    expect(r.text).toMatch(/within the band/);
  });

  it('formats the band in the chosen altitude unit', () => {
    expect(opsBandHazard(lvls([[0, 'GOOD']]), null, 120, 'ft').text).toMatch(/Ops band 0–394 ft/);
  });
});
