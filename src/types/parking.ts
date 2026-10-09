export type ParkingFloor = 'B1' | 'B2' | ''; // '' = ไม่ระบุชั้น

export interface ParkingPermit {
  id: string; // e.g. PK-20261006-001
  createdAt: string; // ISO string
  licensePlate: string; // หมายเลขทะเบียนรถ (เขียนติดกัน ไม่มีช่องว่าง เช่น 1กข4590, ดด111)
  province: string; // จังหวัด (เช่น กรุงเทพมหานคร, นนทบุรี, ปทุมธานี)
  vehicleBrand: string; // ยี่ห้อรถ
  vehicleColor: string; // สีรถ
  parkingFloor: ParkingFloor; // ชั้นที่ขอจอด: B1, B2 หรือว่าง (ไม่ระบุ)
  department?: string; // หน่วยงาน (ถ้ามี)
  subDepartment?: string; // หน่วยงานย่อย (ไม่บังคับ)
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD (นับวันสิ้นสุดด้วย)
}

export interface DayParkingSummary {
  date: string; // YYYY-MM-DD
  formattedDate: string; // e.g. 5 ต.ค. 2569
  dayName: string; // e.g. วันจันทร์
  totalPermitted: number; // cars staying overnight on this date
  b1Count: number; // cars on floor B1
  b2Count: number; // cars on floor B2
  vehicles: ParkingPermit[];
}
