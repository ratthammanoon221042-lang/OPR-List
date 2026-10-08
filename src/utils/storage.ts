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
