import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { ParkingPermit } from '../types/parking';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/drive.file');

let cachedAccessToken: string | null = null;
let isSigningIn = false;

const SPREADSHEET_ID_STORAGE_KEY = 'thai_overnight_google_sheet_id_v2';
const TOKEN_STORAGE_KEY = 'thai_overnight_google_token_v2';
const LEGACY_TOKEN_STORAGE_KEY = 'thai_overnight_google_token_v1';
const APPS_SCRIPT_URL_STORAGE_KEY = 'thai_overnight_apps_script_url_v1';

export const SHEET_HEADERS = [
  'รหัสอ้างอิง',
  'หมายเลขทะเบียน',
  'จังหวัด',
  'ชั้นที่ขอจอด',
  'ยี่ห้อรถ',
  'สีรถ',
  'หน่วยงาน',
  'หน่วยงานย่อย',
  'วันที่เริ่มจอด',
  'วันที่สิ้นสุด',
  'วันที่บันทึกคำขอ',
];

export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * สคริปต์ Google Apps Script สำหรับระบบบันทึกขออนุญาตจอดรถค้างคืน
 * วิธีติดตั้ง:
 * 1. เปิด Google Sheet ที่ต้องการ
 * 2. ไปที่เมนู "ส่วนขยาย" (Extensions) -> "Apps Script"
 * 3. ลบโค้ดเดิมทั้งหมด แล้ววางโค้ดชุดนี้ลงไป
 * 4. กดปุ่มบันทึก (รูปแผ่นดิสก์)
 * 5. กดปุ่มสีน้ำเงิน "การทำให้ใช้งานได้" (Deploy) -> "การทำให้ใช้งานได้รายการใหม่" (New deployment)
 * 6. เลือกประเภทเป็น "เว็บแอปพลิเคชัน" (Web app)
 * 7. ตั้งค่า "ผู้มีสิทธิ์เข้าถึง" (Who has access) ให้เป็น "ทุกคน" (Anyone)
 * 8. กด "ทำให้ใช้งานได้" แล้วคัดลอก URL เว็บแอปมาวางในระบบ
 */

function doGet(e) {
  var sheet = getOrCreateSheet();
  var data = sheet.getDataRange().getValues();
  var rows = data.slice(1);
  
  var permits = rows.map(function(row, index) {
    return {
      id: row[0] || ('PK-' + (index + 1)),
      licensePlate: String(row[1] || '').replace(/\\s+/g, ''),
      province: row[2] || 'กรุงเทพมหานคร',
      parkingFloor: (String(row[3] || '').indexOf('B2') !== -1) ? 'B2' : 'B1',
      vehicleBrand: row[4] || '',
      vehicleColor: row[5] || '',
      department: (row[6] && row[6] !== '-') ? row[6] : '',
      subDepartment: (row[7] && row[7] !== '-') ? row[7] : '',
      startDate: row[8] || '',
      endDate: row[9] || '',
      createdAt: row[10] || new Date().toISOString()
    };
  });

  return ContentService.createTextOutput(JSON.stringify({ status: 'success', data: permits }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var sheet = getOrCreateSheet();
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;

    if (action === 'append') {
      var p = payload.permit;
      sheet.appendRow([
        p.id,
        String(p.licensePlate).replace(/\\s+/g, ''),
        p.province || 'กรุงเทพมหานคร',
        p.parkingFloor,
        p.vehicleBrand,
        p.vehicleColor,
        p.department || '-',
        p.subDepartment || '-',
        p.startDate,
        p.endDate,
        new Date().toLocaleString('th-TH')
      ]);
      return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'delete') {
      var permitId = payload.permitId;
      var cleanPlate = String(payload.licensePlate || '').replace(/\\s+/g, '').toLowerCase();
      var data = sheet.getDataRange().getValues();
      
      // ลบจากล่างขึ้นบน ป้องกัน index คลาดเคลื่อน
      for (var i = data.length - 1; i >= 1; i--) {
        var rowId = String(data[i][0] || '').trim();
        var rowPlate = String(data[i][1] || '').replace(/\\s+/g, '').toLowerCase();
        if ((permitId && rowId === permitId) || (cleanPlate && rowPlate === cleanPlate)) {
          sheet.deleteRow(i + 1);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'sync') {
      var permits = payload.permits || [];
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.getRange(2, 1, lastRow - 1, 11).clearContent();
      }
      
      if (permits.length > 0) {
        var rows = permits.map(function(p) {
          return [
            p.id,
            String(p.licensePlate).replace(/\\s+/g, ''),
            p.province || 'กรุงเทพมหานคร',
            p.parkingFloor,
            p.vehicleBrand,
            p.vehicleColor,
            p.department || '-',
            p.subDepartment || '-',
            p.startDate,
            p.endDate,
            new Date(p.createdAt || new Date()).toLocaleString('th-TH')
          ];
        });
        sheet.getRange(2, 1, rows.length, 11).setValues(rows);
      }
      return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'unknown_action' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getOrCreateSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('รายการขอจอดรถ');
  if (!sheet) {
    sheet = ss.insertSheet('รายการขอจอดรถ');
  }
  var headers = [
    'รหัสอ้างอิง',
    'หมายเลขทะเบียน',
    'จังหวัด',
    'ชั้นที่ขอจอด',
    'ยี่ห้อรถ',
    'สีรถ',
    'หน่วยงาน',
    'หน่วยงานย่อย',
    'วันที่เริ่มจอด',
    'วันที่สิ้นสุด',
    'วันที่บันทึกคำขอ'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  return sheet;
}`;

export const getStoredSpreadsheetId = (): string | null => {
  try {
    return localStorage.getItem(SPREADSHEET_ID_STORAGE_KEY);
  } catch {
    return null;
  }
};

export const setStoredSpreadsheetId = (id: string | null) => {
  try {
    if (id) {
      localStorage.setItem(SPREADSHEET_ID_STORAGE_KEY, id.trim());
    } else {
      localStorage.removeItem(SPREADSHEET_ID_STORAGE_KEY);
    }
  } catch (e) {
    console.error('Failed to set spreadsheet ID in localStorage', e);
  }
};

export const getStoredAppsScriptUrl = (): string | null => {
  try {
    return localStorage.getItem(APPS_SCRIPT_URL_STORAGE_KEY);
  } catch {
    return null;
  }
};

export const setStoredAppsScriptUrl = (url: string | null) => {
  try {
    if (url) {
      localStorage.setItem(APPS_SCRIPT_URL_STORAGE_KEY, url.trim());
    } else {
      localStorage.removeItem(APPS_SCRIPT_URL_STORAGE_KEY);
    }
  } catch (e) {
    console.error('Failed to set Apps Script URL in localStorage', e);
  }
};

/**
 * Save access token persistently in localStorage and memory
 */
export const setStoredAccessToken = (token: string | null) => {
  cachedAccessToken = token;
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY);
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch (e) {
    console.error('Failed to store access token', e);
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken) return cachedAccessToken;
  try {
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY) || 
                   sessionStorage.getItem(TOKEN_STORAGE_KEY) || 
                   sessionStorage.getItem(LEGACY_TOKEN_STORAGE_KEY);
    if (stored) {
      cachedAccessToken = stored;
      return stored;
    }
  } catch {}
  return null;
};

export const initGoogleAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    const token = await getAccessToken();
    if (user && token) {
      cachedAccessToken = token;
      if (onAuthSuccess) onAuthSuccess(user, token);
    } else {
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const signInWithGoogle = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('ไม่สามารถดึง Access Token จาก Google ได้ กรุณาลองใหม่อีกครั้ง');
    }
    const token = credential.accessToken;
    setStoredAccessToken(token);
    return { user: result.user, accessToken: token };
  } catch (error) {
    console.error('Google Sign In error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const logoutGoogle = async () => {
  await auth.signOut();
  setStoredAccessToken(null);
};

/**
 * Helper to fetch spreadsheet info and return sheet title and numeric sheetId
 */
export const getSpreadsheetMetadata = async (
  accessToken: string,
  spreadsheetId: string
): Promise<{ sheetTitle: string; sheetNumericId: number }> => {
  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!metaRes.ok) {
    const errText = await metaRes.text();
    throw new Error(`ไม่สามารถอ่านข้อมูล Google Sheet: ${errText}`);
  }

  const meta = await metaRes.json();
  const sheetObj = meta.sheets?.[0];
  const sheetTitle = sheetObj?.properties?.title || 'รายการขอจอดรถ';
  const sheetNumericId = sheetObj?.properties?.sheetId ?? 0;

  return { sheetTitle, sheetNumericId };
};

/**
 * Ensure headers in row 1 (A1:K1) match the latest structure including 'หน่วยงานย่อย'
 */
export const ensureSheetHeaders = async (
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string
): Promise<void> => {
  try {
    const encodedRange = encodeURIComponent(`'${sheetTitle.replace(/'/g, "''")}'!A1:K1`);
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: [SHEET_HEADERS],
        }),
      }
    );
  } catch (err) {
    console.warn('Failed to ensure sheet headers:', err);
  }
};

/**
 * Convert ParkingPermit to an 11-column row matching Google Sheet structure
 */
export const permitToSheetRow = (permit: ParkingPermit): (string | number)[] => {
  return [
    permit.id,
    permit.licensePlate.replace(/\s+/g, ''),
    permit.province || 'กรุงเทพมหานคร',
    permit.parkingFloor,
    permit.vehicleBrand,
    permit.vehicleColor,
    permit.department || '-',
    permit.subDepartment || '-',
    permit.startDate,
    permit.endDate,
    new Date(permit.createdAt).toLocaleString('th-TH'),
  ];
};

/**
 * Create a brand new Google Spreadsheet, setup 11 columns, populate permits, and bind it
 */
export const createNewParkingSheet = async (
  accessToken: string,
  existingPermits: ParkingPermit[] = []
): Promise<{ spreadsheetId: string; url: string }> => {
  const title = `บันทึกขออนุญาตจอดรถค้างคืน_${new Date().toISOString().split('T')[0]}`;
  const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [
        {
          properties: {
            title: 'รายการขอจอดรถ',
            gridProperties: {
              frozenRowCount: 1,
            },
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`สร้าง Google Sheet ล้มเหลว: ${errText}`);
  }

  const data = await response.json();
  const spreadsheetId = data.spreadsheetId;
  const sheetUrl = data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  // Write headers to the new sheet including subDepartment
  await ensureSheetHeaders(accessToken, spreadsheetId, 'รายการขอจอดรถ');

  // Populate existing permits immediately if any
  if (existingPermits.length > 0) {
    const rows = existingPermits.map(p => permitToSheetRow(p));
    const encodedRange = encodeURIComponent(`'รายการขอจอดรถ'!A2:K${1 + rows.length}`);
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: rows }),
      }
    );
  }

  setStoredSpreadsheetId(spreadsheetId);
  return { spreadsheetId, url: sheetUrl };
};

/**
 * Append a parking permit row to Google Sheet
 */
export const appendPermitToGoogleSheet = async (
  accessToken: string | null,
  spreadsheetId: string | null,
  permit: ParkingPermit
): Promise<void> => {
  // If Apps Script URL is configured, send via Apps Script
  const appsScriptUrl = getStoredAppsScriptUrl();
  if (appsScriptUrl) {
    try {
      await fetch(appsScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'append', permit }),
      });
    } catch (e) {
      console.warn('Apps Script append error:', e);
    }
  }

  // If Google Sheets API credentials are present
  if (accessToken && spreadsheetId) {
    const { sheetTitle } = await getSpreadsheetMetadata(accessToken, spreadsheetId);
    await ensureSheetHeaders(accessToken, spreadsheetId, sheetTitle);

    const row = permitToSheetRow(permit);
    const encodedRange = encodeURIComponent(`'${sheetTitle.replace(/'/g, "''")}'!A:K`);

    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}:append?valueInputOption=USER_ENTERED`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: [row] }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`บันทึกลง Google Sheet ล้มเหลว: ${errText}`);
    }
  }
};

/**
 * Overwrite / synchronize full list of permits to Google Sheet
 */
export const syncAllPermitsToGoogleSheet = async (
  accessToken: string | null,
  spreadsheetId: string | null,
  permits: ParkingPermit[]
): Promise<void> => {
  // If Apps Script URL is configured, sync via Apps Script
  const appsScriptUrl = getStoredAppsScriptUrl();
  if (appsScriptUrl) {
    try {
      await fetch(appsScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'sync', permits }),
      });
    } catch (e) {
      console.warn('Apps Script sync error:', e);
    }
  }

  // If Google Sheets API credentials are present
  if (accessToken && spreadsheetId) {
    const { sheetTitle } = await getSpreadsheetMetadata(accessToken, spreadsheetId);

    // 1. Update/Ensure header row A1:K1
    await ensureSheetHeaders(accessToken, spreadsheetId, sheetTitle);

    // 2. Clear old data rows A2:K2000
    const clearRange = encodeURIComponent(`'${sheetTitle.replace(/'/g, "''")}'!A2:K2000`);
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${clearRange}:clear`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (permits.length === 0) return;

    // 3. Write active permits with all 11 columns
    const rows = permits.map(p => permitToSheetRow(p));
    const putRange = encodeURIComponent(`'${sheetTitle.replace(/'/g, "''")}'!A2:K${1 + rows.length}`);

    const putRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${putRange}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: rows }),
      }
    );

    if (!putRes.ok) {
      const errText = await putRes.text();
      throw new Error(`อัปเดต Google Sheet ล้มเหลว: ${errText}`);
    }
  }
};

/**
 * Delete a specific parking permit from Google Sheet by ID or License Plate
 */
export const deletePermitFromGoogleSheet = async (
  accessToken: string | null,
  spreadsheetId: string | null,
  permitId: string,
  licensePlate?: string,
  remainingPermits?: ParkingPermit[]
): Promise<boolean> => {
  let anySuccess = false;

  // 1. If Apps Script URL is configured
  const appsScriptUrl = getStoredAppsScriptUrl();
  if (appsScriptUrl) {
    try {
      const res = await fetch(appsScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'delete', permitId, licensePlate, permits: remainingPermits }),
      });
      if (res.ok) anySuccess = true;
    } catch (e) {
      console.warn('Apps Script delete error:', e);
    }
  }

  // 2. If Google Sheets API credentials are present
  if (accessToken && spreadsheetId) {
    try {
      const { sheetTitle, sheetNumericId } = await getSpreadsheetMetadata(accessToken, spreadsheetId);
      const encodedRange = encodeURIComponent(`'${sheetTitle.replace(/'/g, "''")}'!A:K`);
      
      const rowsRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (rowsRes.ok) {
        const rowsData = await rowsRes.json();
        const values: string[][] = rowsData.values || [];

        const cleanTargetPlate = (licensePlate || '').replace(/\s+/g, '').trim().toLowerCase();
        const cleanTargetId = (permitId || '').trim();

        const matchingIndices: number[] = [];
        for (let i = values.length - 1; i >= 1; i--) {
          const rowId = (values[i]?.[0] || '').trim();
          const rowPlate = (values[i]?.[1] || '').replace(/\s+/g, '').trim().toLowerCase();

          const idMatch = cleanTargetId && rowId && rowId === cleanTargetId;
          const plateMatch = cleanTargetPlate && rowPlate && rowPlate === cleanTargetPlate;

          if (idMatch || plateMatch) {
            matchingIndices.push(i);
          }
        }

        if (matchingIndices.length > 0) {
          const requests = matchingIndices.map(rowIdx => ({
            deleteDimension: {
              range: {
                sheetId: sheetNumericId,
                dimension: 'ROWS',
                startIndex: rowIdx,
                endIndex: rowIdx + 1,
              },
            },
          }));

          const deleteRes = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ requests }),
            }
          );

          if (deleteRes.ok) {
            anySuccess = true;
            return true;
          }
        }
      }

      // If dimension delete didn't find or failed, fallback to full sync
      if (remainingPermits) {
        await syncAllPermitsToGoogleSheet(accessToken, spreadsheetId, remainingPermits);
        anySuccess = true;
        return true;
      }
    } catch (err) {
      console.error('Google Sheets API delete error:', err);
      if (remainingPermits) {
        try {
          await syncAllPermitsToGoogleSheet(accessToken, spreadsheetId, remainingPermits);
          anySuccess = true;
        } catch {}
      }
    }
  }

  return anySuccess;
};

/**
 * Sync / Read permits from Google Sheet
 */
export const fetchPermitsFromGoogleSheet = async (
  accessToken: string | null,
  spreadsheetId: string | null
): Promise<ParkingPermit[]> => {
  // If Apps Script URL is configured, try fetch via Apps Script
  const appsScriptUrl = getStoredAppsScriptUrl();
  if (appsScriptUrl) {
    try {
      const res = await fetch(`${appsScriptUrl}?action=get`);
      if (res.ok) {
        const json = await res.json();
        if (json?.data && Array.isArray(json.data) && json.data.length > 0) {
          return json.data;
        }
      }
    } catch (e) {
      console.warn('Fetch via Apps Script error:', e);
    }
  }

  if (!accessToken || !spreadsheetId) {
    throw new Error('ไม่พบการเชื่อมต่อ Google Sheet หรือ Access Token');
  }

  const { sheetTitle } = await getSpreadsheetMetadata(accessToken, spreadsheetId);
  const encodedRange = encodeURIComponent(`'${sheetTitle.replace(/'/g, "''")}'!A2:K1000`);

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    throw new Error('ไม่สามารถโหลดข้อมูลจาก Google Sheet ได้');
  }

  const data = await response.json();
  const rows = data.values || [];

  return rows.map((row: string[], index: number) => {
    const is11Col = row.length >= 10;
    const plate = (row[1] || '').replace(/\s+/g, '');
    const province = row[2] || 'กรุงเทพมหานคร';
    const floorRaw = row[3];
    const floor: 'B1' | 'B2' = (floorRaw && floorRaw.includes('B2')) ? 'B2' : 'B1';
    const brand = row[4] || '';
    const color = row[5] || '';
    const department = row[6] && row[6] !== '-' ? row[6] : undefined;
    const subDepartment = is11Col && row[7] && row[7] !== '-' ? row[7] : undefined;
    const startDate = is11Col ? (row[8] || '') : (row[7] || '');
    const endDate = is11Col ? (row[9] || '') : (row[8] || '');
    const createdAt = is11Col ? (row[10] || new Date().toISOString()) : (row[9] || new Date().toISOString());

    return {
      id: row[0] || `PK-${index + 1}`,
      licensePlate: plate,
      province,
      parkingFloor: floor,
      vehicleBrand: brand,
      vehicleColor: color,
      department,
      subDepartment,
      startDate,
      endDate,
      createdAt,
    };
  });
};
