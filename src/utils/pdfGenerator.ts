import { ParkingPermit } from '../types/parking';
import { formatThaiDate, formatThaiDateTime } from './dateUtils';

/**
 * The overnight parking report as A4 pages: used for the PDF download and for printing,
 * so both are exactly the same.
 *
 * Each page is drawn on an HTML5 canvas so the browser does the Thai text shaping
 * (jsPDF cannot position Thai vowels / tone marks correctly). The report flows over as
 * many pages as needed and the table header is repeated on every page.
 */

const PAGE_W = 1240; // A4 at ~150 DPI
const PAGE_H = 1754;
const SCALE = 2; // draw at 2x so text stays crisp when zoomed or printed
const MARGIN_X = 60;
const FOOTER_Y = PAGE_H - 50;
const TABLE_BOTTOM = PAGE_H - 90;
const HEADER_H = 44;
const ROW_H = 46;
const FIRST_PAGE_TABLE_Y = 245;
const NEXT_PAGE_TABLE_Y = 130;

const FONT = '"Prompt", "Sarabun", "TH Sarabun New", -apple-system, sans-serif';
const TABLE_FONT_PX = 20; // header and every cell: the same size, bold

/** 'download' = PDF file (every column); 'print' = the printout (no parking floor and no department) */
export type ReportLayout = 'download' | 'print';
type ColKey = 'index' | 'brand' | 'color' | 'department' | 'plate' | 'province' | 'floor' | 'dates';
const COLUMNS: Record<ReportLayout, { key: ColKey; header: string; width: number }[]> = {
  download: [
    { key: 'index', header: 'ลำดับ', width: 55 },
    { key: 'brand', header: 'ยี่ห้อ', width: 110 },
    { key: 'color', header: 'สี', width: 75 },
    { key: 'department', header: 'หน่วยงาน', width: 190 },
    { key: 'plate', header: 'ทะเบียน', width: 130 },
    { key: 'province', header: 'จังหวัด', width: 175 },
    { key: 'floor', header: 'ชั้นที่จอด', width: 95 },
    { key: 'dates', header: 'วันที่ขอจอด', width: 290 },
  ], // = 1120
  print: [
    { key: 'index', header: 'ลำดับ', width: 60 },
    { key: 'brand', header: 'ยี่ห้อ', width: 170 },
    { key: 'color', header: 'สี', width: 120 },
    { key: 'plate', header: 'ทะเบียน', width: 230 },
    { key: 'province', header: 'จังหวัด', width: 230 },
    { key: 'dates', header: 'วันที่ขอจอด', width: 310 },
  ], // = 1120
};
const TABLE_W = COLUMNS.download.reduce((a, b) => a + b.width, 0); // both layouts are the same total width

/** How many table rows fit on a page: page 1 has the big title block, later pages a small one */
export function rowsPerPage(isFirstPage: boolean): number {
  const tableY = isFirstPage ? FIRST_PAGE_TABLE_Y : NEXT_PAGE_TABLE_Y;
  return Math.floor((TABLE_BOTTOM - tableY - HEADER_H) / ROW_H);
}

/** Splits rows into pages, always returning at least one (empty) page */
export function paginate<T>(items: T[]): T[][] {
  const pages: T[][] = [];
  let index = 0;
  do {
    const size = rowsPerPage(pages.length === 0);
    pages.push(items.slice(index, index + size));
    index += size;
  } while (index < items.length);
  return pages;
}

/** Shortens text with an ellipsis so it fits the given pixel width */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(out + '…').width > maxWidth) {
    out = out.slice(0, -1);
  }
  return out + '…';
}

async function ensureFontsLoaded(): Promise<void> {
  if (!('fonts' in document)) return;
  try {
    await Promise.all([
      document.fonts.load(`15px ${FONT}`),
      document.fonts.load(`500 15px ${FONT}`),
      document.fonts.load(`bold 16px ${FONT}`),
      document.fonts.load(`bold ${TABLE_FONT_PX}px ${FONT}`),
    ]);
    await document.fonts.ready;
  } catch {
    // fall back to whatever font is available
  }
}

function drawPage(
  ctx: CanvasRenderingContext2D,
  rows: ParkingPermit[],
  firstIndex: number,
  pageNo: number,
  pageCount: number,
  summary: { total: number; b1: number; b2: number; noFloor: number; dateText: string; asOfText: string },
  layout: ReportLayout
): void {
  const cols = COLUMNS[layout];
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  ctx.textAlign = 'center';

  let tableY: number;
  if (pageNo === 1) {
    ctx.fillStyle = '#0f172a';
    ctx.font = `bold 32px ${FONT}`;
    ctx.fillText('รายงานทะเบียนรถขออนุญาตจอดค้างคืน', PAGE_W / 2, 105);

    ctx.fillStyle = '#334155';
    ctx.font = `500 20px ${FONT}`;
    ctx.fillText(`ประจำวันที่: ${summary.dateText}`, PAGE_W / 2, 150);

    ctx.font = `bold 16px ${FONT}`;
    ctx.fillStyle = '#1e40af';
    ctx.fillText(
      layout === 'print'
        ? `รวมทั้งหมด ${summary.total} คัน`
        : `รวมทั้งหมด ${summary.total} คัน   |   ชั้น B1: ${summary.b1} คัน   |   ชั้น B2: ${summary.b2} คัน${summary.noFloor > 0 ? `   |   ไม่ระบุชั้น: ${summary.noFloor} คัน` : ''}`,
      PAGE_W / 2,
      190
    );

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(MARGIN_X, 215);
    ctx.lineTo(PAGE_W - MARGIN_X, 215);
    ctx.stroke();
    tableY = FIRST_PAGE_TABLE_Y;
  } else {
    ctx.fillStyle = '#334155';
    ctx.font = `bold 20px ${FONT}`;
    ctx.fillText(`รายงานทะเบียนรถขออนุญาตจอดค้างคืน · ${summary.dateText} (ต่อ)`, PAGE_W / 2, 80);
    tableY = NEXT_PAGE_TABLE_Y;
  }

  // Table header
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(MARGIN_X, tableY, TABLE_W, HEADER_H);
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(MARGIN_X, tableY, TABLE_W, HEADER_H);

  let x = MARGIN_X;
  ctx.fillStyle = '#0f172a';
  ctx.font = `bold ${TABLE_FONT_PX}px ${FONT}`;
  cols.forEach(({ header, width }, i) => {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(header, x + width / 2, tableY + 28);
    if (i > 0) {
      ctx.beginPath();
      ctx.moveTo(x, tableY);
      ctx.lineTo(x, tableY + HEADER_H);
      ctx.stroke();
    }
    x += width;
  });

  // Rows
  if (rows.length === 0) {
    const emptyH = 120;
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.strokeRect(MARGIN_X, tableY + HEADER_H, TABLE_W, emptyH);
    ctx.fillStyle = '#64748b';
    ctx.font = `18px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(
      `ไม่มีรายการรถขออนุญาตจอดค้างคืนในวันที่ ${summary.dateText}`,
      PAGE_W / 2,
      tableY + HEADER_H + 70
    );
  } else {
    rows.forEach((permit, i) => {
      const y = tableY + HEADER_H + i * ROW_H;
      ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#f8fafc';
      ctx.fillRect(MARGIN_X, y, TABLE_W, ROW_H);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.strokeRect(MARGIN_X, y, TABLE_W, ROW_H);

      const textY = y + 30;
      // Every cell uses the same larger, bold font and colour
      const cellFont = `bold ${TABLE_FONT_PX}px ${FONT}`;
      const cellColor = '#0f172a';
      const make: Record<ColKey, { text: string; align: CanvasTextAlign }> = {
        index: { text: String(firstIndex + i + 1), align: 'center' },
        brand: { text: permit.vehicleBrand || '-', align: 'left' },
        color: { text: permit.vehicleColor || '-', align: 'left' },
        department: {
          text: permit.department
            ? `${permit.department}${permit.subDepartment ? ` (${permit.subDepartment})` : ''}`
            : permit.subDepartment || '-',
          align: 'left',
        },
        plate: { text: permit.licensePlate.replace(/\s+/g, ''), align: 'center' },
        province: { text: permit.province || '-', align: 'center' },
        floor: { text: permit.parkingFloor || '-', align: 'center' },
        dates: {
          text: `${formatThaiDate(permit.startDate, 'short')} - ${formatThaiDate(permit.endDate, 'short')}`,
          align: 'center',
        },
      };
      const cells = cols.map((col) => ({ ...make[col.key], font: cellFont, color: cellColor }));

      let cx = MARGIN_X;
      cells.forEach((cell, c) => {
        const w = cols[c].width;
        if (c > 0) {
          ctx.strokeStyle = '#cbd5e1';
          ctx.beginPath();
          ctx.moveTo(cx, y);
          ctx.lineTo(cx, y + ROW_H);
          ctx.stroke();
        }
        ctx.font = cell.font;
        ctx.fillStyle = cell.color;
        ctx.textAlign = cell.align;
        const text = fitText(ctx, cell.text, w - 16);
        ctx.fillText(text, cell.align === 'left' ? cx + 10 : cx + w / 2, textY);
        cx += w;
      });
    });
  }

  // Footer
  ctx.fillStyle = '#94a3b8';
  ctx.font = `14px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(
    `เอกสารสำหรับเจ้าหน้าที่ รปภ. ตรวจสอบยานพาหนะเข้าจอดค้างคืน${summary.asOfText}`,
    PAGE_W / 2,
    FOOTER_Y
  );
  ctx.textAlign = 'right';
  ctx.fillText(`หน้า ${pageNo}/${pageCount}`, PAGE_W - MARGIN_X, FOOTER_Y);
}

/** Draws every page of the report and returns them as JPEG data URLs (A4, ~300 DPI) */
export async function renderReportPages(
  permits: ParkingPermit[],
  targetDate: string,
  dataAsOf?: Date | null,
  layout: ReportLayout = 'download'
): Promise<string[]> {
  await ensureFontsLoaded();

  const pages = paginate(permits);
  const summary = {
    total: permits.length,
    b1: permits.filter((p) => p.parkingFloor === 'B1').length,
    b2: permits.filter((p) => p.parkingFloor === 'B2').length,
    noFloor: permits.filter((p) => !p.parkingFloor).length,
    dateText: formatThaiDate(targetDate, 'long'),
    asOfText: dataAsOf ? ` · ข้อมูล ณ ${formatThaiDateTime(dataAsOf)}` : '',
  };

  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W * SCALE;
  canvas.height = PAGE_H * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');
  ctx.scale(SCALE, SCALE);

  let firstIndex = 0;
  return pages.map((rows, i) => {
    drawPage(ctx, rows, firstIndex, i + 1, pages.length, summary, layout);
    firstIndex += rows.length;
    return canvas.toDataURL('image/jpeg', 0.92);
  });
}

export async function downloadParkingReportPdf(
  permits: ParkingPermit[],
  targetDate: string,
  dataAsOf?: Date | null
): Promise<void> {
  const images = await renderReportPages(permits, targetDate, dataAsOf, 'download');
  const { jsPDF } = await import('jspdf');

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pdfW = 210;
  const pdfH = (PAGE_H * pdfW) / PAGE_W;
  images.forEach((image, i) => {
    if (i > 0) pdf.addPage('a4', 'portrait');
    pdf.addImage(image, 'JPEG', 0, 0, pdfW, pdfH);
  });

  const filename = `รายงานทะเบียนรถขออนุญาตจอด_${targetDate}.pdf`;
  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
