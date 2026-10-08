import React from 'react';
import { ParkingPermit } from '../types/parking';
import { formatThaiDate, isPermitActiveOnDate } from '../utils/dateUtils';

interface PrintReportProps {
  permits: ParkingPermit[];
  date: string;
}

/**
 * The only thing that is printed with window.print(): hidden on screen, shown in print.
 * The table header repeats on every printed page and rows never split across pages.
 */
export const PrintReport: React.FC<PrintReportProps> = ({ permits, date }) => {
  const active = permits.filter((p) => isPermitActiveOnDate(p, date));
  const b1 = active.filter((p) => p.parkingFloor === 'B1').length;
  const b2 = active.length - b1;

  return (
    <section id="print-report" className="hidden text-slate-900">
      <h1 className="text-center text-xl font-bold">รายงานทะเบียนรถขออนุญาตจอดค้างคืน</h1>
      <p className="text-center text-sm mt-1">ประจำวันที่: {formatThaiDate(date, 'long')}</p>
      <p className="text-center text-sm font-semibold mt-1 mb-3">
        รวมทั้งหมด {active.length} คัน | ชั้น B1: {b1} คัน | ชั้น B2: {b2} คัน
      </p>

      {active.length === 0 ? (
        <p className="text-center text-sm py-8 border border-slate-400">
          ไม่มีรายการรถขออนุญาตจอดค้างคืนในวันที่ {formatThaiDate(date, 'long')}
        </p>
      ) : (
        <table className="w-full border-collapse border border-slate-500 text-[12px]">
          <thead>
            <tr className="bg-slate-100">
              {['ลำดับ', 'ยี่ห้อ', 'สี', 'หน่วยงาน', 'ทะเบียน', 'จังหวัด', 'ชั้นที่จอด', 'วันที่ขอจอด'].map((h) => (
                <th key={h} className="border border-slate-500 px-2 py-1.5 text-center">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {active.map((p, i) => (
              <tr key={p.id}>
                <td className="border border-slate-400 px-2 py-1.5 text-center">{i + 1}</td>
                <td className="border border-slate-400 px-2 py-1.5 font-medium">{p.vehicleBrand}</td>
                <td className="border border-slate-400 px-2 py-1.5">{p.vehicleColor}</td>
                <td className="border border-slate-400 px-2 py-1.5">
                  {p.department || '-'}
                  {p.subDepartment ? ` (${p.subDepartment})` : ''}
                </td>
                <td className="border border-slate-400 px-2 py-1.5 text-center font-bold">{p.licensePlate}</td>
                <td className="border border-slate-400 px-2 py-1.5 text-center">{p.province}</td>
                <td className="border border-slate-400 px-2 py-1.5 text-center font-bold">{p.parkingFloor}</td>
                <td className="border border-slate-400 px-2 py-1.5 text-center whitespace-nowrap">
                  {formatThaiDate(p.startDate, 'short')} - {formatThaiDate(p.endDate, 'short')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-center text-[11px] text-slate-500 mt-4">
        เอกสารสำหรับเจ้าหน้าที่ รปภ. ตรวจสอบยานพาหนะเข้าจอดค้างคืน
      </p>
    </section>
  );
};
