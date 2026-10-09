import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ParkingPermit } from '../types/parking';
import { VEHICLE_BRANDS, VEHICLE_COLORS, DEPARTMENTS, PROVINCE_OPTIONS } from '../utils/constants';
import { DropdownSelect } from './DropdownSelect';
import { DateField } from './DateField';
import { calculateNights, formatThaiDate, getTodayDateString } from '../utils/dateUtils';
import { cleanPlate } from '../utils/permit';
import {
  BatchCommon,
  DraftRow,
  ImportDraft,
  RowField,
  buildPermits,
  findBatchClashes,
  isRowComplete,
  isRowEmpty,
  missingFields,
  newRow,
  normalizeProvince,
  rowProvince,
  rowRange,
} from '../utils/batchRows';
import { X, Car, Calendar, CheckCircle2, AlertCircle, AlertTriangle, Building2, Camera, Plus } from 'lucide-react';

interface RequestFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** One permit when editing; one or many when adding */
  onSubmit: (permits: ParkingPermit[]) => void;
  defaultDate?: string;
  /** When set the form edits this permit instead of creating new ones */
  editingPermit?: ParkingPermit | null;
  /** Used to warn about the same plate being requested for overlapping dates */
  existingPermits?: ParkingPermit[];
  /** Rows read from a photo / document, to be checked and saved */
  prefill?: ImportDraft | null;
  /** Changes when a different prefill is given, so the form starts over with it */
  instanceKey?: string | number;
  /** Opens the "fill from photo" dialog (hidden while editing) */
  onOpenImport?: () => void;
}

/** Value for a dropdown that has an "อื่นๆ" (other) option with a free-text field */
function splitOther(value: string | undefined, options: string[]): { select: string; custom: string } {
  if (!value) return { select: '', custom: '' };
  return options.includes(value) ? { select: value, custom: '' } : { select: 'อื่นๆ', custom: value };
}

const FIELD_LABEL: Record<'plate' | 'province', string> = {
  plate: 'ทะเบียน',
  province: 'จังหวัด',
};

/**
 * The form is mounted only while open, so every opening starts from fresh state:
 * blank for a new request, filled from a document, or filled from the permit being edited.
 */
export const RequestFormModal: React.FC<RequestFormModalProps> = ({ isOpen, instanceKey, ...rest }) => {
  if (!isOpen) return null;
  return <RequestForm key={`${rest.editingPermit?.id ?? 'new'}-${instanceKey ?? ''}`} {...rest} />;
};

// Columns of one row of the table (the header uses the same widths)
const ROW_COLS = 'md:grid-cols-[2.5rem_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,1.3fr)_9rem_2.75rem]';

const inputBase =
  'w-full text-base border rounded-lg px-3 py-2.5 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition-colors';

const RequestForm: React.FC<Omit<RequestFormModalProps, 'isOpen' | 'instanceKey'>> = ({
  onClose,
  onSubmit,
  defaultDate,
  editingPermit,
  existingPermits = [],
  prefill,
  onOpenImport,
}) => {
  const isEdit = !!editingPermit;
  const initialDate = defaultDate || getTodayDateString();

  const initialCommon: BatchCommon = editingPermit
    ? {
        department: editingPermit.department ?? '',
        subDepartment: editingPermit.subDepartment ?? '',
        startDate: editingPermit.startDate,
        endDate: editingPermit.endDate,
      }
    : prefill?.common ?? { department: '', subDepartment: '', startDate: initialDate, endDate: initialDate };
  const initialDept = splitOther(initialCommon.department, DEPARTMENTS);

  const [department, setDepartment] = useState(initialDept.select);
  const [customDepartment, setCustomDepartment] = useState(initialDept.custom);
  const [subDepartment, setSubDepartment] = useState(initialCommon.subDepartment);
  const [startDate, setStartDate] = useState(initialCommon.startDate);
  const [endDate, setEndDate] = useState(initialCommon.endDate);

  const [rows, setRows] = useState<DraftRow[]>(() => {
    if (editingPermit) {
      return [
        newRow({
          brand: editingPermit.vehicleBrand,
          color: editingPermit.vehicleColor,
          plate: editingPermit.licensePlate,
          province: editingPermit.province,
          floor: editingPermit.parkingFloor,
        }),
      ];
    }
    if (prefill && prefill.rows.length > 0) return prefill.rows;
    return [newRow()];
  });

  const [errorMsg, setErrorMsg] = useState('');
  // The user has seen the "already requested" warning and chose to save anyway; any edit withdraws it
  const [ackClash, setAckClash] = useState(false);
  // After saving, the form stays open and ready for the next car: this note says what was just saved
  const [savedNote, setSavedNote] = useState('');
  const [showPrefill, setShowPrefill] = useState(true);
  const [focusNonce, setFocusNonce] = useState(0);

  const common: BatchCommon = {
    department: department === 'อื่นๆ' ? customDepartment : department,
    subDepartment,
    startDate,
    endDate,
  };
  const nights = calculateNights(startDate, endDate);
  const datesValid = !!startDate && !!endDate && endDate >= startDate;

  const otherPermits = useMemo(
    () => existingPermits.filter((p) => p.id !== editingPermit?.id),
    [existingPermits, editingPermit]
  );
  const clashes = useMemo(
    () => findBatchClashes(rows, { startDate, endDate }, otherPermits),
    [rows, startDate, endDate, otherPermits]
  );

  const filledRows = rows.filter((r) => !isRowEmpty(r));
  const completeRows = rows.filter(isRowComplete);
  const incompleteCount = filledRows.length - completeRows.length;
  const flagCount = rows.reduce((n, r) => n + r.flags.length, 0);

  // Focus the first cell of a row that was just added
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingFocus.current) return;
    document.querySelector<HTMLElement>(`[data-cell="brand-${pendingFocus.current}"]`)?.focus();
    pendingFocus.current = null;
  }, [rows.length]);

  // Back to the first cell after a save (the rows were cleared, so their count may not have changed)
  useEffect(() => {
    if (focusNonce > 0) document.querySelector<HTMLElement>('[data-cell^="brand-"]')?.focus();
  }, [focusNonce]);

  const changeRow = (key: string, patch: Partial<DraftRow>, changed: RowField[] = []) => {
    setAckClash(false);
    setErrorMsg('');
    setSavedNote('');
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        // Touching a highlighted cell (or any cell, for the "is it a car" note) clears its highlight
        const flags = r.flags.filter((f) => !changed.includes(f) && f !== 'type');
        return { ...r, ...patch, flags };
      })
    );
  };

  const addRow = (focus = true) => {
    const row = newRow({ floor: rows[rows.length - 1]?.floor ?? 'B1' });
    if (focus) pendingFocus.current = row.key;
    setRows((prev) => [...prev, row]);
  };

  const removeRow = (key: string) => {
    setAckClash(false);
    setRows((prev) => {
      const next = prev.filter((r) => r.key !== key);
      return next.length > 0 ? next : [newRow()];
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (department === 'อื่นๆ' && !customDepartment.trim()) {
      setErrorMsg('กรุณาระบุชื่อหน่วยงาน หรือเลือก "ไม่ระบุหน่วยงาน"');
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
    if (filledRows.length === 0) {
      setErrorMsg('กรุณากรอกข้อมูลรถอย่างน้อย 1 คัน');
      return;
    }
    const firstBad = rows.findIndex((r) => !isRowEmpty(r) && missingFields(r).length > 0);
    if (firstBad >= 0) {
      const missing = missingFields(rows[firstBad]);
      const names = missing.map((f) => FIELD_LABEL[f]).join(', ');
      const badProvince = missing.includes('province');
      setErrorMsg(
        badProvince && missing.length === 1
          ? `แถวที่ ${firstBad + 1}: "${rows[firstBad].province.trim()}" ไม่ตรงกับชื่อจังหวัดในรายการ เลือกจากรายการที่ขึ้นมา หรือลบออกถ้าไม่ทราบจังหวัด`
          : `แถวที่ ${firstBad + 1} ยังกรอกไม่ครบหรือไม่ถูกต้อง (${names})`
      );
      return;
    }
    const badRange = rows.findIndex((r) => {
      if (isRowEmpty(r)) return false;
      const range = rowRange(r, { startDate, endDate });
      return range.endDate < range.startDate;
    });
    if (badRange >= 0) {
      setErrorMsg(`แถวที่ ${badRange + 1} มีวันที่สิ้นสุดน้อยกว่าวันที่เริ่ม`);
      return;
    }

    // Same plate already requested for some of these nights: warn once, save on the second click
    if (clashes.size > 0 && !ackClash) {
      setAckClash(true);
      return;
    }

    if (editingPermit) {
      const row = rows[0];
      const permit: ParkingPermit = {
        id: editingPermit.id,
        createdAt: editingPermit.createdAt,
        licensePlate: cleanPlate(row.plate),
        province: rowProvince(row),
        vehicleBrand: row.brand.trim(),
        vehicleColor: row.color.trim(),
        parkingFloor: row.floor,
        department: common.department.trim() || undefined,
        subDepartment: common.subDepartment.trim() || undefined,
        startDate,
        endDate,
      };
      onSubmit([permit]);
      onClose();
      return;
    }

    const built = buildPermits(rows, common);
    onSubmit(built);
    // Stay open for the next car: clear the cars, keep the department and dates (the same document goes on)
    setRows([newRow()]);
    setErrorMsg('');
    setAckClash(false);
    setShowPrefill(false);
    setSavedNote(`บันทึก ${built.length} รายการแล้ว (ผลการบันทึกแจ้งที่มุมจอ) กรอกคันถัดไปได้เลย`);
    setFocusNonce((n) => n + 1);
  };

  const showImport = !isEdit && !!onOpenImport;
  const needsConfirm = clashes.size > 0 && ackClash;

  const cellClass = (row: DraftRow, field: 'brand' | 'color' | 'plate' | 'province', clash: boolean) => {
    const started = !isRowEmpty(row);
    // Required: the plate. A province is only wrong when something was typed that is not on the list.
    const missing =
      started &&
      ((field === 'plate' && !cleanPlate(row.plate)) || (field === 'province' && !!row.province.trim() && !rowProvince(row)));
    if (row.flags.includes(field)) return `${inputBase} bg-amber-100 border-amber-400`;
    if (missing) return `${inputBase} border-rose-400 bg-white`;
    return `${inputBase} ${clash ? 'bg-white border-rose-200' : 'border-slate-300'}`;
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-5">
      <div
        className={`bg-white rounded-2xl w-full shadow-2xl border border-slate-200 overflow-hidden max-h-full flex flex-col animate-in fade-in zoom-in-95 duration-150 ${
          isEdit ? 'max-w-5xl' : 'max-w-[min(90vw,1680px)]'
        }`}
      >
        {/* Header: stays at the top while the body scrolls */}
        <div className="shrink-0 bg-slate-900 text-white px-5 sm:px-8 py-4 flex items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0 shadow-inner">
              <Car className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg sm:text-2xl font-bold">
                {isEdit ? 'แก้ไขรายการขออนุญาตจอดค้างคืน' : 'เพิ่มรายการขออนุญาตจอดค้างคืน'}
              </h3>
              <p className="text-sm sm:text-base text-slate-300">
                {isEdit
                  ? 'แก้ไขข้อมูลรถ หน่วยงาน และช่วงวันที่ขอจอด'
                  : 'กรอกรถหลายคันในครั้งเดียวได้ ใช้หน่วยงานและวันที่ชุดเดียวกัน'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {showImport && (
              <button
                type="button"
                onClick={onOpenImport}
                aria-label="กรอกจากรูป"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-base font-medium rounded-xl border border-white/25 bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
                title="อ่านข้อมูลจากภาพหรือไฟล์หนังสือ"
              >
                <Camera className="w-5 h-5" />
                <span className="hidden sm:inline">กรอกจากรูป</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิด"
              className="text-slate-400 hover:text-white p-1.5 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-5 pb-8">
            {errorMsg && (
              <div role="alert" className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-base rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            {savedNote && (
              <div role="status" className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 text-base rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
                <span>{savedNote}</span>
              </div>
            )}

            {prefill && showPrefill && !isEdit && (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-2 text-base">
                  <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300">
                    อ่านได้ {prefill.rows.length} คัน
                  </span>
                  {flagCount > 0 && (
                    <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-300">
                      ต้องตรวจ {flagCount} ช่อง (ไฮไลต์สีเหลือง)
                    </span>
                  )}
                  {prefill.skipped.length > 0 && (
                    <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-300">
                      ข้ามรถจักรยานยนต์ {prefill.skipped.length} คัน
                    </span>
                  )}
                  {prefill.datesAssumed && (
                    <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-300">
                      เอกสารไม่ระบุวันที่ ใช้วันที่ที่เลือกอยู่ 1 คืน
                    </span>
                  )}
                </div>
                {prefill.skipped.length > 0 && (
                  <details className="border border-slate-200 rounded-xl bg-slate-50 px-4 py-3 text-base">
                    <summary className="cursor-pointer font-medium text-slate-700">
                      ดูรายการรถจักรยานยนต์ที่ข้าม ({prefill.skipped.length})
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {prefill.skipped.map((s, i) => (
                        <li key={i} className="flex flex-wrap justify-between gap-x-3 border-b border-slate-200 last:border-0 py-1.5">
                          <span>{s.text}</span>
                          <span className="text-slate-500 text-sm">{s.reason}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1.5 text-sm text-slate-500">
                      ระบบรับเฉพาะรถยนต์ ถ้าข้ามผิด (เช่นเป็นรถยนต์จริง) ให้กดปุ่ม "เพิ่มรถอีกคัน" แล้วกรอกเอง
                    </p>
                  </details>
                )}
                {prefill.notes && <p className="text-sm text-slate-500">หมายเหตุจากระบบอ่านเอกสาร: {prefill.notes}</p>}
                <p className="text-sm text-slate-500">
                  ระบบยังไม่ได้บันทึกอะไร ตรวจและแก้ไขข้อมูลให้ถูกต้องก่อนกดบันทึก ชั้นที่จอดตั้งต้นเป็น B1 ถ้าเอกสารไม่ระบุ
                </p>
              </div>
            )}

            {needsConfirm && (
              <div role="alert" className="p-4 bg-amber-50 border border-amber-300 text-amber-900 text-base rounded-xl space-y-1">
                <div className="flex items-center gap-2 font-bold">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>มี {clashes.size} คันที่ขออนุญาตไว้แล้วในช่วงวันที่ซ้อนกัน (แถวสีแดง)</span>
                </div>
                <p>ถ้ายืนยันว่าต้องการบันทึกซ้ำ ให้กด "ยืนยันบันทึกซ้ำ" อีกครั้ง หรือลบแถวสีแดงออกก่อน</p>
              </div>
            )}

            {/* Shared by every car in this batch: one line */}
            <div className="grid grid-cols-2 xl:grid-cols-[1.3fr_1.3fr_1fr_1fr_auto] gap-4 p-4 sm:p-5 rounded-xl border border-slate-200 bg-slate-50 items-end">
              <div className="min-w-0 col-span-2 sm:col-span-1">
                <DropdownSelect
                  label="หน่วยงาน"
                  hint="(ไม่บังคับ)"
                  clearLabel="ไม่ระบุหน่วยงาน"
                  value={department}
                  onChange={(val) => {
                    setDepartment(val);
                    setAckClash(false);
                  }}
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
                    className={`${inputBase} border-slate-300 mt-1.5`}
                  />
                )}
              </div>

              <div className="min-w-0 col-span-2 sm:col-span-1">
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="permit-sub-department" className="block text-sm font-semibold text-slate-700">
                    หน่วยงานย่อย
                  </label>
                  <span className="text-xs text-slate-400 font-normal">(ไม่บังคับ)</span>
                </div>
                <input
                  id="permit-sub-department"
                  type="text"
                  placeholder="เช่น กองกลาง, กลุ่มงานระบบ..."
                  value={subDepartment}
                  onChange={(e) => setSubDepartment(e.target.value)}
                  className={`${inputBase} border-slate-300`}
                />
              </div>

              <div className="min-w-0">
                <label htmlFor="permit-start-date" className="block text-sm font-semibold text-slate-700 mb-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span>วันที่เริ่มจอด <span className="text-rose-500">*</span></span>
                </label>
                <DateField
                  id="permit-start-date"
                  required
                  value={startDate}
                  onChange={(iso) => {
                    setStartDate(iso);
                    setAckClash(false);
                    if (iso && endDate < iso) setEndDate(iso);
                  }}
                />
              </div>

              <div className="min-w-0">
                <label htmlFor="permit-end-date" className="block text-sm font-semibold text-slate-700 mb-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span>วันที่สิ้นสุดจอด <span className="text-rose-500">*</span></span>
                </label>
                <DateField
                  id="permit-end-date"
                  required
                  min={startDate}
                  value={endDate}
                  onChange={(iso) => {
                    setEndDate(iso);
                    setAckClash(false);
                  }}
                />
              </div>

              <div
                className={`col-span-2 xl:col-span-1 self-start xl:mt-[1.6rem] px-4 py-2.5 rounded-xl text-base font-bold text-center whitespace-nowrap border ${
                  datesValid ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}
                title="นับวันสิ้นสุดด้วย"
              >
                {datesValid ? `${nights} คืน` : 'ตรวจวันที่'}
              </div>
            </div>

            {/* Cars: one row each */}
            <div>
              <datalist id="brand-options">
                {VEHICLE_BRANDS.filter((b) => b !== 'อื่นๆ').map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
              <datalist id="province-options">
                {PROVINCE_OPTIONS.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              <datalist id="color-options">
                {VEHICLE_COLORS.filter((c) => c !== 'อื่นๆ').map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>

              <div className={`hidden md:grid ${ROW_COLS} gap-3 px-3 pb-2 text-sm font-semibold text-slate-600`}>
                <span className="text-center">#</span>
                <span>ยี่ห้อ <span className="font-normal text-slate-400">(ไม่บังคับ)</span></span>
                <span>สี <span className="font-normal text-slate-400">(ไม่บังคับ)</span></span>
                <span>ทะเบียน <span className="text-rose-500">*</span> <span className="font-normal text-slate-400">(ติดกัน)</span></span>
                <span>จังหวัด <span className="font-normal text-slate-400">(ไม่บังคับ)</span></span>
                <span>ชั้นที่จอด <span className="text-rose-500">*</span></span>
                <span />
              </div>

              <div className="border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden">
                {rows.map((row, i) => {
                  const clash = clashes.get(row.key);
                  const range = rowRange(row, { startDate, endDate });
                  return (
                    <div
                      key={row.key}
                      className={`grid grid-cols-2 ${ROW_COLS} gap-3 p-3 items-start ${
                        clash ? 'bg-rose-50' : 'bg-white'
                      }`}
                    >
                      <div className="col-span-2 md:col-span-1 flex items-center justify-between md:justify-center md:h-[3rem] text-base text-slate-500 font-semibold tabular-nums">
                        <span>
                          <span className="md:hidden">คันที่ </span>
                          {i + 1}
                        </span>
                        {!isEdit && (
                          <button
                            type="button"
                            onClick={() => removeRow(row.key)}
                            aria-label={`ลบแถวที่ ${i + 1}`}
                            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        )}
                      </div>

                      <div className="min-w-0">
                        <input
                          type="text"
                          list="brand-options"
                          data-cell={`brand-${row.key}`}
                          aria-label={`ยี่ห้อ แถวที่ ${i + 1}`}
                          placeholder="เลือกหรือพิมพ์ยี่ห้อ"
                          value={row.brand}
                          onChange={(e) => changeRow(row.key, { brand: e.target.value }, ['brand'])}
                          className={cellClass(row, 'brand', !!clash)}
                        />
                        {row.flags.includes('type') && (
                          <span className="block mt-1 text-sm text-amber-700">
                            ไม่แน่ใจว่าเป็นรถยนต์{' '}
                            <button
                              type="button"
                              onClick={() => changeRow(row.key, {})}
                              className="underline font-semibold cursor-pointer"
                            >
                              เป็นรถยนต์
                            </button>
                          </span>
                        )}
                      </div>

                      <div className="min-w-0">
                        <input
                          type="text"
                          list="color-options"
                          aria-label={`สี แถวที่ ${i + 1}`}
                          placeholder="เลือกหรือพิมพ์สี"
                          value={row.color}
                          onChange={(e) => changeRow(row.key, { color: e.target.value }, ['color'])}
                          className={cellClass(row, 'color', !!clash)}
                        />
                      </div>

                      <div className="col-span-2 md:col-span-1 min-w-0">
                        <input
                          type="text"
                          aria-label={`ทะเบียน แถวที่ ${i + 1}`}
                          placeholder="เช่น 1กข4590"
                          value={row.plate}
                          onChange={(e) => changeRow(row.key, { plate: e.target.value.replace(/\s+/g, '') }, ['plate'])}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter' || isEdit) return;
                            e.preventDefault();
                            if (i === rows.length - 1) addRow();
                            else document.querySelector<HTMLElement>(`[data-cell="brand-${rows[i + 1].key}"]`)?.focus();
                          }}
                          className={`${cellClass(row, 'plate', !!clash)} font-semibold tracking-wide`}
                        />
                        {row.startDate && row.endDate && (
                          <span className="block mt-1 text-sm text-blue-700">
                            วันที่ของคันนี้: {formatThaiDate(range.startDate, 'short')} - {formatThaiDate(range.endDate, 'short')}{' '}
                            <button
                              type="button"
                              onClick={() => changeRow(row.key, { startDate: undefined, endDate: undefined })}
                              className="underline font-semibold cursor-pointer"
                            >
                              ใช้วันที่ด้านบน
                            </button>
                          </span>
                        )}
                      </div>

                      <div className="col-span-2 md:col-span-1 min-w-0">
                        <input
                          type="text"
                          list="province-options"
                          aria-label={`จังหวัด แถวที่ ${i + 1}`}
                          placeholder="พิมพ์หรือเลือกจังหวัด"
                          value={row.province}
                          onChange={(e) => changeRow(row.key, { province: e.target.value }, ['province'])}
                          // "กทม." or "จ.นนทบุรี" becomes the full name when leaving the field
                          onBlur={(e) => {
                            const full = normalizeProvince(e.target.value);
                            if (full && full !== row.province) changeRow(row.key, { province: full });
                          }}
                          className={cellClass(row, 'province', !!clash)}
                        />
                        {clash && (
                          <span className="block mt-1 text-sm text-rose-700">
                            {clash.existing.length > 0
                              ? `ซ้ำ: ขอไว้แล้ว ${formatThaiDate(clash.existing[0].startDate, 'short')} - ${formatThaiDate(clash.existing[0].endDate, 'short')} (ชั้น ${clash.existing[0].parkingFloor})`
                              : 'ซ้ำกับแถวอื่นในชุดนี้'}
                          </span>
                        )}
                      </div>

                      <div
                        role="group"
                        aria-label={`ชั้นที่จอด แถวที่ ${i + 1}`}
                        className={`col-span-2 md:col-span-1 inline-flex border rounded-lg overflow-hidden self-start ${
                          row.flags.includes('floor') ? 'border-amber-400 ring-2 ring-amber-200' : 'border-slate-300'
                        }`}
                      >
                        {(['B1', 'B2'] as const).map((f) => (
                          <button
                            key={f}
                            type="button"
                            aria-pressed={row.floor === f}
                            onClick={() => changeRow(row.key, { floor: f }, ['floor'])}
                            className={`flex-1 px-5 py-2.5 text-base font-bold cursor-pointer transition-colors ${
                              row.floor === f
                                ? f === 'B1'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-indigo-600 text-white'
                                : 'bg-white text-slate-500 hover:bg-slate-100'
                            }`}
                          >
                            {f}
                          </button>
                        ))}
                      </div>

                      {!isEdit && (
                        <button
                          type="button"
                          onClick={() => removeRow(row.key)}
                          aria-label={`ลบแถวที่ ${i + 1}`}
                          className="hidden md:inline-flex items-center justify-center h-[3rem] rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {!isEdit && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => addRow()}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-base font-medium rounded-xl border border-dashed border-blue-400 bg-blue-50 text-blue-700 hover:bg-blue-100 cursor-pointer transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>เพิ่มรถอีกคัน</span>
                  </button>
                  <span className="text-sm text-slate-500">
                    กด Enter ที่ช่องทะเบียนเพื่อขึ้นแถวใหม่ · เว้นแถวว่างไว้ได้ ระบบข้ามให้
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 px-5 sm:px-8 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2.5">
            <span className="text-base text-slate-600" aria-live="polite">
              {incompleteCount > 0
                ? `มี ${incompleteCount} แถวที่ยังกรอกไม่ครบ`
                : `พร้อมบันทึก ${completeRows.length} คัน${datesValid ? ` · ${nights} คืน` : ''}`}
            </span>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-3 border border-slate-300 hover:bg-slate-100 text-slate-700 text-base font-semibold rounded-xl transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className={`px-6 py-3 ${needsConfirm ? 'bg-amber-600 hover:bg-amber-500' : 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700'} text-white text-base font-bold rounded-xl shadow-md transition-colors cursor-pointer flex items-center gap-1.5`}
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>
                  {needsConfirm
                    ? 'ยืนยันบันทึกซ้ำ'
                    : isEdit
                      ? 'บันทึกการแก้ไข'
                      : completeRows.length > 0
                        ? `บันทึก ${completeRows.length} รายการ`
                        : 'บันทึกรายการ'}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
