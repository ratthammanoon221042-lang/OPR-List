import { ParkingPermit, DayParkingSummary } from '../types/parking';

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

const THAI_DAYS_SHORT = [
  'อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'
];

const THAI_DAYS_FULL = [
  'อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'
];

/**
 * Returns today's date formatted as YYYY-MM-DD in local time
 */
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format date string YYYY-MM-DD to Thai string (e.g. "6 ต.ค. 2569")
 */
export function formatThaiDate(dateStr: string, format: 'short' | 'long' = 'short'): string {
  if (!dateStr) return '-';
  if (!isIsoDate(dateStr)) return dateStr;
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10) + 543;
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  if (format === 'long') {
    return `${day} ${THAI_MONTHS[monthIdx]} ${year}`;
  }
  return `${day} ${THAI_MONTHS_SHORT[monthIdx]} ${year}`;
}

/**
 * Get Thai day name from date string YYYY-MM-DD (e.g. "จันทร์" หรือ "จันทร์ 5 ต.ค.")
 */
export function getThaiDayName(dateStr: string, short: boolean = false): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return short ? THAI_DAYS_SHORT[d.getDay()] : THAI_DAYS_FULL[d.getDay()];
}

/**
 * Check if a permit covers a specific overnight date.
 * The start date and the end date are both counted (e.g. 6-8 Oct = 6, 7 and 8).
 */
export function isPermitActiveOnDate(
  permit: Pick<ParkingPermit, 'startDate' | 'endDate'>,
  targetDate: string
): boolean {
  return targetDate >= permit.startDate && targetDate <= permit.endDate;
}

function toUtcDay(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * Number of overnight nights, counting both the start and the end date
 */
export function calculateNights(startDate: string, endDate: string): number {
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) return 0;
  const diffDays = Math.round((toUtcDay(endDate) - toUtcDay(startDate)) / 86_400_000);
  return diffDays < 0 ? 0 : diffDays + 1;
}

/**
 * True for a real calendar date written as YYYY-MM-DD
 */
export function isIsoDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/**
 * Best effort conversion of loose date text to YYYY-MM-DD.
 * Accepts ISO strings (with or without time), dd/mm/yyyy and Buddhist-era years.
 * Returns '' when the text is not a date.
 */
export function parseFlexibleDate(value: unknown): string {
  if (typeof value !== 'string') return '';
  const s = value.trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) {
    const year = Number(iso[1]) > 2400 ? Number(iso[1]) - 543 : Number(iso[1]);
    const out = `${year}-${iso[2]}-${iso[3]}`;
    return isIsoDate(out) ? out : '';
  }

  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (dmy) {
    const year = Number(dmy[3]) > 2400 ? Number(dmy[3]) - 543 : Number(dmy[3]);
    const out = `${year}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    return isIsoDate(out) ? out : '';
  }
  return '';
}

/**
 * Two permits overlap when they share at least one night
 */
export function dateRangesOverlap(
  a: Pick<ParkingPermit, 'startDate' | 'endDate'>,
  b: Pick<ParkingPermit, 'startDate' | 'endDate'>
): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

/**
 * Generate all dates in a month (e.g. 2026-10-01 to 2026-10-31)
 */
export function getDaysInMonth(year: number, month: number): string[] {
  // month is 1-indexed (1 = Jan, 10 = Oct)
  const lastDay = new Date(year, month, 0).getDate();
  const dates: string[] = [];
  const mStr = String(month).padStart(2, '0');
  
  for (let d = 1; d <= lastDay; d++) {
    const dStr = String(d).padStart(2, '0');
    dates.push(`${year}-${mStr}-${dStr}`);
  }
  return dates;
}

/**
 * Compute summary for each day in a list of dates
 * with breakdown for B1 and B2
 */
export function getDailySummaries(permits: ParkingPermit[], dates: string[]): DayParkingSummary[] {
  return dates.map(date => {
    const activePermits = permits.filter(p => isPermitActiveOnDate(p, date));
    const b1Count = activePermits.filter(p => p.parkingFloor === 'B1').length;
    const b2Count = activePermits.filter(p => p.parkingFloor === 'B2').length;
    const [, month, day] = date.split('-').map(Number);
    const dayName = getThaiDayName(date, false);
    const formattedDate = `${day} ${THAI_MONTHS_SHORT[month - 1]}`;

    return {
      date,
      formattedDate,
      dayName,
      totalPermitted: activePermits.length,
      b1Count,
      b2Count,
      vehicles: activePermits
    };
  });
}

/**
 * "8 ต.ค. 2569 14:05 น." for a moment in time (local time, Buddhist year)
 */
export function formatThaiDateTime(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${date.getDate()} ${THAI_MONTHS_SHORT[date.getMonth()]} ${date.getFullYear() + 543} ${hh}:${mm} น.`;
}
