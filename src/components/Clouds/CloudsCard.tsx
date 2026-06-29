import { Card } from '../common/Card';
import { ceilingFt, COVER_OKTAS, type ResolvedCloudBase } from '../../domain/clouds';
import { fmtAltBoth } from '../../utils/format';
import { ftToM, round } from '../../domain/units';
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
function renderCloudBase(cb: ResolvedCloudBase): string {
  if (cb.baseM == null) return '—';
  const m = round(cb.baseM);
  switch (cb.kind) {
    case 'actual':
      return `${m} m AGL`;
    case 'cavok':
      return `≥ ${m} m AGL`;
    case 'model':
      return `~${m} m AGL`;
    case 'estimate':
      return `≈ ${m} m AGL`;
    case 'none-low':
      return 'clear / high base';
    default:
      return '—';
  }
}

export function CloudsCard({ brief }: { brief: Brief }) {
  const { metar, cloudBase } = brief;
  const ceil = ceilingFt(metar.clouds);

  return (
    <Card title="Cloud & ceiling">
      {metar.cavok && <p className={styles.cavok}>CAVOK — no significant cloud below 5000 ft AGL.</p>}

      {metar.clouds.length > 0 ? (
        <ul className={styles.layers}>
          {metar.clouds.map((l, i) => (
            <li key={i}>
              <span className={styles.cover}>{l.cover}</span>
              <span className={styles.base}>
                {l.baseFt != null
                  ? fmtAltBoth(ftToM(l.baseFt))
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
          <dd>{ceil != null ? fmtAltBoth(ftToM(ceil)) : 'none below 1500 ft'}</dd>
        </div>
        <div>
          <dt>Cloud base ({SOURCE_TAG[cloudBase.kind] ?? '—'})</dt>
          <dd>{renderCloudBase(cloudBase)}</dd>
        </div>
      </dl>
      <p className={styles.note}>{cloudBase.note}</p>
    </Card>
  );
}
