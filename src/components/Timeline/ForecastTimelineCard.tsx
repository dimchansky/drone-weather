// Visual forecast timeline — one wide, horizontally scrollable card with two source-labelled
// lanes on a shared hourly time axis:
//   MODEL lane — per-hour point forecast at the selected coordinates (icon, temp, rain amount +
//                probability in one stacked row, wind arrow + speed, gusts) from brief.timeline;
//   TAF lane   — the airport forecast as prevailing segments plus hatched TEMPO/PROB overlays
//                (temporary/probabilistic — never drawn as continuous certainty).
// The lanes share the axis but never share a cell or merge into one verdict. Missing values
// render as "—", never zero. Times are flight-site local; wind follows the selected unit.
// Color discipline: sky-blue = water, warning orange = meaningful gusts only (≥ the TAF
// advisory band), arrows are neutral. The "Now" column stays tinted while scrolling.

import { Card } from '../common/Card';
import type { Brief } from '../../domain/brief';
import type { ParsedTaf } from '../../domain/taf';
import { TAF_GUST_KT } from '../../domain/taf';
import { resolveTafTimeline, type TafBandOverlay, type TafBandSegment } from '../../domain/tafTimeline';
import { modelConditionIcon } from '../../domain/currentConditions';
import { daylight } from '../../domain/sun';
import { ktToMs, ktToKmh, round } from '../../domain/units';
import { useSettingsStore } from '../../store/settingsStore';
import { fmtTimeInZone } from '../../utils/time';
import { HAZARD_LABEL } from '../Taf/tafText';
import { WeatherIcon } from '../Overview/WeatherIcon';
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

/** Short human label for a band item; details go into the tooltip. */
function hazardText(hazards: TafBandSegment['hazards']): string {
  if (hazards.length === 0) return 'No hazards';
  const words = hazards.map((k) => HAZARD_LABEL[k]);
  return words.length > 2 ? `${words[0]} · ${words[1]} +${words.length - 2}` : words.join(' · ');
}

function bandTitle(item: TafBandSegment | TafBandOverlay): string {
  const parts = [hazardText(item.hazards)];
  if (item.gustKt != null) parts.push(`gusts ${item.gustKt} kt`);
  if (item.ceilingFt != null) parts.push(`ceiling ${item.ceilingFt} ft`);
  if (item.visM != null) parts.push(`visibility ${item.visM} m`);
  if (item.wxRaw.length) parts.push(item.wxRaw.join(' '));
  return parts.join(' · ');
}

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

  // Shared axis for the TAF band: start of the first hour → end of the last.
  const axisStart = hours[0].time.getTime();
  const axisEnd = hours[hours.length - 1].time.getTime() + HOUR;
  const pct = (t: number): number =>
    Math.max(0, Math.min(100, ((t - axisStart) / (axisEnd - axisStart)) * 100));

  const cols = { gridTemplateColumns: `max-content repeat(${hours.length}, minmax(46px, 1fr))` };

  /** Cell class: base + "now" column tint + any extras. */
  const cls = (i: number, ...extra: (string | false | undefined)[]): string =>
    [styles.cell, i === 0 && styles.nowCol, ...extra].filter(Boolean).join(' ');

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

          {/* --- TAF lane --- */}
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
              <div className={styles.rowLabel}>TAF</div>
              <div className={styles.bandCell} style={{ gridColumn: `2 / span ${hours.length}` }}>
                <div className={styles.band}>
                  {band.segments.map((s) => (
                    <div
                      key={`s${s.from.toISOString()}`}
                      className={`${styles.segment} ${
                        s.hazards.length === 0 ? styles.segOk : styles.segHazard
                      } ${s.kind === 'becoming' ? styles.segBecoming : ''}`}
                      style={{ left: `${pct(s.from.getTime())}%`, width: `${pct(s.to.getTime()) - pct(s.from.getTime())}%` }}
                      title={`${fmtTimeInZone(s.from, lt)}–${fmtTimeInZone(s.to, lt)}${s.kind === 'becoming' ? ' (changing)' : ''}: ${bandTitle(s)}`}
                    >
                      <span className={styles.segLabel}>
                        {s.kind === 'becoming' ? `→ ${hazardText(s.hazards)}` : hazardText(s.hazards)}
                      </span>
                    </div>
                  ))}
                  {band.overlays.map((o, i) => (
                    <div
                      key={`o${i}-${o.from.toISOString()}`}
                      className={styles.overlay}
                      style={{ left: `${pct(o.from.getTime())}%`, width: `${pct(o.to.getTime()) - pct(o.from.getTime())}%` }}
                      title={`${fmtTimeInZone(o.from, lt)}–${fmtTimeInZone(o.to, lt)}: ${
                        o.probPct ? `${o.probPct}% probability ` : ''
                      }${o.tempo ? 'at times ' : ''}· ${bandTitle(o)}`}
                    >
                      <span className={styles.segLabel}>
                        {o.probPct ? `${o.probPct}% ` : ''}
                        {hazardText(o.hazards)}
                        {o.tempo ? ' at times' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
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
        <div className={styles.legend} aria-hidden="true">
          <span className={styles.legendItem}>
            <span className={`${styles.legSwatch} ${styles.legSolid}`} /> Forecast
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legSwatch} ${styles.legHatch}`} /> At times / probability
          </span>
          <span className={styles.legendItem}>→ Changing</span>
        </div>
      )}
      <p className={styles.footer}>
        Model = point forecast at your coordinates · TAF = airport forecast
      </p>
    </Card>
  );
}
