import styles from './App.module.css';
import { ReloadPrompt } from './components/ReloadPrompt/ReloadPrompt';

const VERSION = import.meta.env.VITE_APP_VERSION ?? 'dev';

export function App() {
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.title}>Drone&nbsp;Weather</h1>
        <p className={styles.tagline}>Pre-flight weather decision support</p>
      </header>

      <main className={styles.main}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Scaffold ready</h2>
          <p>
            The project skeleton (Vite + React + TypeScript, PWA, tests, CI) is in place.
            The weather-brief features are being built against{' '}
            <code>docs/spec.md</code> — wind, vertical hazard analyzer, icing, and a
            transparent risk summary.
          </p>
        </section>
      </main>

      <footer className={styles.footer}>
        <p className={styles.disclaimer}>
          <strong>Decision support only — not a legal flight authorization.</strong> Always
          verify the raw METAR, apply your own aircraft limits, and check local regulations,
          airspace, and NOTAMs before flying.
        </p>
        <p className={styles.version}>build {VERSION}</p>
      </footer>

      <ReloadPrompt />
    </div>
  );
}
