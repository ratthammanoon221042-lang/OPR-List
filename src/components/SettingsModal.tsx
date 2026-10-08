import React, { useState } from 'react';
import {
  X, Settings, Link2, CheckCircle2, AlertCircle, Loader2, Copy, Check, Upload, KeyRound, Unplug,
} from 'lucide-react';
import {
  GOOGLE_APPS_SCRIPT_CODE, getAppsScriptUrl, isValidAppsScriptUrl, pingAppsScript, importPermits, isApiError,
} from '../services/sheetApi';
import { ChangePasswordForm } from './ChangePasswordForm';
import { loadLocalOnlyPermits, saveLocalOnlyPermits } from '../utils/storage';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Token of the logged-in user, or null */
  token: string | null;
  onSaveUrl: (url: string) => void;
  onDisconnect: () => void;
  onRequestLogin: () => void;
  onTokenChanged: (token: string) => void;
  onImported: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen, onClose, token, onSaveUrl, onDisconnect, onRequestLogin, onTokenChanged, onImported,
}) => {
  const [url, setUrl] = useState(() => getAppsScriptUrl());
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [importing, setImporting] = useState(false);
  const [localOnlyCount, setLocalOnlyCount] = useState(() => loadLocalOnlyPermits().length);

  if (!isOpen) return null;

  const connectedUrl = getAppsScriptUrl();
  const isConnected = !!connectedUrl;

  const handleSave = async () => {
    setMessage(null);
    const trimmed = url.trim();
    if (!isValidAppsScriptUrl(trimmed)) {
      setMessage({
        type: 'error',
        text: 'URL ต้องขึ้นต้นด้วย https://script.google.com/ และลงท้ายด้วย /exec',
      });
      return;
    }
    setTesting(true);
    try {
      await pingAppsScript(trimmed);
      onSaveUrl(trimmed);
      setLocalOnlyCount(loadLocalOnlyPermits().length);
      setMessage({ type: 'ok', text: 'เชื่อมต่อ Google Sheet สำเร็จ' });
    } catch (err) {
      setMessage({ type: 'error', text: isApiError(err) ? err.message : 'เชื่อมต่อไม่สำเร็จ' });
    } finally {
      setTesting(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShowCode(true);
      setMessage({ type: 'error', text: 'คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกโค้ดด้านล่างแล้วคัดลอกเอง' });
    }
  };

  const handleImport = async () => {
    if (!token) {
      onRequestLogin();
      return;
    }
    setImporting(true);
    setMessage(null);
    try {
      const { added, skipped } = await importPermits(token, loadLocalOnlyPermits());
      saveLocalOnlyPermits([]);
      setLocalOnlyCount(0);
      onImported();
      setMessage({ type: 'ok', text: `นำเข้าแล้ว ${added} รายการ (ข้าม ${skipped} รายการที่มีอยู่แล้วหรือข้อมูลไม่ครบ)` });
    } catch (err) {
      setMessage({ type: 'error', text: isApiError(err) ? err.message : 'นำเข้าข้อมูลไม่สำเร็จ' });
    } finally {
      setImporting(false);
    }
  };

  const sectionClass = 'bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3';
  const titleClass = 'text-xs font-bold text-slate-700 flex items-center gap-1.5';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-start justify-center p-3 sm:p-5">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden my-3 sm:my-6">
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold">ตั้งค่า</h3>
              <p className="text-xs text-slate-300">เชื่อมต่อ Google Sheet และจัดการรหัสผ่าน</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-1 cursor-pointer" aria-label="ปิด">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4">
          {message && (
            <div
              className={`p-3 border text-xs rounded-xl flex items-start gap-2 ${
                message.type === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-700'
              }`}
            >
              {message.type === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{message.text}</span>
            </div>
          )}

          {/* 1. Connection */}
          <section className={sectionClass}>
            <div className={titleClass}>
              <Link2 className="w-4 h-4 text-blue-600" />
              <span>1. เชื่อมต่อ Google Sheet</span>
              {isConnected && (
                <span className="ml-auto px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px]">เชื่อมต่อแล้ว</span>
              )}
            </div>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="w-full text-xs sm:text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white font-mono focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={testing}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                {testing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>ทดสอบและบันทึก</span>
              </button>
              {isConnected && (
                <button
                  type="button"
                  onClick={() => {
                    onDisconnect();
                    setUrl('');
                    setMessage({ type: 'ok', text: 'ยกเลิกการเชื่อมต่อแล้ว ข้อมูลในเครื่องนี้ยังอยู่ แต่จะไม่ซิงค์กับชีต' });
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-medium rounded-lg cursor-pointer"
                >
                  <Unplug className="w-3.5 h-3.5" />
                  <span>ยกเลิกการเชื่อมต่อ</span>
                </button>
              )}
            </div>

            {isConnected && localOnlyCount > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-2">
                <p>พบข้อมูล {localOnlyCount} รายการที่บันทึกไว้ในเครื่องนี้ก่อนเชื่อมต่อชีต ยังไม่ได้อยู่ในชีต</p>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-400 text-white font-semibold rounded-lg cursor-pointer"
                >
                  {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  <span>{token ? 'นำข้อมูลในเครื่องขึ้นชีต' : 'เข้าสู่ระบบเพื่อนำข้อมูลขึ้นชีต'}</span>
                </button>
              </div>
            )}
          </section>

          {/* 2. Script installation */}
          <section className={sectionClass}>
            <div className={titleClass}>
              <Copy className="w-4 h-4 text-indigo-600" />
              <span>2. ติดตั้งสคริปต์ในชีต (ทำครั้งเดียว)</span>
            </div>
            <ol className="list-decimal pl-5 text-xs text-slate-600 space-y-1">
              <li>เปิด Google Sheet แล้วเลือกเมนู ส่วนขยาย &gt; Apps Script</li>
              <li>ลบโค้ดเดิมทั้งหมด วางโค้ดที่คัดลอกจากปุ่มด้านล่าง แล้วกดบันทึก</li>
              <li>กด ทำให้ใช้งานได้ &gt; การทำให้ใช้งานได้รายการใหม่ &gt; ประเภท เว็บแอป</li>
              <li>ตั้ง "ดำเนินการในฐานะ" เป็น ตัวฉันเอง และ "ผู้มีสิทธิ์เข้าถึง" เป็น ทุกคน</li>
              <li>คัดลอก URL เว็บแอป (ลงท้าย /exec) มาวางในช่องด้านบน</li>
              <li>ล็อกอินครั้งแรกด้วยรหัสเริ่มต้น แล้วระบบจะบังคับให้ตั้งรหัสใหม่</li>
            </ol>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'คัดลอกแล้ว' : 'คัดลอกโค้ดสคริปต์'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCode(!showCode)}
                className="px-3 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-medium rounded-lg cursor-pointer"
              >
                {showCode ? 'ซ่อนโค้ด' : 'ดูโค้ด'}
              </button>
            </div>
            {showCode && (
              <pre className="max-h-64 overflow-auto bg-slate-900 text-slate-100 text-[11px] leading-relaxed p-3 rounded-lg whitespace-pre">
                {GOOGLE_APPS_SCRIPT_CODE}
              </pre>
            )}
            <p className="text-[11px] text-slate-500">
              ถ้าแก้โค้ดสคริปต์ในภายหลัง ต้อง deploy เป็นเวอร์ชันใหม่ทุกครั้ง ถ้าลืมรหัสผ่าน ให้เปิด Apps Script แล้วรันฟังก์ชัน resetPassword
            </p>
          </section>

          {/* 3. Password */}
          {isConnected && (
            <section className={sectionClass}>
              <div className={titleClass}>
                <KeyRound className="w-4 h-4 text-emerald-600" />
                <span>3. เปลี่ยนรหัสผ่าน</span>
              </div>
              {token ? (
                <ChangePasswordForm
                  token={token}
                  onChanged={(newToken) => {
                    onTokenChanged(newToken);
                    setMessage({ type: 'ok', text: 'เปลี่ยนรหัสผ่านแล้ว เครื่องอื่นที่ล็อกอินอยู่จะต้องเข้าสู่ระบบใหม่' });
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={onRequestLogin}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  เข้าสู่ระบบเพื่อเปลี่ยนรหัสผ่าน
                </button>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
