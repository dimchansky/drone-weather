import type { ReactNode } from 'react';
import * as Collapsible from '@radix-ui/react-collapsible';
import styles from './Card.module.css';

interface CardProps {
  title?: string;
  accent?: string; // CSS color for the top accent border
  right?: ReactNode; // header right-side content
  children: ReactNode;
  collapsible?: boolean; // render a tap-to-toggle disclosure
  defaultOpen?: boolean; // only meaningful when collapsible (default: collapsed)
}

export function Card({ title, accent, right, children, collapsible, defaultOpen = false }: CardProps) {
  const style = accent ? { borderTopColor: accent } : undefined;

  if (collapsible) {
    // Content uses `forceMount` so children stay in the DOM in both states (hidden via CSS when
    // closed). This keeps the raw METAR always present/verbatim while still collapsed by default.
    return (
      <Collapsible.Root defaultOpen={defaultOpen} asChild>
        <section className={styles.card} style={style}>
          <header className={styles.head}>
            <h2 className={styles.title}>
              <Collapsible.Trigger className={styles.trigger}>
                <span className={styles.chevron} aria-hidden>
                  ▸
                </span>
                {title}
              </Collapsible.Trigger>
            </h2>
            {right}
          </header>
          <Collapsible.Content forceMount className={styles.content}>
            {children}
          </Collapsible.Content>
        </section>
      </Collapsible.Root>
    );
  }

  return (
    <section className={styles.card} style={style}>
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
