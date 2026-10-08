import React, { useState } from 'react';
import { 
  signInWithGoogle, 
  createNewParkingSheet, 
  getStoredSpreadsheetId, 
  appendPermitToGoogleSheet, 
  fetchPermitsFromGoogleSheet,
  getAccessToken,
  logoutGoogle
} from '../services/googleSheets';
import { ParkingPermit } from '../types/parking';
import { FileSpreadsheet, ExternalLink, RefreshCw, CheckCircle2, AlertCircle, PlusCircle, LogOut } from 'lucide-react';
import { User } from 'firebase/auth';

interface GoogleSheetsSyncBarProps {
  onSyncPermits: (permits: ParkingPermit[]) => void;
  currentPermits: ParkingPermit[];
  showToast: (msg: string, type: 'success' | 'info') => void;
}

export const GoogleSheetsSyncBar: React.FC<GoogleSheetsSyncBarProps> = ({
  onSyncPermits,
  currentPermits,
  showToast,
}) => {
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(() => getStoredSpreadsheetId());
  const [isLoading, setIsLoading] = useState(false);

  // Connect & Create new Sheet
  const handleConnectAndCreateSheet = async () => {
    setIsLoading(true);
    try {
      let token = await getAccessToken();
      let user = googleUser;

      if (!token) {
        const authResult = await signInWithGoogle();
        if (authResult) {
          token = authResult.accessToken;
          user = authResult.user;
          setGoogleUser(user);
        }
      }

      if (!token) {
        showToast('กรุณาลงชื่อเข้าใช้ Google เพื่อสร้าง Sheet', 'info');
        return;
      }

      // Create new Sheet
      const newSheet = await createNewParkingSheet(token);
      setSpreadsheetId(newSheet.spreadsheetId);
      showToast(`สร้าง Google Sheet สำเร็จ! รหัส: ${newSheet.spreadsheetId}`, 'success');

      // Populate existing permits to the new sheet
      for (const p of currentPermits) {
        await appendPermitToGoogleSheet(token, newSheet.spreadsheetId, p);
      }
      showToast('นำเข้าข้อมูลที่มีอยู่เดิมลง Google Sheet เรียบร้อยแล้ว', 'success');
    } catch (err: any) {
      console.error('Google Sheets error:', err);
      showToast(`เกิดข้อผิดพลาด: ${err.message || 'ไม่สามารถเชื่อมต่อ Google Sheet'}`, 'info');
    } finally {
      setIsLoading(false);
    }
  };

  // Sync data from Google Sheet
  const handleSyncFromSheet = async () => {
    if (!spreadsheetId) return;
    setIsLoading(true);
    try {
      let token = await getAccessToken();
      if (!token) {
        const authResult = await signInWithGoogle();
        if (authResult) {
          token = authResult.accessToken;
          setGoogleUser(authResult.user);
        }
      }
      if (!token) return;

      const sheetPermits = await fetchPermitsFromGoogleSheet(token, spreadsheetId);
      if (sheetPermits.length > 0) {
        onSyncPermits(sheetPermits);
        showToast(`ดึงข้อมูลจาก Google Sheet สำเร็จ (${sheetPermits.length} รายการ)`, 'success');
      } else {
        showToast('ยังไม่มีแถวข้อมูลใน Google Sheet', 'info');
      }
    } catch (err: any) {
      console.error('Sync error:', err);
      showToast(`ซิงค์ข้อมูลไม่สำเร็จ: ${err.message}`, 'info');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    await logoutGoogle();
    setGoogleUser(null);
    showToast('ตัดการเชื่อมต่อ Google สำเร็จ', 'info');
  };

  const sheetUrl = spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` : null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
      {/* Left: Status info */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
          <FileSpreadsheet className="w-4 h-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">ฐานข้อมูล Google Sheets:</span>
            {spreadsheetId ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3" />
                เชื่อมต่อแล้ว (พร้อมบันทึกอัตโนมัติ)
              </span>
            ) : (
              <span className="text-[11px] text-slate-500 font-medium">
                (ยังไม่ได้สร้าง Sheet สำหรับเก็บข้อมูล)
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {spreadsheetId
              ? 'ข้อมูลคำขอจอดรถทุกรายการจะถูกบันทึกและซิงค์ลง Google Sheet ทันที'
              : 'กดปุ่มด้านขวาเพื่อสร้าง Google Sheet ใหม่ 1 อันสำหรับบันทึกข้อมูล'}
          </p>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {spreadsheetId ? (
          <>
            <a
              href={sheetUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <span>เปิดดู Google Sheet</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              type="button"
              onClick={handleSyncFromSheet}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition-colors cursor-pointer"
              title="ดึงข้อมูลล่าสุดจาก Google Sheet"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>ซิงค์ข้อมูล</span>
            </button>

            <button
              type="button"
              onClick={handleConnectAndCreateSheet}
              disabled={isLoading}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
              title="สร้าง Sheet ไฟล์ใหม่"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>สร้าง Sheet ใหม่</span>
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleConnectAndCreateSheet}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{isLoading ? 'กำลังสร้าง Google Sheet...' : '+ สร้าง Google Sheet ใหม่ 1 อัน'}</span>
          </button>
        )}
      </div>
    </div>
  );
};
