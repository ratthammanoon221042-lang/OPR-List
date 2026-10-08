import React from 'react';
import { RefreshCw, Cloud, AlertTriangle } from 'lucide-react';

export type SyncState = 'syncing' | 'ok' | 'error';

interface SyncStatusBarProps {
  state: SyncState;
  lastSyncedAt: Date | null;
  errorMessage: string;
  onRefresh: () => void;
}

export const SyncStatusBar: React.FC<SyncStatusBarProps> = ({
  state,
  lastSyncedAt,
  errorMessage,
  onRefresh,
}) => {
  const isError = state === 'error';
  return (
    <div
      className={`flex flex-wrap items-center gap-2 px-3.5 py-2 rounded-xl border text-xs ${
        isError ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-slate-200 bg-white text-slate-600'
      }`}
    >
      {isError ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <Cloud className="w-4 h-4 shrink-0 text-emerald-600" />}
      <span className="flex-1 min-w-48">
        {isError
          ? `ซิงค์กับ Google Sheet ไม่สำเร็จ: ${errorMessage} (กำลังแสดงข้อมูลล่าสุดที่เครื่องนี้จำไว้)`
          : state === 'syncing'
            ? 'กำลังซิงค์กับ Google Sheet...'
            : `เชื่อมต่อ Google Sheet แล้ว${
                lastSyncedAt
                  ? ` · อัปเดตล่าสุด ${lastSyncedAt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`
                  : ''
              }`}
      </span>
      <button
        type="button"
        onClick={onRefresh}
        disabled={state === 'syncing'}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-60 text-slate-700 font-medium cursor-pointer"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${state === 'syncing' ? 'animate-spin' : ''}`} />
        <span>รีเฟรช</span>
      </button>
    </div>
  );
};
