/**
 * ==============================================================
 * Backend ของ "รายการขออนุญาตจอดค้างคืน" (Google Apps Script)
 * ==============================================================
 *
 * วิธีติดตั้ง
 *  1. เปิด Google Sheet ที่จะใช้เก็บข้อมูล > ส่วนขยาย (Extensions) > Apps Script
 *  2. ลบโค้ดเดิมทั้งหมด แล้ววางโค้ดชุดนี้แทน > กดบันทึก
 *  3. ปุ่ม "ทำให้ใช้งานได้" (Deploy) > "การทำให้ใช้งานได้รายการใหม่" (New deployment)
 *  4. เลือกประเภท "เว็บแอป" (Web app)
 *       - ดำเนินการในฐานะ (Execute as): ตัวฉันเอง (Me)
 *       - ผู้มีสิทธิ์เข้าถึง (Who has access): ทุกคน (Anyone)
 *  5. กด "อนุญาต" ในหน้าขอสิทธิ์ แล้วคัดลอก "URL เว็บแอป" (ลงท้าย /exec)
 *
 * ถ้าแก้โค้ดภายหลัง: ทำให้ใช้งานได้ > จัดการการทำให้ใช้งานได้ > ไอคอนดินสอ > เวอร์ชัน "เวอร์ชันใหม่"
 * (วิธีนี้ URL จะไม่เปลี่ยน ส่วนการสร้าง "รายการใหม่" จะได้ URL ใหม่ทุกครั้ง)
 *
 * ความปลอดภัย
 *  - การอ่านรายการ (doGet) เปิดให้ทุกคนที่มี URL เพื่อให้ รปภ. ดูได้โดยไม่ต้องล็อกอิน
 *  - การเพิ่ม / แก้ไข / ลบ / เปลี่ยนรหัสผ่าน ต้องมี token ที่ได้จากการล็อกอินเท่านั้น
 *  - token เป็นลายเซ็น HMAC มีวันหมดอายุ ไม่ต้องเก็บไว้ที่ไหน จึงไม่หลุดเองและไม่ช้า
 *  - รหัสผ่านเก็บเป็น hash (SHA-256 + salt) ใน Script Properties ไม่เก็บเป็นข้อความ
 *  - ล็อกอินผิดเกิน 5 ครั้งจะถูกล็อกชั่วคราว 5 นาที
 *  - ถ้าลืมรหัสผ่าน: เปิดตัวแก้ไข Apps Script แล้วเลือกรันฟังก์ชัน resetPassword()
 */

var SHEET_NAME = 'รายการขอจอดรถ';
var TIMEZONE = 'Asia/Bangkok';
var DEFAULT_PASSWORD = '1234'; // ใช้ได้ก่อนมีการตั้งรหัสใหม่เท่านั้น
var MIN_PASSWORD_LENGTH = 6;
var TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
var MAX_FAILED_LOGINS = 5;
var LOCKOUT_SECONDS = 5 * 60;
// ทุกการเพิ่ม/แก้/ลบผ่านแอปจะอัปเดตแคชนี้ทันที จึงเก็บได้นาน (สูงสุดที่ CacheService ให้คือ 6 ชั่วโมง)
// ถ้าแก้ข้อมูลในชีตด้วยมือโดยตรง ให้กดปุ่ม "รีเฟรช" ในแอป (อ่านสดจากชีต) หรือรอแคชหมดอายุ
var LIST_CACHE_TTL_SECONDS = 6 * 60 * 60;
var CACHE_CHUNK_CHARS = 30000; // CacheService เก็บได้ 100KB ต่อค่า (ภาษาไทย 3 ไบต์/ตัวอักษร)

// เวลาไทยเป็น UTC+7 ตลอดปี (ไม่มีเวลาออมแสง)
var BANGKOK_OFFSET_HOURS = 7;
// รูปแบบวันที่ที่แสดงในชีต: วันที่เริ่ม/สิ้นสุด = dd/mm/yyyy, วันที่บันทึกคำขอ = dd/mm/yyyy 15.00 น.
// ค่าเก็บเป็นข้อความล้วน (ชีตจึงไม่แปลงวันที่เองหรือเลื่อนวันตามเขตเวลา) แอปอ่านกลับเป็น YYYY-MM-DD ให้เอง
var DATE_FORMAT_VERSION = '2';

var HEADERS = [
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

var WRITE_ACTIONS = { add: true, update: true, delete: true, import: true };

// ---------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || 'list';
    if (action === 'list') {
      // fresh=1 (ปุ่มรีเฟรชในแอป) ข้ามแคชและอ่านสดจากชีต
      var json = e.parameter.fresh === '1' ? null : getCachedListJson_();
      if (json === null) {
        json = JSON.stringify(readAllPermits_(getSheet_()));
        putCachedListJson_(json);
      }
      return text_('{"status":"success","data":' + json + '}');
    }
    if (action === 'ping') {
      return json_({ status: 'success', message: 'เชื่อมต่อสำเร็จ' });
    }
    return fail_('bad_request', 'ไม่รู้จัก action: ' + action);
  } catch (err) {
    return fail_('server_error', String(err));
  }
}

function doPost(e) {
  var lock = null;
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var action = body.action;

    if (action === 'ping') {
      return json_({ status: 'success', message: 'เชื่อมต่อสำเร็จ' });
    }
    if (action === 'login') {
      return handleLogin_(body);
    }

    // ทุก action ต่อจากนี้ต้องล็อกอินแล้ว
    if (!isValidToken_(body.token)) {
      return fail_('unauthorized', 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
    }

    // ใช้โดยตัวกลาง (Cloudflare Worker) ก่อนให้บริการอ่านเอกสารจากรูป: แค่ยืนยันว่า token ยังใช้ได้
    if (action === 'checkToken') {
      return json_({ status: 'success' });
    }
    if (action === 'changePassword') {
      return handleChangePassword_(body);
    }
    if (!WRITE_ACTIONS[action]) {
      return fail_('bad_request', 'ไม่รู้จัก action: ' + action);
    }

    // เขียนทีละคำขอ กันข้อมูลชนกันเมื่อหลายเครื่องบันทึกพร้อมกัน
    lock = LockService.getScriptLock();
    lock.waitLock(20000);

    var sheet = getSheet_();
    migrateDateFormats_(sheet); // ครั้งแรกหลังอัปเดตสคริปต์: แปลงแถวเดิมให้เป็นรูปแบบใหม่
    if (action === 'add') return handleAdd_(sheet, body.permit);
    if (action === 'update') return handleUpdate_(sheet, body.permit);
    if (action === 'delete') return handleDelete_(sheet, body.id);
    return handleImport_(sheet, body.permits);
  } catch (err) {
    return fail_('server_error', String(err));
  } finally {
    if (lock) lock.releaseLock();
  }
}

// ---------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------

function handleLogin_(body) {
  var cache = CacheService.getScriptCache();
  var failed = Number(cache.get('login_failed') || 0);
  if (failed >= MAX_FAILED_LOGINS) {
    return fail_('locked', 'ใส่รหัสผิดหลายครั้งเกินไป กรุณารอ 5 นาทีแล้วลองใหม่');
  }

  if (!verifyPassword_(String(body.password || ''))) {
    cache.put('login_failed', String(failed + 1), LOCKOUT_SECONDS);
    return fail_('invalid_password', 'รหัสผ่านไม่ถูกต้อง');
  }

  cache.remove('login_failed');
  return json_({ status: 'success', token: issueToken_(), mustChange: !hasCustomPassword_() });
}

function handleChangePassword_(body) {
  var oldPassword = String(body.oldPassword || '');
  var newPassword = String(body.newPassword || '');

  if (!verifyPassword_(oldPassword)) {
    return fail_('invalid_password', 'รหัสผ่านเดิมไม่ถูกต้อง');
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return fail_('weak_password', 'รหัสผ่านใหม่ต้องยาวอย่างน้อย ' + MIN_PASSWORD_LENGTH + ' ตัวอักษร');
  }
  if (newPassword === DEFAULT_PASSWORD) {
    return fail_('weak_password', 'ห้ามใช้รหัสเริ่มต้นเป็นรหัสผ่านใหม่');
  }

  var props = PropertiesService.getScriptProperties();
  var salt = Utilities.getUuid();
  props.setProperty('PW_SALT2', salt);
  props.setProperty('PW_HASH2', hashPassword_(newPassword, salt));
  // เพิ่มเลขเวอร์ชัน ทำให้ token เดิมทุกเครื่องใช้ไม่ได้อีก
  props.setProperty('PW_VERSION', String(Number(props.getProperty('PW_VERSION') || 0) + 1));

  return json_({ status: 'success', token: issueToken_(), message: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว' });
}

function hasCustomPassword_() {
  return !!PropertiesService.getScriptProperties().getProperty('PW_HASH2');
}

function verifyPassword_(password) {
  var props = PropertiesService.getScriptProperties();
  var storedHash = props.getProperty('PW_HASH2');
  if (!storedHash) {
    return password === DEFAULT_PASSWORD;
  }
  return hashPassword_(password, props.getProperty('PW_SALT2') || '') === storedHash;
}

function hashPassword_(password, salt) {
  return bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + password, Utilities.Charset.UTF_8));
}

function bytesToHex_(bytes) {
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    hex += (b < 16 ? '0' : '') + b.toString(16);
  }
  return hex;
}

/** token = <หมดอายุ(ms)>.<เวอร์ชันรหัสผ่าน>.<ลายเซ็น HMAC> ตรวจได้เองโดยไม่ต้องเก็บ state */
function issueToken_() {
  var body = (Date.now() + TOKEN_TTL_MS) + '.' + currentPasswordVersion_();
  return body + '.' + sign_(body);
}

function isValidToken_(token) {
  if (!token || typeof token !== 'string') return false;
  var parts = token.split('.');
  if (parts.length !== 3) return false;
  if (sign_(parts[0] + '.' + parts[1]) !== parts[2]) return false;
  if (Number(parts[0]) < Date.now()) return false;
  return parts[1] === currentPasswordVersion_();
}

function sign_(body) {
  return bytesToHex_(Utilities.computeHmacSha256Signature(body, getTokenSecret_()));
}

function getTokenSecret_() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('TOKEN_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('TOKEN_SECRET', secret);
  }
  return secret;
}

function currentPasswordVersion_() {
  return PropertiesService.getScriptProperties().getProperty('PW_VERSION') || '0';
}

/** รันเองจากตัวแก้ไข Apps Script เมื่อลืมรหัสผ่าน */
function resetPassword() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('PW_HASH2');
  props.deleteProperty('PW_SALT2');
  props.setProperty('PW_VERSION', String(Number(props.getProperty('PW_VERSION') || 0) + 1));
  CacheService.getScriptCache().remove('login_failed');
}

// ---------------------------------------------------------------
// Data handlers (ทุกตัวตอบกลับพร้อมรายการล่าสุด แอปจึงไม่ต้องโหลดซ้ำ)
// ---------------------------------------------------------------

function handleAdd_(sheet, raw) {
  var permit = validatePermit_(raw);
  if (permit.error) return fail_('bad_request', permit.error);

  // เพิ่มซ้ำด้วย id เดิม (เช่น ลองส่งใหม่หลังเน็ตหลุด) ให้ถือว่าสำเร็จ ไม่เพิ่มแถวซ้ำ
  if (findRowById_(sheet, permit.value.id) > 0) {
    return done_(sheet, { duplicate: true });
  }
  writeRow_(sheet, sheet.getLastRow() + 1, permit.value);
  return done_(sheet, {});
}

function handleUpdate_(sheet, raw) {
  var permit = validatePermit_(raw);
  if (permit.error) return fail_('bad_request', permit.error);

  var row = findRowById_(sheet, permit.value.id);
  if (row < 0) return fail_('not_found', 'ไม่พบรายการที่ต้องการแก้ไข (อาจถูกลบไปแล้ว)');
  writeRow_(sheet, row, permit.value);
  return done_(sheet, {});
}

function handleDelete_(sheet, id) {
  var targetId = String(id || '').trim();
  if (!targetId) return fail_('bad_request', 'ไม่ได้ระบุรหัสอ้างอิงของรายการที่จะลบ');

  // ลบเฉพาะแถวที่ id ตรงกันเท่านั้น (ไม่ลบตามทะเบียน)
  var deleted = 0;
  var ids = readColumnA_(sheet);
  for (var i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i]).trim() === targetId) {
      sheet.deleteRow(i + 2);
      deleted++;
    }
  }
  return done_(sheet, { deleted: deleted });
}

/** นำเข้าข้อมูล: เพิ่มเฉพาะ id ที่ยังไม่มีในชีต ไม่เขียนทับของเดิม */
function handleImport_(sheet, permits) {
  if (!Array.isArray(permits)) return fail_('bad_request', 'รูปแบบข้อมูลไม่ถูกต้อง');

  var existing = {};
  readColumnA_(sheet).forEach(function (id) {
    existing[String(id).trim()] = true;
  });

  var added = 0;
  var skipped = 0;
  permits.forEach(function (raw) {
    var permit = validatePermit_(raw);
    if (permit.error || existing[permit.value.id]) {
      skipped++;
      return;
    }
    writeRow_(sheet, sheet.getLastRow() + 1, permit.value);
    existing[permit.value.id] = true;
    added++;
  });
  return done_(sheet, { added: added, skipped: skipped });
}

/** จบการเขียน: อ่านรายการล่าสุด เก็บแคช แล้วส่งกลับพร้อมผลลัพธ์ */
function done_(sheet, extra) {
  var list = readAllPermits_(sheet);
  var json = JSON.stringify(list);
  clearListCache_();
  putCachedListJson_(json);

  var response = { status: 'success', data: list };
  for (var key in extra) {
    if (extra.hasOwnProperty(key)) response[key] = extra[key];
  }
  return json_(response);
}

// ---------------------------------------------------------------
// List cache (อ่านจากชีตทั้งแผ่นช้า จึงเก็บผลไว้ชั่วคราว และล้างทุกครั้งที่มีการเขียน)
// ---------------------------------------------------------------

function getCachedListJson_() {
  var cache = CacheService.getScriptCache();
  var count = cache.get('list:n');
  if (count === null) return null;
  var parts = [];
  for (var i = 0; i < Number(count); i++) {
    var part = cache.get('list:' + i);
    if (part === null) return null;
    parts.push(part);
  }
  return parts.join('');
}

function putCachedListJson_(json) {
  var items = {};
  var count = Math.max(1, Math.ceil(json.length / CACHE_CHUNK_CHARS));
  for (var i = 0; i < count; i++) {
    items['list:' + i] = json.substring(i * CACHE_CHUNK_CHARS, (i + 1) * CACHE_CHUNK_CHARS);
  }
  items['list:n'] = String(count);
  try {
    CacheService.getScriptCache().putAll(items, LIST_CACHE_TTL_SECONDS);
  } catch (err) {
    // แคชเต็มหรือใช้ไม่ได้: ข้ามไป รอบหน้าอ่านจากชีตตามปกติ
  }
}

function clearListCache_() {
  var cache = CacheService.getScriptCache();
  var count = Number(cache.get('list:n') || 0);
  for (var i = 0; i < count; i++) cache.remove('list:' + i);
  cache.remove('list:n');
}

// ---------------------------------------------------------------
// Validation
// ---------------------------------------------------------------

function validatePermit_(raw) {
  if (!raw || typeof raw !== 'object') return { error: 'ไม่พบข้อมูลรายการ' };

  var p = {
    id: clean_(raw.id, 60),
    createdAt: clean_(raw.createdAt, 40) || new Date().toISOString(),
    licensePlate: clean_(raw.licensePlate, 20).replace(/\s+/g, ''),
    province: clean_(raw.province, 60),
    parkingFloor: raw.parkingFloor === 'B2' ? 'B2' : raw.parkingFloor === 'B1' ? 'B1' : '',
    vehicleBrand: clean_(raw.vehicleBrand, 60),
    vehicleColor: clean_(raw.vehicleColor, 40),
    department: clean_(raw.department, 100),
    subDepartment: clean_(raw.subDepartment, 100),
    startDate: clean_(raw.startDate, 10),
    endDate: clean_(raw.endDate, 10)
  };

  if (!p.id) return { error: 'ไม่มีรหัสอ้างอิง' };
  if (!p.licensePlate) return { error: 'กรุณาระบุหมายเลขทะเบียน' };
  if (!p.parkingFloor) return { error: 'ชั้นที่ขอจอดต้องเป็น B1 หรือ B2' };
  if (!isIsoDate_(p.startDate) || !isIsoDate_(p.endDate)) return { error: 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD' };
  if (p.endDate < p.startDate) return { error: 'วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มจอด' };
  return { value: p };
}

function clean_(value, maxLength) {
  if (value === undefined || value === null) return '';
  return String(value).trim().substring(0, maxLength);
}

function isIsoDate_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var parts = s.split('-');
  var d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
  return d.getUTCFullYear() === Number(parts[0]) &&
    d.getUTCMonth() === Number(parts[1]) - 1 &&
    d.getUTCDate() === Number(parts[2]);
}

// ---------------------------------------------------------------
// Sheet access
// ---------------------------------------------------------------

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  var firstCell = sheet.getRange(1, 1, 1, 1).getValues()[0][0];
  if (firstCell !== HEADERS[0]) {
    var headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setValues([HEADERS]);
    headerRange.setBackground('#1e293b');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
    headerRange.setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function readColumnA_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, 1).getValues().map(function (r) {
    return r[0];
  });
}

/** คืนเลขแถว (เริ่มที่ 2) หรือ -1 ถ้าไม่พบ */
function findRowById_(sheet, id) {
  var ids = readColumnA_(sheet);
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i]).trim() === id) return i + 2;
  }
  return -1;
}

function writeRow_(sheet, rowNumber, p) {
  var range = sheet.getRange(rowNumber, 1, 1, HEADERS.length);
  // บังคับเป็นข้อความล้วน ไม่ให้ชีตแปลงวันที่/ตัวเลขทะเบียน และไม่ตีความเป็นสูตร
  range.setNumberFormat('@');
  range.setValues([[
    p.id,
    p.licensePlate,
    p.province || '-',
    p.parkingFloor,
    p.vehicleBrand || '-',
    p.vehicleColor || '-',
    p.department || '-',
    p.subDepartment || '-',
    formatDmy_(p.startDate),
    formatDmy_(p.endDate),
    formatCreatedAt_(p.createdAt)
  ]]);
}

/** 'YYYY-MM-DD' -> 'dd/mm/yyyy' */
function formatDmy_(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  return m ? m[3] + '/' + m[2] + '/' + m[1] : String(iso);
}

/** เวลาที่บันทึก (ISO) -> 'dd/mm/yyyy 15.00 น.' เวลาไทย 24 ชั่วโมง */
function formatCreatedAt_(isoDateTime) {
  var d = new Date(isoDateTime);
  if (isNaN(d.getTime())) return String(isoDateTime);
  return Utilities.formatDate(d, TIMEZONE, 'dd/MM/yyyy HH.mm') + ' น.';
}

/**
 * แปลงแถวเดิม (วันที่เป็น YYYY-MM-DD / เวลาเป็น ISO) ให้เป็นรูปแบบใหม่ ทำครั้งเดียว
 * ต้องเรียกขณะถือล็อกอยู่แล้ว (หรือผ่าน formatSheetDates)
 */
function migrateDateFormats_(sheet) {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('DATE_FORMAT_VERSION') === DATE_FORMAT_VERSION) return;

  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var range = sheet.getRange(2, 9, lastRow - 1, 3); // คอลัมน์ I:K
    var rows = range.getValues().map(function (r) {
      var start = toIsoDate_(r[0]);
      var end = toIsoDate_(r[1]) || start;
      return [
        start ? formatDmy_(start) : String(r[0] || ''),
        end ? formatDmy_(end) : String(r[1] || ''),
        r[2] ? formatCreatedAt_(toIsoDateTime_(r[2])) : ''
      ];
    });
    range.setNumberFormat('@');
    range.setValues(rows);
  }
  props.setProperty('DATE_FORMAT_VERSION', DATE_FORMAT_VERSION);
  clearListCache_();
}

/** รันเองจากตัวแก้ไข Apps Script เพื่อแปลงแถวเดิมทันที (ไม่ต้องรอการบันทึกครั้งถัดไป) */
function formatSheetDates() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    migrateDateFormats_(getSheet_());
  } finally {
    lock.releaseLock();
  }
}

function readAllPermits_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  var list = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (!row[0] && !row[1]) continue; // แถวว่าง
    var startDate = toIsoDate_(row[8]);
    var endDate = toIsoDate_(row[9]) || startDate;
    if (!startDate) continue; // ไม่มีวันที่ใช้งานไม่ได้

    list.push({
      id: String(row[0] || 'PK-ROW-' + (i + 2)),
      licensePlate: String(row[1] || '').replace(/\s+/g, ''),
      province: row[2] && row[2] !== '-' ? String(row[2]) : '',
      parkingFloor: String(row[3]).indexOf('2') !== -1 ? 'B2' : 'B1',
      vehicleBrand: row[4] && row[4] !== '-' ? String(row[4]) : '',
      vehicleColor: row[5] && row[5] !== '-' ? String(row[5]) : '',
      department: row[6] && row[6] !== '-' ? String(row[6]) : '',
      subDepartment: row[7] && row[7] !== '-' ? String(row[7]) : '',
      startDate: startDate,
      endDate: endDate,
      createdAt: toIsoDateTime_(row[10])
    });
  }
  return list;
}

/** แปลงค่าในเซลล์วันที่เป็น YYYY-MM-DD (รองรับข้อมูลเก่าที่ชีตแปลงเป็นวันที่ หรือเป็น dd/mm/yyyy แบบ พ.ศ.) */
function toIsoDate_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return fixBuddhistYear_(Utilities.formatDate(value, TIMEZONE, 'yyyy-MM-dd'));
  }
  var s = String(value).trim();
  var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return fixBuddhistYear_(iso[1] + '-' + iso[2] + '-' + iso[3]);
  var dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) {
    var year = Number(dmy[3]);
    if (year > 2400) year -= 543;
    return year + '-' + pad2_(dmy[2]) + '-' + pad2_(dmy[1]);
  }
  return '';
}

/** แถวเก่าบางแถวมีปี พ.ศ. (2569-10-08): แปลงกลับเป็น ค.ศ. */
function fixBuddhistYear_(isoDate) {
  var year = Number(isoDate.substring(0, 4));
  return year > 2400 ? (year - 543) + isoDate.substring(4) : isoDate;
}

function toIsoDateTime_(value) {
  if (!value) return new Date().toISOString();
  if (Object.prototype.toString.call(value) === '[object Date]') {
    var fixed = new Date(value.getTime());
    if (fixed.getUTCFullYear() > 2400) fixed.setUTCFullYear(fixed.getUTCFullYear() - 543);
    return fixed.toISOString();
  }
  var s = String(value).trim();

  // 'dd/mm/yyyy 15.00 น.' (รูปแบบปัจจุบัน) หรือ '8/10/2569 14:00:00' (แถวเก่า) เวลาไทย
  var th = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T]+(\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?/);
  if (th) {
    var year = Number(th[3]);
    if (year > 2400) year -= 543;
    var utc = Date.UTC(year, Number(th[2]) - 1, Number(th[1]), Number(th[4]) - BANGKOK_OFFSET_HOURS, Number(th[5]), Number(th[6] || 0));
    return new Date(utc).toISOString();
  }

  var d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toISOString();
}

function pad2_(n) {
  n = String(n);
  return n.length < 2 ? '0' + n : n;
}

// ---------------------------------------------------------------
// Responses
// ---------------------------------------------------------------

function text_(str) {
  return ContentService.createTextOutput(str).setMimeType(ContentService.MimeType.JSON);
}

function json_(obj) {
  return text_(JSON.stringify(obj));
}

function fail_(code, message) {
  return json_({ status: 'error', code: code, message: message });
}
