import React from 'react';
import { RefreshCw, Cloud, CloudOff, AlertTriangle } from 'lucide-react';

/** stale = a background check failed but there is still recent data; error = repeated or manual failure */
export type SyncState = 'syncing' | 'ok' | 'stale' | 'error';

interface SyncStatusBarProps {
  state: SyncState;
  lastSyncedAt: Date | null;
  /** How long the last successful request took, to tell a slow Google from a broken setup */
  lastDurationMs: number | null;
  /** How the latest request travelled: through the relay or straight to the script */
  route?: 'relay' | 'direct' | null;
  errorMessage: string;
  onRefresh: () => void;
}

export const SyncStatusBar: React.FC<SyncStatusBarProps> = ({
  state,
  lastSyncedAt,
  lastDurationMs,
  route,
  errorMessage,
  onRefresh,
}) => {
  const isError = state === 'error';
  const isStale = state === 'stale';
  const time = lastSyncedAt
    ? lastSyncedAt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
    : null;
  const routeText = route === 'relay' ? ' · ผ่านตัวกลาง' : route === 'direct' ? ' · เรียกตรง' : '';
  const speed = lastDurationMs !== null ? ` (ตอบใน ${(lastDurationMs / 1000).toFixed(1)} วินาที${routeText})` : '';

  let message: string;
  if (isError) {
    message = `ซิงค์กับ Google Sheet ไม่สำเร็จ: ${errorMessage} (กำลังแสดงข้อมูลที่เครื่องจำไว้${time ? ` ซึ่งอัปเดตล่าสุด ${time} น.` : ''})`;
  } else if (isStale) {
    message = `Google Sheet ตอบช้าหรือไม่ตอบ (${errorMessage}) กำลังใช้ข้อมูลที่เครื่องจำไว้${time ? ` ซึ่งอัปเดตล่าสุด ${time} น.` : ''} และกำลังลองใหม่อัตโนมัติ`;
  } else if (state === 'syncing') {
    message = 'กำลังซิงค์กับ Google Sheet...';
  } else {
    message = `เชื่อมต่อ Google Sheet แล้ว${time ? ` · อัปเดตล่าสุด ${time} น.` : ''}${speed}`;
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-2 px-3.5 py-2 rounded-xl border text-xs ${
        isError
          ? 'border-rose-200 bg-rose-50 text-rose-800'
          : isStale
            ? 'border-amber-200 bg-amber-50 text-amber-900'
            : 'border-slate-200 bg-white text-slate-600'
      }`}
    >
      {isError ? (
        <AlertTriangle className="w-4 h-4 shrink-0" />
      ) : isStale ? (
        <CloudOff className="w-4 h-4 shrink-0" />
      ) : (
        <Cloud className="w-4 h-4 shrink-0 text-emerald-600" />
      )}
      <span className="flex-1 min-w-48">{message}</span>
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
