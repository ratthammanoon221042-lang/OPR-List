import type { ExtractFile } from '../services/sheetApi';

/** Limits for the "fill from photo" feature (the relay allows about 8 MB per request) */
export const MAX_IMPORT_FILES = 6;
const MAX_PDF_BYTES = 5 * 1024 * 1024;
// Larger than before so the small Thai letters of a table photo stay readable
const MAX_IMAGE_SIDE = 2200;
const JPEG_QUALITY = 0.88;
export const MAX_TOTAL_BASE64_CHARS = 7_000_000;

export const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,application/pdf';

const isPdf = (file: File) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
const isImage = (file: File) => file.type.startsWith('image/');

const readAsBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่ได้'));
    reader.readAsDataURL(blob);
  });

/**
 * Makes a picked file ready to send: photos are scaled down and re-saved as JPEG (a phone photo
 * can be 10 MB, far more than needed to read text), PDFs are sent as they are.
 */
export async function prepareFile(file: File): Promise<ExtractFile> {
  if (isPdf(file)) {
    if (file.size > MAX_PDF_BYTES) throw new Error(`ไฟล์ ${file.name} ใหญ่เกินไป (PDF ไม่เกิน 5 MB)`);
    return { name: file.name, mimeType: 'application/pdf', data: await readAsBase64(file) };
  }
  if (!isImage(file)) throw new Error(`ไฟล์ ${file.name} ไม่ใช่ภาพหรือ PDF`);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`เปิดภาพ ${file.name} ไม่ได้ (ถ้าเป็นภาพ HEIC ให้ถ่ายใหม่เป็น JPEG หรือแคปหน้าจอ)`);
  }
  try {
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('ประมวลผลภาพไม่ได้');
    // White behind transparent screenshots so the text stays readable as JPEG
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', JPEG_QUALITY).split(',')[1] ?? '';
    return { name: file.name || 'ภาพที่วาง', mimeType: 'image/jpeg', data };
  } finally {
    bitmap.close();
  }
}

/** The picture as a data URL, for a thumbnail */
export const toDataUrl = (file: ExtractFile): string => `data:${file.mimeType};base64,${file.data}`;

/**
 * Turns a picture a quarter turn (1 = clockwise, -1 = counter-clockwise), for photos taken sideways.
 * PDFs are returned unchanged (they cannot be rotated here).
 */
export async function rotateFile(file: ExtractFile, quarterTurns: 1 | -1): Promise<ExtractFile> {
  if (!file.mimeType.startsWith('image/')) return file;

  const img = new Image();
  img.src = toDataUrl(file);
  await img.decode();

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalHeight;
  canvas.height = img.naturalWidth;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('ประมวลผลภาพไม่ได้');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((quarterTurns * Math.PI) / 2);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  const data = canvas.toDataURL('image/jpeg', JPEG_QUALITY).split(',')[1] ?? '';
  return { ...file, mimeType: 'image/jpeg', data };
}
