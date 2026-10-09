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
const COL_WIDTHS = [55, 175, 110, 180, 175, 150, 95, 180]; // = 1120
const COL_HEADERS = ['ลำดับ', 'ยี่ห้อ', 'สี', 'หน่วยงาน', 'ทะเบียน', 'จังหวัด', 'ชั้นที่จอด', 'วันที่ขอจอด'];
const TABLE_W = COL_WIDTHS.reduce((a, b) => a + b, 0);

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
  summary: { total: number; b1: number; b2: number; dateText: string; asOfText: string }
): void {
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
      `รวมทั้งหมด ${summary.total} คัน   |   ชั้น B1: ${summary.b1} คัน   |   ชั้น B2: ${summary.b2} คัน`,
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
  ctx.font = `bold 16px ${FONT}`;
  COL_HEADERS.forEach((header, i) => {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(header, x + COL_WIDTHS[i] / 2, tableY + 28);
    if (i > 0) {
      ctx.beginPath();
      ctx.moveTo(x, tableY);
      ctx.lineTo(x, tableY + HEADER_H);
      ctx.stroke();
    }
    x += COL_WIDTHS[i];
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

      const textY = y + 29;
      const cells: { text: string; align: CanvasTextAlign; font: string; color: string }[] = [
        { text: String(firstIndex + i + 1), align: 'center', font: `15px ${FONT}`, color: '#0f172a' },
        { text: permit.vehicleBrand, align: 'left', font: `500 15px ${FONT}`, color: '#0f172a' },
        { text: permit.vehicleColor || '-', align: 'left', font: `15px ${FONT}`, color: '#334155' },
        {
          text: permit.department
            ? `${permit.department}${permit.subDepartment ? ` (${permit.subDepartment})` : ''}`
            : permit.subDepartment || '-',
          align: 'left',
          font: `14px ${FONT}`,
          color: '#475569',
        },
        {
          text: permit.licensePlate.replace(/\s+/g, ''),
          align: 'center',
          font: `bold 18px ${FONT}`,
          color: '#0f172a',
        },
        { text: permit.province || 'กรุงเทพมหานคร', align: 'center', font: `15px ${FONT}`, color: '#0f172a' },
        {
          text: permit.parkingFloor,
          align: 'center',
          font: `bold 17px ${FONT}`,
          color: permit.parkingFloor === 'B1' ? '#1d4ed8' : '#4338ca',
        },
        {
          text: `${formatThaiDate(permit.startDate, 'short')} - ${formatThaiDate(permit.endDate, 'short')}`,
          align: 'center',
          font: `13px ${FONT}`,
          color: '#334155',
        },
      ];

      let cx = MARGIN_X;
      cells.forEach((cell, c) => {
        const w = COL_WIDTHS[c];
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
  dataAsOf?: Date | null
): Promise<string[]> {
  await ensureFontsLoaded();

  const pages = paginate(permits);
  const summary = {
    total: permits.length,
    b1: permits.filter((p) => p.parkingFloor === 'B1').length,
    b2: permits.filter((p) => p.parkingFloor === 'B2').length,
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
    drawPage(ctx, rows, firstIndex, i + 1, pages.length, summary);
    firstIndex += rows.length;
    return canvas.toDataURL('image/jpeg', 0.92);
  });
}

export async function downloadParkingReportPdf(
  permits: ParkingPermit[],
  targetDate: string,
  dataAsOf?: Date | null
): Promise<void> {
  const images = await renderReportPages(permits, targetDate, dataAsOf);
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
