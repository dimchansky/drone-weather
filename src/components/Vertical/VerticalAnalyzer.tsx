import { useState } from 'react';
import { Card } from '../common/Card';
import { SEVERITY_VAR } from '../../utils/severity';
import { maxSeverity } from '../../domain/severity';
import { detectInversion } from '../../domain/profile';
import { fmtAlt } from '../../utils/format';
import { round } from '../../domain/units';
import { useSettingsStore } from '../../store/settingsStore';
import type { Brief } from '../../domain/brief';
import type { Severity } from '../../domain/types';
import { altitudeTicks } from './ticks';
import styles from './VerticalAnalyzer.module.css';

const W = 320;
const H = 286;
const COL_L = 72;
const COL_R = 248;
const TOP = 14;
const BOTTOM = 250;

const ICING_LEGEND: { sev: Severity; label: string }[] = [
  { sev: 'GOOD', label: 'Low' },
  { sev: 'CAUTION', label: 'Moderate' },
  { sev: 'HIGH', label: 'High' },
  { sev: 'NOFLY', label: 'Severe' },
];

export function VerticalAnalyzer({ brief }: { brief: Brief }) {
  const altUnit = useSettingsStore((s) => s.altUnit);
  const opsCeilingM = useSettingsStore((s) => s.opsCeilingM);
  const [full, setFull] = useState(false);
  const maxAlt = full ? 1000 : 150;

  const levels = brief.icing.levels.filter((l) => l.altM <= maxAlt);
  const yFor = (alt: number) => BOTTOM - (alt / maxAlt) * (BOTTOM - TOP);

  // Label only a range-appropriate subset (bands still use every level); look up temps by altitude.
  const byAlt = new Map(brief.icing.levels.map((l) => [l.altM, l]));
  const ticks = altitudeTicks(maxAlt);
  const inversion = detectInversion(brief.icing.levels);

  const bands = levels.slice(0, -1).map((lo, i) => {
    const hi = levels[i + 1];
    const yTop = yFor(hi.altM);
    const yBot = yFor(lo.altM);
    return {
      key: lo.altM,
      y: yTop,
      h: yBot - yTop,
      color: SEVERITY_VAR[maxSeverity([lo.severity, hi.severity])],
    };
  });

  const baseM = brief.cloudBase.baseM;
  const showBase = baseM != null && baseM > 0 && baseM <= maxAlt;
  const showOps = opsCeilingM <= maxAlt;

  return (
    <Card
      title="Vertical hazard analyzer"
      right={
        <button className={styles.toggle} onClick={() => setFull((f) => !f)}>
          {full ? '0–150 m' : '0–1000 m'}
        </button>
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} role="img" aria-label="Vertical hazard profile">
        {bands.map((b) => (
          <rect key={b.key} x={COL_L} y={b.y} width={COL_R - COL_L} height={b.h} fill={b.color} className={styles.band} />
        ))}
        <rect x={COL_L} y={TOP} width={COL_R - COL_L} height={BOTTOM - TOP} className={styles.colOutline} />

        {ticks.map((altM) => {
          const l = byAlt.get(altM);
          if (!l) return null;
          const y = yFor(altM);
          return (
            <g key={altM}>
              <line x1={COL_L - 4} y1={y} x2={COL_L} y2={y} className={styles.tick} />
              <text x={COL_L - 8} y={y} className={styles.axisLabel} textAnchor="end" dominantBaseline="central">
                {fmtAlt(altM, altUnit)}
              </text>
              <text x={COL_R + 8} y={y} className={styles.tempLabel} dominantBaseline="central">
                {round(l.tempC, 1)}°
              </text>
            </g>
          );
        })}

        {showOps && (
          <g>
            <line x1={COL_L} y1={yFor(opsCeilingM)} x2={COL_R} y2={yFor(opsCeilingM)} className={styles.ops} />
            <text x={COL_L + 4} y={yFor(opsCeilingM) - 4} className={styles.opsLabel}>
              ops {fmtAlt(opsCeilingM, altUnit)}
            </text>
          </g>
        )}
        {showBase && (
          <g>
            <line x1={COL_L} y1={yFor(baseM)} x2={COL_R} y2={yFor(baseM)} className={styles.base} />
            <text x={COL_R - 4} y={yFor(baseM) - 4} className={styles.baseLabel} textAnchor="end">
              ☁ base
            </text>
          </g>
        )}
      </svg>

      <div className={styles.legend}>
        {ICING_LEGEND.map((x) => (
          <span key={x.sev} className={styles.legItem}>
            <span className={styles.swatch} style={{ background: SEVERITY_VAR[x.sev] }} /> {x.label}
          </span>
        ))}
      </div>

      {inversion && (
        <p className={styles.inversion}>
          Low-level temperature inversion: temperature rises to ~{round(inversion.topM)} m before
          falling (model).
        </p>
      )}
      {!showBase && baseM != null && baseM > maxAlt && (
        <p className={styles.note}>Cloud base (~{round(baseM)} m) is above the shown range.</p>
      )}
      <p className={styles.note}>
        Colours show icing risk by altitude; temperatures on the right. {brief.profile.note}
      </p>
    </Card>
  );
}
