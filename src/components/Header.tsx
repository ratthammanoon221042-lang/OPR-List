import React from 'react';
import { Plus, FileText, Car, LogIn, LogOut, CheckCircle2 } from 'lucide-react';

interface HeaderProps {
  isAuthenticated: boolean;
  onOpenLogin: () => void;
  onOpenNewRequest: () => void;
  onLogout: () => void;
  onOpenPrintModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isAuthenticated,
  onOpenLogin,
  onOpenNewRequest,
  onLogout,
  onOpenPrintModal,
}) => {
  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5">
          
          {/* Logo & Title: "รายการขออนุญาตจอดค้างคืน" (ไม่มีคำว่าระบบ) */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-inner shrink-0">
              <Car className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white">
                  รายการขออนุญาตจอดค้างคืน
                </h1>
                {isAuthenticated && (
                  <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-medium">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>เข้าสู่ระบบแล้ว</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                สรุปยอดรายวัน · แถบเลือกวันที่ 1-31 · บันทึกขอจอดชั้น B1 และ B2 · ส่งออก PDF
              </p>
            </div>
          </div>

          {/* Action Navigation & Controls */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            {/* Print / Export PDF button */}
            <button
              type="button"
              onClick={onOpenPrintModal}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 border border-slate-700 text-xs sm:text-sm font-medium rounded-xl transition-colors cursor-pointer"
              title="พิมพ์หรือส่งออกเอกสาร PDF สำหรับ รปภ. ตรวจรถ"
            >
              <FileText className="w-4 h-4 text-blue-400" />
              <span>พิมพ์ / ส่งออก PDF</span>
            </button>

            {/* REQUIREMENT 1:
                - ถ้ายังไม่ได้ล็อกอิน: แสดงแท็บ/ปุ่ม "เข้าสู่ระบบเพื่อบันทึกข้อมูล" (ซ่อนปุ่มขออนุญาต)
                - หลังจากล็อกอินแล้ว: แสดงปุ่ม "+ เพิ่มรายการขออนุญาต"
            */}
            {!isAuthenticated ? (
              <button
                type="button"
                onClick={onOpenLogin}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
                title="เข้าสู่ระบบด้วยรหัสผ่านเพื่อบันทึกและจัดการข้อมูล"
              >
                <LogIn className="w-4 h-4" />
                <span>เข้าสู่ระบบเพื่อบันทึกข้อมูล</span>
              </button>
            ) : (
              <>
                {/* ปุ่ม "+ เพิ่มรายการขออนุญาต" โผล่มาหลังจากล็อกอินแล้ว */}
                <button
                  type="button"
                  onClick={onOpenNewRequest}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
                  title="บันทึกข้อมูลขออนุญาตจอดรถค้างคืนใหม่"
                >
                  <Plus className="w-4 h-4" />
                  <span>เพิ่มรายการขออนุญาต</span>
                </button>

                {/* ปุ่มออกจากระบบ */}
                <button
                  type="button"
                  onClick={onLogout}
                  className="inline-flex items-center gap-1 px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-medium rounded-xl transition-colors cursor-pointer"
                  title="ออกจากระบบบันทึกข้อมูล"
                >
                  <LogOut className="w-3.5 h-3.5 text-slate-400" />
                  <span className="hidden sm:inline">ออกจากระบบ</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
