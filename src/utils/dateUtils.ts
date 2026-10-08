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
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
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
 * Check if a permit covers a specific overnight date
 */
export function isPermitActiveOnDate(permit: ParkingPermit, targetDate: string): boolean {
  if (permit.startDate === permit.endDate) {
    return permit.startDate === targetDate;
  }
  return targetDate >= permit.startDate && targetDate < permit.endDate;
}

/**
 * Calculate number of overnight nights
 */
export function calculateNights(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(diffDays, 1);
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
    const [year, month, day] = date.split('-').map(Number);
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
