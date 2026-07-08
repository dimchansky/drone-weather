import { describe, it, expect } from 'vitest';
import { parseTaf } from '../taf';
import { resolveTafTimeline } from '../tafTimeline';

// Reference anchor: 28 June 2026. TAF day/hour groups resolve against this.
const REF = new Date('2026-06-28T06:00:00Z');
const NOW = new Date('2026-06-28T12:00:00Z');
const taf = (raw: string) => parseTaf(raw, { reference: REF });

describe('resolveTafTimeline — basics', () => {
  it('no TAF → unavailable', () => {
    const r = resolveTafTimeline(null, NOW);
    expect(r.available).toBe(false);
    expect(r.segments).toEqual([]);
  });

  it('benign BASE-only TAF → one clean prevailing segment covering the clipped horizon', () => {
    const r = resolveTafTimeline(taf('EYVI 280500Z 2806/2906 27008KT CAVOK'), NOW);
    expect(r.available).toBe(true);
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0]).toMatchObject({ kind: 'prevailing', hazards: [] });
    expect(r.segments[0].from.toISOString()).toBe('2026-06-28T12:00:00.000Z');
    expect(r.segments[0].to.toISOString()).toBe('2026-06-29T00:00:00.000Z'); // now+12h < validTo
    expect(r.endsBeforeHorizon).toBe(false);
    expect(r.overlays).toEqual([]);
  });

  it('BASE hazards are reported (low ceiling + rain)', () => {
    const r = resolveTafTimeline(taf('EYVI 280500Z 2806/2906 27008KT 4000 -RA BKN008'), NOW);
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0].hazards).toEqual(expect.arrayContaining(['lowCeiling', 'lowVis', 'rain']));
    expect(r.segments[0].ceilingFt).toBe(800);
    expect(r.segments[0].visM).toBe(4000);
    expect(r.segments[0].wxRaw).toEqual(['-RA']);
  });

  it('clips to the TAF validity and flags an early end', () => {
    // Valid only until 18Z; horizon would run to 00Z.
    const r = resolveTafTimeline(taf('EYVI 280500Z 2806/2818 27008KT CAVOK'), NOW);
    expect(r.to.toISOString()).toBe('2026-06-28T18:00:00.000Z');
    expect(r.endsBeforeHorizon).toBe(true);
  });

  it('is unavailable when the validity does not overlap the horizon', () => {
    const r = resolveTafTimeline(taf('EYVI 280500Z 2900/2924 27008KT CAVOK'), NOW);
    expect(r.available).toBe(false);
  });
});

describe('resolveTafTimeline — convective cloud exposure (for UI chips)', () => {
  it('CB layer without a TS group: thunderstorm hazard, tsGroup false, base exposed', () => {
    const r = resolveTafTimeline(taf('EYVI 280500Z 2806/2906 27008KT 9999 BKN015CB'), NOW);
    expect(r.segments[0].hazards).toContain('thunderstorm');
    expect(r.segments[0].tsGroup).toBe(false);
    expect(r.segments[0].cbBaseFt).toBe(1500);
  });

  it('TS weather group sets tsGroup true', () => {
    const r = resolveTafTimeline(taf('EYVI 280500Z 2806/2906 27008KT 5000 TSRA BKN008CB'), NOW);
    expect(r.segments[0].tsGroup).toBe(true);
    expect(r.segments[0].cbBaseFt).toBe(800);
  });

  it('TCU is exposed with its base even though it is not a hazard kind', () => {
    const r = resolveTafTimeline(taf('EYVI 280500Z 2806/2906 27008KT 9999 SCT020TCU'), NOW);
    expect(r.segments[0].hazards).toEqual([]);
    expect(r.segments[0].tcuBaseFt).toBe(2000);
    expect(r.segments[0].cbBaseFt).toBeUndefined();
  });
});

describe('resolveTafTimeline — FM (full replacement)', () => {
  it('FM introduces gusts mid-horizon; weather/clouds are fully replaced', () => {
    const r = resolveTafTimeline(
      taf('EYVI 280500Z 2806/2906 27008KT 9999 -RA BKN012 FM281500 30015G28KT 9999 BKN030'),
      NOW,
    );
    expect(r.segments).toHaveLength(2);
    // Before FM: rain, no gusts.
    expect(r.segments[0].hazards).toEqual(['rain']);
    expect(r.segments[0].to.toISOString()).toBe('2026-06-28T15:00:00.000Z');
    // After FM: gusts, rain gone (FM resets the weather groups).
    expect(r.segments[1].from.toISOString()).toBe('2026-06-28T15:00:00.000Z');
    expect(r.segments[1].hazards).toEqual(['gusts']);
    expect(r.segments[1].gustKt).toBe(28);
    expect(r.segments[1].wxRaw).toEqual([]);
  });

  it('an FM before the horizon start is already applied at "now"', () => {
    const r = resolveTafTimeline(
      taf('EYVI 280500Z 2806/2906 27008KT CAVOK FM281000 27020G35KT 9999 SCT040'),
      NOW, // 12Z — after the 10Z FM
    );
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0].hazards).toEqual(['gusts']);
  });
});

describe('resolveTafTimeline — BECMG (gradual amendment)', () => {
  it('marks the transition window as "becoming" with the union of old+new hazards', () => {
    const r = resolveTafTimeline(
      taf('EYVI 280500Z 2806/2906 27008KT 9999 BKN025 BECMG 2814/2816 4000 -RA BKN008'),
      NOW,
    );
    expect(r.segments).toHaveLength(3);
    // Before the window: benign.
    expect(r.segments[0]).toMatchObject({ kind: 'prevailing', hazards: [] });
    // Inside 14–16Z: becoming, conservative union (already shows the incoming hazards).
    expect(r.segments[1].kind).toBe('becoming');
    expect(r.segments[1].from.toISOString()).toBe('2026-06-28T14:00:00.000Z');
    expect(r.segments[1].to.toISOString()).toBe('2026-06-28T16:00:00.000Z');
    expect(r.segments[1].hazards).toEqual(expect.arrayContaining(['lowCeiling', 'lowVis', 'rain']));
    // After: the amendment is the prevailing state.
    expect(r.segments[2].kind).toBe('prevailing');
    expect(r.segments[2].hazards).toEqual(expect.arrayContaining(['lowCeiling', 'lowVis', 'rain']));
    expect(r.segments[2].ceilingFt).toBe(800);
  });

  it('BECMG only amends the listed elements (wind change keeps the cloud deck)', () => {
    const r = resolveTafTimeline(
      taf('EYVI 280500Z 2806/2906 27008KT 9999 BKN008 BECMG 2814/2816 30020G33KT'),
      NOW,
    );
    const last = r.segments[r.segments.length - 1];
    expect(last.hazards).toEqual(expect.arrayContaining(['lowCeiling', 'gusts'])); // ceiling kept
    expect(last.ceilingFt).toBe(800);
    expect(last.gustKt).toBe(33);
  });

  it('BECMG NSW clears the weather groups', () => {
    const r = resolveTafTimeline(
      taf('EYVI 280500Z 2806/2906 27008KT 9999 -RA BKN025 BECMG 2814/2816 NSW'),
      NOW,
    );
    const last = r.segments[r.segments.length - 1];
    expect(last.hazards).toEqual([]);
    expect(last.wxRaw).toEqual([]);
  });
});

describe('resolveTafTimeline — TEMPO / PROB overlays', () => {
  it('TEMPO thunderstorm is an overlay, not a prevailing segment', () => {
    const r = resolveTafTimeline(
      taf('EYVI 280500Z 2806/2906 27008KT CAVOK TEMPO 2813/2817 25015G28KT 3000 TSRA BKN008CB'),
      NOW,
    );
    // Prevailing stays benign for the whole horizon.
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0].hazards).toEqual([]);
    expect(r.overlays).toHaveLength(1);
    const o = r.overlays[0];
    expect(o.tempo).toBe(true);
    expect(o.probPct).toBeUndefined();
    expect(o.from.toISOString()).toBe('2026-06-28T13:00:00.000Z');
    expect(o.to.toISOString()).toBe('2026-06-28T17:00:00.000Z');
    expect(o.hazards).toEqual(expect.arrayContaining(['thunderstorm', 'lowCeiling', 'lowVis', 'gusts']));
  });

  it('PROB30 TEMPO carries its probability and is clipped to the horizon', () => {
    const r = resolveTafTimeline(
      taf('EYVI 280500Z 2806/2906 27008KT CAVOK PROB30 TEMPO 2822/2906 0800 FG'),
      NOW, // horizon ends 29T00Z — overlay 22Z–06Z clips to 22Z–00Z
    );
    expect(r.overlays).toHaveLength(1);
    const o = r.overlays[0];
    expect(o.probPct).toBe(30);
    expect(o.tempo).toBe(true);
    expect(o.to.toISOString()).toBe('2026-06-29T00:00:00.000Z');
    expect(o.hazards).toEqual(expect.arrayContaining(['lowVis']));
  });

  it('overlapping TEMPO windows both survive as separate overlays', () => {
    const r = resolveTafTimeline(
      taf(
        'EYVI 280500Z 2806/2906 27008KT 9999 SCT030 ' +
          'TEMPO 2812/2816 4000 SHRA TEMPO 2815/2819 25018G30KT',
      ),
      NOW,
    );
    expect(r.overlays).toHaveLength(2);
    expect(r.overlays[0].hazards).toEqual(expect.arrayContaining(['lowVis', 'rain']));
    expect(r.overlays[1].hazards).toEqual(['gusts']);
  });

  it('an overlay entirely outside the horizon is dropped', () => {
    const r = resolveTafTimeline(
      taf('EYVI 280500Z 2806/2906 27008KT CAVOK TEMPO 2901/2905 TSRA'),
      NOW, // horizon ends 29T00Z
    );
    expect(r.overlays).toEqual([]);
  });
});
