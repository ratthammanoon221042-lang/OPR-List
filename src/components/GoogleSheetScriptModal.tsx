import React, { useState } from 'react';
import { 
  getStoredAppsScriptUrl, 
  setStoredAppsScriptUrl, 
  sendToAppsScript, 
  fetchFromAppsScript, 
  GOOGLE_APPS_SCRIPT_CODE 
} from '../services/appsScript';
import { ParkingPermit } from '../types/parking';
import { 
  X, 
  FileSpreadsheet, 
  Copy, 
  Check, 
  ExternalLink, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Send, 
  Code,
  DownloadCloud
} from 'lucide-react';

interface GoogleSheetScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPermits: ParkingPermit[];
  onSyncPermits: (permits: ParkingPermit[]) => void;
  showToast: (msg: string, type: 'success' | 'info') => void;
}

export const GoogleSheetScriptModal: React.FC<GoogleSheetScriptModalProps> = ({
  isOpen,
  onClose,
  currentPermits,
  onSyncPermits,
  showToast,
}) => {
  const [url, setUrl] = useState(() => getStoredAppsScriptUrl());
  const [copied, setCopied] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  if (!isOpen) return null;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
      setCopied(true);
      showToast('คัดลอกสคริปต์เรียบร้อยแล้ว', 'success');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      showToast('ไม่สามารถคัดลอกอัตโนมัติได้ กรุณาคลุมดำแล้วกด Copy', 'info');
    }
  };

  const handleSaveAndTest = async () => {
    const cleanUrl = url.trim();
    if (!cleanUrl) {
      setTestResult({ success: false, message: 'กรุณากรอก URL เว็บแอปของ Google Apps Script' });
      return;
    }

    setStoredAppsScriptUrl(cleanUrl);
    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await sendToAppsScript({ action: 'test' });
      if (res.success) {
        setTestResult({ success: true, message: 'เชื่อมต่อกับ Google Sheet สำเร็จ! พร้อมซิงค์ข้อมูลตามแอพ' });
        showToast('เชื่อมต่อ Google Sheet สำเร็จ!', 'success');
      } else {
        setTestResult({ success: false, message: res.message || 'เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบ URL และสิทธิ์การเข้าถึง (Everyone)' });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err?.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSyncAllToSheet = async () => {
    if (!url.trim()) {
      showToast('กรุณาระบุและบันทึก URL เว็บแอปก่อนซิงค์', 'info');
      return;
    }

    setIsSyncing(true);
    try {
      const res = await sendToAppsScript({
        action: 'syncAll',
        permits: currentPermits,
      });

      if (res.success) {
        showToast(`ซิงค์ข้อมูล ${currentPermits.length} รายการลง Google Sheet สำเร็จ!`, 'success');
        setTestResult({ success: true, message: `อัปเดตและเขียนข้อมูล ${currentPermits.length} รายการลงชีตเรียบร้อยแล้ว` });
      } else {
        showToast(`ซิงค์ไม่สำเร็จ: ${res.message}`, 'info');
        setTestResult({ success: false, message: res.message || 'ซิงค์ข้อมูลล้มเหลว' });
      }
    } catch (err: any) {
      showToast('เกิดข้อผิดพลาดในการซิงค์', 'info');
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePullFromSheet = async () => {
    if (!url.trim()) {
      showToast('กรุณาระบุและบันทึก URL เว็บแอปก่อนดึงข้อมูล', 'info');
      return;
    }

    setIsSyncing(true);
    try {
      const res = await fetchFromAppsScript();
      if (res.success && res.data) {
        onSyncPermits(res.data);
        showToast(`ดึงข้อมูลจากชีตสำเร็จ (${res.data.length} รายการ)`, 'success');
        setTestResult({ success: true, message: `ดึงข้อมูลจาก Google Sheet เข้ามาในระบบแล้ว (${res.data.length} รายการ)` });
      } else {
        showToast(res.message || 'ไม่สามารถดึงข้อมูลได้', 'info');
      }
    } catch (err: any) {
      showToast('เกิดข้อผิดพลาดในการดึงข้อมูลจากชีต', 'info');
    } finally {
      setIsSyncing(false);
    }
  };

  const isConnected = !!url.trim();

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex min-h-screen items-start justify-center p-3 sm:p-5">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-3 sm:my-6 max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-3rem)] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="shrink-0 bg-slate-900 text-white px-5 sm:px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0 shadow-inner">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold">สคริปต์เชื่อมต่อ Google Sheet</h3>
                {isConnected ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300 bg-emerald-950/80 border border-emerald-500/40 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    เชื่อมต่อแล้ว
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300 bg-amber-950/80 border border-amber-500/40 px-2 py-0.5 rounded-full">
                    <AlertCircle className="w-3 h-3 text-amber-400" />
                    ยังไม่ได้เชื่อมต่อ
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300">
                ติดตั้งสคริปต์เพื่อให้ Google Sheet อัปเดตข้อมูล เพิ่ม/ลบ อัตโนมัติตามแอพ
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

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          
          {/* Section 1: URL เว็บแอปของ Apps Script */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                <Send className="w-4 h-4 text-emerald-600" />
                <span>1. นำ URL เว็บแอป (Web App URL) มาวางที่นี่</span>
              </label>
              <span className="text-[11px] text-slate-500">ลงท้ายด้วย /exec</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="url"
                placeholder="https://script.google.com/macros/s/.../exec"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1 text-xs sm:text-sm font-mono border border-slate-300 rounded-xl px-3 py-2 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={handleSaveAndTest}
                disabled={isTesting || !url.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:bg-slate-300 text-white text-xs sm:text-sm font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
              >
                {isTesting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>บันทึก & ทดสอบ</span>
              </button>
            </div>

            {testResult && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  testResult.success
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}

            {/* Quick Actions if connected */}
            {isConnected && (
              <div className="pt-2 flex flex-wrap items-center gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={handleSyncAllToSheet}
                  disabled={isSyncing}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>ซิงค์ข้อมูลทั้งหมด ({currentPermits.length} รายการ) ลงชีตทันที</span>
                </button>

                <button
                  type="button"
                  onClick={handlePullFromSheet}
                  disabled={isSyncing}
                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <DownloadCloud className="w-3.5 h-3.5 text-slate-600" />
                  <span>ดึงข้อมูลจากชีตกลับมายังแอพ</span>
                </button>
              </div>
            )}
          </div>

          {/* Section 2: คำแนะนำ 4 ขั้นตอนสั้นๆ */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Code className="w-4 h-4 text-blue-600" />
              <span>2. วิธีติดตั้งสคริปต์ใน Google Sheets (ทำเพียงครั้งเดียว)</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-slate-600">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] shrink-0 font-bold">1</span>
                  <span>เปิด Google Sheets</span>
                </div>
                <p className="text-[11px] text-slate-500 pl-6.5">
                  เปิดสเปรดชีตของคุณ ไปที่เมนู <strong>ส่วนขยาย (Extensions)</strong> &gt; <strong>Apps Script</strong>
                </p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] shrink-0 font-bold">2</span>
                  <span>วางสคริปต์ &amp; บันทึก</span>
                </div>
                <p className="text-[11px] text-slate-500 pl-6.5">
                  ลบโค้ดเดิมออกทั้งหมด กดปุ่ม <strong>คัดลอกสคริปต์</strong> ด้านล่างนี้ไปวาง แล้วกด <strong>บันทึก (Save)</strong>
                </p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] shrink-0 font-bold">3</span>
                  <span>Deploy เป็นเว็บแอป</span>
                </div>
                <p className="text-[11px] text-slate-500 pl-6.5">
                  กดปุ่ม <strong>การทำให้ใช้งานได้ (Deploy)</strong> &gt; <strong>การทำให้ใช้งานได้ใหม่</strong> &gt; เลือก <strong>เว็บแอป (Web app)</strong>
                </p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] shrink-0 font-bold">4</span>
                  <span>สิทธิ์การเข้าถึง: &quot;ทุกคน&quot;</span>
                </div>
                <p className="text-[11px] text-slate-500 pl-6.5">
                  เลือกผู้มีสิทธิ์เข้าถึงเป็น <strong>ทุกคน (Anyone)</strong> แล้วคัดลอก URL เว็บแอปมาวางในข้อ 1 ด้านบน
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: โค้ดสคริปต์ Google Apps Script (พร้อมปุ่มคัดลอก) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Code className="w-4 h-4 text-emerald-600" />
                <span>โค้ดสคริปต์ (Code.gs) พร้อม 11 คอลัมน์ และระบบอัปเดตอัตโนมัติ:</span>
              </label>

              <button
                type="button"
                onClick={handleCopyCode}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'คัดลอกแล้ว!' : 'คัดลอกสคริปต์ (Copy)'}</span>
              </button>
            </div>

            <div className="relative rounded-xl overflow-hidden border border-slate-300 bg-slate-950 shadow-inner">
              <div className="bg-slate-900 px-3 py-1.5 text-[11px] text-slate-400 border-b border-slate-800 flex items-center justify-between font-mono">
                <span>Code.gs (Google Apps Script)</span>
                <span>JavaScript</span>
              </div>
              <pre className="p-3 text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-56 select-all leading-relaxed">
                <code>{GOOGLE_APPS_SCRIPT_CODE}</code>
              </pre>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>เมื่อเชื่อมต่อแล้ว ข้อมูลการเพิ่ม/ลบ จะส่งไปยังชีตทันที</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-colors cursor-pointer"
          >
            ปิดหน้าต่าง
          </button>
        </div>

      </div>
    </div>
  );
};
