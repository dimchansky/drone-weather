import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cachedFetchJson, FetchError } from '../cache';

const ok = (data: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(data) });
const raw = (status: number, body: string, isOk = status >= 200 && status < 300) => ({
  ok: isOk,
  status,
  text: async () => body,
});

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('cachedFetchJson — caching', () => {
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
});

describe('cachedFetchJson — defensive parsing', () => {
  it('resolves to undefined for an empty body (HTTP 204)', async () => {
    const fetchImpl = async () => raw(204, '');
    expect(await cachedFetchJson('u', 1000, { fetchImpl })).toBeUndefined();
  });

  it('resolves to undefined for a whitespace-only 200 body', async () => {
    const fetchImpl = async () => raw(200, '   \n');
    expect(await cachedFetchJson('u', 1000, { fetchImpl })).toBeUndefined();
  });

  it('throws a FetchError (with status + preview) on a non-OK response', async () => {
    const fetchImpl = async () => raw(500, 'upstream boom');
    await expect(cachedFetchJson('u', 1000, { fetchImpl })).rejects.toMatchObject({
      name: 'FetchError',
      status: 500,
      bodyPreview: 'upstream boom',
    });
  });

  it('throws a FetchError on a non-JSON body instead of "Unexpected end of JSON input"', async () => {
    const fetchImpl = async () => raw(200, '<!doctype html><html>oops</html>');
    await expect(cachedFetchJson('u', 1000, { fetchImpl })).rejects.toBeInstanceOf(FetchError);
    await expect(cachedFetchJson('u', 1000, { fetchImpl })).rejects.toMatchObject({
      status: 200,
      message: expect.stringMatching(/not valid JSON/),
    });
  });
});
