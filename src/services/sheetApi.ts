import { ParkingPermit } from '../types/parking';
import type { ExtractedDocument } from '../utils/batchRows';
import { normalizePermit } from '../utils/permit';
import { loadLastSynced } from '../utils/storage';

/**
 * Client for the Google Apps Script backend (apps-script/Code.gs).
 * The Google Sheet behind the script is the single source of truth.
 */

/** Web app URL of the deployed apps-script/Code.gs (the Google Sheet backend) */
const DEFAULT_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbwvZxrFsXHIp63NvyMDQi-QgmPxJ2deHpxWjpMhEQlKBiyNFiMjJrBHMWOpC0gxgINAqQ/exec';

/**
 * Optional relay (cloudflare-worker/): the browser talks to Cloudflare, and Cloudflare talks to Google.
 * Leave empty to call the script directly. If the relay fails, the app falls back to the script itself.
 */
const DEFAULT_PROXY_URL = 'https://opr-list-relay.ratthammanoon-221042.workers.dev/';

// Apps Script can need a while to wake up after being idle
const REQUEST_TIMEOUT_MS = 45_000;
// The relay answers within ~25 s at most (its own limit): do not wait longer before using the direct route
const PROXY_TIMEOUT_MS = 30_000;
// After the relay failed, use the direct route for a while instead of trying the relay first every time
const PROXY_COOLDOWN_MS = 2 * 60_000;
let proxyDownUntil = 0;

export type Route = 'relay' | 'direct';
let lastRoute: Route | null = null;
/** Which way the latest successful request travelled (shown next to the sync time) */
export const getLastRoute = (): Route | null => lastRoute;

// Why the relay was skipped the last time it failed (null while it works), shown in the sync bar
let relayProblem: string | null = null;
export const getRelayProblem = (): string | null => relayProblem;

/** A short, plain reason a relay request failed, to help find out what is wrong on one device */
export function describeRelayProblem(err: ApiError): string {
  if (err.timedOut) return 'ตัวกลางตอบช้าเกินกำหนด';
  if (err.code === 'network') {
    // A blocked connection and a refusal by the relay (page address not allowed) look the same to the browser
    return 'ติดต่อตัวกลางไม่ได้ (อาจถูกเครือข่ายหรือส่วนขยายเบราว์เซอร์บล็อกโดเมน workers.dev หรือที่อยู่เว็บไม่อยู่ในรายการที่ตัวกลางอนุญาต)';
  }
  return `ตัวกลางตอบผิดปกติ (${err.message})`;
}

export type ApiErrorCode =
  | 'unauthorized'
  | 'invalid_password'
  | 'weak_password'
  | 'locked'
  | 'bad_request'
  | 'not_found'
  | 'not_configured'
  | 'rate_limited'
  | 'server_error'
  | 'network';

export class ApiError extends Error {
  code: ApiErrorCode;
  /** True when we gave up waiting (as opposed to the connection failing quickly) */
  timedOut: boolean;
  /** True when the request did not get a proper answer at all (no connection, error status, not JSON) */
  transport: boolean;
  constructor(code: ApiErrorCode, message: string, timedOut = false, transport = code === 'network') {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.timedOut = timedOut;
    this.transport = transport;
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

/**
 * True when we cannot tell whether the sheet received the request: the reply was lost, late,
 * unreadable or an error status (a 404 or 5xx can come back for a request that did run).
 * Answers the script itself gave, such as "wrong password", are definite and return false.
 */
export const isOutcomeUnknown = (e: unknown): boolean =>
  isApiError(e) && (e.code === 'network' || e.code === 'server_error');

/**
 * Pointing at the Anyone setting only makes sense while the app has never reached the sheet.
 * After one successful sync the deployment is known to work, so an odd reply is a transient problem.
 */
const setupHint = (): string =>
  loadLastSynced() === null
    ? ' ตรวจสอบว่า deploy สคริปต์ให้ "ผู้มีสิทธิ์เข้าถึง" เป็น "ทุกคน (Anyone)" และ URL ถูกต้อง (ลงท้ายด้วย /exec)'
    : '';

/** VITE_APPS_SCRIPT_URL (e.g. to point a test build at another deployment) wins over the default */
export function getAppsScriptUrl(): string {
  return (import.meta.env.VITE_APPS_SCRIPT_URL as string | undefined)?.trim() || DEFAULT_APPS_SCRIPT_URL;
}

/** VITE_PROXY_URL overrides the relay; set it to an empty value to switch the relay off */
export function getProxyUrl(): string {
  const fromEnv = import.meta.env.VITE_PROXY_URL as string | undefined;
  return fromEnv !== undefined ? fromEnv.trim() : DEFAULT_PROXY_URL;
}

interface ApiResponse {
  status: 'success' | 'error';
  code?: ApiErrorCode;
  message?: string;
  [key: string]: unknown;
}

async function request(url: string, init?: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<ApiResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      throw new ApiError(
        'server_error',
        `เซิร์ฟเวอร์ตอบกลับผิดปกติ (HTTP ${res.status})${res.status === 404 ? setupHint() : ''}`,
        false,
        true
      );
    }
    let json: ApiResponse;
    try {
      json = (await res.json()) as ApiResponse;
    } catch {
      throw new ApiError('server_error', `เซิร์ฟเวอร์ตอบกลับไม่ใช่ข้อมูลที่ถูกต้อง${setupHint()}`, false, true);
    }
    if (json.status !== 'success') {
      throw new ApiError(json.code ?? 'server_error', json.message ?? 'เกิดข้อผิดพลาดจากเซิร์ฟเวอร์');
    }
    return json;
  } catch (e) {
    if (isApiError(e)) throw e;
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new ApiError('network', 'หมดเวลารอการตอบกลับจากเซิร์ฟเวอร์', true);
    }
    throw new ApiError('network', 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตหรือ URL');
  } finally {
    clearTimeout(timer);
  }
}

function requireUrl(): string {
  const url = getAppsScriptUrl();
  if (!url) throw new ApiError('bad_request', 'ยังไม่ได้ตั้งค่า URL ของ Google Apps Script');
  return url;
}

/**
 * Sends one request: through the relay first when there is one, and if the relay gives no proper
 * answer, straight to the script. A real answer from the script (even "wrong password") is never retried.
 */
async function send(
  build: (base: string) => string,
  init?: RequestInit,
  { fallback = true }: { fallback?: boolean } = {}
): Promise<ApiResponse> {
  const direct = requireUrl();
  const proxy = getProxyUrl();
  const useProxy = proxy !== '' && Date.now() >= proxyDownUntil;

  if (!useProxy) {
    const res = await request(build(direct), init);
    lastRoute = 'direct';
    return res;
  }

  try {
    const res = await request(build(proxy), init, PROXY_TIMEOUT_MS);
    lastRoute = 'relay';
    relayProblem = null;
    return res;
  } catch (err) {
    if (!(isApiError(err) && err.transport)) throw err;
    proxyDownUntil = Date.now() + PROXY_COOLDOWN_MS;
    relayProblem = describeRelayProblem(err);
    console.warn('Relay failed, using the direct route:', err);
    if (!fallback) throw err;
    const res = await request(build(direct), init);
    lastRoute = 'direct';
    return res;
  }
}

// text/plain avoids a CORS preflight, which Apps Script web apps do not answer
const post = (payload: Record<string, unknown>) =>
  send(
    (base) => base,
    {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    },
    // Changing the password is the one request that cannot safely be sent twice
    { fallback: payload.action !== 'changePassword' }
  );

function toPermits(json: ApiResponse): ParkingPermit[] {
  const data = json.data;
  if (!Array.isArray(data)) throw new ApiError('server_error', 'โครงสร้างข้อมูลจากชีตไม่ถูกต้อง');
  return data.map(normalizePermit);
}

/** `fresh` skips the script's cache and reads the sheet itself (used by the refresh button) */
export async function fetchPermits(fresh = false): Promise<ParkingPermit[]> {
  const get = () =>
    send((base) => `${base}${base.includes('?') ? '&' : '?'}action=list${fresh ? '&fresh=1' : ''}`);
  try {
    return toPermits(await get());
  } catch (err) {
    // A connection that dropped at once is worth one more try right away. After a timeout we have
    // already waited long enough: leave the next attempt to the caller's timed retry.
    if (isApiError(err) && err.code === 'network' && !err.timedOut) return toPermits(await get());
    throw err;
  }
}

export async function login(password: string): Promise<{ token: string; mustChange: boolean }> {
  const json = await post({ action: 'login', password });
  return { token: String(json.token), mustChange: json.mustChange === true };
}

export async function changePassword(
  token: string,
  oldPassword: string,
  newPassword: string
): Promise<string> {
  const json = await post({ action: 'changePassword', token, oldPassword, newPassword });
  return String(json.token);
}

/** Brand, colour and province are optional in the app; the sheet (and an older Code.gs that still requires them) gets '-' for none */
const toWire = (permit: ParkingPermit): ParkingPermit => ({
  ...permit,
  vehicleBrand: permit.vehicleBrand.trim() || '-',
  vehicleColor: permit.vehicleColor.trim() || '-',
  province: permit.province.trim() || '-',
});

// Every write answers with the complete, up-to-date list, so no second request is needed.
export const addPermit = async (token: string, permit: ParkingPermit) =>
  toPermits(await post({ action: 'add', token, permit: toWire(permit) }));

export const updatePermit = async (token: string, permit: ParkingPermit) =>
  toPermits(await post({ action: 'update', token, permit: toWire(permit) }));

export const deletePermit = async (token: string, id: string) =>
  toPermits(await post({ action: 'delete', token, id }));

/** Several permits at once. The script skips ids it already has, so sending the same batch twice is safe. */
export const importPermits = async (token: string, permits: ParkingPermit[]) =>
  toPermits(await post({ action: 'import', token, permits: permits.map(toWire) }));

// ---------------------------------------------------------------
// Reading permits from photos / documents (cloudflare-worker, Gemini)
// ---------------------------------------------------------------

export interface ExtractFile {
  name: string;
  mimeType: string;
  /** base64, without the "data:...;base64," prefix */
  data: string;
}

// Reading a few pages can take a while, the relay itself gives up after ~50 s
const EXTRACT_TIMEOUT_MS = 70_000;

/**
 * Asks the relay to read the documents. Only the relay can do this (it holds the AI key), so there is
 * no direct fallback; the relay also checks the login token with the script first.
 */
/**
 * Lets the relay check the login ahead of time (it remembers the answer for a few minutes), so the
 * first reading does not wait for that check. Failures are ignored: reading checks the login itself.
 */
export function warmExtract(token: string): void {
  const proxy = getProxyUrl();
  if (!proxy) return;
  fetch(proxy, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'verify', token }),
  }).catch(() => undefined);
}

export async function extractDocument(token: string, files: ExtractFile[], today: string): Promise<ExtractedDocument> {
  const proxy = getProxyUrl();
  if (!proxy) {
    throw new ApiError('bad_request', 'ฟีเจอร์กรอกจากรูปต้องใช้ตัวกลาง Cloudflare แต่ตัวกลางถูกปิดอยู่ในเว็บนี้');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTRACT_TIMEOUT_MS);
  try {
    const res = await fetch(proxy, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'extract',
        token,
        today,
        files: files.map(({ mimeType, data }) => ({ mimeType, data })),
      }),
      signal: controller.signal,
    });

    let json: ApiResponse | null = null;
    try {
      json = (await res.json()) as ApiResponse;
    } catch {
      // handled below
    }
    if (!json) {
      throw new ApiError('server_error', `ระบบอ่านเอกสารตอบกลับผิดปกติ (HTTP ${res.status})`, false, true);
    }
    if (json.status !== 'success') {
      throw new ApiError(json.code ?? 'server_error', json.message ?? 'อ่านเอกสารไม่สำเร็จ');
    }
    const data = json.data as ExtractedDocument | undefined;
    if (!data || !Array.isArray(data.vehicles)) {
      throw new ApiError('server_error', 'ระบบอ่านเอกสารตอบกลับรูปแบบที่ไม่ถูกต้อง ลองอีกครั้ง');
    }
    return data;
  } catch (e) {
    if (isApiError(e)) throw e;
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new ApiError('network', 'ระบบอ่านเอกสารตอบช้าเกินกำหนด ลองใหม่อีกครั้ง หรือลดจำนวนไฟล์', true);
    }
    throw new ApiError('network', 'ติดต่อระบบอ่านเอกสารไม่ได้ ตรวจสอบอินเทอร์เน็ต');
  } finally {
    clearTimeout(timer);
  }
}
