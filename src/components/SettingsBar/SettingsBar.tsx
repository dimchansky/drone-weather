import { useSettingsStore } from '../../store/settingsStore';
import styles from './SettingsBar.module.css';

export function SettingsBar() {
  const { windUnit, altUnit, theme, setWindUnit, setAltUnit, setTheme } = useSettingsStore();

  return (
    <div className={styles.bar}>
      <label className={styles.field}>
        <span>Wind</span>
        <select value={windUnit} onChange={(e) => setWindUnit(e.target.value as never)}>
          <option value="ms">m/s</option>
          <option value="kt">kt</option>
          <option value="kmh">km/h</option>
        </select>
      </label>
      <label className={styles.field}>
        <span>Altitude</span>
        <select value={altUnit} onChange={(e) => setAltUnit(e.target.value as never)}>
          <option value="m">m</option>
          <option value="ft">ft</option>
        </select>
      </label>
      <label className={styles.field}>
        <span>Theme</span>
        <select value={theme} onChange={(e) => setTheme(e.target.value as never)}>
          <option value="auto">Auto</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
    </div>
  );
}
