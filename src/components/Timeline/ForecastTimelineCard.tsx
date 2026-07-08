// Visual forecast timeline — one wide, horizontally scrollable card with two source-labelled
// lanes on a shared hourly time axis:
//   MODEL lane — per-hour point forecast at the selected coordinates (icon, temp, rain amount &
//                probability, wind arrow + speed, gusts) from brief.timeline;
//   TAF lane   — the airport forecast as prevailing segments plus hatched TEMPO/PROB overlays
//                (temporary/probabilistic — never drawn as continuous certainty).
// The lanes share the axis but never share a cell or merge into one verdict. Missing values
// render as "—", never zero. Times are flight-site local; wind follows the selected unit.

import { Card } from '../common/Card';
import type { Brief } from '../../domain/brief';
import type { ParsedTaf } from '../../domain/taf';
import type { TimelineHour } from '../../domain/types';
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
      width={14}
      height={14}
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
  if (hazards.length === 0) return 'OK';
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

  const cell = (h: TimelineHour, content: React.ReactNode, cls?: string, key?: string) => (
    <div key={key ?? h.time.toISOString()} className={cls ? `${styles.cell} ${cls}` : styles.cell}>
      {content}
    </div>
  );

  return (
    <Card title="Next 12 hours">
      <div className={styles.scroller}>
        <div className={styles.grid} style={cols}>
          {/* --- time axis --- */}
          <div className={`${styles.rowLabel} ${styles.timeLabel}`} />
          {hours.map((h, i) => {
            const dayChanged =
              i > 0 && localDateKey(h.time, lt.utcOffsetSeconds) !== localDateKey(hours[i - 1].time, lt.utcOffsetSeconds);
            return (
              <div key={h.time.toISOString()} className={i === 0 ? `${styles.cell} ${styles.time} ${styles.timeNow}` : `${styles.cell} ${styles.time}`}>
                {i === 0 ? 'Now' : fmtTimeInZone(h.time, lt)}
                {dayChanged && <span className={styles.day}>{DAY_NAMES[localDayIndex(h.time, lt.utcOffsetSeconds)]}</span>}
              </div>
            );
          })}

          {/* --- model lane --- */}
          <div className={styles.laneHeader}>
            <span className={styles.laneHeaderText}>Model · point forecast at your coordinates</span>
          </div>

          <div className={styles.rowLabel}>{' '}</div>
          {hours.map((h, i) =>
            cell(
              h,
              <WeatherIcon
                icon={modelConditionIcon(h.precipMm, h.precipProb, h.cloudCoverPct, nights[i])}
                label={`Hour ${fmtTimeInZone(h.time, lt)} conditions`}
                size={22}
              />,
            ),
          )}

          <div className={styles.rowLabel}>Temp °C</div>
          {hours.map((h) => cell(h, h.tempC != null ? `${round(h.tempC)}°` : '—'))}

          <div className={styles.rowLabel}>Rain mm</div>
          {hours.map((h) =>
            cell(
              h,
              h.precipMm == null ? '—' : round(h.precipMm, 1),
              h.precipMm != null && h.precipMm >= 0.1 ? styles.rain : styles.zero,
            ),
          )}

          <div className={styles.rowLabel}>Prob %</div>
          {hours.map((h) =>
            cell(
              h,
              h.precipProb == null ? '—' : `${round(h.precipProb)}`,
              h.precipProb != null && h.precipProb >= 60 ? styles.rain : styles.zero,
            ),
          )}

          <div className={styles.rowLabel}>Wind {unitLabel}</div>
          {hours.map((h) =>
            cell(
              h,
              <>
                {h.windDirDeg != null && <WindArrow dirDeg={h.windDirDeg} />}
                <span>{speed(h.windKt)}</span>
              </>,
              styles.windCell,
            ),
          )}

          <div className={styles.rowLabel}>Gust {unitLabel}</div>
          {hours.map((h) => cell(h, speed(h.gustKt), h.gustKt != null ? styles.gust : styles.zero))}

          {/* --- TAF lane --- */}
          {band.available ? (
            <>
              <div className={styles.laneHeader}>
                <span className={styles.laneHeaderText}>
                  TAF {taf?.icao || brief.station?.icao || ''} · airport forecast
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
                {taf ? 'TAF valid outside this window' : 'No TAF — no nearby airport forecast'}
              </span>
            </div>
          )}
        </div>
      </div>
      <p className={styles.footer}>
        Model = Open-Meteo point forecast at your coordinates; TAF = airport forecast, not your
        exact spot. Hatched = temporary/probabilistic. Times {lt.timezone ?? 'device local'}.
      </p>
    </Card>
  );
}
