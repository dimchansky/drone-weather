// Light availability at a glance: a mini sun arc with the sun's sunrise→sunset progress, plus
// sunrise/sunset, remaining daylight, the evening golden hour, and the current phase. At night
// the arc shows a moon and the next sunrise. All times in the flight-site local time.

import type { Daylight, DaylightPhase } from '../../domain/sun';
import type { LocationTime } from '../../domain/types';
import { fmtTimeInZone, fmtDuration } from '../../utils/time';
import { sunArcProgress } from './sunArc';
import { MOON_PATH } from './WeatherIcon';
import styles from './OverviewGrid.module.css';

const PHASE_LABEL: Record<DaylightPhase, string> = {
  day: 'Day',
  golden: 'Golden hour',
  civilTwilight: 'Civil twilight',
  night: 'Night',
};

// Arc geometry: half-circle from (10,50) to (90,50), radius 40, length ≈ π·40.
const ARC_LEN = Math.PI * 40;

export function DaylightTile({
  daylight,
  locationTime,
  now,
}: {
  daylight: Daylight;
  locationTime: LocationTime;
  now: Date;
}) {
  const { times, phase, polar } = daylight;
  const progress = sunArcProgress(now, times.sunrise, times.sunset);
  const t = (d: Date | null) => (d ? fmtTimeInZone(d, locationTime) : '—');

  const sunX = progress != null ? 50 - 40 * Math.cos(Math.PI * progress) : null;
  const sunY = progress != null ? 50 - 40 * Math.sin(Math.PI * progress) : null;

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
            {daylight.daylightRemainingMin != null ? (
              <>
                <div className={styles.dlTimes}>
                  ↑ {t(times.sunrise)} · ↓ {t(times.sunset)}
                </div>
                <div className={styles.dlRemaining}>{fmtDuration(daylight.daylightRemainingMin)} left</div>
              </>
            ) : (
              // Sun below the horizon: the next sunrise is the one fact that matters.
              <div className={styles.dlRemaining}>
                {daylight.nextSunrise ? `Sunrise ${t(daylight.nextSunrise)}` : '—'}
              </div>
            )}
            {phase !== 'night' && times.goldenEveningStart && (
              <div className={styles.sub}>Golden {t(times.goldenEveningStart)}</div>
            )}
          </>
        )}
        <div className={styles.sub}>{PHASE_LABEL[phase]}</div>
      </div>
    </div>
  );
}
