import { Card } from '../common/Card';
import { compassPoint } from '../../domain/geo';
import { ktToMs, ktToKmh, round } from '../../domain/units';
import type { Wind } from '../../domain/types';
import styles from './WindCompass.module.css';

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

export function WindCompass({ wind }: { wind: Wind }) {
  const hasDir = wind.dirDeg != null && !wind.calm;
  const driftDeg = wind.dirDeg != null ? (wind.dirDeg + 180) % 360 : null;

  // Wind blows FROM dirDeg TO driftDeg; arrow tip at the drift end (direction of travel).
  const src = wind.dirDeg != null ? pt(wind.dirDeg, R) : null;
  const dst = driftDeg != null ? pt(driftDeg, R) : null;
  const head =
    driftDeg != null
      ? (() => {
          const tip = pt(driftDeg, R);
          const baseC = pt(driftDeg, R - 16);
          const p = { x: Math.cos(rad(driftDeg)), y: Math.sin(rad(driftDeg)) }; // perpendicular
          return `${tip.x},${tip.y} ${baseC.x + p.x * 8},${baseC.y + p.y * 8} ${baseC.x - p.x * 8},${baseC.y - p.y * 8}`;
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
    <Card title="Wind">
      <div className={styles.layout}>
        <svg viewBox="0 0 200 200" className={styles.svg} role="img" aria-label="Wind direction compass">
          <circle cx={CX} cy={CY} r={R} className={styles.ring} />
          {Array.from({ length: 12 }, (_, i) => i * 30).map((d) => {
            const o = pt(d, R);
            const inn = pt(d, R - 7);
            return <line key={d} x1={o.x} y1={o.y} x2={inn.x} y2={inn.y} className={styles.tick} />;
          })}
          {CARDINALS.map(({ d, l }) => {
            const p = pt(d, R - 18);
            return (
              <text key={l} x={p.x} y={p.y} className={styles.card} dominantBaseline="central">
                {l}
              </text>
            );
          })}

          {varArc && <path d={varArc} className={styles.varArc} />}

          {hasDir && src && dst && (
            <>
              <line x1={src.x} y1={src.y} x2={dst.x} y2={dst.y} className={styles.arrow} />
              {head && <polygon points={head} className={styles.headFill} />}
              <circle cx={src.x} cy={src.y} r={4} className={styles.srcDot} />
            </>
          )}
          <circle cx={CX} cy={CY} r={3} className={styles.center} />
          {wind.calm && (
            <text x={CX} y={CY} className={styles.calm} textAnchor="middle" dominantBaseline="central">
              CALM
            </text>
          )}
          {!wind.calm && wind.dirDeg == null && (
            <text x={CX} y={CY} className={styles.calm} textAnchor="middle" dominantBaseline="central">
              VRB
            </text>
          )}
        </svg>

        <div className={styles.facts}>
          <div className={styles.speedRow}>
            <span className={styles.speed}>{round(wind.speedKt)}</span>
            <span className={styles.speedUnit}>kt</span>
            <span className={styles.speedAlt}>
              {round(ktToMs(wind.speedKt), 1)} m/s · {round(ktToKmh(wind.speedKt), 1)} km/h
            </span>
          </div>
          {wind.gustKt != null && (
            <p className={styles.gust}>Gusts to {round(wind.gustKt)} kt</p>
          )}
          <dl className={styles.dirs}>
            <div>
              <dt>From</dt>
              <dd>{wind.dirDeg != null ? `${wind.dirDeg}° ${compassPoint(wind.dirDeg)}` : 'Variable'}</dd>
            </div>
            <div>
              <dt>Drifts toward</dt>
              <dd>{driftDeg != null ? `${driftDeg}° ${compassPoint(driftDeg)}` : '—'}</dd>
            </div>
          </dl>
          {wind.varFromDeg != null && wind.varToDeg != null && (
            <p className={styles.varNote}>
              Direction varying {wind.varFromDeg}°–{wind.varToDeg}°.
            </p>
          )}
        </div>
      </div>

      <p className={styles.advice}>
        {wind.calm
          ? 'Winds are calm — direction is not a concern for your route.'
          : wind.dirDeg != null
            ? `Tip: fly outbound toward ${wind.dirDeg}° (${compassPoint(wind.dirDeg)}) — into the wind — and return with the wind toward ${driftDeg}° (${compassPoint(driftDeg!)}). The harder leg is then flown on a fresher battery.`
            : 'Wind direction is variable — plan for shifting drift in all directions.'}
      </p>
    </Card>
  );
}
