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
 *  5. คัดลอก "URL เว็บแอป" ไปวางในหน้า "ตั้งค่า" ของแอป
 *  6. ล็อกอินครั้งแรกด้วยรหัสเริ่มต้น แล้วแอปจะบังคับให้เปลี่ยนรหัสทันที
 *
 * ถ้าแก้โค้ดภายหลัง ต้องสร้าง "การทำให้ใช้งานได้รายการใหม่" (หรือแก้ deployment เดิมเป็นเวอร์ชันใหม่) ทุกครั้ง
 *
 * ความปลอดภัย
 *  - การอ่านรายการ (doGet) เปิดให้ทุกคนที่มี URL อ่านได้ เพื่อให้ รปภ. ดูได้โดยไม่ต้องล็อกอิน
 *  - การเพิ่ม / แก้ไข / ลบ / เปลี่ยนรหัสผ่าน ต้องมี token ที่ได้จากการล็อกอินเท่านั้น
 *  - รหัสผ่านเก็บเป็น hash (SHA-256 + salt) ใน Script Properties ไม่เก็บเป็นข้อความ
 *  - ล็อกอินผิดเกิน 5 ครั้งจะถูกล็อกชั่วคราว 5 นาที
 *  - ถ้าลืมรหัสผ่าน: เปิดตัวแก้ไข Apps Script แล้วเลือกรันฟังก์ชัน resetPassword()
 */

var SHEET_NAME = 'รายการขอจอดรถ';
var TIMEZONE = 'Asia/Bangkok';
var DEFAULT_PASSWORD = '1234'; // ใช้ได้ก่อนมีการตั้งรหัสใหม่เท่านั้น
var MIN_PASSWORD_LENGTH = 6;
var TOKEN_TTL_SECONDS = 6 * 60 * 60; // CacheService เก็บได้สูงสุด 6 ชั่วโมง
var MAX_FAILED_LOGINS = 5;
var LOCKOUT_SECONDS = 5 * 60;
var HASH_ROUNDS = 1000;

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

// ---------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || 'list';
    if (action === 'list') {
      return json_({ status: 'success', data: readAllPermits_(getSheet_()) });
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
  var lock = LockService.getScriptLock();
  var locked = false;
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var action = body.action;

    // action ที่ไม่ต้องมี token
    if (action === 'ping') {
      return json_({ status: 'success', message: 'เชื่อมต่อสำเร็จ' });
    }

    lock.waitLock(20000);
    locked = true;

    if (action === 'login') {
      return handleLogin_(body);
    }

    // ทุก action ต่อจากนี้ต้องล็อกอินแล้ว
    if (!isValidToken_(body.token)) {
      return fail_('unauthorized', 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
    }

    if (action === 'logout') {
      CacheService.getScriptCache().remove('tok:' + body.token);
      return json_({ status: 'success' });
    }
    if (action === 'changePassword') {
      return handleChangePassword_(body);
    }

    var sheet = getSheet_();
    if (action === 'add') {
      return handleAdd_(sheet, body.permit);
    }
    if (action === 'update') {
      return handleUpdate_(sheet, body.permit);
    }
    if (action === 'delete') {
      return handleDelete_(sheet, body.id);
    }
    if (action === 'import') {
      return handleImport_(sheet, body.permits);
    }
    return fail_('bad_request', 'ไม่รู้จัก action: ' + action);
  } catch (err) {
    return fail_('server_error', String(err));
  } finally {
    if (locked) lock.releaseLock();
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

  var password = String(body.password || '');
  if (!verifyPassword_(password)) {
    cache.put('login_failed', String(failed + 1), LOCKOUT_SECONDS);
    return fail_('invalid_password', 'รหัสผ่านไม่ถูกต้อง');
  }

  cache.remove('login_failed');
  return json_({
    status: 'success',
    token: issueToken_(),
    mustChange: !hasCustomPassword_()
  });
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
  props.setProperty('PW_SALT', salt);
  props.setProperty('PW_HASH', hashPassword_(newPassword, salt));
  // เพิ่มเลขเวอร์ชัน ทำให้ token เดิมทุกเครื่องใช้ไม่ได้อีก
  props.setProperty('PW_VERSION', String(Number(props.getProperty('PW_VERSION') || 0) + 1));

  return json_({ status: 'success', token: issueToken_(), message: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว' });
}

function hasCustomPassword_() {
  return !!PropertiesService.getScriptProperties().getProperty('PW_HASH');
}

function verifyPassword_(password) {
  var props = PropertiesService.getScriptProperties();
  var storedHash = props.getProperty('PW_HASH');
  if (!storedHash) {
    return password === DEFAULT_PASSWORD;
  }
  return hashPassword_(password, props.getProperty('PW_SALT') || '') === storedHash;
}

function hashPassword_(password, salt) {
  var h = sha256Hex_(salt + ':' + password);
  for (var i = 0; i < HASH_ROUNDS; i++) {
    h = sha256Hex_(h + ':' + salt + ':' + password);
  }
  return h;
}

function sha256Hex_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    hex += (b < 16 ? '0' : '') + b.toString(16);
  }
  return hex;
}

function issueToken_() {
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('tok:' + token, currentPasswordVersion_(), TOKEN_TTL_SECONDS);
  return token;
}

function isValidToken_(token) {
  if (!token || typeof token !== 'string') return false;
  var stored = CacheService.getScriptCache().get('tok:' + token);
  return stored !== null && stored === currentPasswordVersion_();
}

function currentPasswordVersion_() {
  return PropertiesService.getScriptProperties().getProperty('PW_VERSION') || '0';
}

/** รันเองจากตัวแก้ไข Apps Script เมื่อลืมรหัสผ่าน */
function resetPassword() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('PW_HASH');
  props.deleteProperty('PW_SALT');
  props.setProperty('PW_VERSION', String(Number(props.getProperty('PW_VERSION') || 0) + 1));
  CacheService.getScriptCache().remove('login_failed');
}

// ---------------------------------------------------------------
// Data handlers
// ---------------------------------------------------------------

function handleAdd_(sheet, raw) {
  var permit = validatePermit_(raw);
  if (permit.error) return fail_('bad_request', permit.error);

  // เพิ่มซ้ำด้วย id เดิม (เช่น ลองส่งใหม่หลังเน็ตหลุด) ให้ถือว่าสำเร็จ ไม่เพิ่มแถวซ้ำ
  if (findRowById_(sheet, permit.value.id) > 0) {
    return json_({ status: 'success', duplicate: true });
  }
  writeRow_(sheet, sheet.getLastRow() + 1, permit.value);
  return json_({ status: 'success' });
}

function handleUpdate_(sheet, raw) {
  var permit = validatePermit_(raw);
  if (permit.error) return fail_('bad_request', permit.error);

  var row = findRowById_(sheet, permit.value.id);
  if (row < 0) return fail_('not_found', 'ไม่พบรายการที่ต้องการแก้ไข (อาจถูกลบไปแล้ว)');
  writeRow_(sheet, row, permit.value);
  return json_({ status: 'success' });
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
  return json_({ status: 'success', deleted: deleted });
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
  return json_({ status: 'success', added: added, skipped: skipped });
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
    province: clean_(raw.province, 60) || 'กรุงเทพมหานคร',
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
  if (!p.vehicleBrand) return { error: 'กรุณาระบุยี่ห้อรถ' };
  if (!p.vehicleColor) return { error: 'กรุณาระบุสีรถ' };
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
    p.province,
    p.parkingFloor,
    p.vehicleBrand,
    p.vehicleColor,
    p.department || '-',
    p.subDepartment || '-',
    p.startDate,
    p.endDate,
    p.createdAt
  ]]);
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
      province: String(row[2] || 'กรุงเทพมหานคร'),
      parkingFloor: String(row[3]).indexOf('2') !== -1 ? 'B2' : 'B1',
      vehicleBrand: String(row[4] || ''),
      vehicleColor: String(row[5] || ''),
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
    return Utilities.formatDate(value, TIMEZONE, 'yyyy-MM-dd');
  }
  var s = String(value).trim();
  var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
  var dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) {
    var year = Number(dmy[3]);
    if (year > 2400) year -= 543;
    return year + '-' + pad2_(dmy[2]) + '-' + pad2_(dmy[1]);
  }
  return '';
}

function toIsoDateTime_(value) {
  if (!value) return new Date().toISOString();
  if (Object.prototype.toString.call(value) === '[object Date]') return value.toISOString();
  var s = String(value).trim();
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

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function fail_(code, message) {
  return json_({ status: 'error', code: code, message: message });
}
