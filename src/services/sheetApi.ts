import { ParkingPermit } from '../types/parking';
import { normalizePermit } from '../utils/permit';
import { loadLastSynced } from '../utils/storage';

/**
 * Client for the Google Apps Script backend (apps-script/Code.gs).
 * The Google Sheet behind the script is the single source of truth.
 */

/** Web app URL of the deployed apps-script/Code.gs (the Google Sheet backend) */
const DEFAULT_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbwvZxrFsXHIp63NvyMDQi-QgmPxJ2deHpxWjpMhEQlKBiyNFiMjJrBHMWOpC0gxgINAqQ/exec';

// Apps Script can need a while to wake up after being idle
const REQUEST_TIMEOUT_MS = 45_000;

export type ApiErrorCode =
  | 'unauthorized'
  | 'invalid_password'
  | 'weak_password'
  | 'locked'
  | 'bad_request'
  | 'not_found'
  | 'server_error'
  | 'network';

export class ApiError extends Error {
  code: ApiErrorCode;
  /** True when we gave up waiting (as opposed to the connection failing quickly) */
  timedOut: boolean;
  constructor(code: ApiErrorCode, message: string, timedOut = false) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.timedOut = timedOut;
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

interface ApiResponse {
  status: 'success' | 'error';
  code?: ApiErrorCode;
  message?: string;
  [key: string]: unknown;
}

async function request(url: string, init?: RequestInit): Promise<ApiResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      throw new ApiError(
        'server_error',
        `Google Sheet ตอบกลับผิดปกติ (HTTP ${res.status})${res.status === 404 ? setupHint() : ''}`
      );
    }
    let json: ApiResponse;
    try {
      json = (await res.json()) as ApiResponse;
    } catch {
      throw new ApiError('server_error', `Google Sheet ตอบกลับไม่ใช่ข้อมูลที่ถูกต้อง${setupHint()}`);
    }
    if (json.status !== 'success') {
      throw new ApiError(json.code ?? 'server_error', json.message ?? 'เกิดข้อผิดพลาดจากเซิร์ฟเวอร์');
    }
    return json;
  } catch (e) {
    if (isApiError(e)) throw e;
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new ApiError('network', 'หมดเวลารอการตอบกลับจาก Google Sheet', true);
    }
    throw new ApiError('network', 'เชื่อมต่อ Google Sheet ไม่ได้ ตรวจสอบอินเทอร์เน็ตหรือ URL');
  } finally {
    clearTimeout(timer);
  }
}

function requireUrl(): string {
  const url = getAppsScriptUrl();
  if (!url) throw new ApiError('bad_request', 'ยังไม่ได้ตั้งค่า URL ของ Google Apps Script');
  return url;
}

// text/plain avoids a CORS preflight, which Apps Script web apps do not answer
const post = (payload: Record<string, unknown>) =>
  request(requireUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });

function toPermits(json: ApiResponse): ParkingPermit[] {
  const data = json.data;
  if (!Array.isArray(data)) throw new ApiError('server_error', 'โครงสร้างข้อมูลจากชีตไม่ถูกต้อง');
  return data.map(normalizePermit);
}

/** `fresh` skips the script's cache and reads the sheet itself (used by the refresh button) */
export async function fetchPermits(fresh = false): Promise<ParkingPermit[]> {
  const url = requireUrl();
  const sep = url.includes('?') ? '&' : '?';
  const get = () => request(`${url}${sep}action=list${fresh ? '&fresh=1' : ''}`);
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

// Every write answers with the complete, up-to-date list, so no second request is needed.
export const addPermit = async (token: string, permit: ParkingPermit) =>
  toPermits(await post({ action: 'add', token, permit }));

export const updatePermit = async (token: string, permit: ParkingPermit) =>
  toPermits(await post({ action: 'update', token, permit }));

export const deletePermit = async (token: string, id: string) =>
  toPermits(await post({ action: 'delete', token, id }));
