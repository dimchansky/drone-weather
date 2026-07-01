// Light availability as an instrument: a sun arc with sunrise/sunset times at its feet and the
// sun's live position by day; moon and faint stars by night. Below it: the phase, the next
// important number big (daylight remaining, or the next sunrise), and unambiguous chips —
// golden hour always as an explicit time RANGE, civil dawn / full dark as labelled times.
// All times in flight-site local time; "tomorrow's" dawn/golden reuse sunTimes() for the
// next-sunrise day.

import type { Coord, LocationTime } from '../../domain/types';
import type { Daylight, DaylightPhase } from '../../domain/sun';
import { sunTimes } from '../../domain/sun';
import { fmtTimeInZone, fmtDuration } from '../../utils/time';
import { sunArcProgress } from './sunArc';
import { MOON_PATH } from './WeatherIcon';
import styles from './OverviewGrid.module.css';

const PHASE_LABEL: Record<DaylightPhase, string> = {
  day: 'Daylight',
  golden: 'Golden hour',
  civilTwilight: 'Civil twilight',
  night: 'Night',
};

// Arc geometry: half-circle from (10,50) to (90,50), radius 40, length ≈ π·40.
const ARC_LEN = Math.PI * 40;

export function DaylightTile({
  daylight,
  locationTime,
  coord,
  now,
}: {
  daylight: Daylight;
  locationTime: LocationTime;
  coord: Coord;
  now: Date;
}) {
  const { times, phase, polar } = daylight;
  const progress = sunArcProgress(now, times.sunrise, times.sunset);
  const t = (d: Date | null) => (d ? fmtTimeInZone(d, locationTime) : '—');
  const range = (a: Date | null, b: Date | null) => `${t(a)}–${t(b)}`;

  const sunX = progress != null ? 50 - 40 * Math.cos(Math.PI * progress) : null;
  const sunY = progress != null ? 50 - 40 * Math.sin(Math.PI * progress) : null;

  const sunUp = daylight.daylightRemainingMin != null;
  // Sun below the horizon: dawn/golden context belongs to the day of the NEXT sunrise (which is
  // tomorrow once the evening events have passed).
  const nextTimes = !sunUp && daylight.nextSunrise ? sunTimes(daylight.nextSunrise, coord) : null;
  const eveningTwilight = phase === 'civilTwilight' && now > times.solarNoon;

  const chips: { text: string; sun?: boolean }[] = [];
  if (polar == null) {
    if (sunUp) {
      if (times.goldenEveningStart && times.sunset && now < times.goldenEveningStart) {
        chips.push({ text: `Golden ${range(times.goldenEveningStart, times.sunset)}`, sun: true });
      }
    } else {
      if (eveningTwilight && times.civilDusk) chips.push({ text: `Dark ${t(times.civilDusk)}` });
      if (nextTimes?.civilDawn) chips.push({ text: `Dawn ${t(nextTimes.civilDawn)}` });
      if (nextTimes?.sunrise && nextTimes.goldenMorningEnd) {
        chips.push({ text: `Golden ${range(nextTimes.sunrise, nextTimes.goldenMorningEnd)}`, sun: true });
      }
    }
  }

  return (
    <div className={`${styles.tile} ${sunUp ? styles.tileSun : styles.tileMoon}`}>
      <h3 className={styles.tileTitle}>Daylight</h3>
      <svg viewBox="0 0 100 60" className={styles.arc} role="img" aria-label={`Daylight: ${PHASE_LABEL[phase]}`}>
        <line x1="4" y1="50" x2="96" y2="50" className={styles.arcHorizon} />
        <path d="M 10 50 A 40 40 0 0 1 90 50" className={styles.arcTrack} />
        {progress != null && (
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            className={styles.arcProgress}
            strokeDasharray={`${ARC_LEN * progress} ${ARC_LEN}`}
          />
        )}
        {sunX != null && sunY != null && (
          <>
            <circle cx={sunX} cy={sunY} r="8" className={styles.arcSunGlow} />
            <circle cx={sunX} cy={sunY} r="4.5" className={styles.arcSun} />
          </>
        )}
        {sunUp && times.sunrise && times.sunset && (
          <>
            <text x="10" y="58" textAnchor="middle" className={styles.arcLabel}>
              ↑{t(times.sunrise)}
            </text>
            <text x="90" y="58" textAnchor="middle" className={styles.arcLabel}>
              ↓{t(times.sunset)}
            </text>
          </>
        )}
        {progress == null && (
          // Sun below the horizon (or polar night): moon and faint stars instead of the sun marker.
          <>
            <path d={MOON_PATH} className={styles.arcMoon} transform="translate(41.5 12) scale(0.75)" />
            <circle cx="26" cy="24" r="0.9" className={styles.arcStar} />
            <circle cx="71" cy="18" r="0.9" className={styles.arcStar} />
            <circle cx="63" cy="33" r="0.7" className={styles.arcStar} />
          </>
        )}
      </svg>
      <div className={styles.dlBody}>
        <div className={styles.dlPhase}>{PHASE_LABEL[phase]}</div>
        {polar === 'day' && (
          <>
            <div className={styles.dlRemaining}>Sun up all day</div>
            <div className={styles.sub}>Polar day — no sunset</div>
          </>
        )}
        {polar === 'night' && (
          <>
            <div className={styles.dlRemaining}>Sun stays down</div>
            <div className={styles.sub}>Polar night — no sunrise</div>
          </>
        )}
        {polar == null &&
          (sunUp ? (
            <>
              {/* Relative first — "how long do I have" is the human question; clock time sits
                  at the arc's ↓ label. */}
              <div className={styles.dlRemaining}>
                Sunset in {fmtDuration(daylight.daylightRemainingMin!)}
              </div>
            </>
          ) : (
            <>
              <div className={styles.dlRemaining}>
                {daylight.nextSunrise ? `Sunrise ${t(daylight.nextSunrise)}` : '—'}
              </div>
              {daylight.nextSunrise && daylight.nextSunrise > now && (
                <div className={styles.status}>
                  in {fmtDuration(Math.round((daylight.nextSunrise.getTime() - now.getTime()) / 60000))}
                </div>
              )}
            </>
          ))}
        {chips.length > 0 && (
          <div className={styles.chips}>
            {chips.map((c) => (
              <span key={c.text} className={`${styles.chip}${c.sun ? ` ${styles.chipSun}` : ''}`}>
                {c.text}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
