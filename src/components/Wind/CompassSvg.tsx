// The wind compass SVG, shared by the dashboard Wind tile and the (retired-from-page, kept
// in-tree) WindCompass card. Drawn as a small instrument: face with an inner rim, cardinal
// letters near the edge, a glowing FROM→drift arrow with a sleek head, and a pivot hub.
// Renders in a 200×200 viewBox; the caller sizes it via `className`. Handles CALM/VRB states.

import type { Wind } from '../../domain/types';
import styles from './CompassSvg.module.css';

const CX = 100;
const CY = 100;
const R = 78;
const rad = (deg: number) => (deg * Math.PI) / 180;
const pt = (deg: number, r: number) => ({
  x: CX + r * Math.sin(rad(deg)),
  y: CY - r * Math.cos(rad(deg)),
});

const CARDINALS = [
  { d: 0, l: 'N' },
  { d: 90, l: 'E' },
  { d: 180, l: 'S' },
  { d: 270, l: 'W' },
];

export function CompassSvg({ wind, className }: { wind: Wind; className?: string }) {
  const hasDir = wind.dirDeg != null && !wind.calm;
  const driftDeg = wind.dirDeg != null ? (wind.dirDeg + 180) % 360 : null;

  // Wind blows FROM dirDeg TO driftDeg; arrow tip at the drift end (direction of travel).
  // The line stops short of the tip so the head stays crisp.
  const src = wind.dirDeg != null ? pt(wind.dirDeg, R - 4) : null;
  const lineEnd = driftDeg != null ? pt(driftDeg, R - 14) : null;
  const head =
    driftDeg != null
      ? (() => {
          const tip = pt(driftDeg, R - 1);
          const baseC = pt(driftDeg, R - 17);
          const p = { x: Math.cos(rad(driftDeg)), y: Math.sin(rad(driftDeg)) }; // perpendicular
          return `${tip.x},${tip.y} ${baseC.x + p.x * 6.5},${baseC.y + p.y * 6.5} ${baseC.x - p.x * 6.5},${baseC.y - p.y * 6.5}`;
        })()
      : null;

  let varArc: string | null = null;
  if (wind.varFromDeg != null && wind.varToDeg != null) {
    const a = pt(wind.varFromDeg, R);
    const b = pt(wind.varToDeg, R);
    const diff = (wind.varToDeg - wind.varFromDeg + 360) % 360;
    varArc = `M ${a.x} ${a.y} A ${R} ${R} 0 ${diff > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
  }

  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-label="Wind direction compass">
      <circle cx={CX} cy={CY} r={R} className={styles.ring} />
      <circle cx={CX} cy={CY} r={R - 6} className={styles.rim} />
      {Array.from({ length: 12 }, (_, i) => i * 30).map((d) => {
        const o = pt(d, R);
        const inn = pt(d, R - 7);
        return <line key={d} x1={o.x} y1={o.y} x2={inn.x} y2={inn.y} className={styles.tick} />;
      })}
      {CARDINALS.map(({ d, l }) => {
        const p = pt(d, R - 15);
        return (
          <text
            key={l}
            x={p.x}
            y={p.y}
            className={l === 'N' ? styles.cardNorth : styles.card}
            dominantBaseline="central"
          >
            {l}
          </text>
        );
      })}

      {varArc && <path d={varArc} className={styles.varArc} />}

      {hasDir && src && lineEnd && (
        <>
          <line x1={src.x} y1={src.y} x2={lineEnd.x} y2={lineEnd.y} className={styles.arrowGlow} />
          <line x1={src.x} y1={src.y} x2={lineEnd.x} y2={lineEnd.y} className={styles.arrow} />
          {head && <polygon points={head} className={styles.headFill} />}
          <circle cx={src.x} cy={src.y} r={4} className={styles.srcDot} />
        </>
      )}
      {/* Pivot hub — an instrument axle rather than a bare dot. */}
      <circle cx={CX} cy={CY} r={5} className={styles.hub} />
      <circle cx={CX} cy={CY} r={1.8} className={styles.hubPin} />
      {wind.calm && (
        <text x={CX} y={CY + 26} className={styles.calm} textAnchor="middle" dominantBaseline="central">
          CALM
        </text>
      )}
      {!wind.calm && wind.dirDeg == null && (
        <text x={CX} y={CY + 26} className={styles.calm} textAnchor="middle" dominantBaseline="central">
          VRB
        </text>
      )}
    </svg>
  );
}
