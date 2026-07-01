import { Card } from '../common/Card';
import { InfoStrip } from '../common/InfoStrip';
import { resolveCloudBase, ceilingFt, type ResolvedCloudBase } from '../../domain/clouds';
import { DEFAULT_OPS_CEILING_M } from '../../domain/risk';
import { fmtAltFt, fmtAltBothFt } from '../../utils/format';
import {
  layerHeadline,
  layerRawTag,
  isCeilingCover,
  convectiveCallout,
  droneRelevanceLine,
} from './cloudText';
import { useSettingsStore } from '../../store/settingsStore';
import type { AltUnit } from '../../store/settingsStore';
import type { Brief } from '../../domain/brief';
import styles from './CloudsCard.module.css';

const SOURCE_TAG: Record<string, string> = {
  actual: 'reported',
  cavok: 'CAVOK lower bound',
  model: 'model · coarse',
  estimate: 'estimate · rough',
  'none-low': 'no significant low cloud',
  none: '—',
};

/** Display the resolved cloud base honestly: precise only for observations; ≈/~ for fallbacks. */
function renderCloudBase(cb: ResolvedCloudBase, altUnit: AltUnit): string {
  if (cb.baseFt == null || cb.baseM == null) return cb.kind === 'none-low' ? 'clear / high base' : '—';
  const primary = `${fmtAltFt(cb.baseFt, altUnit)} AGL`;
  switch (cb.kind) {
    case 'actual':
      return primary;
    case 'cavok':
      return `≥ ${primary}`;
    case 'model':
      return `~${primary}`;
    case 'estimate':
      return `≈ ${primary}`;
    case 'none-low':
      return 'clear / high base';
    default:
      return '—';
  }
}

/** Plain height for a layer: "1158 m (3800 ft) above ground", or an honest fallback. */
function layerHeight(baseFt: number | null, cover: string, altUnit: AltUnit): string {
  if (baseFt != null) return `${fmtAltBothFt(baseFt, altUnit)} above ground`;
  return cover === 'VV' ? 'height unknown' : '';
}

export function CloudsCard({ brief }: { brief: Brief }) {
  const { metar } = brief;
  const altUnit = useSettingsStore((s) => s.altUnit);
  // Recompute the resolved base so its note + value render in the selected altitude unit (the
  // numeric base/kind are unit-independent and match brief.cloudBase used elsewhere).
  const cloudBase = resolveCloudBase(metar, brief.profile, altUnit);
  const ceil = ceilingFt(metar.clouds);
  const callouts = convectiveCallout(metar.clouds, altUnit);
  const relevance = droneRelevanceLine(cloudBase, DEFAULT_OPS_CEILING_M, altUnit);

  return (
    <Card title="Cloud & ceiling" collapsible defaultOpen={false}>
      {/* Dangerous cloud types, explained + highlighted (CB drives the verdict; TCU is card-only). */}
      {callouts.map((c, i) => (
        <InfoStrip key={i} severity={c.severity}>
          {c.text}
        </InfoStrip>
      ))}

      {metar.cavok && (
        <p className={styles.cavok}>CAVOK — no significant cloud below {fmtAltFt(5000, altUnit)} AGL.</p>
      )}

      {metar.clouds.length > 0 ? (
        <ul className={styles.layers}>
          {metar.clouds.map((l, i) => (
            <li key={i}>
              <div className={styles.layerMain}>
                <span>{layerHeadline(l.cover)}</span>
                {isCeilingCover(l.cover) && <span className={styles.ceilingTag}>ceiling</span>}
              </div>
              <div className={styles.layerMeta}>
                {layerHeight(l.baseFt, l.cover, altUnit) && (
                  <span className={styles.base}>{layerHeight(l.baseFt, l.cover, altUnit)}</span>
                )}
                <span className={styles.raw}>{layerRawTag(l)}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        !metar.cavok && <p className={styles.muted}>No cloud layers reported.</p>
      )}

      <dl className={styles.summary}>
        <div>
          <dt>Ceiling</dt>
          <dd>{ceil != null ? fmtAltBothFt(ceil, altUnit) : `none below ${fmtAltFt(1500, altUnit)}`}</dd>
        </div>
        <div>
          <dt>Cloud base ({SOURCE_TAG[cloudBase.kind] ?? '—'})</dt>
          <dd>{renderCloudBase(cloudBase, altUnit)}</dd>
        </div>
      </dl>
      {relevance && <p className={styles.relevance}>{relevance}</p>}
      <p className={styles.note}>
        Ceiling = the lowest broken/overcast layer you can’t climb through; cloud base = the lowest
        cloud bottom.
      </p>
      <p className={styles.note}>{cloudBase.note}</p>
    </Card>
  );
}
