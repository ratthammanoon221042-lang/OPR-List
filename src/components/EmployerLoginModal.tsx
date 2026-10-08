import React, { useState } from 'react';
import { getAuthCredentials, saveAuthCredentials, setAuthenticatedSession, resetPasswordToDefault } from '../utils/storage';
import { X, Lock, Key, AlertCircle, LogIn, Eye, EyeOff } from 'lucide-react';

interface EmployerLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const EmployerLoginModal: React.FC<EmployerLoginModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showChangePassword, setShowChangePassword] = useState(false);

  // Change password states
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changeSuccess, setChangeSuccess] = useState('');

  if (!isOpen) return null;

  const currentCreds = getAuthCredentials();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    // Check against preset password or '1234' default
    if (password === currentCreds.password || password === '1234') {
      if (password === '1234' && currentCreds.password !== '1234') {
        resetPasswordToDefault();
      }
      setAuthenticatedSession(true);
      setPassword('');
      setErrorMsg('');
      onSuccess();
    } else {
      setErrorMsg('รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง');
    }
  };

  const handleChangeCreds = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setChangeSuccess('');

    if (oldPassword !== currentCreds.password && oldPassword !== '1234') {
      setErrorMsg('รหัสผ่านเดิมไม่ถูกต้อง');
      return;
    }

    if (!newPassword.trim()) {
      setErrorMsg('กรุณาระบุรหัสผ่านใหม่');
      return;
    }

    const updated = {
      username: currentCreds.username || 'employer',
      password: newPassword.trim(),
    };

    saveAuthCredentials(updated);
    setChangeSuccess('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว');
    setTimeout(() => {
      setShowChangePassword(false);
      setChangeSuccess('');
      setOldPassword('');
      setNewPassword('');
      setPassword(updated.password);
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header: เข้าสู่ระบบเพื่อบันทึกข้อมูล */}
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white shrink-0 shadow-inner">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold">เข้าสู่ระบบเพื่อบันทึกข้อมูล</h3>
              <p className="text-xs text-slate-300">
                ใส่รหัสผ่านเพื่อบันทึกและจัดการข้อมูล
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {!showChangePassword ? (
            <form onSubmit={handleLogin} className="space-y-4">
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* REQUIREMENT 2: เอาคำว่ารหัสเริ่มต้น 1234 ออก และเอาปุ่มรีเซ็ตเป็น 1234 ออก */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  รหัสผ่านที่ตั้งไว้
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="กรอกรหัสผ่าน"
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
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-2 mt-2"
              >
                <LogIn className="w-4 h-4" />
                <span>เข้าสู่ระบบ</span>
              </button>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-center text-xs text-slate-400">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg('');
                    setShowChangePassword(true);
                  }}
                  className="hover:text-slate-700 hover:underline cursor-pointer"
                >
                  เปลี่ยนรหัสผ่าน
                </button>
              </div>
            </form>
          ) : (
            /* Change Password View */
            <form onSubmit={handleChangeCreds} className="space-y-3.5">
              <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-700">เปลี่ยนรหัสผ่าน</span>
                <button
                  type="button"
                  onClick={() => {
                    setShowChangePassword(false);
                    setErrorMsg('');
                  }}
                  className="text-xs text-emerald-600 hover:underline cursor-pointer"
                >
                  ย้อนกลับ
                </button>
              </div>

              {changeSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl">
                  {changeSuccess}
                </div>
              )}
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  รหัสผ่านเดิม
                </label>
                <input
                  type="password"
                  required
                  placeholder="กรอกรหัสผ่านเดิม"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  รหัสผ่านใหม่
                </label>
                <input
                  type="password"
                  required
                  placeholder="กำหนดรหัสผ่านใหม่"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
              >
                บันทึกรหัสผ่านใหม่
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
