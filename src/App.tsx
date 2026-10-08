/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ParkingPermit } from './types/parking';
import { 
  loadPermits, savePermits, 
  getIsAuthenticated, setAuthenticatedSession, resetPasswordToDefault 
} from './utils/storage';
import { 
  getStoredSpreadsheetId, 
  getStoredAppsScriptUrl,
  getAccessToken, 
  appendPermitToGoogleSheet,
  deletePermitFromGoogleSheet,
  syncAllPermitsToGoogleSheet,
  fetchPermitsFromGoogleSheet,
  initGoogleAuth
} from './services/googleSheets';
import { Header } from './components/Header';
import { OvernightParkingDashboard } from './components/OvernightParkingDashboard';
import { RequestFormModal } from './components/RequestFormModal';
import { SecurityChecklistModal } from './components/SecurityChecklistModal';
import { EmployerLoginModal } from './components/EmployerLoginModal';
import { ConfirmModal } from './components/ConfirmModal';
import { formatThaiDate, getTodayDateString } from './utils/dateUtils';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export default function App() {
  const [permits, setPermits] = useState<ParkingPermit[]>(() => loadPermits());
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => getIsAuthenticated());
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayDateString());

  // Modal states: Only creation form, password verification popup, printable PDF dialog, and confirm modals
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // In-app Confirmation Modals (Replaces window.confirm for iframe stability)
  const [permitToDelete, setPermitToDelete] = useState<ParkingPermit | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'create' | 'delete' | null>(null);
  const [pendingDeletePermit, setPendingDeletePermit] = useState<ParkingPermit | null>(null);

  // Toast notification
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' } | null>(null);

  const showToast = (text: string, type: 'success' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Persist permits whenever updated
  useEffect(() => {
    savePermits(permits);
  }, [permits]);

  // Load from Google Sheet as primary database on mount & on window focus
  useEffect(() => {
    const syncFromGoogleSheet = async () => {
      const sheetId = getStoredSpreadsheetId();
      const appsScriptUrl = getStoredAppsScriptUrl();
      if (!sheetId && !appsScriptUrl) return;

      try {
        const token = await getAccessToken();
        const sheetPermits = await fetchPermitsFromGoogleSheet(token, sheetId);
        if (Array.isArray(sheetPermits)) {
          setPermits(sheetPermits);
          savePermits(sheetPermits);
        }
      } catch (err) {
        console.warn('Sync from Google Sheet:', err);
      }
    };

    syncFromGoogleSheet();

    const handleFocus = () => {
      syncFromGoogleSheet();
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // Reset password to 1234 on mount as requested & init Google Auth
  useEffect(() => {
    resetPasswordToDefault();
    initGoogleAuth();
  }, []);

  // Click handler for Login tab
  const handleOpenLogin = () => {
    setPendingAction('create');
    setIsLoginModalOpen(true);
  };

  // Click handler for "+ เพิ่มรายการขออนุญาต"
  const handleOpenAddRequest = () => {
    if (!isAuthenticated) {
      setPendingAction('create');
      setIsLoginModalOpen(true);
    } else {
      setIsRequestModalOpen(true);
    }
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    setAuthenticatedSession(true);
    setIsLoginModalOpen(false);
    showToast('เข้าสู่ระบบสำเร็จ สามารถบันทึกและจัดการข้อมูลได้ทันที', 'success');

    if (pendingAction === 'delete' && pendingDeletePermit) {
      setPermitToDelete(pendingDeletePermit);
      setIsDeleteConfirmOpen(true);
      setPendingAction(null);
      setPendingDeletePermit(null);
    } else {
      setIsRequestModalOpen(true);
      setPendingAction(null);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setAuthenticatedSession(false);
    showToast('ออกจากระบบเรียบร้อยแล้ว', 'info');
  };

  const handleCreatePermit = async (newPermit: ParkingPermit) => {
    const nextPermits = [newPermit, ...permits];
    setPermits(nextPermits);

    // Auto sync immediately to Google Sheet if connected
    const sheetId = getStoredSpreadsheetId();
    if (sheetId) {
      const token = await getAccessToken();
      try {
        await appendPermitToGoogleSheet(token, sheetId, newPermit);
        showToast(`บันทึกคำขอทะเบียน ${newPermit.licensePlate} และอัปเดตลง Google Sheet เรียบร้อยแล้ว`, 'success');
      } catch (err) {
        console.warn('Auto append failed, performing full sync:', err);
        try {
          await syncAllPermitsToGoogleSheet(token, sheetId, nextPermits);
          showToast(`บันทึกคำขอทะเบียน ${newPermit.licensePlate} และซิงค์ Google Sheet เรียบร้อยแล้ว`, 'success');
        } catch {
          showToast(`บันทึกคำขอทะเบียน ${newPermit.licensePlate} เรียบร้อยแล้ว`, 'success');
        }
      }
    } else {
      showToast(`บันทึกคำขอทะเบียน ${newPermit.licensePlate} เรียบร้อยแล้ว`, 'success');
    }
  };

  // Delete permit trigger
  const handleDeletePermitClick = (permit: ParkingPermit) => {
    if (!isAuthenticated) {
      setPendingAction('delete');
      setPendingDeletePermit(permit);
      setIsLoginModalOpen(true);
      return;
    }
    setPermitToDelete(permit);
    setIsDeleteConfirmOpen(true);
  };

  // Confirmed delete execution: ดำเนินการลบและซิงค์ชีตทันที
  const handleConfirmDelete = async () => {
    if (!permitToDelete) return;
    const targetPermit = permitToDelete;
    const plate = targetPermit.licensePlate;
    const updated = permits.filter(p => p.id !== targetPermit.id);
    setPermits(updated);
    setPermitToDelete(null);

    // Sync deletion with Google Sheet immediately if connected
    const sheetId = getStoredSpreadsheetId();
    if (sheetId) {
      const token = await getAccessToken();
      try {
        const deleted = await deletePermitFromGoogleSheet(
          token, 
          sheetId, 
          targetPermit.id, 
          targetPermit.licensePlate,
          updated
        );
        if (deleted) {
          showToast(`ลบรายการรถทะเบียน ${plate} และอัปเดต Google Sheet ทันที`, 'info');
        } else {
          await syncAllPermitsToGoogleSheet(token, sheetId, updated);
          showToast(`ลบรายการรถทะเบียน ${plate} และอัปเดต Google Sheet ทันที`, 'info');
        }
      } catch (err) {
        console.error('Failed to sync deletion to Google Sheet:', err);
        try {
          await syncAllPermitsToGoogleSheet(token, sheetId, updated);
          showToast(`ลบรายการรถทะเบียน ${plate} และอัปเดต Google Sheet ทันที`, 'info');
        } catch {
          showToast(`ลบรายการรถทะเบียน ${plate} เรียบร้อยแล้ว`, 'info');
        }
      }
    } else {
      showToast(`ลบรายการรถทะเบียน ${plate} เรียบร้อยแล้ว`, 'info');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/80 flex flex-col font-sans text-slate-800">
      {/* Header: ชื่อ "รายการขออนุญาตจอดค้างคืน" (ไม่มีคำว่าระบบ) พร้อมแท็บเข้าสู่ระบบ / เพิ่มรายการ */}
      <Header
        isAuthenticated={isAuthenticated}
        onOpenLogin={handleOpenLogin}
        onOpenNewRequest={handleOpenAddRequest}
        onLogout={handleLogout}
        onOpenPrintModal={() => setIsPrintModalOpen(true)}
      />

      {/* Main Container - Clean Layout without Google Sheet UI banner */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-5 space-y-4">
        {/* Overnight Parking Dashboard */}
        <OvernightParkingDashboard
          permits={permits}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onDeletePermit={handleDeletePermitClick}
          onRequestLogin={handleOpenLogin}
          isAuthenticated={isAuthenticated}
        />
      </main>

      {/* Footer */}
      <footer className="mt-12 bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto px-4">
          <p className="font-semibold text-slate-700">
            รายการขออนุญาตจอดค้างคืน
          </p>
          <p className="text-slate-400 mt-1">
            สรุปยอดรายวัน · แถบเลือกวันที่ 1-31 · บันทึกขอจอดชั้น B1 และ B2 · ส่งออก PDF
          </p>
        </div>
      </footer>

      {/* Request Form Modal (เปิดเมื่อกด "+ เพิ่มรายการขออนุญาต") */}
      <RequestFormModal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        onSubmit={handleCreatePermit}
        defaultDate={selectedDate}
      />

      {/* Password Verification Popup Modal (กรอกเฉพาะรหัสผ่านที่ตั้งไว้) */}
      <EmployerLoginModal
        isOpen={isLoginModalOpen}
        onClose={() => {
          setIsLoginModalOpen(false);
          setPendingAction(null);
          setPendingDeletePermit(null);
        }}
        onSuccess={handleLoginSuccess}
      />

      {/* PDF Export Modal */}
      <SecurityChecklistModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        permits={permits}
        initialDate={selectedDate}
      />

      {/* Delete Confirmation Modal (In-app modal, replaces window.confirm) */}
      <ConfirmModal
        isOpen={isDeleteConfirmOpen && !!permitToDelete}
        title="ยืนยันการลบรายการขออนุญาต"
        message="คุณต้องการลบข้อมูลการขออนุญาตจอดรถค้างคืนรายการนี้ใช่หรือไม่? ข้อมูลนี้จะถูกนำออกจากระบบทันที"
        itemDetails={permitToDelete ? [
          { label: 'หมายเลขทะเบียน', value: `${permitToDelete.licensePlate} (${permitToDelete.province || 'กรุงเทพมหานคร'})` },
          { label: 'ยี่ห้อ / สี', value: `${permitToDelete.vehicleBrand} สี${permitToDelete.vehicleColor}` },
          { label: 'ชั้นที่ขอจอด', value: `ชั้น ${permitToDelete.parkingFloor}` },
          { label: 'ช่วงวันที่ขอจอด', value: `${formatThaiDate(permitToDelete.startDate, 'short')} - ${formatThaiDate(permitToDelete.endDate, 'short')}` },
        ] : []}
        confirmText="ยืนยันการลบ"
        cancelText="ยกเลิก"
        confirmVariant="danger"
        onConfirm={handleConfirmDelete}
        onClose={() => {
          setIsDeleteConfirmOpen(false);
          setPermitToDelete(null);
        }}
      />

      {/* Floating Toast Notice */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 bg-slate-900 text-white text-xs font-medium rounded-xl shadow-xl animate-in slide-in-from-bottom-5 duration-200">
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-blue-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}
    </div>
  );
}
