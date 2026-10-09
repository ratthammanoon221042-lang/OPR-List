import { ParkingPermit } from '../types/parking';
import { normalizePermit } from './permit';

// The Google Sheet is the source of truth. This local copy only lets the app show
// the last known data instantly (or offline) while the sheet is being loaded.
const PERMITS_CACHE_KEY = 'thai_overnight_parking_permits_cache_v7';
const AUTH_TOKEN_KEY = 'thai_overnight_auth_token_v2';

export function loadCachedPermits(): ParkingPermit[] {
  try {
    const raw = localStorage.getItem(PERMITS_CACHE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizePermit) : [];
  } catch (e) {
    console.error('Failed to load cached permits', e);
    return [];
  }
}

export function saveCachedPermits(permits: ParkingPermit[]): void {
  try {
    localStorage.setItem(PERMITS_CACHE_KEY, JSON.stringify(permits));
  } catch (e) {
    console.error('Failed to cache permits', e);
  }
}

// The token lives in sessionStorage only, so closing the tab logs the user out.
export function getAuthToken(): string | null {
  try {
    return sessionStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    else sessionStorage.removeItem(AUTH_TOKEN_KEY);
  } catch (e) {
    console.error('Failed to store auth token', e);
  }
}

const LAST_SYNCED_KEY = 'thai_overnight_last_synced_v1';

export function loadLastSynced(): Date | null {
  try {
    const raw = localStorage.getItem(LAST_SYNCED_KEY);
    const date = raw ? new Date(raw) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
  } catch {
    return null;
  }
}

export function saveLastSynced(date: Date): void {
  try {
    localStorage.setItem(LAST_SYNCED_KEY, date.toISOString());
  } catch {
    // not critical
  }
}

const SHOW_SAVED_AT_KEY = 'thai_overnight_show_saved_at_v1';

/** Whether the "บันทึกเมื่อ" column / line is shown in the list (hidden by default) */
export function loadShowSavedAt(): boolean {
  try {
    return localStorage.getItem(SHOW_SAVED_AT_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveShowSavedAt(show: boolean): void {
  try {
    localStorage.setItem(SHOW_SAVED_AT_KEY, show ? '1' : '0');
  } catch {
    // not critical
  }
}
