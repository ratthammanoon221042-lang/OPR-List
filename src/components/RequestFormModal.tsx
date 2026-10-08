import React, { useState } from 'react';
import { ParkingPermit } from '../types/parking';
import { 
  VEHICLE_BRANDS, 
  VEHICLE_COLORS, 
  DEPARTMENTS, 
  CENTRAL_PROVINCES, 
  NORTH_PROVINCES, 
  NORTHEAST_PROVINCES, 
  SOUTH_PROVINCES 
} from '../utils/constants';
import { DropdownSelect, DropdownGroup } from './DropdownSelect';
import { calculateNights, formatThaiDate, getTodayDateString } from '../utils/dateUtils';
import { findOverlappingPermits, generatePermitId } from '../utils/permit';
import { X, Car, Calendar, CheckCircle2, AlertCircle, AlertTriangle, Layers, Building2, Palette } from 'lucide-react';

interface RequestFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (permit: ParkingPermit) => void;
  defaultDate?: string;
  /** When set the form edits this permit instead of creating a new one */
  editingPermit?: ParkingPermit | null;
  /** Used to warn about the same plate being requested for overlapping dates */
  existingPermits?: ParkingPermit[];
}

/** Value for a dropdown that has an "อื่นๆ" (other) option with a free-text field */
function splitOther(value: string | undefined, options: string[]): { select: string; custom: string } {
  if (!value) return { select: '', custom: '' };
  return options.includes(value) ? { select: value, custom: '' } : { select: 'อื่นๆ', custom: value };
}

/**
 * The form is mounted only while open, so every opening starts from fresh state:
 * blank for a new request, or filled from the permit being edited.
 */
export const RequestFormModal: React.FC<RequestFormModalProps> = ({ isOpen, ...rest }) => {
  if (!isOpen) return null;
  return <RequestForm key={rest.editingPermit?.id ?? 'new'} {...rest} />;
};

const RequestForm: React.FC<Omit<RequestFormModalProps, 'isOpen'>> = ({
  onClose,
  onSubmit,
  defaultDate,
  editingPermit,
  existingPermits = [],
}) => {
  const isEdit = !!editingPermit;
  const initialDate = defaultDate || getTodayDateString();

  const initialBrand = splitOther(editingPermit?.vehicleBrand, VEHICLE_BRANDS);
  const initialColor = splitOther(editingPermit?.vehicleColor, VEHICLE_COLORS);
  const initialDept = splitOther(editingPermit?.department, DEPARTMENTS);

  const [vehicleBrand, setVehicleBrand] = useState(initialBrand.select);
  const [customBrand, setCustomBrand] = useState(initialBrand.custom);

  const [vehicleColor, setVehicleColor] = useState(initialColor.select);
  const [customColor, setCustomColor] = useState(initialColor.custom);

  const [department, setDepartment] = useState(initialDept.select);
  const [customDepartment, setCustomDepartment] = useState(initialDept.custom);
  const [subDepartment, setSubDepartment] = useState(editingPermit?.subDepartment ?? '');

  const [licensePlate, setLicensePlate] = useState(editingPermit?.licensePlate ?? '');
  const [province, setProvince] = useState(editingPermit?.province ?? '');
  const [parkingFloor, setParkingFloor] = useState<'B1' | 'B2'>(editingPermit?.parkingFloor ?? 'B1');
  const [startDate, setStartDate] = useState(editingPermit?.startDate ?? initialDate);
  const [endDate, setEndDate] = useState(editingPermit?.endDate ?? initialDate);
  const [errorMsg, setErrorMsg] = useState('');
  // Permits that clash with the one being entered; the user must confirm to save anyway.
  // Changing plate / province / dates withdraws the warning (see clearOverlaps).
  const [overlaps, setOverlaps] = useState<ParkingPermit[]>([]);
  const clearOverlaps = () => setOverlaps([]);

  const nights = calculateNights(startDate, endDate);

  // Grouped Provinces for Dropdown: Central first starting with Bangkok
  const provinceGroups: DropdownGroup[] = [
    {
      group: 'ภาคกลาง (เริ่มที่ กรุงเทพมหานคร)',
      items: CENTRAL_PROVINCES,
    },
    {
      group: 'ภาคเหนือ',
      items: NORTH_PROVINCES,
    },
    {
      group: 'ภาคตะวันออกเฉียงเหนือ',
      items: NORTHEAST_PROVINCES,
    },
    {
      group: 'ภาคใต้',
      items: SOUTH_PROVINCES,
    },
  ];

  const handleClose = onClose;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanPlate = licensePlate.replace(/\s+/g, '').trim();

    // Validations
    if (!cleanPlate) {
      setErrorMsg('กรุณาระบุหมายเลขทะเบียนรถ (เขียนติดกัน เช่น 1กข4590 หรือ ดด111)');
      return;
    }

    const finalBrand = (vehicleBrand === 'อื่นๆ' ? customBrand : vehicleBrand).trim();
    if (!finalBrand) {
      setErrorMsg('กรุณาเลือกหรือระบุยี่ห้อรถ');
      return;
    }

    const finalColor = (vehicleColor === 'อื่นๆ' ? customColor : vehicleColor).trim();
    if (!finalColor) {
      setErrorMsg('กรุณาเลือกหรือระบุสีรถ');
      return;
    }

    const finalDept = (department === 'อื่นๆ' ? customDepartment : department).trim();
    if (!finalDept) {
      setErrorMsg('กรุณาเลือกหรือระบุหน่วยงาน');
      return;
    }

    if (!province.trim()) {
      setErrorMsg('กรุณาเลือกจังหวัดของทะเบียนรถ');
      return;
    }

    if (!startDate || !endDate) {
      setErrorMsg('กรุณาระบุวันที่ขอจอดให้ครบถ้วน');
      return;
    }

    if (endDate < startDate) {
      setErrorMsg('วันที่สิ้นสุดการจอดต้องไม่น้อยกว่าวันที่เริ่มจอด');
      return;
    }

    const permitId = editingPermit?.id ?? generatePermitId(startDate);

    // Same plate already requested for some of these nights: warn once, save on the second click
    if (overlaps.length === 0) {
      const clashes = findOverlappingPermits(
        { id: permitId, licensePlate: cleanPlate, province: province.trim(), startDate, endDate },
        existingPermits
      );
      if (clashes.length > 0) {
        setOverlaps(clashes);
        return;
      }
    }

    const newPermit: ParkingPermit = {
      id: permitId,
      createdAt: editingPermit?.createdAt ?? new Date().toISOString(),
      licensePlate: cleanPlate,
      province: province.trim(),
      vehicleBrand: finalBrand,
      vehicleColor: finalColor,
      parkingFloor,
      department: finalDept || undefined,
      subDepartment: subDepartment.trim() || undefined,
      startDate,
      endDate,
    };

    onSubmit(newPermit);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex min-h-screen items-start justify-center p-3 sm:p-5">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden my-3 sm:my-6 max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-3rem)] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header: ตรึงด้านบน ไม่เลื่อนหาย */}
        <div className="shrink-0 bg-slate-900 text-white px-5 sm:px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0 shadow-inner">
              <Car className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold">
                {isEdit ? 'แก้ไขรายการขออนุญาตจอดค้างคืน' : 'เพิ่มรายการขออนุญาตจอดค้างคืน'}
              </h3>
              <p className="text-xs text-slate-300">
                กรอกข้อมูลยานพาหนะ หน่วยงาน และช่วงวันที่ขอจอด
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: เลื่อนขึ้นลงได้ พร้อมพื้นที่ด้านล่างเพียงพอสำหรับป็อบอัพดรอปดาวน์ */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5 pb-32">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {overlaps.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-300 text-amber-900 text-xs rounded-xl space-y-1.5">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>ทะเบียนนี้ขออนุญาตไว้แล้วในช่วงวันที่ซ้อนกัน</span>
              </div>
              <ul className="list-disc pl-6 space-y-0.5">
                {overlaps.map((o) => (
                  <li key={o.id}>
                    {o.licensePlate} ชั้น {o.parkingFloor} · {formatThaiDate(o.startDate, 'short')} -{' '}
                    {formatThaiDate(o.endDate, 'short')}
                  </li>
                ))}
              </ul>
              <p>ถ้ายืนยันว่าต้องการบันทึกซ้ำ ให้กด "ยืนยันบันทึกซ้ำ" อีกครั้ง</p>
            </div>
          )}

          {/* หมวด 1: ข้อมูลยานพาหนะและหน่วยงาน */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
            <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wider">
              <Car className="w-4 h-4 text-blue-600" />
              <span>1. ข้อมูลรถและหน่วยงาน</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              
              {/* ยี่ห้อรถ (รีเซ็ตว่างไว้ทุกครั้ง) */}
              <div>
                <DropdownSelect
                  label="ยี่ห้อรถ"
                  required
                  value={vehicleBrand}
                  onChange={(val) => setVehicleBrand(val)}
                  options={VEHICLE_BRANDS}
                  searchable
                  placeholder="เลือกยี่ห้อรถ"
                />
                {vehicleBrand === 'อื่นๆ' && (
                  <input
                    type="text"
                    required
                    placeholder="ระบุยี่ห้อรถ"
                    value={customBrand}
                    onChange={(e) => setCustomBrand(e.target.value)}
                    className="w-full text-xs sm:text-sm border border-slate-300 rounded-lg px-3 py-1.5 mt-1.5 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </div>

              {/* สีรถ (รีเซ็ตว่างไว้ทุกครั้ง) */}
              <div>
                <DropdownSelect
                  label="สีรถ"
                  required
                  value={vehicleColor}
                  onChange={(val) => setVehicleColor(val)}
                  options={VEHICLE_COLORS}
                  searchable={false}
                  placeholder="เลือกสีรถ"
                  icon={<Palette className="w-3.5 h-3.5 text-slate-500 inline mr-0.5" />}
                />
                {vehicleColor === 'อื่นๆ' && (
                  <input
                    type="text"
                    required
                    placeholder="ระบุสีรถ"
                    value={customColor}
                    onChange={(e) => setCustomColor(e.target.value)}
                    className="w-full text-xs sm:text-sm border border-slate-300 rounded-lg px-3 py-1.5 mt-1.5 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </div>

              {/* หน่วยงาน (รีเซ็ตว่างไว้ทุกครั้ง) */}
              <div>
                <DropdownSelect
                  label="หน่วยงาน"
                  required
                  value={department}
                  onChange={(val) => setDepartment(val)}
                  options={DEPARTMENTS}
                  searchable={false}
                  placeholder="เลือกหน่วยงาน"
                  icon={<Building2 className="w-3.5 h-3.5 text-slate-500 inline mr-0.5" />}
                />
                {department === 'อื่นๆ' && (
                  <input
                    type="text"
                    required
                    placeholder="ระบุหน่วยงาน"
                    value={customDepartment}
                    onChange={(e) => setCustomDepartment(e.target.value)}
                    className="w-full text-xs sm:text-sm border border-slate-300 rounded-lg px-3 py-1.5 mt-1.5 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </div>

              {/* หน่วยงานย่อย (ไม่บังคับ - รีเซ็ตว่างไว้ทุกครั้ง) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    หน่วยงานย่อย
                  </label>
                  <span className="text-[11px] text-slate-400 font-normal">
                    (ไม่บังคับ)
                  </span>
                </div>
                <input
                  type="text"
                  placeholder="เช่น กองกลาง, กลุ่มงานระบบ..."
                  value={subDepartment}
                  onChange={(e) => setSubDepartment(e.target.value)}
                  className="w-full text-xs sm:text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition-colors"
                />
              </div>

              {/* หมายเลขทะเบียนรถ (เขียนติดกัน ไม่มีช่องว่าง - รีเซ็ตว่างไว้ทุกครั้ง) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    หมายเลขทะเบียน <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] text-slate-500 font-normal">
                    (เขียนติดกัน)
                  </span>
                </div>
                <input
                  type="text"
                  required
                  placeholder="เช่น 1กข4590 หรือ ดด111"
                  value={licensePlate}
                  onChange={(e) => {
                    setLicensePlate(e.target.value.replace(/\s+/g, ''));
                    clearOverlaps();
                  }}
                  className="w-full text-xs sm:text-sm font-semibold border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 tracking-wider"
                />
              </div>

              {/* จังหวัด (ดรอปดาวน์ 77 จังหวัด เริ่มที่กรุงเทพ - รีเซ็ตว่างไว้ทุกครั้ง) */}
              <div>
                <DropdownSelect
                  label="จังหวัด"
                  required
                  value={province}
                  onChange={(val) => {
                    setProvince(val);
                    clearOverlaps();
                  }}
                  options={provinceGroups}
                  searchable
                  hint="(เริ่มที่ กทม.)"
                  placeholder="เลือกจังหวัด"
                />
              </div>

            </div>
          </div>

          {/* หมวด 2: ชั้นที่จอด และ วันที่ขอจอด */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
            <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wider">
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>2. ชั้นที่จอดและช่วงวันที่ขอจอด</span>
            </div>

            {/* ชั้นที่ขอจอด */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                ชั้นที่ขอจอด <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setParkingFloor('B1')}
                  className={`py-2.5 px-3 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    parkingFloor === 'B1'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
                  <span>ชั้น B1</span>
                </button>

                <button
                  type="button"
                  onClick={() => setParkingFloor('B2')}
                  className={`py-2.5 px-3 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    parkingFloor === 'B2'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-400 inline-block" />
                  <span>ชั้น B2</span>
                </button>
              </div>
            </div>

            {/* ช่วงวันที่ขอจอด */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span>วันที่เริ่มจอด <span className="text-rose-500">*</span></span>
                </label>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    clearOverlaps();
                    if (endDate < e.target.value) {
                      setEndDate(e.target.value);
                    }
                  }}
                  className="w-full text-xs sm:text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-mono"
                />
                <span className="text-[11px] text-slate-500 mt-0.5 block">
                  {formatThaiDate(startDate, 'short')}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span>วันที่สิ้นสุดการจอด <span className="text-rose-500">*</span></span>
                </label>
                <input
                  type="date"
                  required
                  min={startDate}
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    clearOverlaps();
                  }}
                  className="w-full text-xs sm:text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-mono"
                />
                <span className="text-[11px] text-slate-500 mt-0.5 block">
                  {formatThaiDate(endDate, 'short')}
                </span>
              </div>
            </div>

            {/* สรุปจำนวนคืนที่ขอจอด */}
            <div className="bg-blue-50/70 border border-blue-200/60 rounded-xl p-3 flex items-center justify-between text-xs">
              <span className="text-blue-900 font-medium">รวมระยะเวลาที่ขอจอดค้างคืน (นับวันสิ้นสุดด้วย):</span>
              <span className="font-bold text-blue-700 bg-white px-2.5 py-1 rounded-md border border-blue-200 shadow-2xs">
                {nights} คืน
              </span>
            </div>
          </div>

          {/* Modal Footer: ปุ่มยืนยันและยกเลิก */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-200">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs sm:text-sm font-semibold rounded-xl transition-colors cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className={`px-5 py-2 ${overlaps.length > 0 ? 'bg-amber-600 hover:bg-amber-500' : 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700'} text-white text-xs sm:text-sm font-bold rounded-xl shadow-md transition-colors cursor-pointer flex items-center gap-1.5`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{overlaps.length > 0 ? 'ยืนยันบันทึกซ้ำ' : isEdit ? 'บันทึกการแก้ไข' : 'บันทึกรายการ'}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
