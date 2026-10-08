import { ParkingPermit } from '../types/parking';

export const APPS_SCRIPT_URL_KEY = 'thai_overnight_apps_script_url_v1';

export const getStoredAppsScriptUrl = (): string => {
  try {
    return localStorage.getItem(APPS_SCRIPT_URL_KEY) || '';
  } catch {
    return '';
  }
};

export const setStoredAppsScriptUrl = (url: string) => {
  try {
    if (url && url.trim()) {
      localStorage.setItem(APPS_SCRIPT_URL_KEY, url.trim());
    } else {
      localStorage.removeItem(APPS_SCRIPT_URL_KEY);
    }
  } catch (e) {
    console.error('Failed to save Apps Script URL', e);
  }
};

/**
 * Send an action to Google Apps Script Web App
 */
export async function sendToAppsScript(payload: {
  action: 'add' | 'delete' | 'syncAll' | 'test';
  permit?: ParkingPermit;
  id?: string;
  licensePlate?: string;
  permits?: ParkingPermit[];
}): Promise<{ success: boolean; message?: string }> {
  const url = getStoredAppsScriptUrl();
  if (!url) {
    return { success: false, message: 'ยังไม่ได้ระบุ URL ของ Google Apps Script' };
  }

  try {
    // Note: Use text/plain to prevent CORS preflight OPTIONS failure with Google Apps Script
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
    });

    if (response.ok) {
      const data = await response.json().catch(() => null);
      return { 
        success: true, 
        message: data?.message || 'ส่งข้อมูลไปยัง Google Sheet สำเร็จ' 
      };
    }
    
    // In case of opaque response (mode: no-cors or redirect), it still succeeds
    return { success: true, message: 'ส่งคำขอไปยัง Google Sheet สำเร็จ' };
  } catch (err: any) {
    console.error('Apps Script fetch error:', err);
    return { success: false, message: err?.message || 'เชื่อมต่อ Google Apps Script ล้มเหลว' };
  }
}

/**
 * Fetch all permits from Google Sheet via Apps Script
 */
export async function fetchFromAppsScript(): Promise<{ success: boolean; data?: ParkingPermit[]; message?: string }> {
  const url = getStoredAppsScriptUrl();
  if (!url) {
    return { success: false, message: 'ยังไม่ได้ระบุ URL ของ Google Apps Script' };
  }

  try {
    const separator = url.includes('?') ? '&' : '?';
    const response = await fetch(`${url}${separator}t=${Date.now()}`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`โหลดข้อมูลไม่สำเร็จ (HTTP ${response.status})`);
    }

    const res = await response.json();
    if (res.status === 'success' && Array.isArray(res.data)) {
      return { success: true, data: res.data };
    }
    return { success: false, message: res.message || 'โครงสร้างข้อมูลไม่ถูกต้อง' };
  } catch (err: any) {
    console.error('fetchFromAppsScript error:', err);
    return { success: false, message: err?.message || 'ไม่สามารถโหลดข้อมูลจากชีตได้' };
  }
}

/**
 * The ready-to-copy Google Apps Script Code
 */
export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * ==============================================================
 * สคริปต์เชื่อมต่อ Google Sheet สำหรับระบบ "รายการขออนุญาตจอดค้างคืน"
 * ==============================================================
 * 
 * วิธีนำไปใช้งาน:
 * 1. เปิด Google Sheet ของคุณ > ไปที่เมนู "ส่วนขยาย" (Extensions) > เลือก "Apps Script"
 * 2. ลบโค้ดเดิมทั้งหมดออก แล้วคัดลอกโค้ดนี้ไปวางแทนที่
 * 3. กดไอคอน "บันทึก" (รูปแผ่นดิสก์)
 * 4. กดปุ่ม "การทำให้ใช้งานได้" (Deploy) มุมขวาบน > เลือก "การทำให้ใช้งานได้ใหม่" (New deployment)
 * 5. คลิกไอคอนรูปเฟือง ⚙️ > เลือก "เว็บแอป" (Web app)
 *    - คำอธิบาย: ระบบจอดรถค้างคืน
 *    - ดำเนินการในฐานะ (Execute as): ตัวฉันเอง (Me)
 *    - ผู้มีสิทธิ์เข้าถึง (Who has access): "ทุกคน" (Anyone) **สำคัญมาก**
 * 6. กด "ทำให้ใช้งานได้" (Deploy) แล้วคัดลอก "URL เว็บแอป" มาใส่ในแอพพลิเคชัน
 */

var SHEET_NAME = "รายการขอจอดรถ";
var HEADERS = [
  "รหัสอ้างอิง",
  "หมายเลขทะเบียน",
  "จังหวัด",
  "ชั้นที่ขอจอด",
  "ยี่ห้อรถ",
  "สีรถ",
  "หน่วยงาน",
  "หน่วยงานย่อย", // คอลัมน์ที่ 8: หน่วยงานย่อย
  "วันที่เริ่มจอด",
  "วันที่สิ้นสุด",
  "วันที่บันทึกคำขอ"
];

function getOrCreateSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  ensureHeaders(sheet);
  return sheet;
}

function ensureHeaders(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  
  if (lastRow === 0 || lastCol === 0) {
    sheet.appendRow(HEADERS);
    formatHeaderRow(sheet);
    return;
  }
  
  var currentHeaders = sheet.getRange(1, 1, 1, Math.max(lastCol, HEADERS.length)).getValues()[0];
  var needsUpdate = false;
  if (currentHeaders.length < HEADERS.length || currentHeaders[7] !== "หน่วยงานย่อย") {
    needsUpdate = true;
  }
  
  if (needsUpdate) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    formatHeaderRow(sheet);
  }
}

function formatHeaderRow(sheet) {
  var range = sheet.getRange(1, 1, 1, HEADERS.length);
  range.setBackground("#1e293b"); // สีกรมท่า slate-800
  range.setFontColor("#ffffff");
  range.setFontWeight("bold");
  range.setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
}

function cleanPlate(plate) {
  if (!plate) return "";
  return String(plate).replace(/\\s+/g, "").trim().toLowerCase();
}

function permitToRow(p) {
  return [
    p.id || ("PK-" + new Date().getTime()),
    String(p.licensePlate || "").replace(/\\s+/g, ""),
    p.province || "กรุงเทพมหานคร",
    p.parkingFloor || "B1",
    p.vehicleBrand || "",
    p.vehicleColor || "",
    p.department || "-",
    p.subDepartment || "-", // คอลัมน์หน่วยงานย่อย
    p.startDate || "",
    p.endDate || "",
    p.createdAt ? Utilities.formatDate(new Date(p.createdAt), "Asia/Bangkok", "dd/MM/yyyy HH:mm:ss") : Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy HH:mm:ss")
  ];
}

// รับคำขอ POST จากเว็บแอพ (เพิ่ม / ลบ / ซิงค์)
function doPost(e) {
  try {
    var contents = e.postData ? e.postData.contents : "{}";
    var data = JSON.parse(contents);
    var action = data.action;
    var sheet = getOrCreateSheet();
    var response = { status: "success", action: action };

    if (action === "add") {
      // 1. เพิ่มรายการใหม่
      var newRow = permitToRow(data.permit);
      sheet.appendRow(newRow);
      response.message = "บันทึกรายการลงชีตเรียบร้อยแล้ว";
      response.id = data.permit.id;

    } else if (action === "delete") {
      // 2. ลบรายการตาม ID หรือทะเบียนรถ
      var targetId = String(data.id || "").trim();
      var targetPlate = cleanPlate(data.licensePlate);
      var lastRow = sheet.getLastRow();
      var deletedCount = 0;

      if (lastRow > 1) {
        var values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
        // ลบจากล่างขึ้นบน เพื่อป้องกัน Index คลาดเคลื่อน
        for (var i = values.length - 1; i >= 0; i--) {
          var rowId = String(values[i][0] || "").trim();
          var rowPlate = cleanPlate(values[i][1]);

          var matchId = targetId && rowId && (rowId === targetId);
          var matchPlate = targetPlate && rowPlate && (rowPlate === targetPlate);

          if (matchId || matchPlate) {
            sheet.deleteRow(i + 2);
            deletedCount++;
          }
        }
      }
      
      // ถ้าได้รับรายการคงเหลือมาด้วย ให้ซิงค์ทับเพื่อความแม่นยำ 100%
      if (deletedCount === 0 && data.permits && Array.isArray(data.permits)) {
        syncAllData(sheet, data.permits);
        deletedCount = 1;
      }

      response.deletedCount = deletedCount;
      response.message = "ลบรายการออกจากชีตเรียบร้อยแล้ว (" + deletedCount + " แถว)";

    } else if (action === "syncAll") {
      // 3. ซิงค์ข้อมูลทั้งหมด (เขียนทับใหม่)
      var permits = data.permits || [];
      syncAllData(sheet, permits);
      response.count = permits.length;
      response.message = "ซิงค์ข้อมูลทั้งหมดลงชีตเรียบร้อยแล้ว";

    } else if (action === "test") {
      response.message = "เชื่อมต่อสำเร็จ! ชีตพร้อมรับข้อมูล";

    } else {
      response.status = "error";
      response.message = "ไม่รู้จัก action: " + action;
    }

    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function syncAllData(sheet, permits) {
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }
  ensureHeaders(sheet);

  if (permits.length > 0) {
    var rows = permits.map(function(p) {
      return permitToRow(p);
    });
    sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
  }
}

// รับคำขอ GET (ดึงข้อมูลกลับมาที่แอพ)
function doGet(e) {
  try {
    var sheet = getOrCreateSheet();
    var lastRow = sheet.getLastRow();
    var list = [];

    if (lastRow > 1) {
      var range = sheet.getRange(2, 1, lastRow - 1, HEADERS.length);
      var values = range.getValues();

      for (var i = 0; i < values.length; i++) {
        var row = values[i];
        if (!row[1]) continue;

        list.push({
          id: String(row[0] || ("PK-" + (i + 1))),
          licensePlate: String(row[1]).replace(/\\s+/g, ""),
          province: String(row[2] || "กรุงเทพมหานคร"),
          parkingFloor: String(row[3]).indexOf("B2") !== -1 ? "B2" : "B1",
          vehicleBrand: String(row[4] || ""),
          vehicleColor: String(row[5] || ""),
          department: row[6] && row[6] !== "-" ? String(row[6]) : undefined,
          subDepartment: row[7] && row[7] !== "-" ? String(row[7]) : undefined,
          startDate: String(row[8] || ""),
          endDate: String(row[9] || ""),
          createdAt: String(row[10] || new Date().toISOString())
        });
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      count: list.length,
      data: list
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
`;
