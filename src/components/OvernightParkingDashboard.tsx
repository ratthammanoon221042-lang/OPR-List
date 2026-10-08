import React, { useState, useMemo } from 'react';
import { ParkingPermit } from '../types/parking';
import { getDaysInMonth, isPermitActiveOnDate, formatThaiDate, getThaiDayName } from '../utils/dateUtils';
import { downloadParkingReportPdf } from '../utils/pdfGenerator';
import { Calendar, ChevronLeft, ChevronRight, FileDown, Printer, Trash2, Pencil, Loader2, Search, Building2 } from 'lucide-react';

interface OvernightParkingDashboardProps {
  permits: ParkingPermit[];
  onDeletePermit?: (permit: ParkingPermit) => void;
  onEditPermit?: (permit: ParkingPermit) => void;
  onPrint?: (date: string) => void;
  dataAsOf?: Date | null;
  isAuthenticated: boolean;
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

export const OvernightParkingDashboard: React.FC<OvernightParkingDashboardProps> = ({
  permits,
  onDeletePermit,
  onEditPermit,
  onPrint,
  dataAsOf,
  isAuthenticated,
  selectedDate,
  onSelectDate,
}) => {
  // The month shown follows the selected date (also when it is changed from outside)
  const parseYearMonth = (date: string) => {
    const parts = date.split('-').map(Number);
    if (parts[0] && parts[1]) return { year: parts[0], month: parts[1] };
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  };

  const [currentYear, setCurrentYear] = useState(() => parseYearMonth(selectedDate).year);
  const [currentMonth, setCurrentMonth] = useState(() => parseYearMonth(selectedDate).month);
  const [trackedDate, setTrackedDate] = useState(selectedDate);
  const [isExporting, setIsExporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [floorFilter, setFloorFilter] = useState<'all' | 'B1' | 'B2'>('all');

  if (selectedDate !== trackedDate) {
    setTrackedDate(selectedDate);
    const { year, month } = parseYearMonth(selectedDate);
    setCurrentYear(year);
    setCurrentMonth(month);
  }

  const thaiMonthNames = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];

  // Month navigation
  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  // Days in selected month
  const monthDates = useMemo(() => {
    return getDaysInMonth(currentYear, currentMonth);
  }, [currentYear, currentMonth]);

  // Compute daily statistics for the month
  const dayStats = useMemo(() => {
    return monthDates.map(dateStr => {
      const dayNum = parseInt(dateStr.split('-')[2], 10);
      const dayPermits = permits.filter(p => isPermitActiveOnDate(p, dateStr));
      const b1 = dayPermits.filter(p => p.parkingFloor === 'B1').length;
      const b2 = dayPermits.filter(p => p.parkingFloor === 'B2').length;
      return {
        date: dateStr,
        dayNum,
        count: dayPermits.length,
        b1Count: b1,
        b2Count: b2,
        permits: dayPermits,
      };
    });
  }, [monthDates, permits]);

  // Total vehicle-nights in current month
  const totalCarsInMonth = useMemo(() => {
    return dayStats.reduce((sum, d) => sum + d.count, 0);
  }, [dayStats]);

  // Selected day's data
  const currentDayStat = useMemo(() => {
    return dayStats.find(d => d.date === selectedDate) || {
      date: selectedDate,
      dayNum: parseInt(selectedDate.split('-')[2] || '6', 10),
      count: permits.filter(p => isPermitActiveOnDate(p, selectedDate)).length,
      b1Count: permits.filter(p => isPermitActiveOnDate(p, selectedDate) && p.parkingFloor === 'B1').length,
      b2Count: permits.filter(p => isPermitActiveOnDate(p, selectedDate) && p.parkingFloor === 'B2').length,
      permits: permits.filter(p => isPermitActiveOnDate(p, selectedDate)),
    };
  }, [dayStats, selectedDate, permits]);

  // Filtered permits for the selected day based on search query & floor filter
  const displayedPermits = useMemo(() => {
    return currentDayStat.permits.filter(p => {
      if (floorFilter !== 'all' && p.parkingFloor !== floorFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase().replace(/\s+/g, '');
        const plate = p.licensePlate.toLowerCase().replace(/\s+/g, '');
        const prov = (p.province || '').toLowerCase();
        const brand = p.vehicleBrand.toLowerCase();
        const color = p.vehicleColor.toLowerCase();
        const dept = (p.department || '').toLowerCase();
        const subDept = (p.subDepartment || '').toLowerCase();
        return (
          plate.includes(query) ||
          prov.includes(query) ||
          brand.includes(query) ||
          color.includes(query) ||
          dept.includes(query) ||
          subDept.includes(query)
        );
      }
      return true;
    });
  }, [currentDayStat.permits, floorFilter, searchQuery]);

  // Density colors for 1-31 number strip
  const getDensityClass = (count: number, isSelected: boolean) => {
    if (isSelected) {
      return 'bg-blue-600 text-white font-bold ring-2 ring-blue-600 shadow-sm scale-105 z-10';
    }
    if (count === 0) {
      return 'bg-slate-100 text-slate-600 hover:bg-slate-200';
    }
    if (count === 1) {
      return 'bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold border border-blue-200/50';
    }
    if (count === 2) {
      return 'bg-blue-100 text-blue-800 hover:bg-blue-200 font-semibold border border-blue-200';
    }
    if (count === 3) {
      return 'bg-blue-200 text-blue-900 hover:bg-blue-300 font-bold border border-blue-300';
    }
    return 'bg-blue-300 text-blue-950 hover:bg-blue-400 font-bold border border-blue-400';
  };

  // Direct High-Reliability PDF Download
  const handleDownloadPDF = async () => {
    setIsExporting(true);
    try {
      await downloadParkingReportPdf(currentDayStat.permits, selectedDate, dataAsOf);
    } catch (err) {
      console.error('PDF export error:', err);
      window.alert('สร้างไฟล์ PDF ไม่สำเร็จ ลองใช้ปุ่มพิมพ์แล้วเลือก "บันทึกเป็น PDF" แทน');
    } finally {
      setIsExporting(false);
    }
  };

  const shortThaiDay = getThaiDayName(selectedDate, false); // e.g. "วันอังคาร"
  const thaiFormattedDate = formatThaiDate(selectedDate, 'long'); // e.g. "6 ตุลาคม 2569"

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 sm:p-6 space-y-4 sm:space-y-5">
      
      {/* 1. Header Row: สรุปยอดจอดค้างคืน + ตัวเลือกเดือน + ยอดรวมทั้งเดือน */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs shrink-0">
            <Calendar className="w-5 h-5" />
          </div>

          <h2 className="text-base sm:text-xl font-bold text-slate-800 tracking-tight">
            สรุปยอดจอดค้างคืน
          </h2>

          {/* Month Switcher: < ตุลาคม 2569 > */}
          <div className="flex items-center bg-white rounded-xl border border-slate-300 p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors cursor-pointer"
              title="เดือนก่อนหน้า"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 sm:px-3 text-xs sm:text-sm font-bold text-slate-800 whitespace-nowrap">
              {thaiMonthNames[currentMonth - 1]} {currentYear + 543}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors cursor-pointer"
              title="เดือนถัดไป"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Monthly Total Badge */}
          <div className="bg-blue-50 text-blue-700 border border-blue-200/70 font-semibold px-2.5 sm:px-3 py-1 rounded-full text-xs whitespace-nowrap">
            รวมทั้งเดือน {totalCarsInMonth} คัน
          </div>
        </div>
      </div>

      {/* 2. Compact Date Selector (1 to 31) - ONLY DATE NUMBERS, NO CAR COUNT DIGITS */}
      <div className="space-y-1.5">
        <div className="w-full overflow-x-auto pb-1 scrollbar-thin">
          {/* Fit nicely on desktop with w-full flex, and scroll smoothly on small mobile */}
          <div className="flex items-center gap-1 justify-between min-w-[580px] sm:min-w-0 w-full">
            {dayStats.map(d => {
              const isSelected = d.date === selectedDate;
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => onSelectDate(d.date)}
                  className={`flex-1 min-w-[24px] sm:min-w-[28px] max-w-[42px] h-8 sm:h-9 rounded-lg text-xs sm:text-sm flex items-center justify-center transition-all cursor-pointer ${getDensityClass(
                    d.count,
                    isSelected
                  )}`}
                  title={`วันที่ ${d.dayNum} ${thaiMonthNames[currentMonth - 1]}: ขอจอด ${d.count} คัน (B1: ${d.b1Count}, B2: ${d.b2Count})`}
                >
                  {/* REQUIREMENT 3: มีแค่ตัวเลขวันที่ก็พอ ไม่ต้องมีตัวเลขจำนวนรถ */}
                  <span className="leading-none">{d.dayNum}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Heatmap Legend */}
        <div className="flex items-center justify-end gap-1.5 text-[11px] text-slate-500 pt-0.5">
          <span>น้อย</span>
          <span className="w-3 h-3 rounded bg-slate-100 border border-slate-200 inline-block" />
          <span className="w-3 h-3 rounded bg-blue-50 border border-blue-200 inline-block" />
          <span className="w-3 h-3 rounded bg-blue-100 inline-block" />
          <span className="w-3 h-3 rounded bg-blue-200 inline-block" />
          <span className="w-3 h-3 rounded bg-blue-300 inline-block" />
          <span className="w-3 h-3 rounded bg-blue-600 inline-block" />
          <span>มาก</span>
        </div>
      </div>

      {/* 3. Detail Container for Selected Day */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-2xs space-y-4">
        
        {/* Header row: Day name, Total cars, Floor counts, PDF/Print actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            <h3 className="text-base sm:text-lg font-bold text-slate-900">
              {shortThaiDay} {thaiFormattedDate}{' '}
              <span className="text-blue-600 font-extrabold ml-1">
                {currentDayStat.count} คัน
              </span>
            </h3>

            {currentDayStat.count > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="px-2 sm:px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold border border-blue-200">
                  ชั้น B1: {currentDayStat.b1Count} คัน
                </span>
                <span className="px-2 sm:px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-bold border border-indigo-200">
                  ชั้น B2: {currentDayStat.b2Count} คัน
                </span>
              </div>
            )}
          </div>

          {/* Action buttons on the right */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPDF}
              disabled={isExporting || currentDayStat.count === 0}
              className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-300 text-white text-xs sm:text-sm font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
              title="ดาวน์โหลดไฟล์ PDF รายงานรถขอจอดประจำวัน"
            >
              {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
              <span>ดาวน์โหลด PDF</span>
            </button>

            <button
              type="button"
              onClick={() => onPrint?.(selectedDate)}
              disabled={currentDayStat.count === 0}
              className="p-1.5 sm:p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              title="พิมพ์เอกสาร"
            >
              <Printer className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Search & Floor Filter for the Day's vehicles */}
        {currentDayStat.count > 0 && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-0.5 pb-1">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="ค้นหาทะเบียน, ยี่ห้อ, สี, หน่วยงาน หรือจังหวัด..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:bg-white transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Floor Filter Tabs */}
            <div className="flex items-center gap-1 self-start sm:self-auto bg-slate-100 p-0.5 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setFloorFilter('all')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  floorFilter === 'all'
                    ? 'bg-white text-slate-800 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ทั้งหมด ({currentDayStat.count})
              </button>
              <button
                type="button"
                onClick={() => setFloorFilter('B1')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  floorFilter === 'B1'
                    ? 'bg-blue-600 text-white shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ชั้น B1 ({currentDayStat.b1Count})
              </button>
              <button
                type="button"
                onClick={() => setFloorFilter('B2')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  floorFilter === 'B2'
                    ? 'bg-indigo-600 text-white shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ชั้น B2 ({currentDayStat.b2Count})
              </button>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* REQUIREMENT 1 & 2: DESKTOP TABLE VIEW (FITS 100% WIDTH, NO SCROLLBAR) */}
        {/* Column Order: ลำดับ | ยี่ห้อ | สี | หน่วยงาน | ทะเบียน | จังหวัด | ชั้นที่จอด | วันที่ขอจอด */}
        {/* ============================================================== */}
        <div className="hidden md:block w-full rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
          <table className="w-full text-left border-collapse text-xs lg:text-sm">
            <thead>
              <tr className="bg-slate-100/90 text-slate-700 text-xs font-bold border-b border-slate-200">
                <th className="py-2.5 px-2 text-center w-10 text-slate-500 font-semibold">ลำดับ</th>
                <th className="py-2.5 px-3">ยี่ห้อ</th>
                <th className="py-2.5 px-2.5">สี</th>
                <th className="py-2.5 px-3">หน่วยงาน</th>
                <th className="py-2.5 px-3 text-center">ทะเบียน</th>
                <th className="py-2.5 px-3 text-center">จังหวัด</th>
                <th className="py-2.5 px-2.5 text-center">ชั้นที่จอด</th>
                <th className="py-2.5 px-3 text-center">วันที่ขอจอด</th>
                <th className="py-2.5 px-2 text-center w-20 text-slate-500 font-semibold">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {currentDayStat.count === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-400 text-sm">
                    ไม่มีรถขออนุญาตจอดค้างคืนในวันที่ {formatThaiDate(selectedDate, 'long')}
                  </td>
                </tr>
              ) : displayedPermits.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400 text-sm">
                    ไม่พบรถที่ตรงกับคำค้นหา "{searchQuery}"
                  </td>
                </tr>
              ) : (
                displayedPermits.map((permit, index) => {
                  const plateClean = permit.licensePlate.replace(/\s+/g, '');
                  const provText = permit.province || 'กรุงเทพมหานคร';

                  return (
                    <tr key={permit.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* 1. ลำดับ */}
                      <td className="py-2.5 px-2 text-center font-mono text-slate-400 font-medium text-xs">
                        {index + 1}
                      </td>

                      {/* 2. ยี่ห้อ (REQUIREMENT 2: ยี่ห้อขึ้นก่อน) */}
                      <td className="py-2.5 px-3 font-semibold text-slate-800">
                        {permit.vehicleBrand}
                      </td>

                      {/* 3. สี */}
                      <td className="py-2.5 px-2.5 text-slate-600">
                        {permit.vehicleColor}
                      </td>

                      {/* 4. หน่วยงาน */}
                      <td className="py-2.5 px-3 text-slate-600 max-w-[200px]" title={permit.department ? `${permit.department}${permit.subDepartment ? ` (${permit.subDepartment})` : ''}` : '-'}>
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-800">{permit.department || '-'}</span>
                          {permit.subDepartment && (
                            <span className="text-[11px] text-slate-500 truncate">{permit.subDepartment}</span>
                          )}
                        </div>
                      </td>

                      {/* 5. ทะเบียน (เขียนติดกัน ไม่ใส่กรอบสีดำ ใช้ฟอนต์เดียวกับยี่ห้อ) */}
                      <td className="py-2.5 px-3 text-center font-bold text-slate-900">
                        {plateClean}
                      </td>

                      {/* 6. จังหวัด */}
                      <td className="py-2.5 px-3 text-center font-medium text-slate-700">
                        {provText}
                      </td>

                      {/* 7. ชั้นที่จอด: B1 หรือ B2 */}
                      <td className="py-2.5 px-2.5 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md font-bold text-xs ${
                            permit.parkingFloor === 'B1'
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                          }`}
                        >
                          {permit.parkingFloor}
                        </span>
                      </td>

                      {/* 8. วันที่ขอจอด */}
                      <td className="py-2.5 px-3 text-center text-xs text-slate-500 font-mono whitespace-nowrap">
                        {formatThaiDate(permit.startDate, 'short')} - {formatThaiDate(permit.endDate, 'short')}
                      </td>

                      {/* จัดการ (แก้ไข / ลบ) */}
                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onEditPermit?.(permit)}
                          className="p-1.5 rounded-lg cursor-pointer transition-colors inline-flex items-center justify-center text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                          title={isAuthenticated ? 'แก้ไขรายการ' : 'เข้าสู่ระบบเพื่อแก้ไขข้อมูล'}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeletePermit?.(permit)}
                          className="p-1.5 rounded-lg cursor-pointer transition-colors inline-flex items-center justify-center text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                          title={isAuthenticated ? 'ลบรายการขออนุญาต' : 'เข้าสู่ระบบเพื่อลบข้อมูล'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ============================================================== */}
        {/* REQUIREMENT 4: OPTIMIZED MOBILE VIEW (CARDS - TOUCH FRIENDLY, NO OVERFLOW) */}
        {/* Ordered: ยี่ห้อ · สี · หน่วยงาน · ทะเบียน · จังหวัด · ชั้นที่จอด · วันที่ขอจอด */}
        {/* ============================================================== */}
        <div className="block md:hidden space-y-2.5">
          {currentDayStat.count === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl bg-slate-50">
              ไม่มีรถขออนุญาตจอดค้างคืนในวันที่ {formatThaiDate(selectedDate, 'long')}
            </div>
          ) : displayedPermits.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl bg-slate-50">
              ไม่พบรถที่ตรงกับคำค้นหา "{searchQuery}"
            </div>
          ) : (
            displayedPermits.map((permit, index) => {
              const plateClean = permit.licensePlate.replace(/\s+/g, '');
              const provText = permit.province || 'กรุงเทพมหานคร';

              return (
                <div
                  key={permit.id}
                  className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs space-y-2 relative"
                >
                  {/* Top Line: ลำดับ + ยี่ห้อ + สี + ชั้นที่จอด */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 font-mono text-[11px] font-bold flex items-center justify-center">
                        {index + 1}
                      </span>
                      {/* 1. ยี่ห้อ & 2. สี */}
                      <span className="font-bold text-slate-900 text-sm">
                        {permit.vehicleBrand}
                      </span>
                      <span className="text-slate-400 text-xs">·</span>
                      <span className="text-slate-600 text-xs font-medium">
                        สี{permit.vehicleColor}
                      </span>
                    </div>

                    {/* ชั้นที่จอด: B1 หรือ B2 */}
                    <span
                      className={`px-2 py-0.5 rounded-md font-bold text-xs ${
                        permit.parkingFloor === 'B1'
                          ? 'bg-blue-100 text-blue-800 border border-blue-200'
                          : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                      }`}
                    >
                      ชั้น {permit.parkingFloor}
                    </span>
                  </div>

                  {/* Middle Line: ทะเบียน & จังหวัด (ตัวปกติ ไม่ใส่กรอบสีดำ ฟอนต์เดียวกับยี่ห้อ) */}
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className="font-bold text-slate-900 text-sm">
                      {plateClean}
                    </span>
                    <span className="text-xs font-medium text-slate-600">
                      {provText}
                    </span>
                  </div>

                  {/* Info Row: หน่วยงาน & วันที่ขอจอด */}
                  <div className="flex flex-col gap-1 text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                    {(permit.department || permit.subDepartment) && (
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="text-slate-700 font-medium">
                          {permit.department || '-'}
                          {permit.subDepartment ? ` (${permit.subDepartment})` : ''}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>
                          {formatThaiDate(permit.startDate, 'short')} - {formatThaiDate(permit.endDate, 'short')}
                        </span>
                      </div>

                      {/* Edit / delete actions */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onEditPermit?.(permit)}
                          className="p-1 px-1.5 rounded-md transition-colors cursor-pointer inline-flex items-center gap-1 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                          title={isAuthenticated ? 'แก้ไขรายการ' : 'เข้าสู่ระบบเพื่อแก้ไขข้อมูล'}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span className="text-[11px] font-medium">แก้ไข</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeletePermit?.(permit)}
                          className="p-1 px-1.5 rounded-md transition-colors cursor-pointer inline-flex items-center gap-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                          title={isAuthenticated ? 'ลบรายการขออนุญาต' : 'เข้าสู่ระบบเพื่อลบข้อมูล'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="text-[11px] font-medium">ลบ</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>

    </div>
  );
};
