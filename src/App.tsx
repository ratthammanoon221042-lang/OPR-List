/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ParkingPermit } from './types/parking';
import { loadCachedPermits, saveCachedPermits, getAuthToken, setAuthToken } from './utils/storage';
import {
  fetchPermits, addPermit, updatePermit, deletePermit, isApiError,
} from './services/sheetApi';
import { Header } from './components/Header';
import { OvernightParkingDashboard } from './components/OvernightParkingDashboard';
import { RequestFormModal } from './components/RequestFormModal';
import { SecurityChecklistModal } from './components/SecurityChecklistModal';
import { EmployerLoginModal } from './components/EmployerLoginModal';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { SyncStatusBar, SyncState } from './components/SyncStatusBar';
import { PrintReport } from './components/PrintReport';
import { ConfirmModal } from './components/ConfirmModal';
import { formatThaiDate, getTodayDateString } from './utils/dateUtils';
import { CheckCircle2, AlertCircle, XCircle } from 'lucide-react';

type ToastType = 'success' | 'info' | 'error';

const AUTO_REFRESH_MS = 60_000;
const FOCUS_REFRESH_MIN_GAP_MS = 10_000;

export default function App() {
  const [permits, setPermits] = useState<ParkingPermit[]>(() => loadCachedPermits());
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayDateString());

  // Logged-in session; reading is open to everyone, changing data needs the password
  const [token, setTokenState] = useState<string | null>(() => getAuthToken());
  const canEdit = !!token;

  const [syncState, setSyncState] = useState<SyncState>('syncing');
  const [syncError, setSyncError] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  // Modals
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [editingPermit, setEditingPermit] = useState<ParkingPermit | null>(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [permitToDelete, setPermitToDelete] = useState<ParkingPermit | null>(null);

  // What to do once the user has logged in (open the form, ask to delete, ...)
  const afterLoginRef = useRef<(() => void) | null>(null);

  // Print request: a counter so printing the same date twice still triggers
  const [printRequest, setPrintRequest] = useState<{ date: string; n: number } | null>(null);

  // Toast
  const [toast, setToast] = useState<{ text: string; type: ToastType } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((text: string, type: ToastType = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, type });
    toastTimer.current = setTimeout(() => setToast(null), type === 'error' ? 6000 : 3000);
  }, []);
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const setToken = useCallback((next: string | null) => {
    setAuthToken(next);
    setTokenState(next);
  }, []);

  // Keep a local copy so the last known list shows instantly / offline
  useEffect(() => {
    saveCachedPermits(permits);
  }, [permits]);

  // ---------------------------------------------------------------
  // Syncing with the sheet. A refresh never overwrites the list while a write is
  // in flight (or started during the fetch), and only the newest refresh is applied.
  // ---------------------------------------------------------------
  const pendingWrites = useRef(0);
  const writeEpoch = useRef(0);
  const refreshSeq = useRef(0);
  const lastRefreshAt = useRef(0);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());

  const refresh = useCallback(async (showSpinner = false) => {
    if (pendingWrites.current > 0) return;
    const seq = ++refreshSeq.current;
    const epoch = writeEpoch.current;
    lastRefreshAt.current = Date.now();
    if (showSpinner) setSyncState('syncing');
    try {
      const data = await fetchPermits();
      if (seq !== refreshSeq.current || pendingWrites.current > 0 || epoch !== writeEpoch.current) return;
      setPermits(data);
      setLastSyncedAt(new Date());
      setSyncError('');
      setSyncState('ok');
    } catch (err) {
      if (seq !== refreshSeq.current) return;
      setSyncError(err instanceof Error ? err.message : 'ไม่ทราบสาเหตุ');
      setSyncState('error');
    }
  }, []);

  useEffect(() => {
    // refresh() only sets state after the network request resolves
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();

    const onFocus = () => {
      if (Date.now() - lastRefreshAt.current > FOCUS_REFRESH_MIN_GAP_MS) refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') onFocus();
    };
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, AUTO_REFRESH_MS);

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  // ---------------------------------------------------------------
  // Writes: update the screen at once, save to the sheet, undo and tell the user if it fails.
  // ---------------------------------------------------------------
  const requireLogin = (action: () => void) => {
    afterLoginRef.current = action;
    setIsLoginModalOpen(true);
  };

  const runWrite = async (opts: {
    apply: (prev: ParkingPermit[]) => ParkingPermit[];
    revert: (prev: ParkingPermit[]) => ParkingPermit[];
    call: (token: string) => Promise<ParkingPermit[]>;
    success: string;
    failure: string;
  }) => {
    if (!token) {
      showToast('กรุณาเข้าสู่ระบบก่อนบันทึกข้อมูล', 'error');
      return;
    }

    setPermits(opts.apply);
    pendingWrites.current++;
    writeEpoch.current++;
    // Writes go to the sheet one at a time, in the order the user made them
    const run = writeQueue.current.then(async () => {
      let serverList: ParkingPermit[] | null = null;
      try {
        serverList = await opts.call(token);
        showToast(`${opts.success} และบันทึกลง Google Sheet แล้ว`, 'success');
      } catch (err) {
        setPermits(opts.revert);
        if (isApiError(err) && err.code === 'unauthorized') {
          setToken(null);
          showToast('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่ (รายการนี้ยังไม่ถูกบันทึก)', 'error');
          setIsLoginModalOpen(true);
        } else {
          showToast(`${opts.failure}: ${err instanceof Error ? err.message : 'ไม่ทราบสาเหตุ'}`, 'error');
        }
      } finally {
        pendingWrites.current--;
        if (serverList && pendingWrites.current === 0) {
          // The sheet's own answer is the truth once nothing else is waiting to be saved
          setPermits(serverList);
          setLastSyncedAt(new Date());
          setSyncError('');
          setSyncState('ok');
        } else if (!serverList) {
          refresh();
        }
      }
    });
    writeQueue.current = run;
    await run;
  };

  const handleSubmitPermit = (permit: ParkingPermit) => {
    const editing = editingPermit;
    if (editing) {
      runWrite({
        apply: (prev) => prev.map((p) => (p.id === permit.id ? permit : p)),
        revert: (prev) => prev.map((p) => (p.id === permit.id ? editing : p)),
        call: (t) => updatePermit(t, permit),
        success: `แก้ไขรายการทะเบียน ${permit.licensePlate} เรียบร้อย`,
        failure: 'แก้ไขรายการไม่สำเร็จ',
      });
    } else {
      runWrite({
        apply: (prev) => [...prev, permit],
        revert: (prev) => prev.filter((p) => p.id !== permit.id),
        call: (t) => addPermit(t, permit),
        success: `บันทึกคำขอทะเบียน ${permit.licensePlate} เรียบร้อย`,
        failure: 'บันทึกรายการไม่สำเร็จ',
      });
    }
  };

  const handleConfirmDelete = () => {
    const target = permitToDelete;
    if (!target) return;
    setPermitToDelete(null);
    runWrite({
      apply: (prev) => prev.filter((p) => p.id !== target.id),
      revert: (prev) => (prev.some((p) => p.id === target.id) ? prev : [...prev, target]),
      call: (t) => deletePermit(t, target.id),
      success: `ลบรายการรถทะเบียน ${target.licensePlate} เรียบร้อย`,
      failure: 'ลบรายการไม่สำเร็จ',
    });
  };

  // ---------------------------------------------------------------
  // UI handlers
  // ---------------------------------------------------------------
  const openNewRequestForm = () => {
    setEditingPermit(null);
    setIsRequestModalOpen(true);
  };

  const handleOpenAddRequest = () => {
    if (canEdit) openNewRequestForm();
    else requireLogin(openNewRequestForm);
  };

  const handleEditPermit = (permit: ParkingPermit) => {
    const open = () => {
      setEditingPermit(permit);
      setIsRequestModalOpen(true);
    };
    if (canEdit) open();
    else requireLogin(open);
  };

  const handleDeletePermitClick = (permit: ParkingPermit) => {
    const ask = () => setPermitToDelete(permit);
    if (canEdit) ask();
    else requireLogin(ask);
  };

  const handleLoginSuccess = (newToken: string) => {
    setToken(newToken);
    setIsLoginModalOpen(false);
    showToast('เข้าสู่ระบบสำเร็จ สามารถบันทึกและจัดการข้อมูลได้ทันที', 'success');
    const next = afterLoginRef.current;
    afterLoginRef.current = null;
    next?.();
  };

  const handleLogout = () => {
    setToken(null);
    showToast('ออกจากระบบเรียบร้อยแล้ว', 'info');
  };

  // Printing: render the report first, then open the print dialog
  const requestPrint = (date: string) => setPrintRequest((prev) => ({ date, n: (prev?.n ?? 0) + 1 }));
  useEffect(() => {
    if (!printRequest) return;
    const timer = setTimeout(() => window.print(), 100);
    return () => clearTimeout(timer);
  }, [printRequest]);

  return (
    <div id="app-root" className="min-h-screen bg-slate-100/80 flex flex-col font-sans text-slate-800">
      <Header
        isAuthenticated={canEdit}
        onOpenLogin={() => requireLogin(openNewRequestForm)}
        onOpenNewRequest={handleOpenAddRequest}
        onLogout={handleLogout}
        onOpenPrintModal={() => setIsPrintModalOpen(true)}
        onOpenChangePassword={() => setIsPasswordModalOpen(true)}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-5 space-y-4">
        <SyncStatusBar
          state={syncState}
          lastSyncedAt={lastSyncedAt}
          errorMessage={syncError}
          onRefresh={() => refresh(true)}
        />

        <OvernightParkingDashboard
          permits={permits}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onDeletePermit={handleDeletePermitClick}
          onEditPermit={handleEditPermit}
          onPrint={requestPrint}
          isAuthenticated={canEdit}
        />
      </main>

      <footer className="mt-12 bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto px-4">
          <p className="font-semibold text-slate-700">รายการขออนุญาตจอดค้างคืน</p>
          <p className="text-slate-400 mt-1">
            สรุปยอดรายวัน · แถบเลือกวันที่ 1-31 · บันทึกขอจอดชั้น B1 และ B2 · ส่งออก PDF / Excel
          </p>
        </div>
      </footer>

      <RequestFormModal
        isOpen={isRequestModalOpen}
        onClose={() => {
          setIsRequestModalOpen(false);
          setEditingPermit(null);
        }}
        onSubmit={handleSubmitPermit}
        defaultDate={selectedDate}
        editingPermit={editingPermit}
        existingPermits={permits}
      />

      <EmployerLoginModal
        isOpen={isLoginModalOpen}
        onClose={() => {
          setIsLoginModalOpen(false);
          afterLoginRef.current = null;
        }}
        onSuccess={handleLoginSuccess}
      />

      <SecurityChecklistModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        permits={permits}
        initialDate={selectedDate}
        onPrint={requestPrint}
      />

      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        token={token}
        onClose={() => setIsPasswordModalOpen(false)}
        onChanged={(newToken) => {
          setToken(newToken);
          setIsPasswordModalOpen(false);
          showToast('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว', 'success');
        }}
      />

      <ConfirmModal
        isOpen={!!permitToDelete}
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
        onClose={() => setPermitToDelete(null)}
      />

      {toast && (
        <div
          role="status"
          className="fixed bottom-5 right-5 left-5 sm:left-auto z-[60] flex items-center gap-2 px-4 py-3 bg-slate-900 text-white text-xs font-medium rounded-xl shadow-xl"
        >
          {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
          {toast.type === 'info' && <AlertCircle className="w-4 h-4 text-blue-400 shrink-0" />}
          {toast.type === 'error' && <XCircle className="w-4 h-4 text-rose-400 shrink-0" />}
          <span>{toast.text}</span>
        </div>
      )}

      {/* Direct child of #app-root: the only element visible when printing */}
      <PrintReport permits={permits} date={printRequest?.date ?? selectedDate} />
    </div>
  );
}
