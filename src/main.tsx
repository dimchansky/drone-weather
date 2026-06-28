import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './global.css';

// Apply persisted theme before first paint to prevent a flash of the wrong theme.
(() => {
  try {
    const raw = localStorage.getItem('drone-weather-settings');
    if (raw) {
      const { state } = JSON.parse(raw);
      if (state?.theme && state.theme !== 'auto') {
        document.documentElement.dataset.theme = state.theme;
      }
    }
  } catch {
    /* ignore */
  }
})();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
