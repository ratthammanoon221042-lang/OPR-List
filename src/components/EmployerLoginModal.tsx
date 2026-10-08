import React, { useEffect, useState } from 'react';
import { X, Lock, Key, AlertCircle, LogIn, Eye, EyeOff, Loader2, ShieldAlert } from 'lucide-react';
import { login, isApiError } from '../services/sheetApi';
import { ChangePasswordForm } from './ChangePasswordForm';

interface EmployerLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the session token once the user is fully logged in */
  onSuccess: (token: string) => void;
}

export const EmployerLoginModal: React.FC<EmployerLoginModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [busy, setBusy] = useState(false);
  // After a few seconds tell the user it is the sheet's backend waking up, not a freeze
  const [slow, setSlow] = useState(false);
  // Set when the server says the default password is still in use: the user must pick a new one
  const [forceChange, setForceChange] = useState<{ token: string; oldPassword: string } | null>(null);

  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(timer);
  }, [busy]);

  if (!isOpen) return null;

  const reset = () => {
    setPassword('');
    setErrorMsg('');
    setForceChange(null);
    setShowPassword(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSlow(false);
    setBusy(true);
    try {
      const { token, mustChange } = await login(password);
      if (mustChange) {
        setForceChange({ token, oldPassword: password });
      } else {
        reset();
        onSuccess(token);
      }
    } catch (err) {
      setErrorMsg(isApiError(err) ? err.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white shrink-0 shadow-inner">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold">
                {forceChange ? 'ตั้งรหัสผ่านใหม่' : 'เข้าสู่ระบบเพื่อบันทึกข้อมูล'}
              </h3>
              <p className="text-xs text-slate-300">
                {forceChange ? 'ต้องเปลี่ยนรหัสเริ่มต้นก่อนใช้งาน' : 'ใส่รหัสผ่านเพื่อบันทึกและจัดการข้อมูล'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
            aria-label="ปิด"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {forceChange ? (
            <div className="space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>ระบบยังใช้รหัสเริ่มต้นอยู่ กรุณาตั้งรหัสผ่านใหม่ รหัสใหม่จะใช้ได้ทุกเครื่อง</span>
              </div>
              <ChangePasswordForm
                token={forceChange.token}
                knownOldPassword={forceChange.oldPassword}
                submitLabel="บันทึกรหัสผ่านและเข้าสู่ระบบ"
                onChanged={(newToken) => {
                  reset();
                  onSuccess(newToken);
                }}
              />
            </div>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{errorMsg}</span>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">รหัสผ่าน</label>
                <div className="relative">
                  <Key className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="กรอกรหัสผ่าน"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-10 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500 transition-all font-mono"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                    title={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                <span>{busy ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}</span>
              </button>
              {busy && slow && (
                <p className="text-[11px] text-slate-500 text-center">
                  Google Sheet กำลังเริ่มทำงาน ครั้งแรกอาจใช้เวลาสักครู่ กรุณารอ
                </p>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
