import React from 'react';
import { X, KeyRound } from 'lucide-react';
import { ChangePasswordForm } from './ChangePasswordForm';

interface ChangePasswordModalProps {
  isOpen: boolean;
  token: string | null;
  onClose: () => void;
  onChanged: (newToken: string) => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ isOpen, token, onClose, onChanged }) => {
  if (!isOpen || !token) return null;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold">เปลี่ยนรหัสผ่าน</h3>
              <p className="text-xs text-slate-300">รหัสใหม่ใช้ได้ทุกเครื่อง</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-1 cursor-pointer" aria-label="ปิด">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-3">
          <ChangePasswordForm token={token} onChanged={onChanged} />
          <p className="text-[11px] text-slate-500">เครื่องอื่นที่ล็อกอินอยู่จะต้องเข้าสู่ระบบใหม่</p>
        </div>
      </div>
    </div>
  );
};
