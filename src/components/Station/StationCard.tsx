import { Card } from '../common/Card';
import { useBriefStore } from '../../store/briefStore';
import { useLocationStore } from '../../store/locationStore';
import { fmtDistance, fmtBearing, fmtAge } from '../../utils/format';
import { ageMinutes, fmtLocalTime, fmtUtcTime } from '../../utils/time';
import type { Brief } from '../../domain/brief';
import styles from './StationCard.module.css';

export function StationCard({ brief, now }: { brief: Brief; now: Date }) {
  const nearby = useBriefStore((s) => s.nearby);
  const setSelectedIcao = useLocationStore((s) => s.setSelectedIcao);

  const observed = brief.metar.observedAt;
  const age = ageMinutes(observed, now);
  const fetched = `fetched ${fmtLocalTime(brief.fetchedAt)} LT`;

  if (brief.source === 'model' || !brief.station) {
    return (
      <Card title="Station" collapsible defaultOpen={false}>
        <p className={styles.warn}>
          No nearby METAR station found. Showing <strong>forecast model</strong> data for your
          location — treat it as an approximation.
        </p>
        <p className={styles.fetched}>
          Model time {fmtLocalTime(observed)} LT · {fetched}
        </p>
      </Card>
    );
  }

  const st = brief.station;
  const far = st.distanceKm > 40;
  const stale = age > 120;

  return (
    <Card title="Station" collapsible defaultOpen={false}>
      <div className={styles.headline}>
        <span className={styles.icao}>{st.icao}</span>
        {st.name && <span className={styles.name}>{st.name}</span>}
      </div>

      <dl className={styles.grid}>
        <div>
          <dt>Distance</dt>
          <dd>{fmtDistance(st.distanceKm)}</dd>
        </div>
        <div>
          <dt>Bearing</dt>
          <dd>{fmtBearing(st.bearingDeg)}</dd>
        </div>
        <div title={`${fmtUtcTime(observed)} · ${fetched}`}>
          <dt>METAR observed</dt>
          <dd>{fmtLocalTime(observed)} LT</dd>
          <span className={styles.sub}>{fmtAge(age)} old</span>
        </div>
      </dl>

      <p className={styles.fetched}>{fetched}</p>

      {nearby.length > 1 && (
        <label className={styles.picker}>
          <span>Switch station</span>
          <select value={st.icao} onChange={(e) => setSelectedIcao(e.target.value)}>
            {nearby.map((n) => (
              <option key={n.metar.icao} value={n.metar.icao}>
                {n.metar.icao} — {fmtDistance(n.distanceKm)}
                {n.metar.stationName ? ` (${n.metar.stationName})` : ''}
              </option>
            ))}
          </select>
        </label>
      )}

      {(far || stale) && (
        <p className={styles.warn}>
          {far && `Station is ${fmtDistance(st.distanceKm)} away — it may not represent your exact site. `}
          {stale && `METAR is ${fmtAge(age)} old — conditions may have changed.`}
        </p>
      )}
    </Card>
  );
}
