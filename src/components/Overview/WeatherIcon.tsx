// Inline SVG weather icons for the dashboard (no external assets). Stroke-based, 24×24 viewBox,
// colored only through CSS-module classes that reference theme tokens, so they follow dark/light
// automatically. Path data follows the familiar Lucide/Feather outlines.

import type { ConditionIcon } from '../../domain/currentConditions';
import styles from './WeatherIcon.module.css';

const CLOUD = 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z';
// Cloud with an open top-right shoulder so a small sun/moon can peek out behind it.
const CLOUD_SMALL = 'M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z';
const CLOUD_RAISED = 'M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242';
/** Crescent path (24×24) — also reused by the Daylight tile's night arc. */
export const MOON_PATH = 'M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z';
const MOON = MOON_PATH;

const SUN_RAYS = [
  'M12 2v2', 'M12 20v2', 'm4.93 4.93 1.41 1.41', 'm17.66 17.66 1.41 1.41',
  'M2 12h2', 'M20 12h2', 'm6.34 17.66-1.41 1.41', 'm19.07 4.93-1.41 1.41',
];
const SUN_RAYS_SMALL = ['M12 2v2', 'm4.93 4.93 1.41 1.41', 'M20 12h2', 'm19.07 4.93-1.41 1.41'];

function paths(icon: ConditionIcon) {
  switch (icon) {
    case 'sun':
      return (
        <>
          <circle cx="12" cy="12" r="4" className={styles.sun} />
          {SUN_RAYS.map((d) => <path key={d} d={d} className={styles.sun} />)}
        </>
      );
    case 'moon':
      return <path d={MOON} className={styles.moon} />;
    case 'cloud':
      return <path d={CLOUD} className={styles.cloud} />;
    case 'cloud-sun':
      return (
        <>
          {SUN_RAYS_SMALL.map((d) => <path key={d} d={d} className={styles.sun} />)}
          <path d="M15.947 12.65a4 4 0 0 0-5.925-4.128" className={styles.sun} />
          <path d={CLOUD_SMALL} className={styles.cloud} />
        </>
      );
    case 'cloud-moon':
      return (
        <>
          <path d="M10.083 9A6.002 6.002 0 0 1 16 4a4.243 4.243 0 0 0 6 6 6 6 0 0 1-3 5.197" className={styles.moon} />
          <path d={CLOUD_SMALL} className={styles.cloud} />
        </>
      );
    case 'rain':
      return (
        <>
          <path d={CLOUD_RAISED} className={styles.cloud} />
          <path d="M16 14v6" className={styles.drop} />
          <path d="M8 14v6" className={styles.drop} />
          <path d="M12 16v6" className={styles.drop} />
        </>
      );
    case 'snow':
      return (
        <>
          <path d={CLOUD_RAISED} className={styles.cloud} />
          {['M8 15h.01', 'M8 19h.01', 'M12 17h.01', 'M12 21h.01', 'M16 15h.01', 'M16 19h.01'].map(
            (d) => <path key={d} d={d} className={styles.flake} />,
          )}
        </>
      );
    case 'thunder':
      return (
        <>
          <path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973" className={styles.cloud} />
          <path d="m13 12-3 5h4l-3 5" className={styles.bolt} />
        </>
      );
    case 'fog':
      return (
        <>
          <path d={CLOUD_RAISED} className={styles.cloud} />
          <path d="M16 17H7" className={styles.fogLine} />
          <path d="M17 21H9" className={styles.fogLine} />
        </>
      );
  }
}

export function WeatherIcon({
  icon,
  label,
  size = 48,
}: {
  icon: ConditionIcon;
  label: string;
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={styles.icon}
      role="img"
      aria-label={label}
    >
      {paths(icon)}
    </svg>
  );
}
