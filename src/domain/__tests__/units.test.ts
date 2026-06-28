import { describe, it, expect } from 'vitest';
import {
  ktToMs,
  ktToKmh,
  msToKt,
  kmhToKt,
  ftToM,
  mToFt,
  hpaToInhg,
  inhgToHpa,
  round,
} from '../units';

describe('speed conversions', () => {
  it('converts knots to m/s and km/h', () => {
    expect(ktToMs(10)).toBeCloseTo(5.14444, 4);
    expect(ktToKmh(10)).toBeCloseTo(18.52, 4);
  });

  it('round-trips through m/s and km/h', () => {
    expect(msToKt(ktToMs(17))).toBeCloseTo(17, 6);
    expect(kmhToKt(ktToKmh(17))).toBeCloseTo(17, 6);
  });
});

describe('length conversions', () => {
  it('converts feet to metres (2000 ft ≈ 610 m)', () => {
    expect(ftToM(2000)).toBeCloseTo(609.6, 1);
    expect(round(ftToM(8000))).toBe(2438);
  });

  it('round-trips ft↔m', () => {
    expect(mToFt(ftToM(3500))).toBeCloseTo(3500, 6);
  });
});

describe('pressure conversions', () => {
  it('round-trips hPa↔inHg (1013 hPa ≈ 29.92 inHg)', () => {
    expect(hpaToInhg(1013)).toBeCloseTo(29.92, 1);
    expect(inhgToHpa(hpaToInhg(1013))).toBeCloseTo(1013, 6);
  });
});

describe('round', () => {
  it('rounds to decimals and normalizes -0', () => {
    expect(round(22.675, 1)).toBe(22.7);
    expect(round(-0.0001)).toBe(0);
    expect(round(21.05, 1)).toBe(21.1);
  });
});
