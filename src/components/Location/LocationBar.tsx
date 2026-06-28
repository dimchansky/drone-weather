import { useState } from 'react';
import { useLocationStore } from '../../store/locationStore';
import { fmtCoord } from '../../utils/format';
import styles from './LocationBar.module.css';

export function LocationBar() {
  const coord = useLocationStore((s) => s.coord);
  const source = useLocationStore((s) => s.source);
  const setCoord = useLocationStore((s) => s.setCoord);

  const [manual, setManual] = useState(false);
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [geoError, setGeoError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const useGps = () => {
    setGeoError(null);
    if (!('geolocation' in navigator)) {
      setGeoError('Geolocation is not available on this device.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setCoord({ lat: pos.coords.latitude, lon: pos.coords.longitude }, 'gps');
      },
      (err) => {
        setLocating(false);
        setGeoError(err.message || 'Could not get your location.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const la = Number(lat);
    const lo = Number(lon);
    if (Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) {
      setCoord({ lat: la, lon: lo }, 'manual');
      setManual(false);
    } else {
      setGeoError('Enter a valid latitude (−90…90) and longitude (−180…180).');
    }
  };

  return (
    <div className={styles.bar}>
      <div className={styles.row}>
        <button className={styles.primary} onClick={useGps} disabled={locating}>
          {locating ? 'Locating…' : '📍 Use my location'}
        </button>
        <button className={styles.ghost} onClick={() => setManual((m) => !m)}>
          {manual ? 'Cancel' : 'Enter coordinates'}
        </button>
      </div>

      {coord && (
        <p className={styles.current}>
          {fmtCoord(coord.lat, coord.lon)} <span className={styles.src}>({source})</span>
        </p>
      )}

      {manual && (
        <form className={styles.manual} onSubmit={submitManual}>
          <input
            inputMode="decimal"
            placeholder="Latitude"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            aria-label="Latitude"
          />
          <input
            inputMode="decimal"
            placeholder="Longitude"
            value={lon}
            onChange={(e) => setLon(e.target.value)}
            aria-label="Longitude"
          />
          <button type="submit" className={styles.primary}>
            Set
          </button>
        </form>
      )}

      {geoError && (
        <p className={styles.error} role="alert">
          {geoError}
        </p>
      )}
    </div>
  );
}
