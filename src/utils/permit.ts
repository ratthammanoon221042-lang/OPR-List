import { ParkingPermit } from '../types/parking';
import { THAI_PROVINCES } from './constants';
import { dateRangesOverlap, getTodayDateString, parseFlexibleDate } from './dateUtils';

type RawPermit = Partial<Record<keyof ParkingPermit, unknown>>;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * Normalizes a permit to guarantee:
 * 1. licensePlate has NO spaces (written connected)
 * 2. province is separated from the plate
 * 3. parkingFloor is strictly 'B1' or 'B2'
 * 4. dates are YYYY-MM-DD and endDate >= startDate
 */
export function normalizePermit(raw: RawPermit): ParkingPermit {
  let plate = text(raw.licensePlate);
  let province = text(raw.province);

  // If province is missing, attempt to extract it from the plate string
  if (!province) {
    for (const p of THAI_PROVINCES) {
      if (plate.endsWith(p)) {
        province = p;
        plate = plate.slice(0, plate.length - p.length).trim();
        break;
      }
    }
  }

  // Also check shorthand like "กรุงเทพฯ" or "กทม."
  if (!province && (plate.includes('กรุงเทพฯ') || plate.includes('กทม.'))) {
    province = 'กรุงเทพมหานคร';
    plate = plate.replace('กรุงเทพฯ', '').replace('กทม.', '').trim();
  }

  plate = plate.replace(/\s+/g, '');
  if (!province) province = 'กรุงเทพมหานคร';

  const floorText = text(raw.parkingFloor);
  const floor: 'B1' | 'B2' = /B\s*2|ชั้น\s*2|^2$/i.test(floorText) ? 'B2' : 'B1';

  const startDate = parseFlexibleDate(raw.startDate) || getTodayDateString();
  let endDate = parseFlexibleDate(raw.endDate) || startDate;
  if (endDate < startDate) endDate = startDate;

  // Rows written by an older script carry a Buddhist-era year (2569-10-08T...): convert it back
  const createdAtText = text(raw.createdAt).replace(/^(\d{4})(?=-)/, (y) => (Number(y) > 2400 ? String(Number(y) - 543) : y));
  const createdAt = createdAtText && !Number.isNaN(Date.parse(createdAtText))
    ? createdAtText
    : new Date().toISOString();

  return {
    id: text(raw.id) || generatePermitId(startDate),
    createdAt,
    licensePlate: plate,
    province,
    vehicleBrand: text(raw.vehicleBrand) || 'ไม่ระบุ',
    vehicleColor: text(raw.vehicleColor) || 'ไม่ระบุ',
    parkingFloor: floor,
    department: text(raw.department) || undefined,
    subDepartment: text(raw.subDepartment) || undefined,
    startDate,
    endDate,
  };
}

/**
 * Unique id such as PK-20261006-K3F9Q2 (6 random base-36 chars, ~2 billion combinations per day)
 */
export function generatePermitId(startDate: string): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (b) => (b % 36).toString(36)).join('').toUpperCase();
  return `PK-${startDate.replace(/-/g, '')}-${suffix}`;
}

/** Same vehicle, floor, department and dates (ignores id, createdAt and how the plate was typed) */
export function samePermitContent(a: ParkingPermit, b: ParkingPermit): boolean {
  const x = normalizePermit(a);
  const y = normalizePermit(b);
  return (
    cleanPlate(x.licensePlate) === cleanPlate(y.licensePlate) &&
    x.province === y.province &&
    x.vehicleBrand === y.vehicleBrand &&
    x.vehicleColor === y.vehicleColor &&
    x.parkingFloor === y.parkingFloor &&
    (x.department ?? '') === (y.department ?? '') &&
    (x.subDepartment ?? '') === (y.subDepartment ?? '') &&
    x.startDate === y.startDate &&
    x.endDate === y.endDate
  );
}

export const cleanPlate = (plate: string): string => plate.replace(/\s+/g, '').toLowerCase();

/**
 * Other permits of the same plate (and province) that share at least one night with `candidate`
 */
export function findOverlappingPermits(
  candidate: Pick<ParkingPermit, 'id' | 'licensePlate' | 'province' | 'startDate' | 'endDate'>,
  permits: ParkingPermit[]
): ParkingPermit[] {
  const plate = cleanPlate(candidate.licensePlate);
  return permits.filter(
    (p) =>
      p.id !== candidate.id &&
      cleanPlate(p.licensePlate) === plate &&
      p.province === candidate.province &&
      dateRangesOverlap(p, candidate)
  );
}
