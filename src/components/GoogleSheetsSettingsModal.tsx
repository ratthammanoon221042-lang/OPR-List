import React, { useState, useEffect } from 'react';
import { 
  getStoredSpreadsheetId, 
  setStoredSpreadsheetId, 
  getStoredAppsScriptUrl, 
  setStoredAppsScriptUrl, 
  getAccessToken, 
  signInWithGoogle, 
  createNewParkingSheet, 
  syncAllPermitsToGoogleSheet, 
  fetchPermitsFromGoogleSheet, 
  GOOGLE_APPS_SCRIPT_CODE,
  logoutGoogle
} from '../services/googleSheets';
import { ParkingPermit } from '../types/parking';
import { 
  X, 
  FileSpreadsheet, 
  Plus, 
  CheckCircle2, 
  ExternalLink, 
  RefreshCw, 
  Copy, 
  Check, 
  Code, 
  Link2, 
  AlertCircle, 
  Loader2,
  Trash2
} from 'lucide-react';

interface GoogleSheetsSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  permits: ParkingPermit[];
  onSyncPermits: (permits: ParkingPermit[]) => void;
  showToast: (msg: string, type: 'success' | 'info') => void;
}

export const GoogleSheetsSettingsModal: React.FC<GoogleSheetsSettingsModalProps> = ({
  isOpen,
  onClose,
  permits,
  onSyncPermits,
  showToast,
}) => {
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(() => getStoredSpreadsheetId());
  const [customSheetInput, setCustomSheetInput] = useState('');
  const [appsScriptUrl, setAppsScriptUrl] = useState<string>(() => getStoredAppsScriptUrl() || '');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [activeTab, setActiveTab] = useState<'connect' | 'script'>('connect');

  useEffect(() => {
    if (isOpen) {
      setSpreadsheetId(getStoredSpreadsheetId());
      setAppsScriptUrl(getStoredAppsScriptUrl() || '');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 1-Click: Create New Sheet and Bind
  const handleCreateNewSheet = async () => {
    setIsLoading(true);
    try {
      let token = await getAccessToken();
      if (!token) {
        const authRes = await signInWithGoogle();
        if (authRes) {
          token = authRes.accessToken;
        }
      }

      if (!token) {
        showToast('กรุณาลงชื่อเข้าใช้ Google เพื่อสร้างชีตใหม่', 'info');
        return;
      }

      const newSheet = await createNewParkingSheet(token, permits);
      setSpreadsheetId(newSheet.spreadsheetId);
      showToast(`สร้างและผูกกับ Google Sheet ใหม่สำเร็จ! (${permits.length} รายการ)`, 'success');
    } catch (err: any) {
      console.error('Create sheet error:', err);
      showToast(`สร้างชีตไม่สำเร็จ: ${err.message || 'โปรดลองใหม่อีกครั้ง'}`, 'info');
    } finally {
      setIsLoading(false);
    }
  };

  // Manual Bind Sheet ID or Link
  const handleBindCustomSheet = async () => {
    let cleanId = customSheetInput.trim();
    if (!cleanId) return;

    // If full Google Sheets URL was pasted
    const match = cleanId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      cleanId = match[1];
    }

    setStoredSpreadsheetId(cleanId);
    setSpreadsheetId(cleanId);
    setCustomSheetInput('');
    showToast('ผูกกับ Google Sheet สำเร็จเรียบร้อยแล้ว', 'success');

    // Attempt to sync current permits to this sheet
    try {
      const token = await getAccessToken();
      if (token) {
        await syncAllPermitsToGoogleSheet(token, cleanId, permits);
        showToast('ซิงค์ข้อมูลไปยังชีตที่ผูกใหม่เรียบร้อยแล้ว', 'success');
      }
    } catch (e) {
      console.warn('Sync to newly bound sheet error:', e);
    }
  };

  // Unbind Sheet
  const handleUnbindSheet = () => {
    setStoredSpreadsheetId(null);
    setSpreadsheetId(null);
    showToast('ยกเลิกการผูก Google Sheet เรียบร้อยแล้ว', 'info');
  };

  // Save Apps Script URL
  const handleSaveAppsScriptUrl = () => {
    const cleanUrl = appsScriptUrl.trim();
    setStoredAppsScriptUrl(cleanUrl || null);
    showToast(cleanUrl ? 'บันทึก URL ของ Google Apps Script เรียบร้อยแล้ว' : 'ลบการตั้งค่า Apps Script แล้ว', 'success');
  };

  // Force Full Sync Now
  const handleSyncNow = async () => {
    setIsLoading(true);
    try {
      let token = await getAccessToken();
      if (!token && !getStoredAppsScriptUrl()) {
        const authRes = await signInWithGoogle();
        if (authRes) token = authRes.accessToken;
      }

      await syncAllPermitsToGoogleSheet(token, spreadsheetId, permits);
      showToast(`ซิงค์ข้อมูลสำเร็จ (${permits.length} รายการ ถูกเขียนลงชีตครบถ้วน)`, 'success');
    } catch (err: any) {
      console.error('Sync error:', err);
      showToast(`ซิงค์ไม่สำเร็จ: ${err.message}`, 'info');
    } finally {
      setIsLoading(false);
    }
  };

  // Pull data from Sheet to App
  const handlePullFromSheet = async () => {
    setIsLoading(true);
    try {
      let token = await getAccessToken();
      if (!token && !getStoredAppsScriptUrl()) {
        const authRes = await signInWithGoogle();
        if (authRes) token = authRes.accessToken;
      }

      const pulled = await fetchPermitsFromGoogleSheet(token, spreadsheetId);
      if (pulled.length > 0) {
        onSyncPermits(pulled);
        showToast(`ดึงข้อมูลจากชีตสำเร็จ (${pulled.length} รายการ)`, 'success');
      } else {
        showToast('ไม่พบข้อมูลรายการในชีต', 'info');
      }
    } catch (err: any) {
      console.error('Pull error:', err);
      showToast(`ดึงข้อมูลไม่สำเร็จ: ${err.message}`, 'info');
    } finally {
      setIsLoading(false);
    }
  };

  // Copy Apps Script Code
  const handleCopyCode = () => {
    navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
    setCopiedCode(true);
    showToast('คัดลอกโค้ดสคริปต์ Google Apps Script แล้ว', 'success');
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const sheetUrl = spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` : null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[calc(100vh-2rem)] animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="shrink-0 bg-slate-900 text-white px-5 sm:px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0 shadow-inner">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold">ตั้งค่าเชื่อมต่อฐานข้อมูล Google Sheets</h3>
              <p className="text-xs text-slate-300">
                ผูกกับ Google Sheet เพื่อบันทึก อัปเดต และลบข้อมูลอัตโนมัติ
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

        {/* Tab Switcher */}
        <div className="shrink-0 flex items-center border-b border-slate-200 bg-slate-50 px-5 pt-2 gap-2 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('connect')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'connect'
                ? 'border-emerald-600 text-emerald-700 font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Link2 className="w-4 h-4" />
            <span>เชื่อมต่อ Google Sheets</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('script')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'script'
                ? 'border-emerald-600 text-emerald-700 font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Code className="w-4 h-4" />
            <span>สคริปต์ Google Apps Script (ถาวร 100%)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {activeTab === 'connect' ? (
            <>
              {/* Current Connection Status */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-700">สถานะการเชื่อมต่อ:</span>
                    {spreadsheetId || appsScriptUrl ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>เชื่อมต่อและพร้อมใช้งาน</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-100 border border-amber-200 px-2.5 py-0.5 rounded-full">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>ยังไม่ได้ผูกชีต</span>
                      </span>
                    )}
                  </div>

                  {sheetUrl && (
                    <a
                      href={sheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>เปิดดูใน Google Sheets</span>
                    </a>
                  )}
                </div>

                {spreadsheetId && (
                  <div className="text-xs text-slate-600 flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200 font-mono">
                    <div className="truncate mr-2">
                      <span className="text-slate-400 select-none mr-1.5">ID:</span>
                      <span className="font-bold text-slate-800">{spreadsheetId}</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleUnbindSheet}
                      className="text-rose-500 hover:text-rose-700 p-1 rounded-md hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                      title="ยกเลิกการผูกชีตนี้"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Action 1: Create New Sheet and Bind (PRIMARY) */}
              <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 sm:p-5 space-y-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                    1
                  </div>
                  <h4 className="text-sm font-bold text-slate-800">
                    สร้าง Google Sheet ใหม่และผูกทันที (แนะนำ)
                  </h4>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  ระบบจะสร้างชีตใหม่พร้อมตั้งค่าหัวตาราง 11 คอลัมน์ (รวมหน่วยงานย่อย) และโอนย้ายข้อมูลปัจจุบันลงในชีตให้อัตโนมัติทันที
                </p>
                <button
                  type="button"
                  onClick={handleCreateNewSheet}
                  disabled={isLoading}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:bg-slate-300 text-white text-xs sm:text-sm font-bold rounded-xl shadow-md transition-all cursor-pointer"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  <span>สร้างชีตใหม่และผูกทันที</span>
                </button>
              </div>

              {/* Action 2: Bind Existing Sheet ID or URL */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-slate-800 text-white flex items-center justify-center font-bold text-xs">
                    2
                  </div>
                  <h4 className="text-sm font-bold text-slate-800">
                    หรือผูกกับ Google Sheet เดิมที่มีอยู่แล้ว
                  </h4>
                </div>
                <p className="text-xs text-slate-500">
                  วาง URL เต็มของ Google Sheet หรือ Sheet ID ที่ต้องการใช้งาน
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="วางลิงก์ Google Sheet หรือ Sheet ID ที่นี่..."
                    value={customSheetInput}
                    onChange={(e) => setCustomSheetInput(e.target.value)}
                    className="flex-1 text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleBindCustomSheet}
                    disabled={!customSheetInput.trim()}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-300 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0"
                  >
                    ผูกชีตนี้
                  </button>
                </div>
              </div>

              {/* Action 3: Sync Actions */}
              {(spreadsheetId || appsScriptUrl) && (
                <div className="border-t border-slate-200 pt-3 flex flex-wrap items-center justify-between gap-2.5">
                  <span className="text-xs text-slate-500">
                    ข้อมูลในระบบ: <strong className="text-slate-800">{permits.length} รายการ</strong>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handlePullFromSheet}
                      disabled={isLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>ดึงข้อมูลจากชีต</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSyncNow}
                      disabled={isLoading}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-2xs transition-colors cursor-pointer"
                    >
                      {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      <span>ซิงค์ข้อมูลลงชีตตอนนี้</span>
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Tab: Apps Script Code & Webhook Web App */
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 text-xs text-blue-900 space-y-1.5">
                <div className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-blue-600" />
                  <span>ข้อดีของ Google Apps Script Web App:</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-700 text-[11px]">
                  <li>ไม่ต้องล็อกอิน Google ไม่ขึ้นแจ้งเตือนหมดอายุ ทำงานได้ตลอด 24 ชม.</li>
                  <li>เมื่อเพิ่มหรือลบรายการในแอพ ข้อมูลใน Google Sheet จะอัปเดตแบบเรียลไทม์ 100%</li>
                  <li>ติดตั้งง่าย เพียงคัดลอกโค้ดด้านล่างไปวางใน Extensions -&gt; Apps Script ของ Google Sheet</li>
                </ul>
              </div>

              {/* Web App URL Input */}
              <div className="border border-slate-200 rounded-xl p-3.5 space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  URL เว็บแอปพลิเคชัน (Apps Script Web App URL)
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    placeholder="https://script.google.com/macros/s/.../exec"
                    value={appsScriptUrl}
                    onChange={(e) => setAppsScriptUrl(e.target.value)}
                    className="flex-1 text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleSaveAppsScriptUrl}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0"
                  >
                    บันทึก URL
                  </button>
                </div>
              </div>

              {/* Code viewer with copy */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-800 text-white px-3.5 py-2.5 flex items-center justify-between text-xs">
                  <span className="font-mono text-slate-300">Code.gs (Apps Script)</span>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded-md transition-colors cursor-pointer"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCode ? 'คัดลอกแล้ว!' : 'คัดลอกโค้ดทั้งหมด'}</span>
                  </button>
                </div>
                <pre className="p-3 bg-slate-900 text-slate-200 font-mono text-[11px] max-h-56 overflow-y-auto leading-relaxed select-all">
                  {GOOGLE_APPS_SCRIPT_CODE}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="shrink-0 bg-slate-50 border-t border-slate-200 px-5 py-3 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs sm:text-sm font-semibold rounded-xl transition-colors cursor-pointer"
          >
            ปิดหน้าต่าง
          </button>
        </div>

      </div>
    </div>
  );
};
