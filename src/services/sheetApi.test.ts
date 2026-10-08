import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchPermits, isOutcomeUnknown, isApiError, addPermit, ApiError } from './sheetApi';
import { ParkingPermit } from '../types/parking';

const store = new Map<string, string>();
const markSynced = () => store.set('thai_overnight_last_synced_v1', new Date().toISOString());

const reply = (status: number, body: unknown, asText = false) =>
  new Response(asText ? String(body) : JSON.stringify(body), { status });

const permit: ParkingPermit = {
  id: 'A',
  createdAt: '2026-10-08T00:00:00.000Z',
  licensePlate: '1กข4590',
  province: 'กรุงเทพมหานคร',
  vehicleBrand: 'Toyota',
  vehicleColor: 'ขาว',
  parkingFloor: 'B1',
  startDate: '2026-10-08',
  endDate: '2026-10-08',
};

beforeEach(() => {
  // These tests are about the script calls themselves: keep the relay out of the way
  vi.stubEnv('VITE_PROXY_URL', '');
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const messageOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('expected a rejection');
};

describe('error messages', () => {
  it('404 before the app has ever reached the sheet: points at the Anyone setting', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(404, 'not found', true)));
    const err = await messageOf(fetchPermits());
    expect(err.message).toContain('HTTP 404');
    expect(err.message).toContain('Anyone');
  });

  it('404 after a successful sync: no permission hint (it would be wrong; the deployment works)', async () => {
    markSynced();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(404, 'not found', true)));
    const err = await messageOf(addPermit('tok', permit));
    expect(err.message).toContain('HTTP 404');
    expect(err.message).not.toContain('Anyone');
    expect(err.message).not.toContain('ทุกคน');
  });

  it('an unreadable reply gets the same treatment', async () => {
    markSynced();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(200, '<html>oops</html>', true)));
    const err = await messageOf(fetchPermits());
    expect(err.message).not.toContain('Anyone');
  });
});

describe('what counts as an unclear outcome', () => {
  it('lost replies and error statuses are unclear; answers from the script are definite', () => {
    expect(isOutcomeUnknown(new ApiError('network', 'x'))).toBe(true);
    expect(isOutcomeUnknown(new ApiError('server_error', 'x'))).toBe(true);
    expect(isOutcomeUnknown(new ApiError('unauthorized', 'x'))).toBe(false);
    expect(isOutcomeUnknown(new ApiError('bad_request', 'x'))).toBe(false);
    expect(isOutcomeUnknown(new Error('x'))).toBe(false);
  });

  it('a 404 / 500 reply to a write is unclear', async () => {
    markSynced();
    for (const status of [404, 500, 502]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(status, 'x', true)));
      const err = await messageOf(addPermit('tok', permit));
      expect(isApiError(err) && isOutcomeUnknown(err)).toBe(true);
    }
  });
});

describe('fetchPermits retry policy', () => {
  it('retries at once when the connection dropped quickly', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(reply(200, { status: 'success', data: [] }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchPermits()).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry at once after a timeout (the caller retries later)', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError'));
    vi.stubGlobal('fetch', fetchMock);
    const err = await messageOf(fetchPermits());
    expect(err.code).toBe('network');
    expect(err.timedOut).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('asks the script to skip its cache only for a fresh read', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(reply(200, { status: 'success', data: [] })));
    vi.stubGlobal('fetch', fetchMock);
    await fetchPermits();
    await fetchPermits(true);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('fresh=1');
    expect(String(fetchMock.mock.calls[1][0])).toContain('fresh=1');
  });
});

describe('relay (Cloudflare Worker) in front of the script', () => {
  const PROXY = 'https://relay.example.workers.dev';
  const SCRIPT_HOST = 'script.google.com';

  const load = async (proxy: string | null) => {
    vi.resetModules();
    vi.stubEnv('VITE_PROXY_URL', proxy ?? '');
    return import('./sheetApi');
  };
  const hostsCalled = (m: ReturnType<typeof vi.fn>) => m.mock.calls.map(([u]) => new URL(String(u)).host);
  const okList = () => reply(200, { status: 'success', data: [] });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('with no relay configured, only the script is called', async () => {
    const api = await load(null);
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(okList()));
    vi.stubGlobal('fetch', fetchMock);
    await api.fetchPermits();
    expect(hostsCalled(fetchMock)).toEqual([SCRIPT_HOST]);
  });

  it('goes through the relay first (same query, same body)', async () => {
    const api = await load(PROXY);
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(okList()));
    vi.stubGlobal('fetch', fetchMock);
    await api.fetchPermits(true);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${PROXY}?action=list&fresh=1`);
    await api.addPermit('tok', permit);
    expect(fetchMock.mock.calls[1][0]).toBe(PROXY);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ action: 'add', token: 'tok' });
    expect(hostsCalled(fetchMock)).toEqual(['relay.example.workers.dev', 'relay.example.workers.dev']);
  });

  it('falls back to the script when the relay cannot be reached, then keeps using the script for a while', async () => {
    vi.useFakeTimers();
    const api = await load(PROXY);
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      new URL(String(url)).host === SCRIPT_HOST ? Promise.resolve(okList()) : Promise.reject(new TypeError('relay down'))
    );
    vi.stubGlobal('fetch', fetchMock);

    await api.fetchPermits();
    expect(hostsCalled(fetchMock)).toEqual(['relay.example.workers.dev', SCRIPT_HOST]);

    fetchMock.mockClear();
    await api.fetchPermits();
    expect(hostsCalled(fetchMock)).toEqual([SCRIPT_HOST]); // cooldown: the relay is not tried first

    vi.setSystemTime(Date.now() + 2 * 60_000 + 1000);
    fetchMock.mockClear();
    await api.fetchPermits();
    expect(hostsCalled(fetchMock)[0]).toBe('relay.example.workers.dev'); // tried again after the cooldown
  });

  it('remembers which way the latest request travelled', async () => {
    const api = await load(PROXY);
    expect(api.getLastRoute()).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(okList())));
    await api.fetchPermits();
    expect(api.getLastRoute()).toBe('relay');

    const api2 = await load(PROXY);
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) =>
      new URL(String(url)).host === SCRIPT_HOST ? Promise.resolve(okList()) : Promise.reject(new TypeError('relay down'))
    ));
    await api2.fetchPermits();
    expect(api2.getLastRoute()).toBe('direct');

    const api3 = await load(null);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(okList())));
    await api3.fetchPermits();
    expect(api3.getLastRoute()).toBe('direct');
  });

  it('a relay error status (502/504) also falls back', async () => {
    const api = await load(PROXY);
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(new URL(String(url)).host === SCRIPT_HOST ? okList() : reply(502, { status: 'error', code: 'server_error' }))
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await api.fetchPermits()).toEqual([]);
    expect(hostsCalled(fetchMock)).toEqual(['relay.example.workers.dev', SCRIPT_HOST]);
  });

  it('a real answer from the script through the relay is final: no second request', async () => {
    const api = await load(PROXY);
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(reply(200, { status: 'error', code: 'invalid_password', message: 'รหัสผ่านไม่ถูกต้อง' }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const err = await messageOf(api.login('wrong'));
    expect(err.code).toBe('invalid_password');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('adding / editing / deleting may be sent on to the script after the relay failed (safe to repeat by id)', async () => {
    const api = await load(PROXY);
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      new URL(String(url)).host === SCRIPT_HOST ? Promise.resolve(okList()) : Promise.reject(new TypeError('relay down'))
    );
    vi.stubGlobal('fetch', fetchMock);
    await api.deletePermit('tok', 'A');
    expect(hostsCalled(fetchMock)).toEqual(['relay.example.workers.dev', SCRIPT_HOST]);
  });

  it('changing the password is never sent twice', async () => {
    const api = await load(PROXY);
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('relay down'));
    vi.stubGlobal('fetch', fetchMock);
    await messageOf(api.changePassword('tok', 'old', 'newer-pass'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(hostsCalled(fetchMock)).toEqual(['relay.example.workers.dev']);
  });
});
