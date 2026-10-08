import { describe, it, expect, vi, afterEach } from 'vitest';
import worker from './worker.js';

const handle = (request: Request, env: Record<string, string>) => worker.fetch(request, env);

const SCRIPT = 'https://script.google.com/macros/s/TEST/exec';
const env = { APPS_SCRIPT_URL: SCRIPT };
const PAGES = 'https://ratthammanoon221042-lang.github.io';

const upstreamOk = (body: unknown = { status: 'success' }) =>
  vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(body), { status: 200 })));

afterEach(() => vi.unstubAllGlobals());

const get = (qs = '', headers: Record<string, string> = {}) =>
  handle(new Request(`https://proxy.example/${qs}`, { headers }), env);

const post = (body: unknown, headers: Record<string, string> = {}) =>
  handle(new Request('https://proxy.example/', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers }), env);

describe('who may call', () => {
  it('refuses a browser page from another site', async () => {
    const fetchMock = upstreamOk();
    vi.stubGlobal('fetch', fetchMock);
    const res = await get('?action=list', { Origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers the app\'s own origin with CORS headers for exactly that origin', async () => {
    vi.stubGlobal('fetch', upstreamOk());
    const res = await get('?action=ping', { Origin: PAGES });
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(PAGES);
  });

  it('allows a plain address-bar / curl test (no Origin) without CORS headers', async () => {
    vi.stubGlobal('fetch', upstreamOk());
    const res = await get('?action=ping');
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('ALLOWED_ORIGINS can be changed from the Cloudflare dashboard', async () => {
    vi.stubGlobal('fetch', upstreamOk());
    const res = await handle(new Request('https://proxy.example/?action=ping', { headers: { Origin: 'https://my.site' } }), {
      ...env,
      ALLOWED_ORIGINS: 'https://my.site, https://other.site',
    });
    expect(res.status).toBe(200);
  });

  it('answers a preflight', async () => {
    const res = await handle(new Request('https://proxy.example/', { method: 'OPTIONS', headers: { Origin: PAGES } }), env);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('rejects other methods', async () => {
    vi.stubGlobal('fetch', upstreamOk());
    const res = await handle(new Request('https://proxy.example/', { method: 'DELETE' }), env);
    expect(res.status).toBe(405);
  });
});

describe('what it forwards', () => {
  it('GET list goes to the fixed script URL only; the caller cannot choose another target', async () => {
    const fetchMock = upstreamOk({ status: 'success', data: [] });
    vi.stubGlobal('fetch', fetchMock);
    const res = await get('?action=list&url=https://evil.example/&x=1');
    expect(await res.json()).toEqual({ status: 'success', data: [] });
    const [target] = fetchMock.mock.calls[0];
    expect(String(target)).toBe(`${SCRIPT}?action=list`);
  });

  it('passes fresh=1 only for list', async () => {
    const fetchMock = upstreamOk();
    vi.stubGlobal('fetch', fetchMock);
    await get('?action=list&fresh=1');
    await get('?action=ping&fresh=1');
    expect(String(fetchMock.mock.calls[0][0])).toContain('fresh=1');
    expect(String(fetchMock.mock.calls[1][0])).not.toContain('fresh=1');
  });

  it('refuses unknown GET and POST actions without calling Google', async () => {
    const fetchMock = upstreamOk();
    vi.stubGlobal('fetch', fetchMock);
    expect((await get('?action=drop')).status).toBe(400);
    expect((await post({ action: 'syncAll' })).status).toBe(400);
    expect((await post({ nothing: true })).status).toBe(400);
    expect((await post('not json')).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POST forwards the body unchanged as text/plain, for every action the app uses', async () => {
    for (const action of ['ping', 'login', 'changePassword', 'add', 'update', 'delete', 'import']) {
      const fetchMock = upstreamOk({ status: 'success', action });
      vi.stubGlobal('fetch', fetchMock);
      const body = JSON.stringify({ action, token: 'tok', permit: { id: 'A' } });
      const res = await post(body);
      expect(res.status).toBe(200);
      const [target, init] = fetchMock.mock.calls[0];
      expect(String(target)).toBe(SCRIPT);
      expect(init.method).toBe('POST');
      expect(init.body).toBe(body);
      expect(init.headers['Content-Type']).toContain('text/plain');
      expect(init.redirect).toBe('follow');
    }
  });

  it('refuses a body over the size limit', async () => {
    vi.stubGlobal('fetch', upstreamOk());
    const res = await post(JSON.stringify({ action: 'import', pad: 'x'.repeat(1_100_000) }));
    expect(res.status).toBe(413);
  });
});

describe('what it answers', () => {
  it('returns Google\'s JSON untouched, uncached, with a JSON content type', async () => {
    vi.stubGlobal('fetch', upstreamOk({ status: 'error', code: 'invalid_password', message: 'x' }));
    const res = await post({ action: 'login', password: 'p' });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ status: 'error', code: 'invalid_password', message: 'x' });
  });

  it('an error status from Google becomes a 502 JSON error (the app then falls back)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 })));
    const res = await get('?action=list');
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toMatchObject({ status: 'error', code: 'server_error' });
    expect(body.message).toContain('404');
  });

  it('GET is retried once when the connection fails', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce(new Response('{"status":"success"}'));
    vi.stubGlobal('fetch', fetchMock);
    const res = await get('?action=list');
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a write is NEVER repeated by the proxy', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('network'));
    vi.stubGlobal('fetch', fetchMock);
    const res = await post({ action: 'add', token: 't', permit: { id: 'A' } });
    expect(res.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a timeout is a 504', async () => {
    const timeout = Object.assign(new Error('t'), { name: 'TimeoutError' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout));
    const res = await post({ action: 'ping' });
    expect(res.status).toBe(504);
  });

  it('error replies still carry CORS headers so the browser can read them', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')));
    const res = await get('?action=list', { Origin: PAGES });
    expect(res.status).toBe(502);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(PAGES);
  });
});
