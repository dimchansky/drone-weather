import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { useNow } from '../useNow';

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-28T13:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('advances on its interval (fake timers, no real clock)', () => {
    const { result } = renderHook(() => useNow(1000));
    const t0 = result.current.getTime();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.getTime()).toBe(t0 + 60_000);
  });
});
