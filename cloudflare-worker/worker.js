/**
 * ตัวกลาง (proxy) ระหว่างเว็บ "รายการขออนุญาตจอดค้างคืน" กับ Google Apps Script
 * รันบน Cloudflare Workers (แผนฟรี)
 *
 * ทำไมต้องมี: เบราว์เซอร์ที่เรียก script.google.com ตรง ๆ ต้องผ่านเครือข่ายอินเทอร์เน็ตของผู้ใช้ ซึ่งบางที่ช้าหรือ
 * หลุดบ่อย ตัวกลางนี้ให้ Cloudflare (ศูนย์ข้อมูล) เป็นฝ่ายเรียก Google แทน เบราว์เซอร์คุยกับ Cloudflare อย่างเดียว
 *
 * ความปลอดภัย
 *  - เรียกได้เฉพาะสคริปต์ URL ที่ระบุไว้ด้านล่างเท่านั้น (ไม่รับ URL จากผู้เรียก)
 *  - ส่งต่อเฉพาะ action ที่แอปใช้ (รายการด้านล่าง) ที่เหลือปฏิเสธ
 *  - เว็บอื่นที่ไม่อยู่ในรายการ ALLOWED_ORIGINS เรียกผ่านเบราว์เซอร์ไม่ได้
 *  - ไม่เก็บ ไม่แคช และไม่บันทึกข้อมูลหรือรหัสผ่านที่ผ่านมา
 *
 * วิธีติดตั้ง (ทำครั้งเดียว): ดูไฟล์ cloudflare-worker/README.md
 */

// URL เว็บแอปของ Apps Script (ลงท้าย /exec) ถ้า deploy สคริปต์ใหม่แล้ว URL เปลี่ยน ให้แก้บรรทัดนี้
const DEFAULT_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbwvZxrFsXHIp63NvyMDQi-QgmPxJ2deHpxWjpMhEQlKBiyNFiMjJrBHMWOpC0gxgINAqQ/exec';

// เว็บที่อนุญาตให้เรียกผ่านเบราว์เซอร์ (origin = ส่วน https://ชื่อโดเมน ไม่มี / ท้าย)
const DEFAULT_ALLOWED_ORIGINS = [
  'https://ratthammanoon221042-lang.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

const GET_ACTIONS = new Set(['list', 'ping']);
const POST_ACTIONS = new Set(['ping', 'login', 'changePassword', 'add', 'update', 'delete', 'import']);
const MAX_BODY_BYTES = 1_000_000;
const UPSTREAM_TIMEOUT_MS = 25_000;

function corsHeaders(origin) {
  if (!origin) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function reply(status, body, cors) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...cors,
    },
  });
}

const fail = (status, code, message, cors) => reply(status, { status: 'error', code, message }, cors);

async function callScript(url, init) {
  return fetch(url, { ...init, redirect: 'follow', signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
}

async function handle(request, env = {}) {
  const origin = request.headers.get('Origin');
  const allowedOrigins = env.ALLOWED_ORIGINS
    ? String(env.ALLOWED_ORIGINS).split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_ALLOWED_ORIGINS;
  const scriptUrl = String(env.APPS_SCRIPT_URL || DEFAULT_APPS_SCRIPT_URL);

  // A browser from any other site is refused. (No Origin header = not a browser page, e.g. typing the
  // address in the address bar or curl for a test: allowed, but it only reaches the same public script.)
  if (origin && !allowedOrigins.includes(origin)) {
    return fail(403, 'forbidden', 'เว็บนี้ไม่ได้รับอนุญาตให้ใช้ตัวกลางนี้', {});
  }
  const cors = corsHeaders(origin);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  let target;
  let init;

  if (request.method === 'GET') {
    const params = new URL(request.url).searchParams;
    const action = params.get('action') || 'list';
    if (!GET_ACTIONS.has(action)) return fail(400, 'bad_request', 'ไม่รู้จัก action นี้', cors);
    target = new URL(scriptUrl);
    target.searchParams.set('action', action);
    if (action === 'list' && params.get('fresh') === '1') target.searchParams.set('fresh', '1');
    init = { method: 'GET' };
  } else if (request.method === 'POST') {
    const declared = Number(request.headers.get('Content-Length') || 0);
    if (declared > MAX_BODY_BYTES) return fail(413, 'bad_request', 'ข้อมูลใหญ่เกินไป', cors);
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return fail(413, 'bad_request', 'ข้อมูลใหญ่เกินไป', cors);

    let action;
    try {
      action = JSON.parse(text).action;
    } catch {
      return fail(400, 'bad_request', 'รูปแบบข้อมูลไม่ถูกต้อง', cors);
    }
    if (!POST_ACTIONS.has(action)) return fail(400, 'bad_request', 'ไม่รู้จัก action นี้', cors);

    target = scriptUrl;
    // text/plain: the same content type the app sends; Apps Script web apps do not answer CORS preflights
    init = { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: text };
  } else {
    return fail(405, 'bad_request', 'ใช้ได้เฉพาะ GET และ POST', cors);
  }

  let upstream;
  try {
    upstream = await callScript(target, init);
  } catch (error) {
    // Reads can safely be tried once more; writes are never repeated here (the app checks the sheet itself)
    if (request.method === 'GET') {
      try {
        upstream = await callScript(target, init);
      } catch (retryError) {
        error = retryError;
      }
    }
    if (!upstream) {
      const timedOut = error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      return fail(timedOut ? 504 : 502, 'server_error', timedOut ? 'Google ตอบช้าเกินกำหนด' : 'เชื่อมต่อ Google ไม่ได้', cors);
    }
  }

  if (!upstream.ok) {
    return fail(502, 'server_error', `Google ตอบกลับผิดปกติ (HTTP ${upstream.status})`, cors);
  }
  // Pass Google's JSON through unchanged
  return reply(200, await upstream.text(), cors);
}

export default {
  fetch(request, env) {
    return handle(request, env);
  },
};
