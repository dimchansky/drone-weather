import { describe, it, expect } from 'vitest';
import { parseCoordinateInput, parseLatitudeInput, parseLongitudeInput } from '../coords';

describe('parseCoordinateInput', () => {
  it.each([
    ['54.66508', 54.66508],
    ['54,66508', 54.66508], // decimal comma (mobile locale)
    [' 54,66508 ', 54.66508], // surrounding spaces
    ['25.21689', 25.21689],
    ['-54.5', -54.5],
    ['−25,5', -25.5], // unicode minus + comma
    ['+12,3', 12.3],
    ['0', 0],
    ['.5', 0.5],
    ['90', 90],
  ])('parses %j -> %j', (input, expected) => {
    expect(parseCoordinateInput(input)).toBeCloseTo(expected, 6);
  });

  it.each([
    [''],
    ['   '],
    ['abc'],
    ['54,66,508'], // two commas
    ['54..665'], // two dots
    ['1,234.56'], // both separators (ambiguous)
    ['54.'], // trailing separator
    ['5.4.3'],
    ['12,'],
  ])('rejects %j', (input) => {
    expect(parseCoordinateInput(input)).toBeNull();
  });
});

describe('parseLatitudeInput', () => {
  it('accepts comma decimals within range', () => {
    expect(parseLatitudeInput('54,66508')).toBeCloseTo(54.66508, 6);
    expect(parseLatitudeInput('-90')).toBe(-90);
    expect(parseLatitudeInput('90')).toBe(90);
  });
  it('rejects out-of-range latitude', () => {
    expect(parseLatitudeInput('91')).toBeNull();
    expect(parseLatitudeInput('-90.0001')).toBeNull();
  });
});

describe('parseLongitudeInput', () => {
  it('accepts comma decimals within range', () => {
    expect(parseLongitudeInput('25,21689')).toBeCloseTo(25.21689, 6);
    expect(parseLongitudeInput('-180')).toBe(-180);
    expect(parseLongitudeInput('180')).toBe(180);
  });
  it('rejects out-of-range longitude', () => {
    expect(parseLongitudeInput('181')).toBeNull();
    expect(parseLongitudeInput('-180.5')).toBeNull();
  });
});

describe('real-world example from the bug report', () => {
  it('accepts 54,66508 / 25,21689', () => {
    expect(parseLatitudeInput('54,66508')).toBeCloseTo(54.66508, 6);
    expect(parseLongitudeInput('25,21689')).toBeCloseTo(25.21689, 6);
  });
});
