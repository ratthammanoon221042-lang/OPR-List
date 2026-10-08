import { ParkingPermit } from '../types/parking';
import { formatThaiDate } from './dateUtils';
import { jsPDF } from 'jspdf';

/**
 * High-reliability client-side PDF generator for Overnight Parking reports.
 * Uses native HTML5 Canvas 2D rendering to guarantee:
 * - 100% correct Thai script and vowel rendering
 * - No dependency on html2canvas CSS parsing or CORS issues
 * - Clean, crisp A4 PDF output with columns ordered:
 *   ลำดับ | ยี่ห้อ | สี | หน่วยงาน | ทะเบียน | จังหวัด | ชั้นที่จอด | วันที่ขอจอด
 */
export async function downloadParkingReportPdf(
  permits: ParkingPermit[],
  targetDate: string
): Promise<void> {
  const activePermits = permits;
  const b1Count = activePermits.filter(p => p.parkingFloor === 'B1').length;
  const b2Count = activePermits.filter(p => p.parkingFloor === 'B2').length;
  const thaiDateStr = formatThaiDate(targetDate, 'long');

  // A4 resolution at ~150 DPI
  const canvasWidth = 1240;
  const canvasHeight = 1754;

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context not available');
  }

  // 1. Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Helper font setter
  const fontBase = '"Prompt", "Sarabun", "TH Sarabun New", -apple-system, sans-serif';

  // 2. Header Title
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.font = `bold 32px ${fontBase}`;
  ctx.fillText('รายงานทะเบียนรถขออนุญาตจอดค้างคืน', canvasWidth / 2, 105);

  // 3. Subtitle Date
  ctx.fillStyle = '#334155';
  ctx.font = `500 20px ${fontBase}`;
  ctx.fillText(`ประจำวันที่: ${thaiDateStr}`, canvasWidth / 2, 150);

  // 4. Summary badge text
  ctx.font = `bold 16px ${fontBase}`;
  ctx.fillStyle = '#1e40af';
  ctx.fillText(
    `รวมทั้งหมด ${activePermits.length} คัน   |   ชั้น B1: ${b1Count} คัน   |   ชั้น B2: ${b2Count} คัน`,
    canvasWidth / 2,
    190
  );

  // Horizontal divider
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(60, 215);
  ctx.lineTo(canvasWidth - 60, 215);
  ctx.stroke();

  // 5. Table geometry
  // Order: ลำดับ | ยี่ห้อ | สี | หน่วยงาน | ทะเบียน | จังหวัด | ชั้นที่จอด | วันที่ขอจอด
  const tableX = 60;
  const tableY = 245;
  const colWidths = [55, 175, 110, 180, 175, 150, 95, 180]; // Total = 1120 px
  const colHeaders = [
    'ลำดับ',
    'ยี่ห้อ',
    'สี',
    'หน่วยงาน',
    'ทะเบียน',
    'จังหวัด',
    'ชั้นที่จอด',
    'วันที่ขอจอด',
  ];
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  const headerHeight = 44;
  const rowHeight = 46;

  // Draw Table Header
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(tableX, tableY, tableWidth, headerHeight);
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(tableX, tableY, tableWidth, headerHeight);

  // Header column text & vertical dividers
  let currentX = tableX;
  ctx.fillStyle = '#0f172a';
  ctx.font = `bold 16px ${fontBase}`;
  ctx.textAlign = 'center';

  for (let i = 0; i < colHeaders.length; i++) {
    const w = colWidths[i];
    const centerX = currentX + w / 2;
    ctx.fillText(colHeaders[i], centerX, tableY + 28);

    if (i > 0) {
      ctx.beginPath();
      ctx.moveTo(currentX, tableY);
      ctx.lineTo(currentX, tableY + headerHeight);
      ctx.stroke();
    }
    currentX += w;
  }

  // Draw Table Rows
  if (activePermits.length === 0) {
    const emptyRowHeight = 120;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(tableX, tableY + headerHeight, tableWidth, emptyRowHeight);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.strokeRect(tableX, tableY + headerHeight, tableWidth, emptyRowHeight);

    ctx.fillStyle = '#64748b';
    ctx.font = `18px ${fontBase}`;
    ctx.textAlign = 'center';
    ctx.fillText(
      `ไม่มีรายการรถขออนุญาตจอดค้างคืนในวันที่ ${thaiDateStr}`,
      canvasWidth / 2,
      tableY + headerHeight + 70
    );
  } else {
    let currentY = tableY + headerHeight;

    activePermits.forEach((permit, index) => {
      // Row Background
      ctx.fillStyle = index % 2 === 0 ? '#ffffff' : '#f8fafc';
      ctx.fillRect(tableX, currentY, tableWidth, rowHeight);

      // Row Border
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.strokeRect(tableX, currentY, tableWidth, rowHeight);

      // Vertical dividers
      let xPos = tableX;
      for (let i = 0; i < colWidths.length; i++) {
        const w = colWidths[i];
        if (i > 0) {
          ctx.beginPath();
          ctx.moveTo(xPos, currentY);
          ctx.lineTo(xPos, currentY + rowHeight);
          ctx.stroke();
        }

        const textY = currentY + 29;
        ctx.fillStyle = '#0f172a';

        if (i === 0) {
          // ลำดับ
          ctx.textAlign = 'center';
          ctx.font = `15px ${fontBase}`;
          ctx.fillText((index + 1).toString(), xPos + w / 2, textY);
        } else if (i === 1) {
          // ยี่ห้อ
          ctx.textAlign = 'left';
          ctx.font = `500 15px ${fontBase}`;
          ctx.fillStyle = '#0f172a';
          ctx.fillText(permit.vehicleBrand, xPos + 10, textY);
        } else if (i === 2) {
          // สี
          ctx.textAlign = 'left';
          ctx.font = `15px ${fontBase}`;
          ctx.fillStyle = '#334155';
          ctx.fillText(permit.vehicleColor, xPos + 10, textY);
        } else if (i === 3) {
          // หน่วยงาน
          ctx.textAlign = 'left';
          ctx.font = `14px ${fontBase}`;
          ctx.fillStyle = '#475569';
          const fullDept = permit.department 
            ? `${permit.department}${permit.subDepartment ? ` (${permit.subDepartment})` : ''}`
            : (permit.subDepartment || '-');
          // Truncate if too long for cell
          const maxChars = 22;
          const displayDept = fullDept.length > maxChars ? fullDept.substring(0, maxChars) + '...' : fullDept;
          ctx.fillText(displayDept, xPos + 10, textY);
        } else if (i === 4) {
          // ทะเบียน (เขียนติดกัน ตัวหนา)
          ctx.textAlign = 'center';
          ctx.font = `bold 18px ${fontBase}`;
          ctx.fillText(permit.licensePlate.replace(/\s+/g, ''), xPos + w / 2, textY);
        } else if (i === 5) {
          // จังหวัด
          ctx.textAlign = 'center';
          ctx.font = `15px ${fontBase}`;
          ctx.fillText(permit.province || 'กรุงเทพมหานคร', xPos + w / 2, textY);
        } else if (i === 6) {
          // ชั้นที่จอด: B1 หรือ B2
          ctx.textAlign = 'center';
          ctx.font = `bold 17px ${fontBase}`;
          ctx.fillStyle = permit.parkingFloor === 'B1' ? '#1d4ed8' : '#4338ca';
          ctx.fillText(permit.parkingFloor, xPos + w / 2, textY);
        } else if (i === 7) {
          // วันที่ขอจอด
          ctx.textAlign = 'center';
          ctx.font = `13px ${fontBase}`;
          ctx.fillStyle = '#334155';
          const rangeStr = `${formatThaiDate(permit.startDate, 'short')} - ${formatThaiDate(permit.endDate, 'short')}`;
          ctx.fillText(rangeStr, xPos + w / 2, textY);
        }

        xPos += w;
      }

      currentY += rowHeight;
    });
  }

  // 6. Footer Information
  ctx.fillStyle = '#94a3b8';
  ctx.font = `14px ${fontBase}`;
  ctx.textAlign = 'center';
  ctx.fillText(
    'เอกสารสำหรับเจ้าหน้าที่ รปภ. ตรวจสอบยานพาหนะเข้าจอดค้างคืน · สร้างอัตโนมัติจากระบบ',
    canvasWidth / 2,
    canvasHeight - 50
  );

  // 7. Convert Canvas to jsPDF
  const imgData = canvas.toDataURL('image/jpeg', 0.96);
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pdfWidth = 210;
  const pdfHeight = (canvasHeight * pdfWidth) / canvasWidth;
  pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);

  // 8. Download PDF with multi-tier fallback
  const filename = `รายงานทะเบียนรถขออนุญาตจอด_${targetDate}.pdf`;
  try {
    pdf.save(filename);
  } catch (saveErr) {
    console.warn('Standard pdf.save failed, falling back to Blob download', saveErr);
    const pdfBlob = pdf.output('blob');
    const blobUrl = URL.createObjectURL(pdfBlob);
    const downloadLink = document.createElement('a');
    downloadLink.href = blobUrl;
    downloadLink.download = filename;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
  }
}
