import { useRegisterSW } from 'virtual:pwa-register/react';
import styles from './ReloadPrompt.module.css';

export function ReloadPrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className={styles.toast} role="status" aria-live="polite">
      <span>A new version is available.</span>
      <button className={styles.reload} onClick={() => updateServiceWorker(true)}>
        Reload
      </button>
    </div>
  );
}
