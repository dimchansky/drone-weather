// Light availability at a glance: the current phase, a mini sun arc with sunrise→sunset progress,
// the next important event big (remaining daylight while the sun is up, the next sunrise when it
// is down), and civil-dawn/dusk + golden-hour context lines. Times use the flight-site local time.
// Dawn/golden for "tomorrow" reuse the existing sunTimes() for the next-sunrise day.

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

  const sunX = progress != null ? 50 - 40 * Math.cos(Math.PI * progress) : null;
  const sunY = progress != null ? 50 - 40 * Math.sin(Math.PI * progress) : null;

  const sunUp = daylight.daylightRemainingMin != null;
  // Sun below the horizon: dawn/golden context belongs to the day of the NEXT sunrise (which is
  // tomorrow once the evening events have passed).
  const nextTimes = !sunUp && daylight.nextSunrise ? sunTimes(daylight.nextSunrise, coord) : null;
  const eveningTwilight = phase === 'civilTwilight' && now > times.solarNoon;

  const context: string[] = [];
  if (polar == null) {
    if (sunUp) {
      context.push(`Sunset ${t(times.sunset)}`);
      if (times.goldenEveningStart && now < times.goldenEveningStart) {
        context.push(`Golden ${t(times.goldenEveningStart)}`);
      }
    } else {
      if (eveningTwilight && times.civilDusk) context.push(`Dark ${t(times.civilDusk)}`);
      if (nextTimes?.civilDawn) context.push(`Dawn ${t(nextTimes.civilDawn)}`);
      if (nextTimes?.goldenMorningEnd) context.push(`Golden till ${t(nextTimes.goldenMorningEnd)}`);
    }
  }

  return (
    <div className={styles.tile}>
      <h3 className={styles.tileTitle}>Daylight</h3>
      <svg viewBox="0 0 100 56" className={styles.arc} role="img" aria-label={`Daylight: ${PHASE_LABEL[phase]}`}>
        <line x1="4" y1="50" x2="96" y2="50" className={styles.arcHorizon} />
        <path d="M 10 50 A 40 40 0 0 1 90 50" className={styles.arcTrack} />
        {progress != null && (
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            className={styles.arcProgress}
            strokeDasharray={`${ARC_LEN * progress} ${ARC_LEN}`}
          />
        )}
        {sunX != null && sunY != null && <circle cx={sunX} cy={sunY} r="4.5" className={styles.arcSun} />}
        {progress == null && (
          // Sun below the horizon (or polar night): a moon sits mid-arc instead of the sun marker.
          <path d={MOON_PATH} className={styles.arcMoon} transform="translate(41.5 12) scale(0.75)" />
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
        {polar == null && (
          <>
            {sunUp ? (
              <div className={styles.dlRemaining}>
                {fmtDuration(daylight.daylightRemainingMin!)} left
              </div>
            ) : (
              <div className={styles.dlRemaining}>
                {daylight.nextSunrise ? `Sunrise ${t(daylight.nextSunrise)}` : '—'}
              </div>
            )}
            {context.length > 0 && <div className={styles.sub}>{context.join(' · ')}</div>}
          </>
        )}
      </div>
    </div>
  );
}
