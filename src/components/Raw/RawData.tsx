import { useState } from 'react';
import { Card } from '../common/Card';
import type { Brief } from '../../domain/brief';
import styles from './RawData.module.css';

export function RawData({ brief }: { brief: Brief }) {
  const [copied, setCopied] = useState(false);
  const text = [brief.metar.raw, brief.taf?.raw].filter(Boolean).join('\n\n');

  const copy = () => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <Card
      title="Raw data"
      right={
        <button className={styles.copy} onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      }
    >
      <pre className={styles.raw}>{brief.metar.raw || '(no raw METAR)'}</pre>
      {brief.taf && <pre className={styles.raw}>{brief.taf.raw}</pre>}
      <p className={styles.hint}>
        The raw report is always shown so you can verify the interpretation yourself.
      </p>
    </Card>
  );
}
