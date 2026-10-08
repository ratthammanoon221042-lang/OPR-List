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
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

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
