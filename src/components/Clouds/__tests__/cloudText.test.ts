import { describe, it, expect } from 'vitest';
import {
  coverLabel,
  skyAmountPhrase,
  layerHeadline,
  coverFraction,
  isCeilingCover,
  layerRawTag,
  convectiveCallout,
  droneRelevanceLine,
} from '../cloudText';
import { makeCloudLayer, type ResolvedCloudBase } from '../../../domain/clouds';

const base = (kind: ResolvedCloudBase['kind'], baseFt: number | null): ResolvedCloudBase => ({
  kind,
  baseFt,
  baseM: baseFt == null ? null : Math.round(baseFt * 0.3048),
  note: '',
});

describe('coverLabel / skyAmountPhrase / layerHeadline', () => {
  it('translates each cover code to a human label (no bare abbreviation)', () => {
    expect(coverLabel('FEW')).toBe('Few clouds');
    expect(coverLabel('SCT')).toBe('Scattered clouds');
    expect(coverLabel('BKN')).toBe('Broken cloud');
    expect(coverLabel('OVC')).toBe('Overcast');
    expect(coverLabel('VV')).toBe('Sky obscured');
    expect(coverLabel('SKC')).toBe('Sky clear');
    expect(coverLabel('NSC')).toBe('No significant cloud');
  });

  it('gives a plain "how much sky" phrase instead of the bare okta figure', () => {
    expect(skyAmountPhrase('FEW')).toBe('a few patches');
    expect(skyAmountPhrase('SCT')).toBe('up to about half the sky');
    expect(skyAmountPhrase('BKN')).toBe('most of the sky');
    expect(skyAmountPhrase('OVC')).toBe('the whole sky');
    expect(skyAmountPhrase('VV')).toBe('');
  });

  it('composes a headline; obscured/clear covers carry no amount clause', () => {
    expect(layerHeadline('SCT')).toBe('Scattered clouds — up to about half the sky');
    expect(layerHeadline('VV')).toBe('Sky obscured');
    expect(layerHeadline('SKC')).toBe('Sky clear');
  });
});

describe('coverFraction / isCeilingCover', () => {
  it('renders eighths for real layers, nothing for VV/clear', () => {
    expect(coverFraction('FEW')).toBe('1–2/8');
    expect(coverFraction('SCT')).toBe('3–4/8');
    expect(coverFraction('BKN')).toBe('5–7/8');
    expect(coverFraction('OVC')).toBe('8/8');
    expect(coverFraction('VV')).toBe('');
    expect(coverFraction('NSC')).toBe('');
  });

  it('marks only BKN/OVC/VV as a ceiling (SCT/FEW are not)', () => {
    expect(isCeilingCover('BKN')).toBe(true);
    expect(isCeilingCover('OVC')).toBe(true);
    expect(isCeilingCover('VV')).toBe(true);
    expect(isCeilingCover('SCT')).toBe(false);
    expect(isCeilingCover('FEW')).toBe(false);
  });
});

describe('layerRawTag', () => {
  it('keeps the raw code + fraction (+ CB/TCU) as a dim secondary label', () => {
    expect(layerRawTag(makeCloudLayer('SCT', 3800))).toBe('SCT · 3–4/8');
    expect(layerRawTag(makeCloudLayer('BKN', 5000, { cb: true }))).toBe('BKN · 5–7/8 · CB');
    expect(layerRawTag(makeCloudLayer('SCT', 1800, { tcu: true }))).toBe('SCT · 3–4/8 · TCU');
    expect(layerRawTag(makeCloudLayer('NSC', null))).toBe('NSC');
  });
});

describe('convectiveCallout', () => {
  it('has no callout for ordinary layers', () => {
    expect(convectiveCallout([makeCloudLayer('SCT', 3800), makeCloudLayer('BKN', 5000)], 'ft')).toEqual([]);
  });

  it('flags CB as a NO-FLY thunderstorm cloud with its height and unit', () => {
    const [c] = convectiveCallout([makeCloudLayer('SCT', 3800, { cb: true })], 'ft');
    expect(c.severity).toBe('NOFLY');
    expect(c.text).toContain('Cumulonimbus (CB)');
    expect(c.text).toContain('thunderstorm cloud');
    expect(c.text).toContain('3800 ft above ground');
    expect(c.text).toContain('no-fly');
    // unit-aware
    expect(convectiveCallout([makeCloudLayer('SCT', 3800, { cb: true })], 'm')[0].text).toContain('1158 m above ground');
  });

  it('flags TCU as a CAUTION building-storm cloud (verdict unchanged)', () => {
    const [c] = convectiveCallout([makeCloudLayer('SCT', 1800, { tcu: true })], 'ft');
    expect(c.severity).toBe('CAUTION');
    expect(c.text).toContain('Towering cumulus (TCU)');
    expect(c.text).toContain('building storm cloud');
    expect(c.text).toContain('caution');
  });

  it('returns both, CB first, when both types are present', () => {
    const cs = convectiveCallout([makeCloudLayer('SCT', 1800, { tcu: true }), makeCloudLayer('BKN', 4000, { cb: true })], 'ft');
    expect(cs.map((c) => c.severity)).toEqual(['NOFLY', 'CAUTION']);
  });

  it('omits the height when the CB layer has no reported base', () => {
    const [c] = convectiveCallout([makeCloudLayer('BKN', null, { cb: true })], 'ft');
    expect(c.text).toContain('thunderstorm cloud.');
    expect(c.text).not.toContain('above ground');
  });
});

describe('droneRelevanceLine', () => {
  it('warns when the base is within the 120 m ops band', () => {
    expect(droneRelevanceLine(base('actual', 300), 120, 'm')).toBe(
      'Cloud base 91 m above ground is within your 120 m operating band — you could be flying into cloud.',
    );
  });

  it('says "only just above" in the margin above the band', () => {
    expect(droneRelevanceLine(base('actual', 800), 120, 'm')).toBe(
      'Cloud base 244 m above ground is only just above your 120 m operating band.',
    );
  });

  it('says "well above" for a high base', () => {
    expect(droneRelevanceLine(base('actual', 3800), 120, 'm')).toBe(
      'Cloud base 1158 m above ground is well above your 120 m operating band.',
    );
  });

  it('hedges model (~) and estimate (≈) bases', () => {
    expect(droneRelevanceLine(base('model', 3800), 120, 'm')).toContain('~1158 m');
    expect(droneRelevanceLine(base('estimate', 3800), 120, 'm')).toContain('≈1158 m');
  });

  it('treats none-low as clear/high, regardless of any rough base', () => {
    expect(droneRelevanceLine(base('none-low', null), 120, 'm')).toBe(
      'Cloud is clear or a high base — nothing near your 120 m operating band.',
    );
    expect(droneRelevanceLine(base('none-low', 5000), 120, 'm')).toContain('Cloud is clear or a high base');
  });

  it('is null when there is no base to talk about', () => {
    expect(droneRelevanceLine(base('none', null), 120, 'm')).toBeNull();
  });

  it('renders the ops band in the chosen unit', () => {
    expect(droneRelevanceLine(base('actual', 3800), 120, 'ft')).toContain('your 394 ft operating band');
  });
});
