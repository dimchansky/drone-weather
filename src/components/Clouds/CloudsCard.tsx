import { Card } from '../common/Card';
import { resolveCloudBase, ceilingFt, COVER_OKTAS, type ResolvedCloudBase } from '../../domain/clouds';
import { fmtAltFt, fmtAltBothFt } from '../../utils/format';
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

export function CloudsCard({ brief }: { brief: Brief }) {
  const { metar } = brief;
  const altUnit = useSettingsStore((s) => s.altUnit);
  // Recompute the resolved base so its note + value render in the selected altitude unit (the
  // numeric base/kind are unit-independent and match brief.cloudBase used elsewhere).
  const cloudBase = resolveCloudBase(metar, brief.profile, altUnit);
  const ceil = ceilingFt(metar.clouds);

  return (
    <Card title="Cloud & ceiling" collapsible defaultOpen={false}>
      {metar.cavok && (
        <p className={styles.cavok}>CAVOK — no significant cloud below {fmtAltFt(5000, altUnit)} AGL.</p>
      )}

      {metar.clouds.length > 0 ? (
        <ul className={styles.layers}>
          {metar.clouds.map((l, i) => (
            <li key={i}>
              <span className={styles.cover}>{l.cover}</span>
              <span className={styles.base}>
                {l.baseFt != null
                  ? fmtAltBothFt(l.baseFt, altUnit)
                  : l.cover === 'VV'
                    ? 'sky obscured'
                    : 'clear'}
              </span>
              <span className={styles.okta}>
                {COVER_OKTAS[l.cover] ?? ''}
                {l.cb ? ' · CB' : l.tcu ? ' · TCU' : ''}
              </span>
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
      <p className={styles.note}>{cloudBase.note}</p>
    </Card>
  );
}
