import { useState } from 'react';
import { useLocationStore } from '../../store/locationStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useBriefStore } from '../../store/briefStore';
import { fmtCoord } from '../../utils/format';
import { parseLatitudeInput, parseLongitudeInput, parseCoordinatePair } from '../../utils/coords';
import styles from './LocationBar.module.css';

const EXAMPLE = 'Try: 54.6651, 25.2169';

/* Small stroke icons (Lucide outlines) so the action buttons read at a glance without emoji.
   Text labels stay visible at every width — icons alone would make Paste/Enter ambiguous. */
function Icon({ paths, circle }: { paths: string[]; circle?: [number, number, number] }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={15}
      height={15}
      className={styles.icon}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
      {circle && <circle cx={circle[0]} cy={circle[1]} r={circle[2]} />}
    </svg>
  );
}

const PinIcon = () => (
  <Icon
    paths={['M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0']}
    circle={[12, 10, 3]}
  />
);
const PasteIcon = () => (
  <Icon
    paths={[
      'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
      'M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z',
    ]}
  />
);
const EditIcon = () => (
  <Icon paths={['M12 20h9', 'M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z']} />
);
const RefreshIcon = () => (
  <Icon paths={['M3 12a9 9 0 0 1 15-6.7L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-15 6.7L3 16', 'M3 21v-5h5']} />
);

export function LocationBar() {
  const coord = useLocationStore((s) => s.coord);
  const source = useLocationStore((s) => s.source);
  const selectedIcao = useLocationStore((s) => s.selectedIcao);
  const setCoord = useLocationStore((s) => s.setCoord);
  const opsCeilingM = useSettingsStore((s) => s.opsCeilingM);
  const load = useBriefStore((s) => s.load);
  const status = useBriefStore((s) => s.status);

  const [manual, setManual] = useState(false);
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [paste, setPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const closeForms = () => {
    setManual(false);
    setPaste(false);
    setError(null);
  };

  const useGps = () => {
    setError(null);
    if (!('geolocation' in navigator)) {
      setError('Geolocation is not available on this device.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        closeForms();
        setCoord({ lat: pos.coords.latitude, lon: pos.coords.longitude }, 'gps');
      },
      (err) => {
        setLocating(false);
        setError(err.message || 'Could not get your location.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    // Accept both dot and comma decimals (mobile locale keyboards emit a comma).
    const la = parseLatitudeInput(lat);
    const lo = parseLongitudeInput(lon);
    if (la != null && lo != null) {
      setCoord({ lat: la, lon: lo }, 'manual');
      closeForms();
    } else {
      setError(`Enter a valid latitude (−90…90) and longitude (−180…180). ${EXAMPLE}`);
    }
  };

  /** Try to apply a pasted "lat, lon" pair; returns false if it doesn't parse. */
  const applyPair = (text: string): boolean => {
    const pair = parseCoordinatePair(text);
    if (!pair) return false;
    setCoord(pair, 'pasted');
    closeForms();
    return true;
  };

  const onPaste = async () => {
    setError(null);
    setManual(false);
    // Best effort: read the clipboard directly (one tap). Falls back to a paste field.
    try {
      const text = await navigator.clipboard?.readText?.();
      if (text && applyPair(text)) return;
      if (text) setPasteText(text); // prefill whatever was there for the user to fix
    } catch {
      /* clipboard unavailable or permission denied — use the field */
    }
    setPaste(true);
  };

  const submitPaste = (e: React.FormEvent) => {
    e.preventDefault();
    if (!applyPair(pasteText)) {
      setError(`Couldn't read coordinates from that text. Paste a "latitude, longitude" pair. ${EXAMPLE}`);
    }
  };

  const refresh = () => {
    if (coord) void load(coord, { selectedIcao, opsCeilingM, force: true });
  };
  const refreshing = status === 'loading';

  return (
    <div className={styles.bar}>
      <div className={styles.row}>
        <button className={styles.primary} onClick={useGps} disabled={locating}>
          <PinIcon />
          {locating ? 'Locating…' : 'My location'}
        </button>
        <button className={styles.ghost} onClick={onPaste}>
          <PasteIcon />
          Paste
        </button>
        <button
          className={styles.ghost}
          onClick={() => {
            setPaste(false);
            setError(null);
            setManual((m) => !m);
          }}
        >
          <EditIcon />
          {manual ? 'Cancel' : 'Enter'}
        </button>
        {coord && (
          <button className={styles.ghost} onClick={refresh} disabled={refreshing}>
            <RefreshIcon />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        )}
      </div>

      {coord && (
        <p className={styles.current}>
          {fmtCoord(coord.lat, coord.lon)} <span className={styles.src}>({source})</span>
        </p>
      )}

      {paste && (
        <form className={styles.manual} onSubmit={submitPaste}>
          <input
            type="text"
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Paste: 54.6651, 25.2169"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            aria-label="Paste coordinates"
          />
          <button type="submit" className={styles.primary}>
            Use
          </button>
        </form>
      )}

      {manual && (
        <form className={styles.manual} onSubmit={submitManual}>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Latitude"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            aria-label="Latitude"
          />
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
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

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
