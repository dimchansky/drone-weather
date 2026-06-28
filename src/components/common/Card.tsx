import type { ReactNode } from 'react';
import styles from './Card.module.css';

interface CardProps {
  title?: string;
  accent?: string; // CSS color for the top accent border
  right?: ReactNode; // header right-side content
  children: ReactNode;
}

export function Card({ title, accent, right, children }: CardProps) {
  return (
    <section className={styles.card} style={accent ? { borderTopColor: accent } : undefined}>
      {title && (
        <header className={styles.head}>
          <h2 className={styles.title}>{title}</h2>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}
