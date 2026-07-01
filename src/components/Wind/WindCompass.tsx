import { Card } from '../common/Card';
import { compassPoint } from '../../domain/geo';
import { routeAdvice } from '../../domain/windAdvice';
import { ktToMs, ktToKmh, round, fmtWindSpeed } from '../../domain/units';
import { useSettingsStore } from '../../store/settingsStore';
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

  // Primary wind unit follows the user's setting; the other two are shown as secondary.
  const windUnit = useSettingsStore((s) => s.windUnit);
  const parts: Record<'kt' | 'ms' | 'kmh', string> = {
    kt: `${round(wind.speedKt)} kt`,
    ms: `${round(ktToMs(wind.speedKt), 1)} m/s`,
    kmh: `${round(ktToKmh(wind.speedKt), 1)} km/h`,
  };
  const order: ('kt' | 'ms' | 'kmh')[] =
    windUnit === 'ms' ? ['ms', 'kt', 'kmh'] : windUnit === 'kmh' ? ['kmh', 'kt', 'ms'] : ['kt', 'ms', 'kmh'];
  const primaryNum =
    windUnit === 'ms'
      ? round(ktToMs(wind.speedKt), 1)
      : windUnit === 'kmh'
        ? round(ktToKmh(wind.speedKt), 1)
        : round(wind.speedKt);
  const primaryUnit = windUnit === 'ms' ? 'm/s' : windUnit === 'kmh' ? 'km/h' : 'kt';
  const secondary = order.slice(1).map((u) => parts[u]).join(' · ');

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
            <span className={styles.speed}>{primaryNum}</span>
            <span className={styles.speedUnit}>{primaryUnit}</span>
            <span className={styles.speedAlt}>{secondary}</span>
          </div>
          {wind.gustKt != null && (
            <p className={styles.gust}>Gusts to {fmtWindSpeed(wind.gustKt, windUnit)}</p>
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

      <p className={styles.advice}>{routeAdvice(wind)}</p>
    </Card>
  );
}
