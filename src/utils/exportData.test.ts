import { describe, it, expect } from 'vitest';
import { buildCsv, escapeCsvField, permitToExportRow } from './exportData';
import { ParkingPermit } from '../types/parking';

const permit: ParkingPermit = {
  id: 'PK-1',
  createdAt: '2026-10-06T03:00:00.000Z',
  licensePlate: '1กข4590',
  province: 'กรุงเทพมหานคร',
  vehicleBrand: 'Toyota',
  vehicleColor: 'ขาว',
  parkingFloor: 'B1',
  department: 'สร.',
  startDate: '2026-10-06',
  endDate: '2026-10-08',
};

describe('escapeCsvField', () => {
  it('doubles quotes so a field cannot break out of its cell', () => {
    expect(escapeCsvField('5" "wheel"')).toBe('"5"" ""wheel"""');
  });
  it('neutralises spreadsheet formulas', () => {
    expect(escapeCsvField('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(escapeCsvField('+1')).toBe(`"'+1"`);
    expect(escapeCsvField('@cmd')).toBe(`"'@cmd"`);
  });
  it('keeps commas and newlines inside the quotes', () => {
    expect(escapeCsvField('a,b\nc')).toBe('"a,b\nc"');
  });
});

describe('buildCsv', () => {
  it('starts with a BOM, has a header, and one line per permit', () => {
    const csv = buildCsv([permit, { ...permit, id: 'PK-2', vehicleBrand: 'Ho"nda' }]);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('"1","Toyota","ขาว","สร.","-","1กข4590","กรุงเทพมหานคร","6 ต.ค. 2569 - 8 ต.ค. 2569"');
    expect(lines[2]).toContain('"Ho""nda"');
  });
});

describe('permitToExportRow', () => {
  it('numbers rows from 1 and joins the date range', () => {
    expect(permitToExportRow(permit, 4)[0]).toBe(5);
  });
});
