import { describe, it, expect, vi, afterEach } from 'vitest';
import { APP_VERSION, fetchLatestVersion, reloadWithNewVersion } from './appVersion';

afterEach(() => vi.unstubAllGlobals());

describe('fetchLatestVersion', () => {
  it('reads version.json straight from the network (never from cache)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ version: 'abc1234.202610081200' })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchLatestVersion()).toBe('abc1234.202610081200');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/version\.json\?t=\d+$/);
    expect(init.cache).toBe('no-store');
  });

  it.each([
    ['a missing file', () => new Response('nope', { status: 404 })],
    ['not JSON', () => new Response('<html>')],
    ['no version field', () => new Response('{}')],
    ['a non-text version', () => new Response('{"version":5}')],
  ])('gives null for %s (no banner)', async (_name, make) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(make()));
    expect(await fetchLatestVersion()).toBeNull();
  });

  it('gives null when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    expect(await fetchLatestVersion()).toBeNull();
  });
});

describe('version stamp', () => {
  it('is baked in at build time', () => {
    expect(APP_VERSION).toBe('test-build');
  });

  it('reload goes to the same page with a changing query so the browser skips its cached copy', () => {
    const replace = vi.fn();
    vi.stubGlobal('window', { location: { pathname: '/OPR-List/', replace } });
    reloadWithNewVersion('abc1234.202610081200');
    expect(replace).toHaveBeenCalledWith('/OPR-List/?v=abc1234.202610081200');
  });
});
