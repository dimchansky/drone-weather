// Visual forecast timeline — one wide, horizontally scrollable card with two source-labelled
// lanes on a shared hourly time axis:
//   MODEL lane — per-hour point forecast at the selected coordinates (icon, temp, rain amount +
//                probability in one stacked row, wind arrow + speed, gusts) from brief.timeline;
//   TAF lanes  — the airport forecast as stacked hazard CHIPS: a prevailing lane (what will be)
//                and, when TEMPO/PROB groups exist, a separate hatched "at times" lane (what may
//                be, temporarily) — temporary/probabilistic never reads as continuous certainty.
// Chips carry values (Ceiling 500 ft, Vis 3 km, Gust 25 kt) in the selected units; human wording
// first, raw TAF codes in tooltips and the TAF Details card. Lanes grow vertically with content
// (capped at 4 chips + "+N"). Missing values render as "—", never zero. Times are flight-site
// local. Color discipline: sky-blue = water, warning orange = meaningful gusts only.

import { Card } from '../common/Card';
import type { Brief } from '../../domain/brief';
import type { ParsedTaf } from '../../domain/taf';
import { TAF_GUST_KT } from '../../domain/taf';
import { resolveTafTimeline, type TafBandOverlay, type TafBandSegment } from '../../domain/tafTimeline';
import { modelConditionIcon } from '../../domain/currentConditions';
import { daylight } from '../../domain/sun';
import { ktToMs, ktToKmh, round, fmtWindSpeed, FT_TO_M, type AltUnit, type WindUnit } from '../../domain/units';
import { useSettingsStore } from '../../store/settingsStore';
import { fmtTimeInZone } from '../../utils/time';
import { WeatherIcon } from '../Overview/WeatherIcon';
import { Glyph } from '../Overview/Glyphs';
import styles from './ForecastTimelineCard.module.css';

const HOUR = 3600000;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Local calendar day of an instant at the flight site (for day-change markers). */
const localDayIndex = (d: Date, utcOffsetSeconds: number): number =>
  new Date(d.getTime() + utcOffsetSeconds * 1000).getUTCDay();
const localDateKey = (d: Date, utcOffsetSeconds: number): string =>
  new Date(d.getTime() + utcOffsetSeconds * 1000).toISOString().slice(0, 10);

function WindArrow({ dirDeg }: { dirDeg: number }) {
  // The arrow points where the wind BLOWS TOWARD (drift), matching the compass tile.
  return (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      className={styles.windArrow}
      style={{ transform: `rotate(${(dirDeg + 180) % 360}deg)` }}
      aria-hidden="true"
    >
      <path d="M12 21V5" />
      <path d="m6 11 6-6 6 6" />
    </svg>
  );
}

// ---------- TAF band chips ----------

export type BandChipTone = 'high' | 'caution' | 'water' | 'ok' | 'qual' | 'more';
export type BandChipIcon = 'bolt' | 'cloud' | 'eye' | 'wind';
/** Compact abbreviations used in the band — the legend explains exactly these. */
export type BandAbbr = 'TS' | 'CB' | 'TCU' | 'Ceil' | 'Vis';
export interface BandChip {
  text: string;
  tone: BandChipTone;
  icon?: BandChipIcon;
  abbr?: BandAbbr;
}

type BandItem = TafBandSegment | TafBandOverlay;

const fmtAltChip = (ft: number, altUnit: AltUnit): string =>
  altUnit === 'ft' ? `${round(ft)} ft` : `${round(ft * FT_TO_M)} m`;
const fmtVisChip = (m: number): string => (m >= 1000 ? `${round(m / 1000, 1)} km` : `${m} m`);

/**
 * Compact hazard chips for one band item, most decision-relevant first, values in the selected
 * units. Short standardized labels (TS / CB / TCU / Ceil / Vis) — the dynamic legend explains
 * exactly the abbreviations on screen; full human wording lives in the tooltip and TAF Details.
 * Capped at 4 + "+N more".
 */
export function bandChips(item: BandItem, windUnit: WindUnit, altUnit: AltUnit): BandChip[] {
  const chips: BandChip[] = [];
  if (item.hazards.includes('thunderstorm')) {
    if (item.tsGroup) {
      chips.push({ text: 'TS', tone: 'high', icon: 'bolt', abbr: 'TS' });
    } else {
      const base = item.cbBaseFt != null ? ` ${fmtAltChip(item.cbBaseFt, altUnit)}` : '';
      chips.push({ text: `CB${base}`, tone: 'high', icon: 'bolt', abbr: 'CB' });
    }
  }
  if (item.tcuBaseFt !== undefined) {
    const base = item.tcuBaseFt != null ? ` ${fmtAltChip(item.tcuBaseFt, altUnit)}` : '';
    chips.push({ text: `TCU${base}`, tone: 'caution', icon: 'cloud', abbr: 'TCU' });
  }
  if (item.hazards.includes('lowCeiling') && item.ceilingFt != null) {
    chips.push({ text: `Ceil ${fmtAltChip(item.ceilingFt, altUnit)}`, tone: 'caution', icon: 'cloud', abbr: 'Ceil' });
  }
  if (item.hazards.includes('lowVis') && item.visM != null) {
    chips.push({ text: `Vis ${fmtVisChip(item.visM)}`, tone: 'caution', icon: 'eye', abbr: 'Vis' });
  }
  if (item.hazards.includes('gusts') && item.gustKt != null) {
    chips.push({ text: `Gust ${fmtWindSpeed(item.gustKt, windUnit)}`, tone: 'caution', icon: 'wind' });
  }
  if (item.hazards.includes('strongWind')) chips.push({ text: 'Strong wind', tone: 'caution', icon: 'wind' });
  if (item.hazards.includes('snow')) chips.push({ text: 'Snow', tone: 'water' });
  else if (item.hazards.includes('rain')) chips.push({ text: 'Rain', tone: 'water' });

  if (chips.length === 0) return [{ text: 'No hazards', tone: 'ok' }];
  if (chips.length > 4) return [...chips.slice(0, 4), { text: `+${chips.length - 4} more`, tone: 'more' }];
  return chips;
}

/**
 * Overlay qualifier chip — only when there is a probability to state. Plain TEMPO needs no chip:
 * living in the hatched "Temporary" lane already says "at times".
 */
export function overlayQualifier(o: TafBandOverlay): BandChip | null {
  if (o.probPct == null) return null;
  return { text: `${o.probPct}%`, tone: 'qual' };
}

/** Legend vocabulary — rendered only for the abbreviations actually used on screen. */
const ABBR_LEGEND: Record<BandAbbr, string> = {
  TS: 'thunderstorm',
  CB: 'storm cloud',
  TCU: 'building cloud',
  Ceil: 'ceiling',
  Vis: 'visibility',
};
const ABBR_ORDER: BandAbbr[] = ['TS', 'CB', 'TCU', 'Ceil', 'Vis'];
const ABBR_TITLE: Record<BandAbbr, string> = {
  TS: 'TS — thunderstorm forecast at the airport',
  CB: 'CB — cumulonimbus (storm clouds), base height when reported',
  TCU: 'TCU — towering cumulus (building storm clouds), base height when reported',
  Ceil: 'Ceiling — lowest broken/overcast cloud base',
  Vis: 'Visibility at the airport',
};

/**
 * Greedy calendar-style row assignment so time-overlapping overlays stack instead of colliding.
 * Items must be sorted by `from` (resolveTafTimeline guarantees it).
 */
export function assignRows(items: { from: Date; to: Date }[]): number[] {
  const rowEnds: number[] = [];
  return items.map((it) => {
    const idx = rowEnds.findIndex((end) => end <= it.from.getTime());
    if (idx >= 0) {
      rowEnds[idx] = it.to.getTime();
      return idx;
    }
    rowEnds.push(it.to.getTime());
    return rowEnds.length - 1;
  });
}

function bandTitle(item: BandItem): string {
  const parts: string[] = [];
  if (item.hazards.length === 0) parts.push('no significant hazards');
  if (item.gustKt != null) parts.push(`gusts ${item.gustKt} kt`);
  if (item.ceilingFt != null) parts.push(`ceiling ${item.ceilingFt} ft`);
  if (item.visM != null) parts.push(`visibility ${item.visM} m`);
  if (item.cbBaseFt !== undefined) parts.push(`CB${item.cbBaseFt != null ? ` base ${item.cbBaseFt} ft` : ''}`);
  if (item.tcuBaseFt !== undefined) parts.push(`TCU${item.tcuBaseFt != null ? ` base ${item.tcuBaseFt} ft` : ''}`);
  if (item.wxRaw.length) parts.push(item.wxRaw.join(' '));
  return parts.join(' · ');
}

const CHIP_H = 16; // chip height + stack gap (compact)
const LANE_PAD = 8;
const laneHeight = (chips: number): number => chips * CHIP_H + LANE_PAD;

export function ForecastTimelineCard({
  brief,
  taf,
  now,
}: {
  brief: Brief;
  taf: ParsedTaf | null;
  now: Date;
}) {
  const windUnit = useSettingsStore((s) => s.windUnit);
  const altUnit = useSettingsStore((s) => s.altUnit);
  const hours = brief.timeline;
  if (hours.length === 0) return null;

  const unitLabel = windUnit === 'ms' ? 'm/s' : windUnit === 'kmh' ? 'km/h' : 'kt';
  const speed = (kt: number | null): string =>
    kt == null
      ? '—'
      : windUnit === 'ms'
        ? String(round(ktToMs(kt), 1))
        : windUnit === 'kmh'
          ? String(round(ktToKmh(kt), 1))
          : String(round(kt));

  const lt = brief.locationTime;
  const nights = hours.map((h) => daylight(h.time, brief.coord).phase === 'night');
  const band = resolveTafTimeline(taf, now, 12);

  // Shared axis for the TAF lanes: start of the first hour → end of the last.
  const axisStart = hours[0].time.getTime();
  const axisEnd = hours[hours.length - 1].time.getTime() + HOUR;
  const pct = (t: number): number =>
    Math.max(0, Math.min(100, ((t - axisStart) / (axisEnd - axisStart)) * 100));
  const spanStyle = (from: Date, to: Date) => ({
    left: `${pct(from.getTime())}%`,
    width: `${pct(to.getTime()) - pct(from.getTime())}%`,
  });
  const timeSpan = (from: Date, to: Date) => `${fmtTimeInZone(from, lt)}–${fmtTimeInZone(to, lt)}`;

  const cols = { gridTemplateColumns: `max-content repeat(${hours.length}, minmax(46px, 1fr))` };
  const bandSpan = { gridColumn: `2 / span ${hours.length}` };

  /** Cell class: base + "now" column tint + any extras. */
  const cls = (i: number, ...extra: (string | false | undefined)[]): string =>
    [styles.cell, i === 0 && styles.nowCol, ...extra].filter(Boolean).join(' ');

  // TAF lane geometry (computed from content so the band grows only when the TAF is complex).
  const segChips = band.segments.map((s) => {
    const chips = bandChips(s, windUnit, altUnit);
    return s.kind === 'becoming' ? [{ text: '→ Changing', tone: 'qual' as const }, ...chips] : chips;
  });
  const prevailH = laneHeight(Math.max(1, ...segChips.map((c) => c.length)));
  const ovlChips = band.overlays.map((o) => {
    const qual = overlayQualifier(o);
    return qual ? [qual, ...bandChips(o, windUnit, altUnit)] : bandChips(o, windUnit, altUnit);
  });
  const ovlRows = assignRows(band.overlays);
  const ovlRowH = laneHeight(Math.max(1, ...ovlChips.map((c) => c.length)));
  const ovlLaneH = (Math.max(-1, ...ovlRows) + 1) * (ovlRowH + 4) - 4;
  // Windows whose VISIBLE portion is under an hour get no chip text — a tinted block with a
  // tooltip beats clipped type. Clamped to the axis: a window running past the horizon edge is
  // judged by what's actually on screen, not its raw duration.
  const textless = (from: Date, to: Date): boolean =>
    Math.min(to.getTime(), axisEnd) - Math.max(from.getTime(), axisStart) < HOUR;

  // The legend explains exactly the abbreviations on screen — nothing more.
  const usedAbbrs = ABBR_ORDER.filter((a) =>
    [...segChips, ...ovlChips].some((chips) => chips.some((c) => c.abbr === a)),
  );
  const hasBecoming = band.segments.some((s) => s.kind === 'becoming');

  const chipEls = (chips: BandChip[]) =>
    chips.map((c, i) => (
      <span key={`${i}${c.text}`} className={`${styles.tChip} ${styles[TONE_CLASS[c.tone]]}`}>
        {c.icon && <Glyph kind={c.icon} size={11} className={styles.chipIcon} />}
        {c.text}
      </span>
    ));

  return (
    <Card title="Next 12 hours">
      <div className={styles.scroller}>
        <div className={styles.grid} style={cols}>
          {/* --- time axis --- */}
          <div className={styles.rowLabel} />
          {hours.map((h, i) => {
            const dayChanged =
              i > 0 && localDateKey(h.time, lt.utcOffsetSeconds) !== localDateKey(hours[i - 1].time, lt.utcOffsetSeconds);
            return (
              <div key={h.time.toISOString()} className={cls(i, styles.time, i === 0 && styles.timeNow)}>
                {i === 0 ? 'Now' : fmtTimeInZone(h.time, lt)}
                {dayChanged && <span className={styles.day}>{DAY_NAMES[localDayIndex(h.time, lt.utcOffsetSeconds)]}</span>}
              </div>
            );
          })}

          {/* --- model lane --- */}
          <div className={styles.laneHeader}>
            <span className={styles.laneHeaderText}>
              <span className={`${styles.srcPill} ${styles.srcPillModel}`}>Model</span>
              point forecast at your coordinates
            </span>
          </div>

          {/* weather group: icon + temperature (the anchor row) */}
          <div className={styles.rowLabel}>{' '}</div>
          {hours.map((h, i) => (
            <div key={h.time.toISOString()} className={cls(i)}>
              <WeatherIcon
                icon={modelConditionIcon(h.precipMm, h.precipProb, h.cloudCoverPct, nights[i])}
                label={`Hour ${fmtTimeInZone(h.time, lt)} conditions`}
                size={22}
              />
            </div>
          ))}

          <div className={styles.rowLabel}>Temp °C</div>
          {hours.map((h, i) => (
            <div key={h.time.toISOString()} className={cls(i, styles.tempCell)}>
              {h.tempC != null ? `${round(h.tempC)}°` : '—'}
            </div>
          ))}

          <div className={styles.groupSep} />

          {/* rain group: amount over probability in ONE stacked row */}
          <div className={styles.rowLabel}>
            Rain <span className={styles.rowLabelSub}>mm · %</span>
          </div>
          {hours.map((h, i) => (
            <div key={h.time.toISOString()} className={cls(i)}>
              <span className={h.precipMm != null && h.precipMm >= 0.1 ? styles.rain : styles.zero}>
                {h.precipMm == null ? '—' : round(h.precipMm, 1)}
              </span>
              <span
                className={`${styles.rainProb} ${
                  h.precipProb != null && h.precipProb >= 60 ? styles.rain : styles.zero
                }`}
              >
                {h.precipProb == null ? '—' : `${round(h.precipProb)}%`}
              </span>
            </div>
          ))}

          <div className={styles.groupSep} />

          {/* wind group: direction + speed, then gusts (orange only when meaningful) */}
          <div className={styles.rowLabel}>Wind {unitLabel}</div>
          {hours.map((h, i) => (
            <div key={h.time.toISOString()} className={cls(i, styles.windCell)}>
              {h.windDirDeg != null && <WindArrow dirDeg={h.windDirDeg} />}
              <span>{speed(h.windKt)}</span>
            </div>
          ))}

          <div className={styles.rowLabel}>Gust</div>
          {hours.map((h, i) => (
            <div
              key={h.time.toISOString()}
              className={cls(
                i,
                h.gustKt == null ? styles.zero : h.gustKt >= TAF_GUST_KT ? styles.gust : undefined,
              )}
            >
              {speed(h.gustKt)}
            </div>
          ))}

          {/* --- TAF lanes --- */}
          {band.available ? (
            <>
              <div className={styles.laneHeader}>
                <span className={styles.laneHeaderText}>
                  <span className={`${styles.srcPill} ${styles.srcPillTaf}`}>
                    TAF {taf?.icao || brief.station?.icao || ''}
                  </span>
                  airport forecast
                  {band.endsBeforeHorizon ? ` · ends ${fmtTimeInZone(band.to, lt)}` : ''}
                </span>
              </div>

              {/* prevailing lane */}
              <div className={styles.rowLabel}>TAF</div>
              <div className={styles.bandCell} style={bandSpan}>
                <div className={styles.chipLane} style={{ height: prevailH }}>
                  {band.segments.map((s, si) => (
                    <div
                      key={`s${s.from.toISOString()}`}
                      className={`${styles.segment} ${
                        s.hazards.length === 0 ? styles.segOk : styles.segHazard
                      } ${s.kind === 'becoming' ? styles.segBecoming : ''}`}
                      style={spanStyle(s.from, s.to)}
                      title={`${timeSpan(s.from, s.to)}${s.kind === 'becoming' ? ' (changing)' : ''}: ${bandTitle(s)}`}
                    >
                      {!textless(s.from, s.to) && chipEls(segChips[si])}
                    </div>
                  ))}
                </div>
              </div>

              {/* Temporary/probable lane — TEMPO/PROB only, spatially separate */}
              {band.overlays.length > 0 && (
                <>
                  <div className={styles.rowLabel} title="TEMPO / PROB — temporary or probabilistic conditions, not continuous">
                    <span className={styles.rowLabelSub}>Temporary</span>
                  </div>
                  <div className={styles.bandCell} style={bandSpan}>
                    <div className={styles.ovlLane} style={{ height: ovlLaneH }}>
                      {band.overlays.map((o, oi) => (
                        <div
                          key={`o${oi}-${o.from.toISOString()}`}
                          className={styles.ovlBox}
                          style={{
                            ...spanStyle(o.from, o.to),
                            top: ovlRows[oi] * (ovlRowH + 4),
                            height: ovlRowH,
                          }}
                          title={`${timeSpan(o.from, o.to)}: ${
                            o.probPct ? `${o.probPct}% probability ` : ''
                          }${o.tempo ? 'at times ' : ''}· ${bandTitle(o)}`}
                        >
                          {!textless(o.from, o.to) && chipEls(ovlChips[oi])}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className={styles.laneHeader}>
              <span className={styles.laneHeaderText}>
                <span className={`${styles.srcPill} ${styles.srcPillTaf}`}>TAF</span>
                {taf ? 'valid outside this window' : 'no nearby airport forecast'}
              </span>
            </div>
          )}
        </div>
      </div>

      {band.available && (
        <div className={styles.legend}>
          {usedAbbrs.map((a) => (
            <span key={a} className={styles.legendItem} title={ABBR_TITLE[a]}>
              <strong className={styles.legendAbbr}>{a}</strong> {ABBR_LEGEND[a]}
            </span>
          ))}
          {band.overlays.length > 0 && (
            <span className={styles.legendItem}>
              <span className={`${styles.legSwatch} ${styles.legHatch}`} /> temporary / possible
            </span>
          )}
          {hasBecoming && <span className={styles.legendItem}>→ changing</span>}
        </div>
      )}
      <p className={styles.footer}>
        Model = point forecast at your coordinates · TAF = airport forecast
      </p>
    </Card>
  );
}

const TONE_CLASS: Record<BandChipTone, string> = {
  high: 'tHigh',
  caution: 'tCaution',
  water: 'tWater',
  ok: 'tOk',
  qual: 'tQual',
  more: 'tMore',
};
