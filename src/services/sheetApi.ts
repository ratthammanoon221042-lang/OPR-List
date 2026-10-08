import { ParkingPermit } from '../types/parking';
import { normalizePermit } from '../utils/permit';

/**
 * Client for the Google Apps Script backend (apps-script/Code.gs).
 * The Google Sheet behind the script is the single source of truth.
 */

/** Web app URL of the deployed apps-script/Code.gs (the Google Sheet backend) */
const DEFAULT_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbwa37UQKqxDALMTZTxjeGkG1Nz_ZWAYFIU-_Y827Kfni0vJVJNoQsf3kazg6lTkzAlRgQ/exec';

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
      // Apps Script answers an anonymous caller with 404 when the deployment is not open to "Anyone"
      const hint = res.status === 404 ? ' ตรวจสอบว่า deploy สคริปต์ให้ "ผู้มีสิทธิ์เข้าถึง" เป็น "ทุกคน (Anyone)" และ URL ถูกต้อง' : '';
      throw new ApiError('server_error', `เซิร์ฟเวอร์ตอบกลับผิดพลาด (HTTP ${res.status}).${hint}`);
    }
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
