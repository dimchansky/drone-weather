import { useSettingsStore } from '../../store/settingsStore';
import styles from './SettingsBar.module.css';

// Compact unit/theme controls that sit in the header's title row. The text labels hide on very
// narrow screens (CSS); the selects keep aria-labels so the controls stay named.
export function SettingsBar() {
  const { windUnit, altUnit, theme, setWindUnit, setAltUnit, setTheme } = useSettingsStore();

  return (
    <div className={styles.bar}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Wind</span>
        <select aria-label="Wind unit" value={windUnit} onChange={(e) => setWindUnit(e.target.value as never)}>
          <option value="ms">m/s</option>
          <option value="kt">kt</option>
          <option value="kmh">km/h</option>
        </select>
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Altitude</span>
        <select aria-label="Altitude unit" value={altUnit} onChange={(e) => setAltUnit(e.target.value as never)}>
          <option value="m">m</option>
          <option value="ft">ft</option>
        </select>
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Theme</span>
        <select aria-label="Theme" value={theme} onChange={(e) => setTheme(e.target.value as never)}>
          <option value="auto">Auto</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
    </div>
  );
}
