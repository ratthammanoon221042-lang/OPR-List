import { describe, it, expect } from 'vitest';
import { ParkingPermit } from '../types/parking';
import {
  buildPermits,
  draftFromExtraction,
  findBatchClashes,
  isRowComplete,
  isRowEmpty,
  missingFields,
  newRow,
  normalizeBrand,
  normalizeColor,
  splitColorFromText,
  normalizeDepartment,
  normalizeProvince,
} from './batchRows';

const common = { department: 'สกมช.', subDepartment: '', startDate: '2026-10-09', endDate: '2026-10-10' };
const car = (over = {}) => newRow({ brand: 'Toyota', color: 'ขาว', plate: '1กก1234', province: 'กรุงเทพมหานคร', ...over });

const saved = (over: Partial<ParkingPermit> = {}): ParkingPermit => ({
  id: 'PK-OLD',
  createdAt: '2026-10-01T00:00:00.000Z',
  licensePlate: '1กก1234',
  province: 'กรุงเทพมหานคร',
  vehicleBrand: 'Toyota',
  vehicleColor: 'ขาว',
  parkingFloor: 'B1',
  startDate: '2026-10-10',
  endDate: '2026-10-11',
  ...over,
});

describe('rows', () => {
  it('a row nobody typed into is empty (the default floor does not count) and is skipped', () => {
    expect(isRowEmpty(newRow())).toBe(true);
    expect(isRowEmpty(newRow({ plate: '1กก1234' }))).toBe(false);
    expect(buildPermits([newRow(), car()], common)).toHaveLength(1);
  });

  it('lists what is missing in a started row', () => {
    const r = newRow({ plate: '1กก1234' });
    expect(missingFields(r)).toEqual([]); // brand, colour and province are optional
    expect(isRowComplete(r)).toBe(true);
    expect(isRowComplete(newRow({ plate: '1กก1234', province: 'ไม่ใช่จังหวัด' }))).toBe(false);
    expect(isRowComplete(car())).toBe(true);
    expect(isRowComplete(car({ color: '' }))).toBe(true);
    expect(isRowComplete(car({ brand: '', color: '' }))).toBe(true);
    expect(missingFields(newRow({ plate: '   ' }))).toContain('plate');
  });
});

describe('typed provinces', () => {
  it('a short or prefixed name counts as the province; text that is no province counts as missing', () => {
    expect(missingFields(car({ province: 'กทม.' }))).toEqual([]);
    expect(missingFields(car({ province: 'จ.นนทบุรี' }))).toEqual([]);
    expect(missingFields(car({ province: 'นนท' }))).toEqual(['province']);
    expect(isRowComplete(car({ province: 'ไม่ใช่จังหวัด' }))).toBe(false);
    const [p] = buildPermits([car({ province: 'กทม.' })], common);
    expect(p.province).toBe('กรุงเทพมหานคร');
  });

  it('clashes compare the full province name, however it was typed', () => {
    const row = car({ province: 'กทม.' });
    const clashes = findBatchClashes([row], { startDate: '2026-10-09', endDate: '2026-10-10' }, [saved()]);
    expect(clashes.get(row.key)?.existing).toHaveLength(1);
  });
});

describe('buildPermits without a colour', () => {
  it('saves a car with no colour as an empty colour', () => {
    const [p] = buildPermits([car({ color: '' })], common);
    expect(p.vehicleColor).toBe('');
  });
});

describe('buildPermits', () => {
  it('gives every car its own permit with the shared department and dates, a clean plate and a unique id', () => {
    const permits = buildPermits(
      [car({ plate: '1กก 1234' }), car({ plate: '2ขข5678', floor: 'B2', brand: ' Honda ' })],
      { ...common, subDepartment: ' กองกลาง ' },
      new Date('2026-10-09T03:00:00Z')
    );
    expect(permits).toHaveLength(2);
    expect(permits[0]).toMatchObject({
      licensePlate: '1กก1234',
      department: 'สกมช.',
      subDepartment: 'กองกลาง',
      startDate: '2026-10-09',
      endDate: '2026-10-10',
      parkingFloor: 'B1',
      createdAt: '2026-10-09T03:00:00.000Z',
    });
    expect(permits[1]).toMatchObject({ vehicleBrand: 'Honda', parkingFloor: 'B2' });
    expect(permits[0].id).not.toBe(permits[1].id);
    expect(permits[0].id).toMatch(/^PK-20261009-/);
  });

  it('leaves the department out when empty, and uses a car\'s own dates when it has them', () => {
    const [p] = buildPermits([car({ startDate: '2026-11-01', endDate: '2026-11-03' })], { ...common, department: '' });
    expect(p.department).toBeUndefined();
    expect(p).toMatchObject({ startDate: '2026-11-01', endDate: '2026-11-03' });
  });
});

describe('findBatchClashes', () => {
  const range = { startDate: '2026-10-09', endDate: '2026-10-10' };

  it('flags a car already requested for an overlapping night', () => {
    const row = car();
    const clashes = findBatchClashes([row], range, [saved()]);
    expect(clashes.get(row.key)?.existing).toHaveLength(1);
  });

  it('ignores other plates, other provinces and non-overlapping dates', () => {
    const row = car();
    expect(findBatchClashes([row], range, [saved({ licensePlate: '9ซซ9999' })]).size).toBe(0);
    expect(findBatchClashes([row], range, [saved({ province: 'นนทบุรี' })]).size).toBe(0);
    expect(findBatchClashes([row], range, [saved({ startDate: '2026-10-11', endDate: '2026-10-12' })]).size).toBe(0);
  });

  it('flags the same plate twice in one batch', () => {
    const a = car();
    const b = car({ plate: '1กก 1234' });
    const clashes = findBatchClashes([a, b], range, []);
    expect(clashes.get(a.key)?.inBatch).toBe(true);
    expect(clashes.get(b.key)?.inBatch).toBe(true);
  });

  it('the same plate on different dates in one batch is fine', () => {
    const a = car();
    const b = car({ startDate: '2026-10-20', endDate: '2026-10-21' });
    expect(findBatchClashes([a, b], range, []).size).toBe(0);
  });

  it('skips incomplete rows and invalid date ranges', () => {
    expect(findBatchClashes([newRow({ province: 'กรุงเทพมหานคร' })], range, [saved()]).size).toBe(0); // no plate yet
    expect(findBatchClashes([car()], { startDate: '2026-10-10', endDate: '2026-10-09' }, [saved()]).size).toBe(0);
  });
});

describe('matching what the reader found to the form lists', () => {
  it('provinces: short forms and prefixes become the full name; unknown names stay unmatched', () => {
    expect(normalizeProvince('กทม.')).toBe('กรุงเทพมหานคร');
    expect(normalizeProvince('กรุงเทพฯ')).toBe('กรุงเทพมหานคร');
    expect(normalizeProvince('จ.นนทบุรี')).toBe('นนทบุรี');
    expect(normalizeProvince('จังหวัด ปทุมธานี')).toBe('ปทุมธานี');
    expect(normalizeProvince('เมืองลับแล')).toBe('');
    expect(normalizeProvince('')).toBe('');
  });

  it('colours lose the word "สี"; brands ignore case', () => {
    expect(normalizeColor('สีขาว')).toBe('ขาว');
    expect(normalizeColor('สี ดำ')).toBe('ดำ');
    expect(normalizeColor('ฟ้าอ่อน')).toBe('ฟ้าอ่อน');
  });

  it('departments in the list are chosen, other names are kept as typed', () => {
    expect(normalizeDepartment('สกมช.')).toEqual({ select: 'สกมช.', custom: '' });
    expect(normalizeDepartment('กองกลาง สป.ดศ.')).toEqual({ select: 'อื่นๆ', custom: 'กองกลาง สป.ดศ.' });
    expect(normalizeDepartment('')).toEqual({ select: '', custom: '' });
  });
});

describe('draftFromExtraction', () => {
  const doc = {
    department: 'สกมช.',
    startDate: '2026-10-09',
    endDate: '2026-10-10',
    vehicles: [
      { kind: 'car' as const, brand: 'toyota', color: 'สีขาว', plate: '1กก 1234', province: 'กทม.', floor: 'B2' },
      { kind: 'motorcycle' as const, brand: 'Honda', color: 'แดง', plate: '1กพ234', province: 'กรุงเทพมหานคร', note: 'เขียนว่ามอเตอร์ไซค์' },
      { kind: 'unknown' as const, brand: 'Nissan', color: 'เทา', plate: '5จจ7890', province: 'นนทบุรี', uncertain: ['plate'] },
    ],
  };

  it('only cars become rows; motorcycles are listed as skipped; unsure types stay but flagged', () => {
    const draft = draftFromExtraction(doc, '2026-10-01');
    expect(draft.rows).toHaveLength(2);
    expect(draft.skipped).toHaveLength(1);
    expect(draft.skipped[0].text).toContain('Honda');
    expect(draft.skipped[0].reason).toContain('มอเตอร์ไซค์');
    expect(draft.rows[0]).toMatchObject({ brand: 'Toyota', color: 'ขาว', plate: '1กก1234', province: 'กรุงเทพมหานคร', floor: 'B2' });
    expect(draft.rows[0].flags).toEqual([]);
    expect(draft.rows[1].flags).toEqual(expect.arrayContaining(['type', 'plate', 'floor']));
  });

  it('takes department and dates from the document', () => {
    const draft = draftFromExtraction(doc, '2026-10-01');
    expect(draft.common).toMatchObject({ department: 'สกมช.', startDate: '2026-10-09', endDate: '2026-10-10' });
    expect(draft.datesAssumed).toBe(false);
  });

  it('uses the selected date for one night when the document gives no dates', () => {
    const draft = draftFromExtraction({ vehicles: doc.vehicles }, '2026-10-01');
    expect(draft.common).toMatchObject({ startDate: '2026-10-01', endDate: '2026-10-01' });
    expect(draft.datesAssumed).toBe(true);
  });

  it('flags a province or brand it cannot match, and an unlisted colour', () => {
    const draft = draftFromExtraction(
      { vehicles: [{ kind: 'car', brand: 'Wuling', color: 'ฟ้าอ่อน', plate: '3คค9012', province: 'เมืองลับแล', floor: 'B1' }] },
      '2026-10-01'
    );
    expect(draft.rows[0].province).toBe('');
    expect(draft.rows[0].flags).toEqual(expect.arrayContaining(['brand', 'color', 'province']));
  });

  it('cars on other dates keep their own dates; the most common range is shared', () => {
    const draft = draftFromExtraction(
      {
        vehicles: [
          { kind: 'car', brand: 'Toyota', color: 'ขาว', plate: '1กก1111', province: 'กทม.', floor: 'B1', startDate: '2026-10-09', endDate: '2026-10-10' },
          { kind: 'car', brand: 'Honda', color: 'ดำ', plate: '2ขข2222', province: 'กทม.', floor: 'B1', startDate: '2026-10-09', endDate: '2026-10-10' },
          { kind: 'car', brand: 'Isuzu', color: 'เทา', plate: '3คค3333', province: 'กทม.', floor: 'B1', startDate: '2026-10-12', endDate: '2026-10-12' },
        ],
      },
      '2026-10-01'
    );
    expect(draft.common).toMatchObject({ startDate: '2026-10-09', endDate: '2026-10-10' });
    expect(draft.rows[0].startDate).toBeUndefined();
    expect(draft.rows[2]).toMatchObject({ startDate: '2026-10-12', endDate: '2026-10-12' });
    const permits = buildPermits(draft.rows, draft.common);
    expect(permits[2]).toMatchObject({ startDate: '2026-10-12', endDate: '2026-10-12' });
  });

  it('converts a Buddhist-era year that slipped through, and an end before the start becomes one night', () => {
    const draft = draftFromExtraction(
      { startDate: '2569-10-09', endDate: '2569-10-08', vehicles: [{ kind: 'car', brand: 'Kia', color: 'ดำ', plate: '1กก1', province: 'กทม.', floor: 'B1' }] },
      '2026-10-01'
    );
    expect(draft.common.startDate).toBe('2026-10-09');
    expect(draft.common.endDate).toBe('2026-10-09');
  });

  it('only motorcycles: nothing to fill, but they are all listed', () => {
    const draft = draftFromExtraction({ vehicles: [{ kind: 'motorcycle', brand: 'Yamaha' }] }, '2026-10-01');
    expect(draft.rows).toHaveLength(0);
    expect(draft.skipped).toHaveLength(1);
  });

  it('an unknown department name goes to the form as plain text', () => {
    const draft = draftFromExtraction({ department: 'กองกลาง', vehicles: doc.vehicles }, '2026-10-01');
    expect(draft.common.department).toBe('กองกลาง');
  });

  it('Thai digits left in a plate become 0-9; a letter with one car in the body and a table of others both work', () => {
    const draft = draftFromExtraction(
      {
        department: 'กองการสื่อสารโทรคมนาคม',
        startDate: '2026-09-30',
        endDate: '2026-10-02',
        vehicles: [
          { kind: 'car', plate: '๙กฎ ๓๔๕๓', province: 'กรุงเทพมหานคร', floor: 'B2', uncertain: ['brand', 'color'] },
          { kind: 'car', brand: 'Mazda', color: 'เทา', plate: 'กษ๖๐๐๙', province: 'พระนครศรีอยุธยา', floor: 'B2', startDate: '2026-09-30', endDate: '2026-09-30' },
          { kind: 'car', brand: 'Isuzu', color: 'เทา', plate: 'ศฮ 9183', province: 'กทม.', floor: 'B2', startDate: '2026-09-30', endDate: '2026-09-30' },
        ],
      },
      '2026-10-09'
    );
    expect(draft.rows.map((r) => r.plate)).toEqual(['9กฎ3453', 'กษ6009', 'ศฮ9183']);
    expect(draft.rows[1].province).toBe('พระนครศรีอยุธยา');
    // the two table cars share one range (the most common); the letter's own car keeps the document range
    expect(draft.common).toMatchObject({ startDate: '2026-09-30', endDate: '2026-09-30' });
    expect(draft.rows[0]).toMatchObject({ startDate: '2026-09-30', endDate: '2026-10-02' });
    expect(draft.rows[0].flags).toEqual(expect.arrayContaining(['brand', 'color']));
    expect(isRowComplete(draft.rows[0])).toBe(true); // brand and colour are optional: the letter gives only a plate and a province
    expect(draft.common.department).toBe('กองการสื่อสารโทรคมนาคม');
  });
});

describe('reading time', () => {
  it('keeps the timing the relay reported, and ignores a missing or broken one', () => {
    const meta = { model: 'gemini-x', loginMs: 300, aiMs: 4200, totalMs: 4500 };
    expect(draftFromExtraction({ vehicles: [], meta }, '2026-10-01').meta).toEqual(meta);
    expect(draftFromExtraction({ vehicles: [] }, '2026-10-01').meta).toBeNull();
    expect(draftFromExtraction({ vehicles: [], meta: { model: 'x' } as never }, '2026-10-01').meta).toBeNull();
  });
});

describe('brand and colour written together', () => {
  it('takes the brand from a "brand/model" text, in English or Thai, in any case', () => {
    expect(normalizeBrand('Honda/City')).toBe('Honda');
    expect(normalizeBrand('honda jazz')).toBe('Honda');
    expect(normalizeBrand('Benz a200')).toBe('Benz');
    expect(normalizeBrand('Mazda2')).toBe('Mazda');
    expect(normalizeBrand('suzuki Swift')).toBe('Suzuki');
    expect(normalizeBrand('isuzu d-max')).toBe('Isuzu');
    expect(normalizeBrand('nissan/almera')).toBe('Nissan');
    expect(normalizeBrand('Land Rover Defender')).toBe('Land Rover');
    expect(normalizeBrand('โตโยต้า/ยาริส')).toBe('Toyota');
    expect(normalizeBrand('โตโยต้า/Altis')).toBe('Toyota');
    expect(normalizeBrand('Wuling Air')).toBe('Wuling Air'); // unknown brand: kept as written
    expect(normalizeBrand('')).toBe('');
  });

  it('splits a colour out of the model text', () => {
    expect(splitColorFromText('Haval สีดำ')).toEqual({ rest: 'Haval', color: 'ดำ' });
    expect(splitColorFromText('Honda Jazz (GE สีเทา)')).toEqual({ rest: 'Honda Jazz (GE)', color: 'เทา' });
    expect(splitColorFromText('Toyota Altis')).toEqual({ rest: 'Toyota Altis', color: '' });
  });
});

describe('a table with the colour inside the model text and a province sometimes missing', () => {
  const doc = {
    department: 'สป.ดศ.',
    vehicles: [
      { kind: 'car' as const, brand: 'Honda Jazz (GE สีเทา)', plate: '1กฒ9551', province: 'กทม', floor: 'B1' },
      { kind: 'car' as const, brand: 'Haval สีดำ', plate: '4ขก1340', province: 'กทม', floor: 'B1' },
      { kind: 'car' as const, brand: 'toyota/yaris', plate: 'งจ 2485', province: 'นครราชสีมา', floor: 'B1' },
      { kind: 'car' as const, brand: 'Mazda2', plate: '6ขฒ4332', floor: 'B1' },
    ],
  };

  it('splits brand and colour; a missing province stays empty (optional) and is not flagged', () => {
    const draft = draftFromExtraction(doc, '2026-10-09');
    expect(draft.common.department).toBe('สป.ดศ.');
    expect(draft.rows[0]).toMatchObject({ brand: 'Honda', color: 'เทา' });
    expect(draft.rows[1]).toMatchObject({ brand: 'Haval', color: 'ดำ' });
    expect(draft.rows[2]).toMatchObject({ brand: 'Toyota', color: '', plate: 'งจ2485', province: 'นครราชสีมา' });
    expect(draft.rows[3]).toMatchObject({ plate: '6ขฒ4332', province: '' });
    expect(draft.rows[3].flags).not.toContain('province');
    expect(draft.rows[0].flags).not.toContain('brand');
    expect(isRowComplete(draft.rows[3])).toBe(true); // only the plate is required
  });

  it('every car gets the one department of the batch', () => {
    const permits = buildPermits(draftFromExtraction(doc, '2026-10-09').rows, draftFromExtraction(doc, '2026-10-09').common);
    expect(new Set(permits.map((p) => p.department))).toEqual(new Set(['สป.ดศ.']));
  });
});
