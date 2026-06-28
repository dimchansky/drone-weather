import { describe, it, expect, beforeEach } from 'vitest';
import { cachedFetchJson } from '../cache';

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data });

beforeEach(() => localStorage.clear());

describe('cachedFetchJson', () => {
  it('serves a fresh cache hit without re-fetching', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return ok({ n: calls });
    };
    const a = await cachedFetchJson('u', 1000, { fetchImpl, now: () => 1000 });
    const b = await cachedFetchJson('u', 1000, { fetchImpl, now: () => 1500 });
    expect(a).toEqual({ n: 1 });
    expect(b).toEqual({ n: 1 });
    expect(calls).toBe(1);
  });

  it('re-fetches once the TTL has elapsed', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return ok({ n: calls });
    };
    await cachedFetchJson('u', 1000, { fetchImpl, now: () => 1000 });
    const b = await cachedFetchJson('u', 1000, { fetchImpl, now: () => 3000 });
    expect(b).toEqual({ n: 2 });
    expect(calls).toBe(2);
  });

  it('falls back to a stale value when the network fails', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      if (calls === 1) return ok({ n: 1 });
      throw new Error('network down');
    };
    await cachedFetchJson('u', 1000, { fetchImpl, now: () => 1000 });
    const stale = await cachedFetchJson('u', 1, { fetchImpl, now: () => 99999 });
    expect(stale).toEqual({ n: 1 });
  });

  it('throws when the network fails and there is no cache', async () => {
    const fetchImpl = async () => {
      throw new Error('network down');
    };
    await expect(cachedFetchJson('u', 1000, { fetchImpl })).rejects.toThrow();
  });

  it('throws on a non-OK response with no cache', async () => {
    const fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}) });
    await expect(cachedFetchJson('u', 1000, { fetchImpl })).rejects.toThrow(/500/);
  });
});
