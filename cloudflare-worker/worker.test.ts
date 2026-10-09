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

describe('extract (read cars from photos)', () => {
  const GEMINI = 'https://generativelanguage.googleapis.com/';
  const file = { mimeType: 'image/jpeg', data: 'AAAA' };
  const geminiAnswer = (data: unknown) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(data) }] } }] });

  /** Routes the two upstream calls: Apps Script (checkToken) and Gemini */
  const upstream = (opts: { token?: 'ok' | 'bad' | 'old'; gemini?: Response | (() => Response) } = {}) =>
    vi.fn().mockImplementation((url: string) => {
      if (String(url).startsWith(GEMINI)) {
        const g = opts.gemini ?? new Response(JSON.stringify(geminiAnswer({ vehicles: [] })), { status: 200 });
        return Promise.resolve(typeof g === 'function' ? g() : g.clone());
      }
      const t = opts.token ?? 'ok';
      const body =
        t === 'ok'
          ? { status: 'success' }
          : t === 'bad'
            ? { status: 'error', code: 'unauthorized', message: 'x' }
            : { status: 'error', code: 'bad_request', message: 'ไม่รู้จัก action: checkToken' };
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    });

  let n = 0;
  const extract = (over: Record<string, unknown> = {}, envOver: Record<string, string> = {}, headers: Record<string, string> = {}) =>
    handle(
      new Request('https://proxy.example/', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'extract', token: `tok-${++n}`, today: '2026-10-09', files: [file], ...over }),
      }),
      { ...env, GEMINI_API_KEY: 'key-123', EXTRACT_RATE_LIMIT_MAX: '1000', ...envOver }
    );

  it('refuses without a login token and without calling the AI', async () => {
    const fetchMock = upstream();
    vi.stubGlobal('fetch', fetchMock);
    const res = await extract({ token: '' });
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says so when the AI key is not set up yet', async () => {
    vi.stubGlobal('fetch', upstream());
    const res = await extract({}, { GEMINI_API_KEY: '' });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'not_configured' });
  });

  it('checks the token with Apps Script first; a bad token never reaches the AI', async () => {
    const fetchMock = upstream({ token: 'bad' });
    vi.stubGlobal('fetch', fetchMock);
    const res = await extract();
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 'unauthorized' });
    expect(fetchMock.mock.calls.some(([u]) => String(u).startsWith(GEMINI))).toBe(false);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({ action: 'checkToken' });
  });

  it('explains when Apps Script is still an old version', async () => {
    vi.stubGlobal('fetch', upstream({ token: 'old' }));
    const res = await extract();
    expect(res.status).toBe(502);
    expect((await res.json()).message).toContain('Code.gs');
  });

  it('rejects bad files and too many files', async () => {
    vi.stubGlobal('fetch', upstream());
    expect((await extract({ files: [] })).status).toBe(400);
    expect((await extract({ files: Array(7).fill(file) })).status).toBe(400);
    expect((await extract({ files: [{ mimeType: 'text/html', data: 'x' }] })).status).toBe(400);
    expect((await extract({ files: [{ mimeType: 'image/png' }] })).status).toBe(400);
  });

  it('sends the files and the instructions to Gemini with the key in a header, and returns only the cleaned fields', async () => {
    const fetchMock = upstream({
      gemini: new Response(
        JSON.stringify(
          geminiAnswer({
            department: 'สกมช.',
            startDate: '2026-10-09',
            endDate: '2026-10-10',
            secret: 'ignored',
            vehicles: [
              { kind: 'car', brand: 'Toyota', color: 'ขาว', plate: '1กก1234', province: 'กทม.', uncertain: ['plate'], extra: 'x' },
              { kind: 'motorcycle', brand: 'Honda', note: 'จักรยานยนต์' },
              { kind: 'weird' },
            ],
          })
        ),
        { status: 200 }
      ),
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await extract({}, { GEMINI_MODEL: 'gemini-test' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('success');
    expect(body.data.secret).toBeUndefined();
    expect(body.data.vehicles).toHaveLength(3);
    expect(body.data.vehicles[0]).toMatchObject({ kind: 'car', plate: '1กก1234', uncertain: ['plate'] });
    expect(body.data.vehicles[0].extra).toBeUndefined();
    expect(body.data.vehicles[2].kind).toBe('unknown');

    const call = fetchMock.mock.calls.find(([u]) => String(u).startsWith(GEMINI));
    expect(String(call?.[0])).toContain('/models/gemini-test:generateContent');
    expect(call?.[1].headers['x-goog-api-key']).toBe('key-123');
    expect(String(call?.[0])).not.toContain('key-123');
    const sent = JSON.parse(call?.[1].body);
    expect(sent.contents[0].parts[0].text).toContain('รถจักรยานยนต์');
    expect(sent.contents[0].parts[1]).toEqual({ inline_data: { mime_type: 'image/jpeg', data: 'AAAA' } });
    expect(sent.generationConfig.responseMimeType).toBe('application/json');
  });

  it('accepts a large body for extract only (other actions keep the 1 MB limit)', async () => {
    vi.stubGlobal('fetch', upstream());
    const big = { mimeType: 'image/jpeg', data: 'A'.repeat(2_000_000) };
    expect((await extract({ files: [big] })).status).toBe(200);
    expect((await post(JSON.stringify({ action: 'import', pad: 'x'.repeat(1_100_000) }))).status).toBe(413);
    expect((await extract({ files: [{ mimeType: 'image/jpeg', data: 'A'.repeat(8_100_000) }] })).status).toBe(413);
  });

  it('turns quota and key problems into clear errors', async () => {
    vi.stubGlobal('fetch', upstream({ gemini: new Response('{}', { status: 429 }) }));
    const quota = await extract();
    expect(quota.status).toBe(429);
    expect(await quota.json()).toMatchObject({ code: 'rate_limited' });

    vi.stubGlobal('fetch', upstream({ gemini: new Response('{}', { status: 403 }) }));
    const denied = await extract();
    expect(denied.status).toBe(502);
    expect((await denied.json()).message).toContain('GEMINI_API_KEY');
  });

  describe('when Google AI is busy', () => {
    const ok = () => new Response(JSON.stringify(geminiAnswer({ vehicles: [{ kind: 'car', plate: '1กก1111' }] })), { status: 200 });
    const busy = () => new Response(JSON.stringify({ error: { code: 503, status: 'UNAVAILABLE', message: 'The model is overloaded' } }), { status: 503 });
    const fast = { GEMINI_RETRY_DELAY_MS: '0' };
    /** Answers Gemini calls from a list, in order, and records which model each call used */
    const sequence = (answers: Array<() => Response>) => {
      const models: string[] = [];
      const mock = vi.fn().mockImplementation((url: string) => {
        if (String(url).startsWith(GEMINI)) {
          models.push(String(url).split('/models/')[1].split(':')[0]);
          return Promise.resolve((answers.shift() ?? busy)());
        }
        return Promise.resolve(new Response(JSON.stringify({ status: 'success' }), { status: 200 }));
      });
      vi.stubGlobal('fetch', mock);
      return models;
    };

    it('tries the same model once more after a 503', async () => {
      const models = sequence([busy, ok]);
      const res = await extract({}, fast);
      expect(res.status).toBe(200);
      expect(models).toEqual(['gemini-flash-latest', 'gemini-flash-latest']);
    });

    it('switches to the backup model when the main one stays busy', async () => {
      const models = sequence([busy, busy, ok]);
      const res = await extract({}, fast);
      expect(res.status).toBe(200);
      expect(models).toEqual(['gemini-flash-latest', 'gemini-flash-latest', 'gemini-flash-lite-latest']);
    });

    it('a full main-model quota moves on to the backup model straight away', async () => {
      const models = sequence([() => new Response('{}', { status: 429 }), ok]);
      expect((await extract({}, fast)).status).toBe(200);
      expect(models).toEqual(['gemini-flash-latest', 'gemini-flash-lite-latest']);
    });

    it('GEMINI_FALLBACK_MODELS can be changed, and a rejected key does not try other models', async () => {
      const models = sequence([() => new Response('{}', { status: 404 }), ok]);
      expect((await extract({}, { ...fast, GEMINI_FALLBACK_MODELS: 'my-backup' })).status).toBe(200);
      expect(models).toEqual(['gemini-flash-latest', 'my-backup']);

      const denied = sequence([() => new Response('{}', { status: 403 })]);
      expect((await extract({}, fast)).status).toBe(502);
      expect(denied).toHaveLength(1);
    });

    it('gives a clear message when every model is busy', async () => {
      const models = sequence([busy, busy, busy, busy]);
      const res = await extract({}, fast);
      expect(res.status).toBe(502);
      expect((await res.json()).message).toContain('หนาแน่น');
      expect(models).toHaveLength(4);
    });

    it('names every model that was tried, so a retired backup does not hide why the main one failed', async () => {
      const retired = () =>
        new Response(JSON.stringify({ error: { code: 404, status: 'NOT_FOUND', message: 'This model models/gemini-2.5-flash is no longer available to new users.' } }), { status: 404 });
      sequence([() => new Response('{}', { status: 429 }), retired]);
      const res = await extract({}, { ...fast, GEMINI_MODEL: 'main-model', GEMINI_FALLBACK_MODELS: 'gemini-2.5-flash' });
      expect(res.status).toBe(429);
      const message = (await res.json()).message;
      expect(message).toContain('main-model → HTTP 429');
      expect(message).toContain('gemini-2.5-flash → HTTP 404');
      expect(message).toContain('โควต้า');
    });

    it('GEMINI_THINKING fixes one form: no probing after a 400, and the form is reported', async () => {
      const models = sequence([() => new Response(JSON.stringify({ error: { message: 'bad' } }), { status: 400 }), ok]);
      const res = await extract({}, { ...fast, GEMINI_THINKING: 'minimal', GEMINI_MEDIA_RESOLUTION: 'off' });
      expect(res.status).toBe(200); // the backup model answered
      expect(models).toEqual(['gemini-flash-latest', 'gemini-flash-lite-latest']);
      expect((await res.json()).data.meta.thinking).toBe('minimal');
    });

    it('a "location not supported" refusal stops at once (no retries, no backup models) and explains it', async () => {
      const blocked = () =>
        new Response(JSON.stringify({ error: { code: 400, status: 'FAILED_PRECONDITION', message: 'User location is not supported for the API use.' } }), { status: 400 });
      const models = sequence([blocked, blocked, blocked, blocked]);
      const res = await handle(
        Object.assign(
          new Request('https://proxy.example/', {
            method: 'POST',
            body: JSON.stringify({ action: 'extract', token: `tok-loc-${++n}`, today: '2026-10-09', files: [file] }),
          }),
          { cf: { colo: 'HKG' } }
        ),
        { ...env, GEMINI_API_KEY: 'key-123', EXTRACT_RATE_LIMIT_MAX: '1000', ...fast }
      );
      expect(res.status).toBe(502);
      const message = (await res.json()).message;
      expect(message).toContain('HKG');
      expect(message).toContain('Smart Placement');
      expect(models).toHaveLength(1);
    });

    it('GEMINI_BASE_URL sends the call somewhere else (for example Cloudflare AI Gateway)', async () => {
      const fetchMock = upstream();
      vi.stubGlobal('fetch', fetchMock);
      await extract({}, { GEMINI_BASE_URL: 'https://gateway.ai.cloudflare.com/v1/acct/gw/google-ai-studio/v1beta/models', GEMINI_MODEL: 'm1' });
      const urls = fetchMock.mock.calls.map(([u]) => String(u));
      expect(urls.some((u) => u === 'https://gateway.ai.cloudflare.com/v1/acct/gw/google-ai-studio/v1beta/models/m1:generateContent')).toBe(true);
    });

    it('shows Google\'s own reason for an unexpected error', async () => {
      const odd = () => new Response(JSON.stringify({ error: { status: 'INTERNAL_X' } }), { status: 418 });
      sequence([odd, odd]);
      const res = await extract({}, fast);
      expect((await res.json()).message).toContain('HTTP 418: INTERNAL_X');
    });
  });

  it('copes with an empty or unreadable AI answer', async () => {
    vi.stubGlobal('fetch', upstream({ gemini: new Response(JSON.stringify({ candidates: [] }), { status: 200 }) }));
    expect((await extract()).status).toBe(502);
    vi.stubGlobal(
      'fetch',
      upstream({ gemini: new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }), { status: 200 }) })
    );
    expect((await extract()).status).toBe(502);
  });

  it('strips a markdown fence around the JSON', async () => {
    const text = '```json\n' + JSON.stringify({ vehicles: [{ kind: 'car', plate: '9ขข9999' }] }) + '\n```';
    vi.stubGlobal('fetch', upstream({ gemini: new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 }) }));
    const res = await extract();
    expect((await res.json()).data.vehicles[0].plate).toBe('9ขข9999');
  });

  it('reports how long it took and which model answered; with GEMINI_THINKING=auto it asks the AI to think less', async () => {
    const fetchMock = upstream();
    vi.stubGlobal('fetch', fetchMock);
    const body = (await (await extract({}, { GEMINI_MODEL: 'gemini-test', GEMINI_THINKING: 'auto' })).json()).data;
    expect(body.meta).toMatchObject({ model: 'gemini-test' });
    expect(body.meta.totalMs).toBeGreaterThanOrEqual(body.meta.aiMs);
    const call = fetchMock.mock.calls.find(([u]) => String(u).startsWith(GEMINI));
    expect(JSON.parse(call?.[1].body).generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it('accepts a model name copied from AI Studio with the "models/" prefix', async () => {
    const fetchMock = upstream();
    vi.stubGlobal('fetch', fetchMock);
    await extract({}, { GEMINI_MODEL: 'models/gemini-3.6-flash', GEMINI_FALLBACK_MODELS: 'models/gemini-2.5-flash' });
    const call = fetchMock.mock.calls.find(([u]) => String(u).startsWith(GEMINI));
    expect(String(call?.[0])).toContain('/v1beta/models/gemini-3.6-flash:generateContent');
  });

  it('GEMINI_THINKING=default sends no thinking setting at all (the model thinks as usual)', async () => {
    const fetchMock = upstream();
    vi.stubGlobal('fetch', fetchMock);
    const res = await extract({}, { GEMINI_THINKING: 'default' });
    expect((await res.json()).data.meta.thinking).toBe('default');
    const call = fetchMock.mock.calls.find(([u]) => String(u).startsWith(GEMINI));
    expect(JSON.parse(call?.[1].body).generationConfig.thinkingConfig).toBeUndefined();
  });

  it('reads the picture at high resolution by default; GEMINI_MEDIA_RESOLUTION=off leaves it out', async () => {
    const fetchMock = upstream();
    vi.stubGlobal('fetch', fetchMock);
    await extract({}, { GEMINI_MEDIA_RESOLUTION: 'high' });
    await extract({}, { GEMINI_MEDIA_RESOLUTION: 'off' });
    const sent = fetchMock.mock.calls.filter(([u]) => String(u).startsWith(GEMINI)).map(([, init]) => JSON.parse(init.body).generationConfig);
    expect(sent[0].mediaResolution).toBe('MEDIA_RESOLUTION_HIGH');
    expect(sent[1].mediaResolution).toBeUndefined();
  });

  it('the prompt covers rotated pages, colour inside the model text and plates with spaces', async () => {
    const fetchMock = upstream();
    vi.stubGlobal('fetch', fetchMock);
    await extract();
    const call = fetchMock.mock.calls.find(([u]) => String(u).startsWith(GEMINI));
    const prompt = JSON.parse(call?.[1].body).contents[0].parts[0].text;
    for (const needle of ['หมุนข้าง 90°', 'Haval สีดำ', '7 กม 374']) expect(prompt).toContain(needle);
  });

  it('verify warms the login check without reading anything', async () => {
    const fetchMock = upstream();
    vi.stubGlobal('fetch', fetchMock);
    const res = await handle(
      new Request('https://proxy.example/', { method: 'POST', body: JSON.stringify({ action: 'verify', token: 'warm-1' }) }),
      { ...env, GEMINI_API_KEY: 'key-123' }
    );
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls.every(([u]) => !String(u).startsWith(GEMINI))).toBe(true);
    // and the login check is remembered: reading right after does not ask Apps Script again
    await handle(
      new Request('https://proxy.example/', {
        method: 'POST',
        body: JSON.stringify({ action: 'extract', token: 'warm-1', today: '2026-10-09', files: [file] }),
      }),
      { ...env, GEMINI_API_KEY: 'key-123' }
    );
    expect(fetchMock.mock.calls.filter(([u]) => !String(u).startsWith(GEMINI))).toHaveLength(1);

    const bad = await handle(
      new Request('https://proxy.example/', { method: 'POST', body: JSON.stringify({ action: 'verify', token: '' }) }),
      env
    );
    expect(bad.status).toBe(401);
  });

  it('is refused for a page from another site', async () => {
    const fetchMock = upstream();
    vi.stubGlobal('fetch', fetchMock);
    const res = await extract({}, {}, { Origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('also tries the other forms after a 400 whose text does not mention thinking, and shows Google\'s message when nothing works', async () => {
    vi.resetModules();
    const fresh = (await import('./worker.js')).default;
    const call = (envOver: Record<string, string> = {}) =>
      fresh.fetch(
        new Request('https://proxy.example/', {
          method: 'POST',
          body: JSON.stringify({ action: 'extract', token: `tok-fresh-${++n}`, today: '2026-10-09', files: [file] }),
        }),
        { ...env, GEMINI_API_KEY: 'key-123', GEMINI_RETRY_DELAY_MS: '0', GEMINI_THINKING: 'auto', GEMINI_MEDIA_RESOLUTION: 'off', ...envOver }
      );
    const bad = () => new Response(JSON.stringify({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Request contains an invalid argument.' } }), { status: 400 });

    let calls = 0;
    const seen: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init: { body: string }) => {
        if (!String(url).startsWith(GEMINI)) return Promise.resolve(new Response(JSON.stringify({ status: 'success' }), { status: 200 }));
        calls++;
        seen.push(JSON.parse(init.body).generationConfig.thinkingConfig ?? null);
        return Promise.resolve(calls <= 2 ? bad() : new Response(JSON.stringify(geminiAnswer({ vehicles: [] })), { status: 200 }));
      })
    );
    expect((await call()).status).toBe(200);
    expect(seen).toEqual([{ thinkingBudget: 0 }, { thinkingLevel: 'minimal' }, { thinkingLevel: 'low' }]);

    // nothing works (for example a picture Google cannot process): the real reason is shown
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) =>
        Promise.resolve(String(url).startsWith(GEMINI) ? bad() : new Response(JSON.stringify({ status: 'success' }), { status: 200 }))
      )
    );
    const res = await call();
    expect(res.status).toBe(502);
    const message = (await res.json()).message;
    expect(message).toContain('HTTP 400: Request contains an invalid argument.');
    expect(message).not.toContain('GEMINI_API_KEY');
  });

  it('falls back through the "think less" forms when a model rejects them, and remembers what works (keep last: it changes the remembered form)', async () => {
    const seen: unknown[] = [];
    const rejectThinking = () =>
      new Response(JSON.stringify({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Unknown name "thinkingBudget": thinking config not supported' } }), { status: 400 });
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init: { body: string }) => {
        if (!String(url).startsWith(GEMINI)) return Promise.resolve(new Response(JSON.stringify({ status: 'success' }), { status: 200 }));
        calls++;
        seen.push(JSON.parse(init.body).generationConfig.thinkingConfig ?? null);
        return Promise.resolve(
          calls <= 2 ? rejectThinking() : new Response(JSON.stringify(geminiAnswer({ vehicles: [] })), { status: 200 })
        );
      })
    );
    vi.resetModules(); // a fresh worker: its own rate-limit counter and remembered thinking form
    const fresh = (await import('./worker.js')).default;
    const call = () =>
      fresh.fetch(
        new Request('https://proxy.example/', {
          method: 'POST',
          body: JSON.stringify({ action: 'extract', token: `tok-last-${++n}`, today: '2026-10-09', files: [file] }),
        }),
        { ...env, GEMINI_API_KEY: 'key-123', GEMINI_RETRY_DELAY_MS: '0', GEMINI_THINKING: 'auto', GEMINI_MEDIA_RESOLUTION: 'off' }
      );
    expect((await call()).status).toBe(200);
    expect(seen).toEqual([{ thinkingBudget: 0 }, { thinkingLevel: 'minimal' }, { thinkingLevel: 'low' }]);
    // next request starts with the form that worked
    seen.length = 0;
    calls = 99;
    await call();
    expect(seen).toEqual([{ thinkingLevel: 'low' }]);
  });

  it('drops the high-resolution setting after a 400 and retries the same model, and remembers it', async () => {
    vi.resetModules();
    const fresh = (await import('./worker.js')).default;
    const call = () =>
      fresh.fetch(
        new Request('https://proxy.example/', {
          method: 'POST',
          body: JSON.stringify({ action: 'extract', token: `tok-media-${++n}`, today: '2026-10-09', files: [file] }),
        }),
        { ...env, GEMINI_API_KEY: 'key-123', GEMINI_RETRY_DELAY_MS: '0', GEMINI_THINKING: 'default' }
      );
    const seen: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init: { body: string }) => {
        if (!String(url).startsWith(GEMINI)) return Promise.resolve(new Response(JSON.stringify({ status: 'success' }), { status: 200 }));
        const cfg = JSON.parse(init.body).generationConfig;
        seen.push(cfg.mediaResolution ?? null);
        return Promise.resolve(
          cfg.mediaResolution
            ? new Response(JSON.stringify({ error: { message: 'media_resolution not supported' } }), { status: 400 })
            : new Response(JSON.stringify(geminiAnswer({ vehicles: [] })), { status: 200 })
        );
      })
    );
    expect((await call()).status).toBe(200);
    expect(seen).toEqual(['MEDIA_RESOLUTION_HIGH', null]);
    seen.length = 0;
    await call();
    expect(seen).toEqual([null]); // remembered: not asked again
  });

  it('limits how often a reading can be started (protects the free quota)', async () => {
    vi.resetModules();
    const fresh = (await import('./worker.js')).default;
    vi.stubGlobal('fetch', upstream());
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await fresh.fetch(
        new Request('https://proxy.example/', {
          method: 'POST',
          body: JSON.stringify({ action: 'extract', token: `tok-rate-${++n}`, today: '2026-10-09', files: [file] }),
        }),
        { ...env, GEMINI_API_KEY: 'key-123', EXTRACT_RATE_LIMIT_MAX: '2' }
      );
      statuses.push(res.status);
    }
    expect(statuses).toEqual([200, 200, 429]);
  });


});
