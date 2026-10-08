import { ParkingPermit } from '../types/parking';
import { normalizePermit } from '../utils/permit';
import appsScriptCode from '../../apps-script/Code.gs?raw';

/**
 * Client for the Google Apps Script backend (apps-script/Code.gs).
 * The Google Sheet behind the script is the single source of truth.
 */

export const GOOGLE_APPS_SCRIPT_CODE: string = appsScriptCode;

const URL_STORAGE_KEY = 'thai_overnight_apps_script_url_v2';
const REQUEST_TIMEOUT_MS = 25_000;

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
  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

/** A URL baked in at build time (VITE_APPS_SCRIPT_URL) is used until the user saves their own */
export function getAppsScriptUrl(): string {
  try {
    const stored = localStorage.getItem(URL_STORAGE_KEY);
    if (stored) return stored;
  } catch {
    // storage unavailable (private mode etc.)
  }
  return (import.meta.env.VITE_APPS_SCRIPT_URL as string | undefined)?.trim() || '';
}

export function setAppsScriptUrl(url: string | null): void {
  try {
    if (url && url.trim()) localStorage.setItem(URL_STORAGE_KEY, url.trim());
    else localStorage.removeItem(URL_STORAGE_KEY);
  } catch (e) {
    console.error('Failed to save Apps Script URL', e);
  }
}

export function isValidAppsScriptUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' && u.hostname === 'script.google.com' && /\/exec\/?$/.test(u.pathname);
  } catch {
    return false;
  }
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
    if (!res.ok) throw new ApiError('server_error', `เซิร์ฟเวอร์ตอบกลับผิดพลาด (HTTP ${res.status})`);
    let json: ApiResponse;
    try {
      json = (await res.json()) as ApiResponse;
    } catch {
      throw new ApiError(
        'server_error',
        'ตอบกลับไม่ใช่ข้อมูลที่ถูกต้อง ตรวจสอบว่า deploy เป็น "ทุกคน (Anyone)" และใช้ URL ที่ลงท้ายด้วย /exec'
      );
    }
    if (json.status !== 'success') {
      throw new ApiError(json.code ?? 'server_error', json.message ?? 'เกิดข้อผิดพลาดจากเซิร์ฟเวอร์');
    }
    return json;
  } catch (e) {
    if (isApiError(e)) throw e;
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new ApiError('network', 'หมดเวลารอการตอบกลับจาก Google Sheet');
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

export async function pingAppsScript(url: string): Promise<void> {
  const sep = url.includes('?') ? '&' : '?';
  await request(`${url}${sep}action=ping&t=${Date.now()}`);
}

export async function fetchPermits(): Promise<ParkingPermit[]> {
  const url = requireUrl();
  const sep = url.includes('?') ? '&' : '?';
  const json = await request(`${url}${sep}action=list&t=${Date.now()}`);
  const data = json.data;
  if (!Array.isArray(data)) throw new ApiError('server_error', 'โครงสร้างข้อมูลจากชีตไม่ถูกต้อง');
  return data.map(normalizePermit);
}

export async function login(password: string): Promise<{ token: string; mustChange: boolean }> {
  const json = await post({ action: 'login', password });
  return { token: String(json.token), mustChange: json.mustChange === true };
}

export async function logout(token: string): Promise<void> {
  try {
    await post({ action: 'logout', token });
  } catch {
    // the token expires on its own; nothing to do if this fails
  }
}

export async function changePassword(
  token: string,
  oldPassword: string,
  newPassword: string
): Promise<string> {
  const json = await post({ action: 'changePassword', token, oldPassword, newPassword });
  return String(json.token);
}

export const addPermit = (token: string, permit: ParkingPermit) =>
  post({ action: 'add', token, permit }).then(() => undefined);

export const updatePermit = (token: string, permit: ParkingPermit) =>
  post({ action: 'update', token, permit }).then(() => undefined);

export const deletePermit = (token: string, id: string) =>
  post({ action: 'delete', token, id }).then(() => undefined);

export async function importPermits(
  token: string,
  permits: ParkingPermit[]
): Promise<{ added: number; skipped: number }> {
  const json = await post({ action: 'import', token, permits });
  return { added: Number(json.added ?? 0), skipped: Number(json.skipped ?? 0) };
}
