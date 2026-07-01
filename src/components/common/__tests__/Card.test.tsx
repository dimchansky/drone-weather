import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Card } from '../Card';

describe('Card', () => {
  it('renders children immediately and has no trigger when not collapsible', () => {
    render(<Card title="Plain">hello world</Card>);
    expect(screen.getByText('hello world')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('keeps children mounted (forceMount) behind a collapsed trigger, and opens on click', () => {
    render(
      <Card title="Raw data" collapsible defaultOpen={false}>
        verbatim text
      </Card>,
    );
    // Content is in the DOM even while collapsed (verification guarantee).
    expect(screen.getByText('verbatim text')).toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: /raw data/i });
    expect(trigger).toHaveAttribute('data-state', 'closed');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('data-state', 'open');
  });

  it('respects defaultOpen', () => {
    render(
      <Card title="Details" collapsible defaultOpen>
        body
      </Card>,
    );
    expect(screen.getByRole('button', { name: /details/i })).toHaveAttribute('data-state', 'open');
  });
});
