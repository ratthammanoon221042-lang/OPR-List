import { describe, it, expect } from 'vitest';
import {
  calculateNights, dateRangesOverlap, formatThaiDate, formatThaiDateTime, getDailySummaries, getDaysInMonth,
  isoToDmy, maskDmy, parseDmy,
  isIsoDate, isPermitActiveOnDate, parseFlexibleDate,
} from './dateUtils';
import { ParkingPermit } from '../types/parking';

const permit = (startDate: string, endDate: string, parkingFloor: 'B1' | 'B2' = 'B1'): ParkingPermit => ({
  id: `${startDate}-${endDate}-${parkingFloor}`,
  createdAt: '2026-10-01T00:00:00.000Z',
  licensePlate: '1กข4590',
  province: 'กรุงเทพมหานคร',
  vehicleBrand: 'Toyota',
  vehicleColor: 'ขาว',
  parkingFloor,
  startDate,
  endDate,
});

describe('isPermitActiveOnDate (start and end date both count)', () => {
  const p = permit('2026-10-06', '2026-10-08');
  it.each([
    ['2026-10-05', false],
    ['2026-10-06', true],
    ['2026-10-07', true],
    ['2026-10-08', true],
    ['2026-10-09', false],
  ])('%s -> %s', (date, expected) => {
    expect(isPermitActiveOnDate(p, date)).toBe(expected);
  });

  it('a single-day permit covers exactly that day', () => {
    const one = permit('2026-10-06', '2026-10-06');
    expect(isPermitActiveOnDate(one, '2026-10-06')).toBe(true);
    expect(isPermitActiveOnDate(one, '2026-10-07')).toBe(false);
  });
});

describe('calculateNights', () => {
  it('counts both ends', () => {
    expect(calculateNights('2026-10-06', '2026-10-06')).toBe(1);
    expect(calculateNights('2026-10-06', '2026-10-08')).toBe(3);
  });
  it('works across month and year boundaries', () => {
    expect(calculateNights('2026-10-30', '2026-11-02')).toBe(4);
    expect(calculateNights('2026-12-31', '2027-01-01')).toBe(2);
    expect(calculateNights('2028-02-28', '2028-03-01')).toBe(3); // leap year
  });
  it('is 0 for invalid or reversed input', () => {
    expect(calculateNights('', '2026-10-06')).toBe(0);
    expect(calculateNights('2026-10-08', '2026-10-06')).toBe(0);
    expect(calculateNights('2026-02-31', '2026-03-02')).toBe(0);
  });
});

describe('isIsoDate', () => {
  it('accepts real dates only', () => {
    expect(isIsoDate('2026-10-06')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('6/10/2026')).toBe(false);
    expect(isIsoDate('')).toBe(false);
  });
});

describe('parseFlexibleDate', () => {
  it.each([
    ['2026-10-06', '2026-10-06'],
    ['2026-10-06T17:00:00.000Z', '2026-10-06'],
    ['06/10/2026', '2026-10-06'],
    ['6/10/2569', '2026-10-06'],
    ['2569-10-06', '2026-10-06'],
    ['not a date', ''],
    ['2026-02-30', ''],
  ])('%s -> %s', (input, expected) => {
    expect(parseFlexibleDate(input)).toBe(expected);
  });
  it('returns empty text for non-strings', () => {
    expect(parseFlexibleDate(undefined)).toBe('');
    expect(parseFlexibleDate(20261006)).toBe('');
  });
});

describe('dateRangesOverlap', () => {
  it('detects shared nights, including touching ends', () => {
    expect(dateRangesOverlap(permit('2026-10-06', '2026-10-08'), permit('2026-10-08', '2026-10-10'))).toBe(true);
    expect(dateRangesOverlap(permit('2026-10-06', '2026-10-08'), permit('2026-10-09', '2026-10-10'))).toBe(false);
    expect(dateRangesOverlap(permit('2026-10-01', '2026-10-31'), permit('2026-10-15', '2026-10-15'))).toBe(true);
  });
});

describe('formatThaiDate', () => {
  it('uses the Buddhist year', () => {
    expect(formatThaiDate('2026-10-06', 'short')).toBe('6 ต.ค. 2569');
    expect(formatThaiDate('2026-10-06', 'long')).toBe('6 ตุลาคม 2569');
  });
  it('does not throw on bad input', () => {
    expect(formatThaiDate('', 'short')).toBe('-');
    expect(formatThaiDate('garbage', 'short')).toBe('garbage');
  });
});

describe('calendar helpers', () => {
  it('lists every day of a month', () => {
    expect(getDaysInMonth(2026, 2)).toHaveLength(28);
    expect(getDaysInMonth(2028, 2)).toHaveLength(29);
    expect(getDaysInMonth(2026, 10)[30]).toBe('2026-10-31');
  });
  it('summarises cars per day and floor', () => {
    const summaries = getDailySummaries(
      [permit('2026-10-06', '2026-10-07', 'B1'), permit('2026-10-07', '2026-10-07', 'B2')],
      ['2026-10-06', '2026-10-07', '2026-10-08']
    );
    expect(summaries.map((s) => [s.totalPermitted, s.b1Count, s.b2Count])).toEqual([
      [1, 1, 0],
      [2, 1, 1],
      [0, 0, 0],
    ]);
  });
});

describe('formatThaiDateTime', () => {
  it('writes the Buddhist year and a 24-hour time', () => {
    expect(formatThaiDateTime(new Date(2026, 9, 8, 14, 5))).toBe('8 ต.ค. 2569 14:05 น.');
    expect(formatThaiDateTime(new Date(2026, 0, 1, 0, 0))).toBe('1 ม.ค. 2569 00:00 น.');
  });
});

describe('dd/mm/yyyy helpers', () => {
  it('isoToDmy writes the day first', () => {
    expect(isoToDmy('2026-10-08')).toBe('08/10/2026');
    expect(isoToDmy('')).toBe('');
    expect(isoToDmy('2026-02-31')).toBe('');
  });

  it('maskDmy adds the slashes while typing and ignores other characters', () => {
    expect(maskDmy('0')).toBe('0');
    expect(maskDmy('08')).toBe('08');
    expect(maskDmy('081')).toBe('08/1');
    expect(maskDmy('0810')).toBe('08/10');
    expect(maskDmy('08102')).toBe('08/10/2');
    expect(maskDmy('08102026')).toBe('08/10/2026');
    expect(maskDmy('08/10/2026999')).toBe('08/10/2026');
    expect(maskDmy('8 Oct')).toBe('8');
    expect(maskDmy('08/')).toBe('08'); // the slash can be deleted with backspace
  });

  it('parseDmy accepts real dates only and understands Buddhist-era years', () => {
    expect(parseDmy('08/10/2026')).toBe('2026-10-08');
    expect(parseDmy('08/10/2569')).toBe('2026-10-08');
    expect(parseDmy('29/02/2028')).toBe('2028-02-29');
    expect(parseDmy('29/02/2026')).toBe('');
    expect(parseDmy('31/04/2026')).toBe('');
    expect(parseDmy('08/10/26')).toBe('');
    expect(parseDmy('2026-10-08')).toBe('');
    expect(parseDmy('')).toBe('');
  });

  it('round-trips', () => {
    for (const iso of ['2026-01-01', '2026-12-31', '2028-02-29']) expect(parseDmy(isoToDmy(iso))).toBe(iso);
  });
});
