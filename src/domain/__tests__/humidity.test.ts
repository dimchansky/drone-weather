import { describe, it, expect } from 'vitest';
import { dewPointFromRH, rhFromDewPoint, dewPointSpread } from '../humidity';

describe('rhFromDewPoint', () => {
  it('is 100% at saturation (T == Td)', () => {
    expect(rhFromDewPoint(20, 20)).toBeCloseTo(100, 6);
    expect(rhFromDewPoint(-5, -5)).toBeCloseTo(100, 6);
  });

  it('matches a known case (23/07 ≈ 35.7%)', () => {
    expect(rhFromDewPoint(23, 7)).toBeCloseTo(35.7, 1);
  });

  it('is lower for a larger spread', () => {
    expect(rhFromDewPoint(23, 7)).toBeLessThan(rhFromDewPoint(23, 18));
  });
});

describe('dewPointFromRH', () => {
  it('equals temperature at 100% RH', () => {
    expect(dewPointFromRH(20, 100)).toBeCloseTo(20, 2);
  });

  it('round-trips with rhFromDewPoint', () => {
    const rh = rhFromDewPoint(23, 7);
    expect(dewPointFromRH(23, rh)).toBeCloseTo(7, 4);
  });
});

describe('dewPointSpread', () => {
  it('is T − Td', () => {
    expect(dewPointSpread(23, 7)).toBe(16);
    expect(dewPointSpread(-2, -3)).toBe(1);
  });
});
