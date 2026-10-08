import { ParkingPermit } from '../types/parking';
import { INITIAL_PERMITS, DEFAULT_AUTH_CREDENTIALS, THAI_PROVINCES } from './mockData';

const PERMITS_STORAGE_KEY = 'thai_overnight_parking_permits_v6';
const AUTH_STATUS_KEY = 'thai_overnight_auth_status_v1';
const AUTH_CREDENTIALS_KEY = 'thai_overnight_auth_creds_v1';

/**
 * Normalizes a permit to guarantee:
 * 1. licensePlate has NO spaces (written connected)
 * 2. province is separated
 * 3. parkingFloor is strictly 'B1' or 'B2'
 */
export function normalizePermit(raw: any): ParkingPermit {
  let plate = (raw.licensePlate || '').trim();
  let prov = (raw.province || '').trim();

  // If province is missing, attempt to extract it from the plate string
  if (!prov) {
    for (const p of THAI_PROVINCES) {
      if (plate.endsWith(p)) {
        prov = p;
        plate = plate.slice(0, plate.length - p.length).trim();
        break;
      }
    }
  }

  // Also check shorthand like "กรุงเทพฯ" or "กทม."
  if (!prov) {
    if (plate.includes('กรุงเทพฯ') || plate.includes('กทม.')) {
      prov = 'กรุงเทพมหานคร';
      plate = plate.replace('กรุงเทพฯ', '').replace('กทม.', '').trim();
    }
  }

  // Remove ALL spaces from licensePlate
  plate = plate.replace(/\s+/g, '');
  if (!prov) {
    prov = 'กรุงเทพมหานคร';
  }

  // Normalize floor to strictly B1 or B2
  let rawFloor = (raw.parkingFloor || 'B1').toString();
  let floor: 'B1' | 'B2' = 'B1';
  if (rawFloor.includes('B2') || rawFloor.includes('ชั้น 2') || rawFloor.includes('2')) {
    floor = 'B2';
  } else {
    floor = 'B1';
  }

  return {
    id: raw.id || `PK-${Date.now()}`,
    createdAt: raw.createdAt || new Date().toISOString(),
    licensePlate: plate,
    province: prov,
    vehicleBrand: (raw.vehicleBrand || 'ไม่ระบุ').trim(),
    vehicleColor: (raw.vehicleColor || 'ไม่ระบุ').trim(),
    parkingFloor: floor,
    department: raw.department ? raw.department.trim() : undefined,
    subDepartment: raw.subDepartment ? raw.subDepartment.trim() : undefined,
    startDate: raw.startDate || '2026-10-06',
    endDate: raw.endDate || raw.startDate || '2026-10-06',
    requesterName: raw.requesterName,
    requesterPhone: raw.requesterPhone,
  };
}

/**
 * Load permits - zero mock data, returns only real saved permits or empty array
 */
export function loadPermits(): ParkingPermit[] {
  try {
    const raw = localStorage.getItem(PERMITS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(normalizePermit);
  } catch (e) {
    console.error('Failed to load permits from localStorage', e);
    return [];
  }
}

export function savePermits(permits: ParkingPermit[]): void {
  try {
    const normalized = permits.map(normalizePermit);
    localStorage.setItem(PERMITS_STORAGE_KEY, JSON.stringify(normalized));
  } catch (e) {
    console.error('Failed to save permits to localStorage', e);
  }
}

export function getAuthCredentials(): { username: string; password: string } {
  try {
    const raw = localStorage.getItem(AUTH_CREDENTIALS_KEY);
    if (!raw) return DEFAULT_AUTH_CREDENTIALS;
    const parsed = JSON.parse(raw);
    return parsed?.password ? parsed : DEFAULT_AUTH_CREDENTIALS;
  } catch {
    return DEFAULT_AUTH_CREDENTIALS;
  }
}

export function resetPasswordToDefault(): void {
  try {
    localStorage.setItem(AUTH_CREDENTIALS_KEY, JSON.stringify(DEFAULT_AUTH_CREDENTIALS));
  } catch (e) {
    console.error('Failed to reset auth credentials', e);
  }
}

export function saveAuthCredentials(creds: { username: string; password: string }): void {
  try {
    localStorage.setItem(AUTH_CREDENTIALS_KEY, JSON.stringify(creds));
  } catch (e) {
    console.error('Failed to save auth credentials', e);
  }
}

export function getIsAuthenticated(): boolean {
  try {
    return sessionStorage.getItem(AUTH_STATUS_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setAuthenticatedSession(status: boolean): void {
  try {
    if (status) {
      sessionStorage.setItem(AUTH_STATUS_KEY, 'true');
    } else {
      sessionStorage.removeItem(AUTH_STATUS_KEY);
    }
  } catch (e) {
    console.error('Failed to update session auth status', e);
  }
}
