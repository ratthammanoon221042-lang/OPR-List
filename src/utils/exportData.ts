import { ParkingPermit } from '../types/parking';
import { formatThaiDate } from './dateUtils';

export const EXPORT_HEADERS = [
  'ลำดับ',
  'ยี่ห้อ',
  'สี',
  'หน่วยงาน',
  'หน่วยงานย่อย',
  'หมายเลขทะเบียน',
  'จังหวัด',
  'วันที่ขอจอด',
];

export function permitToExportRow(permit: ParkingPermit, index: number): (string | number)[] {
  return [
    index + 1,
    permit.vehicleBrand || '-',
    permit.vehicleColor || '-',
    permit.department || '-',
    permit.subDepartment || '-',
    permit.licensePlate.replace(/\s+/g, ''),
    permit.province || '-',
    `${formatThaiDate(permit.startDate, 'short')} - ${formatThaiDate(permit.endDate, 'short')}`,
  ];
}

/**
 * Escapes one CSV field: quotes are doubled, and values that a spreadsheet would
 * treat as a formula (=, +, -, @) get a leading apostrophe. A lone "-" (empty marker) stays as is.
 */
export function escapeCsvField(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@\t\r]./s.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildCsv(permits: ParkingPermit[]): string {
  const rows = permits.map((p, i) => permitToExportRow(p, i));
  const lines = [EXPORT_HEADERS, ...rows].map((row) => row.map(escapeCsvField).join(','));
  // BOM so Excel opens the Thai text as UTF-8
  return '﻿' + lines.join('\r\n');
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export function downloadCsv(permits: ParkingPermit[], date: string): void {
  const blob = new Blob([buildCsv(permits)], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `รายการทะเบียนรถ_${date}.csv`);
}

export async function downloadExcel(permits: ParkingPermit[], date: string): Promise<void> {
  // Loaded on demand so the Excel writer is not part of the initial bundle
  const { default: writeXlsxFile } = await import('write-excel-file/universal');

  // Every cell uses the same larger, bold font
  const FONT_SIZE = 14;
  const header = EXPORT_HEADERS.map((value) => ({
    value,
    fontWeight: 'bold' as const,
    fontSize: FONT_SIZE,
    align: 'center' as const,
  }));
  const body = permits.map((p, i) =>
    permitToExportRow(p, i).map((value) =>
      typeof value === 'number'
        ? { value, type: Number, fontWeight: 'bold' as const, fontSize: FONT_SIZE }
        : { value, type: String, fontWeight: 'bold' as const, fontSize: FONT_SIZE }
    )
  );

  const blob = await writeXlsxFile([header, ...body], {
    columns: [
      { width: 9 },
      { width: 16 },
      { width: 14 },
      { width: 20 },
      { width: 22 },
      { width: 20 },
      { width: 22 },
      { width: 34 },
    ],
    sheet: `ประจำวันที่ ${date}`,
  }).toBlob();
  downloadBlob(blob, `รายการทะเบียนรถ_${date}.xlsx`);
}
