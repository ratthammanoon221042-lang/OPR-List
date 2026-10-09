import { ParkingPermit } from '../types/parking';
import { DEPARTMENTS, PROVINCE_OPTIONS, VEHICLE_BRANDS, VEHICLE_COLORS } from './constants';
import { dateRangesOverlap, isIsoDate } from './dateUtils';
import { cleanPlate, generatePermitId } from './permit';

/**
 * The rows of the "add permits" table: several cars that share one department and one date range.
 * Rows are typed in by hand or filled from a photo / document (see services/extractApi.ts).
 */

export type RowField = 'brand' | 'color' | 'plate' | 'province' | 'floor' | 'type';

export interface DraftRow {
  /** Stable key for React lists (not stored anywhere) */
  key: string;
  brand: string;
  color: string;
  plate: string;
  province: string;
  floor: 'B1' | 'B2';
  /** Own dates, only when they differ from the dates shared by the whole batch */
  startDate?: string;
  endDate?: string;
  /** Fields the reader was unsure about; shown highlighted until the user changes them */
  flags: RowField[];
}

export interface BatchCommon {
  department: string;
  subDepartment: string;
  startDate: string;
  endDate: string;
}

let keyCounter = 0;
export const nextRowKey = (): string => `row-${++keyCounter}`;

export const newRow = (over: Partial<DraftRow> = {}): DraftRow => ({
  key: nextRowKey(),
  brand: '',
  color: '',
  plate: '',
  province: '',
  floor: 'B1',
  flags: [],
  ...over,
});

/** A row nobody typed into (the default floor does not count) is skipped when saving */
export const isRowEmpty = (r: DraftRow): boolean => !r.brand.trim() && !r.color.trim() && !r.plate.trim() && !r.province.trim();

/** The province as the list spells it ("กทม." and "จ.นนทบุรี" are understood), or '' when it is not a province */
export const rowProvince = (r: DraftRow): string => normalizeProvince(r.province);

/** Brand, plate and a province from the list are needed (the colour is optional); typed text that is no province counts as missing */
export const missingFields = (r: DraftRow): Array<'brand' | 'plate' | 'province'> => {
  const missing: Array<'brand' | 'plate' | 'province'> = [];
  if (!r.brand.trim()) missing.push('brand');
  if (!cleanPlate(r.plate)) missing.push('plate');
  if (!rowProvince(r)) missing.push('province');
  return missing;
};

export const isRowComplete = (r: DraftRow): boolean => !isRowEmpty(r) && missingFields(r).length === 0;

export const rowRange = (r: DraftRow, common: Pick<BatchCommon, 'startDate' | 'endDate'>) => ({
  startDate: r.startDate || common.startDate,
  endDate: r.endDate || common.endDate,
});

/** Turns the rows into permits (empty rows are left out). The rows must be complete. */
export function buildPermits(rows: DraftRow[], common: BatchCommon, now = new Date()): ParkingPermit[] {
  return rows
    .filter((r) => !isRowEmpty(r))
    .map((r) => {
      const { startDate, endDate } = rowRange(r, common);
      return {
        id: generatePermitId(startDate),
        createdAt: now.toISOString(),
        licensePlate: cleanPlate(r.plate),
        province: rowProvince(r),
        vehicleBrand: r.brand.trim(),
        vehicleColor: r.color.trim(),
        parkingFloor: r.floor,
        department: common.department.trim() || undefined,
        subDepartment: common.subDepartment.trim() || undefined,
        startDate,
        endDate,
      };
    });
}

export interface RowClash {
  /** Permits already in the sheet for the same plate and some of the same nights */
  existing: ParkingPermit[];
  /** Another row of this same batch has the same plate and overlapping nights */
  inBatch: boolean;
}

/** Which complete rows clash with saved permits or with each other, by row key */
export function findBatchClashes(
  rows: DraftRow[],
  common: Pick<BatchCommon, 'startDate' | 'endDate'>,
  existingPermits: ParkingPermit[]
): Map<string, RowClash> {
  const result = new Map<string, RowClash>();
  const active = rows.filter(isRowComplete);

  active.forEach((row, i) => {
    const range = rowRange(row, common);
    if (!isIsoDate(range.startDate) || !isIsoDate(range.endDate) || range.endDate < range.startDate) return;
    const plate = cleanPlate(row.plate);
    const province = rowProvince(row);

    const existing = existingPermits.filter(
      (p) => cleanPlate(p.licensePlate) === plate && p.province === province && dateRangesOverlap(p, range)
    );
    const inBatch = active.some((other, j) => {
      if (j === i) return false;
      const o = rowRange(other, common);
      return cleanPlate(other.plate) === plate && rowProvince(other) === province && dateRangesOverlap(o, range);
    });
    if (existing.length || inBatch) result.set(row.key, { existing, inBatch });
  });
  return result;
}

// ---------------------------------------------------------------
// Matching what the reader found to the app's own lists
// ---------------------------------------------------------------

const squash = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/** The option that equals `value` ignoring case and spaces, or '' */
export function matchOption(value: string, options: readonly string[]): string {
  const target = squash(value);
  if (!target) return '';
  return options.find((o) => squash(o) === target) ?? '';
}

const PROVINCE_ALIASES: Record<string, string> = {
  กทม: 'กรุงเทพมหานคร',
  'กทม.': 'กรุงเทพมหานคร',
  กรุงเทพ: 'กรุงเทพมหานคร',
  กรุงเทพฯ: 'กรุงเทพมหานคร',
  'กรุงเทพฯ.': 'กรุงเทพมหานคร',
  bangkok: 'กรุงเทพมหานคร',
};

export function normalizeProvince(raw: string): string {
  const cleaned = raw.trim().replace(/^(จังหวัด|จ\.)\s*/, '');
  if (!cleaned) return '';
  const alias = PROVINCE_ALIASES[squash(cleaned)];
  if (alias) return alias;
  return matchOption(cleaned, PROVINCE_OPTIONS);
}

export function normalizeColor(raw: string): string {
  const cleaned = raw.trim().replace(/^สี\s*/, '');
  return matchOption(cleaned, VEHICLE_COLORS.filter((c) => c !== 'อื่นๆ')) || cleaned;
}

export function normalizeBrand(raw: string): string {
  const cleaned = raw.trim();
  return matchOption(cleaned, VEHICLE_BRANDS.filter((b) => b !== 'อื่นๆ')) || cleaned;
}

export function normalizeDepartment(raw: string): { select: string; custom: string } {
  const cleaned = raw.trim();
  if (!cleaned) return { select: '', custom: '' };
  const hit = matchOption(cleaned, DEPARTMENTS.filter((d) => d !== 'อื่นๆ'));
  return hit ? { select: hit, custom: '' } : { select: 'อื่นๆ', custom: cleaned };
}

// ---------------------------------------------------------------
// What the document reader returns (see cloudflare-worker/worker.js)
// ---------------------------------------------------------------

export interface ExtractedVehicle {
  kind: 'car' | 'motorcycle' | 'unknown';
  brand?: string | null;
  color?: string | null;
  plate?: string | null;
  province?: string | null;
  floor?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  uncertain?: string[] | null;
  note?: string | null;
}

/** How long the reading took, reported by the relay */
export interface ReadMeta {
  model: string;
  loginMs: number;
  aiMs: number;
  totalMs: number;
}

export interface ExtractedDocument {
  meta?: ReadMeta | null;
  department?: string | null;
  subDepartment?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  vehicles: ExtractedVehicle[];
  notes?: string | null;
}

export interface SkippedVehicle {
  text: string;
  reason: string;
}

export interface ImportDraft {
  rows: DraftRow[];
  common: BatchCommon;
  /** Motorcycles etc. that were left out on purpose, shown so the user can check */
  skipped: SkippedVehicle[];
  /** True when the document gave no dates and the selected date was used */
  datesAssumed: boolean;
  /** Timing and model of the reading, when the relay reported it */
  meta: ReadMeta | null;
  notes: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Thai digits (๐-๙) to 0-9, in case the reader left some in a plate */
export const thaiDigitsToArabic = (text: string): string => text.replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50));
const isoOrEmpty = (v: unknown): string => {
  const s = str(v);
  if (!isIsoDate(s)) return '';
  // A Buddhist-era year that was not converted
  const year = Number(s.slice(0, 4));
  return year > 2400 ? `${year - 543}${s.slice(4)}` : s;
};

const describeVehicle = (v: ExtractedVehicle): string =>
  [str(v.brand), str(v.color) && `สี${str(v.color)}`, str(v.plate) && `ทะเบียน ${str(v.plate)}`, str(v.province)]
    .filter(Boolean)
    .join(' ') || 'ไม่ทราบรายละเอียด';

const UNCERTAIN_FIELDS: RowField[] = ['brand', 'color', 'plate', 'province', 'floor'];

/**
 * Turns the reader's answer into rows for the table. Only cars become rows; motorcycles are listed
 * as skipped; vehicles whose type is unclear stay as rows with a flag so nothing is dropped silently.
 */
export function draftFromExtraction(doc: ExtractedDocument, fallbackDate: string): ImportDraft {
  const skipped: SkippedVehicle[] = [];
  const items: Array<{ row: DraftRow; start: string; end: string }> = [];
  const docStart = isoOrEmpty(doc.startDate);
  const docEnd = isoOrEmpty(doc.endDate);

  for (const v of doc.vehicles ?? []) {
    if (v.kind === 'motorcycle') {
      skipped.push({ text: describeVehicle(v), reason: str(v.note) || 'เป็นรถจักรยานยนต์' });
      continue;
    }

    const flags = new Set<RowField>();
    (v.uncertain ?? []).forEach((f) => {
      if ((UNCERTAIN_FIELDS as string[]).includes(f)) flags.add(f as RowField);
    });
    if (v.kind === 'unknown') flags.add('type');

    const brand = normalizeBrand(str(v.brand));
    if (brand && !matchOption(brand, VEHICLE_BRANDS)) flags.add('brand');
    const color = normalizeColor(str(v.color));
    if (color && !matchOption(color, VEHICLE_COLORS)) flags.add('color');
    const plate = cleanPlate(thaiDigitsToArabic(str(v.plate)));
    const province = normalizeProvince(str(v.province));
    if (str(v.province) && !province) flags.add('province');
    if (!str(v.floor)) flags.add('floor');
    const floor: 'B1' | 'B2' = /B\s*2|ชั้น\s*2|^2$/i.test(str(v.floor)) ? 'B2' : 'B1';

    const start = isoOrEmpty(v.startDate) || docStart;
    const end = isoOrEmpty(v.endDate) || docEnd || start;

    items.push({
      row: newRow({ brand, color, plate, province, floor, flags: [...flags] }),
      start,
      end: end && start && end < start ? start : end,
    });
  }

  // The shared dates are the range most cars have; cars with a different range keep their own
  const tally = new Map<string, number>();
  items.forEach(({ start, end }) => {
    if (start) tally.set(`${start}|${end}`, (tally.get(`${start}|${end}`) ?? 0) + 1);
  });
  let commonKey = '';
  let best = 0;
  tally.forEach((count, key) => {
    if (count > best) {
      best = count;
      commonKey = key;
    }
  });
  const [commonStart, commonEnd] = commonKey ? commonKey.split('|') : [fallbackDate, fallbackDate];
  const datesAssumed = !commonKey;

  items.forEach(({ row, start, end }) => {
    if (start && `${start}|${end}` !== commonKey) {
      row.startDate = start;
      row.endDate = end || start;
    }
  });

  const dept = normalizeDepartment(str(doc.department));
  return {
    rows: items.map((i) => i.row),
    common: {
      department: dept.select === 'อื่นๆ' ? dept.custom : dept.select,
      subDepartment: str(doc.subDepartment),
      startDate: commonStart,
      endDate: commonEnd || commonStart,
    },
    skipped,
    datesAssumed,
    meta: doc.meta && typeof doc.meta.totalMs === 'number' ? doc.meta : null,
    notes: str(doc.notes),
  };
}
