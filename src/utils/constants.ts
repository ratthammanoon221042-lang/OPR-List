export const PARKING_FLOORS: ('B1' | 'B2')[] = ['B1', 'B2'];

// ยี่ห้อ ปรับเป็นดรอปดาวน์ รายการตามนี้
export const VEHICLE_BRANDS = [
  'Toyota',
  'Honda',
  'Isuzu',
  'BYD',
  'Mitsubishi',
  'Mazda',
  'MG',
  'NETA',
  'Benz',
  'Subaru',
  'Ford',
  'ORA',
  'Nissan',
  'Suzuki',
  'Chevrolet',
  'BMW',
  'Volvo',
  'Volkswagen',
  'Mini',
  'Hyundai',
  'Lexus',
  'Audi',
  'Porsche',
  'Land Rover',
  'Jaguar',
  'Kia',
  'Tesla',
  'AION',
  'Proton',
  'Haval',
  'Jaecoo',
  'Deepal',
  'Changan',
  'Chery',
  'Geely',
  'Xpeng',
  'อื่นๆ',
];

// สี ใช้เป็นดรอปดาวน์ ตามนี้
export const VEHICLE_COLORS = [
  'ขาว',
  'ดำ',
  'เทา',
  'บรอนซ์ทอง',
  'บรอนซ์เงิน',
  'น้ำเงิน',
  'ฟ้า',
  'แดง',
  'ส้ม',
  'เหลือง',
  'เขียว',
  'น้ำตาล',
  'ทอง',
  'ชมพู',
  'ม่วง',
  'อื่นๆ',
];

// หน่วยงาน ใช้เป็นดรอปดาวน์ ตามนี้
export const DEPARTMENTS = [
  'สร.',
  'สป.ดศ.',
  'สดช.',
  'สสช.',
  'สพธอ.',
  'สคส.',
  'สกมช.',
  'ปอท.',
  'กท.',
  'อื่นๆ',
];

// จังหวัดของไทย 77 จังหวัด (แยกตามภาคเพื่อใช้จัดกลุ่มข้อมูลเท่านั้น หน้าฟอร์มใช้ PROVINCE_OPTIONS ที่เป็นรายการเดียว)
export const CENTRAL_PROVINCES = [
  'กรุงเทพมหานคร',
  'นนทบุรี',
  'ปทุมธานี',
  'สมุทรปราการ',
  'สมุทรสาคร',
  'สมุทรสงคราม',
  'นครปฐม',
  'พระนครศรีอยุธยา',
  'สระบุรี',
  'ลพบุรี',
  'สุพรรณบุรี',
  'อ่างทอง',
  'สิงห์บุรี',
  'ชัยนาท',
  'นครนายก',
  'กาญจนบุรี',
  'ราชบุรี',
  'เพชรบุรี',
  'ประจวบคีรีขันธ์',
  'ชลบุรี',
  'ระยอง',
  'จันทบุรี',
  'ตราด',
  'ฉะเชิงเทรา',
  'ปราจีนบุรี',
  'สระแก้ว',
];

export const NORTH_PROVINCES = [
  'เชียงใหม่',
  'เชียงราย',
  'ลำปาง',
  'ลำพูน',
  'แม่ฮ่องสอน',
  'น่าน',
  'พะเยา',
  'แพร่',
  'อุตรดิตถ์',
  'ตาก',
  'สุโขทัย',
  'พิษณุโลก',
  'พิจิตร',
  'กำแพงเพชร',
  'เพชรบูรณ์',
  'นครสวรรค์',
  'อุทัยธานี',
];

export const NORTHEAST_PROVINCES = [
  'นครราชสีมา',
  'ขอนแก่น',
  'อุดรธานี',
  'อุบลราชธานี',
  'กาฬสินธุ์',
  'ชัยภูมิ',
  'นครพนม',
  'บึงกาฬ',
  'บุรีรัมย์',
  'มหาสารคาม',
  'มุกดาหาร',
  'ยโสธร',
  'ร้อยเอ็ด',
  'เลย',
  'สกลนคร',
  'สุรินทร์',
  'ศรีสะเกษ',
  'หนองคาย',
  'หนองบัวลำภู',
  'อำนาจเจริญ',
];

export const SOUTH_PROVINCES = [
  'ชุมพร',
  'ระนอง',
  'สุราษฎร์ธานี',
  'นครศรีธรรมราช',
  'กระบี่',
  'พังงา',
  'ภูเก็ต',
  'ตรัง',
  'พัทลุง',
  'สงขลา',
  'สตูล',
  'ปัตตานี',
  'ยะลา',
  'นราธิวาส',
];

export const THAI_PROVINCES = [
  ...CENTRAL_PROVINCES,
  ...NORTH_PROVINCES,
  ...NORTHEAST_PROVINCES,
  ...SOUTH_PROVINCES,
];

/**
 * Province choices in the form: one plain list (no region headings), Bangkok first and the rest
 * in Thai alphabetical order so a province is easy to find.
 */
export const PROVINCE_OPTIONS: string[] = [
  'กรุงเทพมหานคร',
  ...THAI_PROVINCES.filter((p) => p !== 'กรุงเทพมหานคร').sort((a, b) => a.localeCompare(b, 'th')),
];

// ลบข้อมูลจำลองออกทั้งหมด ใช้ข้อมูลจริงจาก Google Sheets เป็นหลัก
