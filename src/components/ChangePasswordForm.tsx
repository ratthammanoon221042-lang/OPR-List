import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { changePassword, isApiError } from '../services/sheetApi';

export const MIN_PASSWORD_LENGTH = 6;

interface ChangePasswordFormProps {
  token: string;
  /** When set the old password is already known (forced change right after first login) */
  knownOldPassword?: string;
  submitLabel?: string;
  onChanged: (newToken: string) => void;
}

export const ChangePasswordForm: React.FC<ChangePasswordFormProps> = ({
  token,
  knownOldPassword,
  submitLabel = 'บันทึกรหัสผ่านใหม่',
  onChanged,
}) => {
  const [oldPassword, setOldPassword] = useState(knownOldPassword ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`รหัสผ่านใหม่ต้องยาวอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('รหัสผ่านใหม่และการยืนยันไม่ตรงกัน');
      return;
    }
    setBusy(true);
    try {
      const newToken = await changePassword(token, oldPassword, newPassword);
      onChanged(newToken);
    } catch (err) {
      setError(isApiError(err) ? err.message : 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500';

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {knownOldPassword === undefined && (
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">รหัสผ่านเดิม</label>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            className={inputClass}
          />
        </div>
      )}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          รหัสผ่านใหม่ <span className="font-normal text-slate-400">(อย่างน้อย {MIN_PASSWORD_LENGTH} ตัวอักษร)</span>
        </label>
        <input
          type="password"
          required
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">ยืนยันรหัสผ่านใหม่</label>
        <input
          type="password"
          required
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={inputClass}
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-400 text-white rounded-xl text-sm font-semibold transition-colors cursor-pointer"
      >
        {busy ? 'กำลังบันทึก...' : submitLabel}
      </button>
    </form>
  );
};
