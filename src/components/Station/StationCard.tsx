import { Card } from '../common/Card';
import { useBriefStore } from '../../store/briefStore';
import { useLocationStore } from '../../store/locationStore';
import { fmtDistance, fmtBearing, fmtAge } from '../../utils/format';
import type { Brief } from '../../domain/brief';
import styles from './StationCard.module.css';

export function StationCard({ brief }: { brief: Brief }) {
  const nearby = useBriefStore((s) => s.nearby);
  const setSelectedIcao = useLocationStore((s) => s.setSelectedIcao);

  if (brief.source === 'model' || !brief.station) {
    return (
      <Card title="Station">
        <p className={styles.warn}>
          No nearby METAR station found. Showing <strong>forecast model</strong> data for your
          location — treat it as an approximation.
        </p>
      </Card>
    );
  }

  const st = brief.station;
  const age = brief.metar.ageMin;
  const far = st.distanceKm > 40;
  const stale = age > 120;

  return (
    <Card title="Station">
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
        <div>
          <dt>METAR age</dt>
          <dd>{fmtAge(age)}</dd>
        </div>
      </dl>

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
