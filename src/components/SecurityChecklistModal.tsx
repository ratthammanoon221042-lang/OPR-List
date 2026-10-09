import React, { useState } from 'react';
import { ParkingPermit } from '../types/parking';
import { isPermitActiveOnDate, formatThaiDate, getTodayDateString } from '../utils/dateUtils';
import { downloadParkingReportPdf } from '../utils/pdfGenerator';
import { downloadCsv, downloadExcel } from '../utils/exportData';
import { DateField } from './DateField';
import { X, Printer, Download, FileSpreadsheet, Calendar, FileDown, Loader2 } from 'lucide-react';

interface SecurityChecklistModalProps {
  isOpen: boolean;
  onClose: () => void;
  permits: ParkingPermit[];
  initialDate?: string;
  onPrint: (date: string) => void;
  dataAsOf?: Date | null;
}

export const SecurityChecklistModal: React.FC<SecurityChecklistModalProps> = ({ isOpen, ...rest }) => {
  if (!isOpen) return null;
  return <SecurityChecklist {...rest} />;
};

const SecurityChecklist: React.FC<Omit<SecurityChecklistModalProps, 'isOpen'>> = ({
  onClose,
  permits,
  initialDate,
  onPrint,
  dataAsOf,
}) => {
  const [targetDate, setTargetDate] = useState(() => initialDate || getTodayDateString());
  const [isExporting, setIsExporting] = useState(false);

  // Filter permits for targetDate
  const activePermits = permits.filter(p => isPermitActiveOnDate(p, targetDate));
  const b1Count = activePermits.filter(p => p.parkingFloor === 'B1').length;
  const b2Count = activePermits.filter(p => p.parkingFloor === 'B2').length;

  // 100% Reliable Client-Side PDF Download
  const handleDownloadPDF = async () => {
    setIsExporting(true);
    try {
      await downloadParkingReportPdf(activePermits, targetDate, dataAsOf);
    } catch (err) {
      console.error('Failed to generate PDF', err);
      window.alert('สร้างไฟล์ PDF ไม่สำเร็จ ลองใช้ปุ่มพิมพ์แล้วเลือก "บันทึกเป็น PDF" แทน');
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => onPrint(targetDate);

  const handleExportCSV = () => downloadCsv(activePermits, targetDate);

  const handleExportExcel = async () => {
    try {
      await downloadExcel(activePermits, targetDate);
    } catch (err) {
      console.error('Failed to export Excel', err);
      window.alert('ส่งออกไฟล์ Excel ไม่สำเร็จ ลองใช้ CSV แทน');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      {/* Modal Dialog Container with max-h-[92vh] to guarantee top is NEVER cut off */}
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        
        {/* Top Controls Toolbar - ALWAYS VISIBLE AT TOP */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-400 shrink-0" />
            <div>
              <h3 className="text-sm sm:text-base font-bold">เอกสาร PDF รายการทะเบียนรถขออนุญาตจอด</h3>
              <p className="text-xs text-slate-300">
                เรียงลำดับ: ยี่ห้อ · สี · หน่วยงาน · ทะเบียน · จังหวัด · ชั้นที่จอด · วันที่ขอจอด
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Primary Action: Direct PDF Download */}
            <button
              type="button"
              onClick={handleDownloadPDF}
              disabled={isExporting}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 text-white text-xs font-bold rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>กำลังสร้าง PDF...</span>
                </>
              ) : (
                <>
                  <FileDown className="w-3.5 h-3.5" />
                  <span>ดาวน์โหลดไฟล์ PDF</span>
                </>
              )}
            </button>

            {/* Print button */}
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium rounded-lg transition-colors cursor-pointer"
              title="พิมพ์ผ่านเครื่องพิมพ์"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>พิมพ์</span>
            </button>

            {/* CSV Export */}
            <button
              type="button"
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium rounded-lg transition-colors cursor-pointer"
              title="ส่งออก CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>

            {/* Excel Export */}
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium rounded-lg transition-colors cursor-pointer"
              title="ส่งออก Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Excel</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Date Selector Bar - ALWAYS VISIBLE */}
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-2.5 flex items-center justify-between text-xs text-slate-600 shrink-0">
          <div className="flex items-center gap-2">
            <label htmlFor="report-date" className="font-semibold text-slate-700">เลือกวันที่สำหรับรายงาน:</label>
            <div className="w-36">
              <DateField id="report-date" value={targetDate} onChange={(iso) => iso && setTargetDate(iso)} />
            </div>
          </div>

          <div className="font-medium text-slate-700 flex items-center gap-2">
            <span>จำนวนรถ: <strong className="text-blue-700 font-bold">{activePermits.length}</strong> คัน</span>
            <span className="text-slate-300">|</span>
            <span className="text-blue-700 font-semibold">ชั้น B1: {b1Count} คัน</span>
            <span className="text-slate-300">·</span>
            <span className="text-indigo-700 font-semibold">ชั้น B2: {b2Count} คัน</span>
          </div>
        </div>

        {/* SCROLLABLE SHEET PREVIEW */}
        <div className="p-6 sm:p-8 bg-white text-slate-900 font-sans overflow-y-auto flex-1">
          
          {/* Header: Title & Date */}
          <div className="text-center pb-5 mb-5 border-b-2 border-slate-900">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              รายการทะเบียนรถขออนุญาตจอดค้างคืน
            </h1>
            <p className="text-sm text-slate-800 font-medium mt-1">
              ประจำวันที่: {formatThaiDate(targetDate, 'long')}
            </p>
          </div>

          {/* Table with user's exact requested order:
              ลำดับ | ยี่ห้อ | สี | หน่วยงาน | ทะเบียน | จังหวัด | ชั้นที่จอด | วันที่ขอจอด */}
          {activePermits.length === 0 ? (
            <div className="py-12 text-center text-slate-500 border border-dashed border-slate-300 rounded-lg text-sm">
              ไม่มีรายการรถขออนุญาตจอดค้างคืนในวันที่ {formatThaiDate(targetDate, 'long')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse border border-slate-400 text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-100 border-b-2 border-slate-400 text-slate-900 font-bold">
                    <th className="py-2.5 px-2.5 border border-slate-300 text-center w-12">ลำดับ</th>
                    <th className="py-2.5 px-3 border border-slate-300">ยี่ห้อ</th>
                    <th className="py-2.5 px-3 border border-slate-300">สี</th>
                    <th className="py-2.5 px-3 border border-slate-300">หน่วยงาน</th>
                    <th className="py-2.5 px-3 border border-slate-300 text-center">หมายเลขทะเบียน</th>
                    <th className="py-2.5 px-3 border border-slate-300 text-center">จังหวัด</th>
                    <th className="py-2.5 px-3 border border-slate-300 text-center">ชั้นที่จอด</th>
                    <th className="py-2.5 px-3 border border-slate-300 text-center">วันที่ขอจอด</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300">
                  {activePermits.map((permit, index) => (
                    <tr key={permit.id} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-2.5 border border-slate-300 text-center font-mono text-slate-600">
                        {index + 1}
                      </td>
                      <td className="py-2.5 px-3 border border-slate-300 font-semibold text-slate-800">
                        {permit.vehicleBrand || '-'}
                      </td>
                      <td className="py-2.5 px-3 border border-slate-300 text-slate-700">
                        {permit.vehicleColor || '-'}
                      </td>
                      <td className="py-2.5 px-3 border border-slate-300 text-slate-600">
                        <span>{permit.department || '-'}</span>
                        {permit.subDepartment && (
                          <span className="text-xs text-slate-500 block">({permit.subDepartment})</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 border border-slate-300 text-center font-bold text-slate-900 font-mono tracking-wider">
                        {permit.licensePlate.replace(/\s+/g, '')}
                      </td>
                      <td className="py-2.5 px-3 border border-slate-300 text-center font-medium text-slate-800">
                        {permit.province || '-'}
                      </td>
                      <td className="py-2.5 px-3 border border-slate-300 text-center font-bold text-blue-700">
                        {permit.parkingFloor}
                      </td>
                      <td className="py-2.5 px-3 border border-slate-300 text-center text-slate-600 whitespace-nowrap text-xs font-mono">
                        {formatThaiDate(permit.startDate, 'short')} - {formatThaiDate(permit.endDate, 'short')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer - ALWAYS VISIBLE AT BOTTOM */}
        <div className="bg-slate-100 px-6 py-3 border-t border-slate-200 flex justify-between items-center text-xs shrink-0">
          <span className="text-slate-500 hidden sm:inline">
            กด 'ดาวน์โหลดไฟล์ PDF' เพื่อบันทึกเป็นไฟล์ .pdf ลงเครื่องทันที
          </span>
          <div className="flex gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              ปิด
            </button>
            <button
              type="button"
              onClick={handleDownloadPDF}
              disabled={isExporting}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 text-white font-bold rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              <span>ดาวน์โหลดไฟล์ PDF</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
