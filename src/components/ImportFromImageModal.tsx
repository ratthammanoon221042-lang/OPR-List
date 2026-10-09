import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, FileText, Loader2, X, ImagePlus, AlertCircle, ShieldAlert } from 'lucide-react';
import { ExtractFile, extractDocument, isApiError, warmExtract } from '../services/sheetApi';
import { ACCEPTED_TYPES, MAX_IMPORT_FILES, MAX_TOTAL_BASE64_CHARS, prepareFile } from '../utils/prepareFiles';
import { ExtractedDocument } from '../utils/batchRows';

interface ImportFromImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string | null;
  /** Called with what was read; the caller shows it in the table for checking and returns false when there was nothing to show */
  onExtracted: (doc: ExtractedDocument) => boolean;
  /** Called when the login has expired */
  onUnauthorized: () => void;
  today: string;
}

interface PickedFile extends ExtractFile {
  id: number;
  sizeKb: number;
}

let fileId = 0;

/** Mounted only while open, so each opening starts empty */
export const ImportFromImageModal: React.FC<ImportFromImageModalProps> = ({ isOpen, ...rest }) => {
  if (!isOpen) return null;
  return <ImportDialog {...rest} />;
};

const ImportDialog: React.FC<Omit<ImportFromImageModalProps, 'isOpen'>> = ({
  onClose,
  token,
  onExtracted,
  onUnauthorized,
  today,
}) => {
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [busy, setBusy] = useState<'preparing' | 'reading' | null>(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const filesRef = useRef<PickedFile[]>([]);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  // Get the relay's login check out of the way while the user picks files
  useEffect(() => {
    if (token) warmExtract(token);
  }, [token]);

  // Seconds spent reading, shown so a long wait is not mistaken for a hang
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (busy !== 'reading') return;
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 500);
    return () => {
      clearInterval(timer);
      setElapsed(0);
    };
  }, [busy]);

  const addFiles = useCallback(async (picked: File[]) => {
    if (picked.length === 0) return;
    setError('');
    setBusy('preparing');
    const added: PickedFile[] = [];
    const problems: string[] = [];
    for (const file of picked) {
      if (filesRef.current.length + added.length >= MAX_IMPORT_FILES) {
        problems.push(`ใส่ได้ไม่เกิน ${MAX_IMPORT_FILES} ไฟล์ต่อครั้ง`);
        break;
      }
      try {
        const prepared = await prepareFile(file);
        added.push({ ...prepared, id: ++fileId, sizeKb: Math.round((prepared.data.length * 3) / 4 / 1024) });
      } catch (e) {
        problems.push(e instanceof Error ? e.message : 'เตรียมไฟล์ไม่สำเร็จ');
      }
    }
    setFiles((prev) => [...prev, ...added]);
    if (problems.length) setError(problems.join(' · '));
    setBusy(null);
  }, []);

  // Ctrl+V: a screenshot or copied image / file
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.files ?? []);
      if (items.length === 0) return;
      e.preventDefault();
      void addFiles(items);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [addFiles]);

  const totalChars = files.reduce((n, f) => n + f.data.length, 0);

  const handleRead = async () => {
    if (!token || files.length === 0) return;
    if (totalChars > MAX_TOTAL_BASE64_CHARS) {
      setError('ไฟล์รวมกันใหญ่เกินไป ลองลดจำนวนไฟล์หรือส่งทีละไม่กี่หน้า');
      return;
    }
    setError('');
    setBusy('reading');
    try {
      const doc = await extractDocument(token, files, today);
      // false = nothing usable was found: stay here so the user can try other files
      if (!onExtracted(doc)) setBusy(null);
    } catch (e) {
      if (isApiError(e) && e.code === 'unauthorized') {
        onUnauthorized();
        return;
      }
      setError(e instanceof Error ? e.message : 'อ่านเอกสารไม่สำเร็จ');
      setBusy(null);
    }
  };

  const reading = busy === 'reading';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex min-h-screen items-start justify-center p-2 sm:p-5">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden my-2 sm:my-6 flex flex-col">
        <div className="bg-slate-900 text-white px-5 sm:px-8 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg sm:text-2xl font-bold">กรอกจากรูปหรือไฟล์หนังสือ</h3>
              <p className="text-sm sm:text-base text-slate-300">อ่านรถยนต์จากหนังสือหรือตารางแนบ แล้วให้ตรวจก่อนบันทึก</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={reading}
            aria-label="ปิด"
            className="text-slate-400 hover:text-white p-1.5 rounded-lg cursor-pointer disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-8 space-y-5">
          {error && (
            <div role="alert" className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-base rounded-xl flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void addFiles(Array.from(e.dataTransfer.files));
            }}
            className={`rounded-2xl border-2 border-dashed px-4 py-7 text-center grid gap-2.5 justify-items-center transition-colors ${
              dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50'
            }`}
          >
            <ImagePlus className="w-8 h-8 text-slate-400" />
            <strong className="text-lg text-slate-800">วางภาพ ลากไฟล์มาวาง หรือเลือกไฟล์</strong>
            <span className="text-base text-slate-600">
              กด <kbd className="px-1.5 border border-slate-300 rounded bg-white text-xs">Ctrl</kbd> +{' '}
              <kbd className="px-1.5 border border-slate-300 rounded bg-white text-xs">V</kbd> เพื่อวางภาพแคปหน้าจอได้เลย
            </span>
            <div className="flex flex-wrap gap-2 justify-center">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={reading}
                className="px-5 py-2.5 text-base font-semibold rounded-xl border border-slate-300 bg-white hover:bg-slate-100 cursor-pointer disabled:opacity-50"
              >
                เลือกไฟล์
              </button>
              <button
                type="button"
                onClick={() => cameraInput.current?.click()}
                disabled={reading}
                className="px-5 py-2.5 text-base font-semibold rounded-xl border border-slate-300 bg-white hover:bg-slate-100 cursor-pointer disabled:opacity-50"
              >
                ถ่ายรูปเอกสาร
              </button>
            </div>
            <span className="text-sm text-slate-500">
              รับ JPG, PNG, PDF · ใส่ได้ไม่เกิน {MAX_IMPORT_FILES} ไฟล์ · อ่านเฉพาะรถยนต์ (ข้ามรถจักรยานยนต์)
            </span>
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED_TYPES}
              multiple
              hidden
              onChange={(e) => {
                void addFiles(Array.from(e.target.files ?? []));
                e.target.value = '';
              }}
            />
            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                void addFiles(Array.from(e.target.files ?? []));
                e.target.value = '';
              }}
            />
          </div>

          {files.length > 0 && (
            <ul className="space-y-2">
              {files.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-3 py-2 border border-slate-200 rounded-xl">
                  <FileText className="w-5 h-5 text-slate-400 shrink-0" />
                  <span className="flex-1 min-w-0 text-base break-words">
                    {f.name}
                    <span className="block text-sm text-slate-500">
                      {f.mimeType === 'application/pdf' ? 'PDF' : 'ภาพ'} · {f.sizeKb} KB
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))}
                    disabled={reading}
                    aria-label={`เอา ${f.name} ออก`}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer disabled:opacity-40"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-base">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              ไฟล์จะถูกส่งไปให้ AI ของ Google อ่านเพื่อดึงข้อมูล (ถ้าใช้แพ็กเกจฟรี Google อาจนำไปปรับปรุงผลิตภัณฑ์ของเขา) ไม่ควรใช้กับเอกสารลับ
              ระบบไม่เก็บไฟล์ไว้
            </span>
          </div>
        </div>

        <div className="px-5 sm:px-8 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2.5">
          <span className="text-base text-slate-600" aria-live="polite">
            {reading
              ? `กำลังอ่านเอกสาร ${elapsed} วินาที (ปกติไม่เกิน 20-30 วินาที) อย่าปิดหน้านี้`
              : busy === 'preparing'
                ? 'กำลังเตรียมไฟล์...'
                : files.length > 0
                  ? `เลือกไว้ ${files.length} ไฟล์`
                  : 'ยังไม่ได้เลือกไฟล์'}
          </span>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={reading}
              className="px-5 py-3 border border-slate-300 hover:bg-slate-100 text-slate-700 text-base font-semibold rounded-xl cursor-pointer disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleRead}
              disabled={files.length === 0 || busy !== null}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white text-base font-bold rounded-xl shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {reading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{reading ? 'กำลังอ่าน...' : `อ่านข้อมูลจากไฟล์${files.length ? ` (${files.length})` : ''}`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
