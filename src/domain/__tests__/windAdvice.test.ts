import { describe, it, expect } from 'vitest';
import { routeAdvice } from '../windAdvice';
import type { Wind } from '../types';

const wind = (partial: Partial<Wind>): Wind => ({
  dirDeg: null,
  variable: false,
  speedKt: 10,
  gustKt: null,
  calm: false,
  ...partial,
});

describe('routeAdvice', () => {
  it('notes calm winds have no route concern', () => {
    expect(routeAdvice(wind({ calm: true, speedKt: 0 }))).toMatch(/calm/i);
  });

  it('notes variable direction (VRB) means drift in all directions', () => {
    expect(routeAdvice(wind({ dirDeg: null, variable: true }))).toMatch(/variable/i);
  });

  it('gives the into-wind outbound + downwind return with both compass points', () => {
    const advice = routeAdvice(wind({ dirDeg: 290 }));
    expect(advice).toMatch(/290° \(WNW\)/); // outbound, into the wind
    expect(advice).toMatch(/110° \(ESE\)/); // return, with the wind (drift)
    expect(advice).toMatch(/fresher battery/);
  });
});
