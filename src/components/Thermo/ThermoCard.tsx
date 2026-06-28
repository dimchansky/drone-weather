import { Card } from '../common/Card';
import { rhFromDewPoint } from '../../domain/humidity';
import { round } from '../../domain/units';
import type { Metar } from '../../domain/types';
import styles from './ThermoCard.module.css';

export function ThermoCard({ metar }: { metar: Metar }) {
  const { tempC, dewpC } = metar;
  if (tempC == null) {
    return (
      <Card title="Temperature & moisture">
        <p className={styles.muted}>Temperature not reported.</p>
      </Card>
    );
  }
  const rh = dewpC != null ? round(rhFromDewPoint(tempC, dewpC)) : null;
  const spread = dewpC != null ? round(tempC - dewpC, 1) : null;

  const interp =
    spread == null
      ? 'Dew point not reported.'
      : spread > 5
        ? 'Large spread — relatively dry air; lower fog/condensation risk.'
        : spread >= 2
          ? 'Moderate spread — some moisture; watch for cloud/fog forming.'
          : 'Small spread — air near saturation; higher fog/cloud/moisture risk.';

  return (
    <Card title="Temperature & moisture">
      <dl className={styles.grid}>
        <div>
          <dt>Temperature</dt>
          <dd>{round(tempC, 1)} °C</dd>
        </div>
        <div>
          <dt>Dew point</dt>
          <dd>{dewpC != null ? `${round(dewpC, 1)} °C` : '—'}</dd>
        </div>
        <div>
          <dt>Rel. humidity</dt>
          <dd>{rh != null ? `${rh}%` : '—'}</dd>
        </div>
        <div>
          <dt>Spread</dt>
          <dd>{spread != null ? `${spread} °C` : '—'}</dd>
        </div>
      </dl>
      <p className={styles.interp}>{interp}</p>
      {metar.qnhHpa != null && <p className={styles.qnh}>QNH {metar.qnhHpa} hPa</p>}
    </Card>
  );
}
