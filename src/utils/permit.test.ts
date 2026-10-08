import { describe, it, expect } from 'vitest';
import { findOverlappingPermits, generatePermitId, normalizePermit } from './permit';
import { ParkingPermit } from '../types/parking';

const base: ParkingPermit = {
  id: 'PK-1',
  createdAt: '2026-10-06T03:00:00.000Z',
  licensePlate: '1กข4590',
  province: 'กรุงเทพมหานคร',
  vehicleBrand: 'Toyota',
  vehicleColor: 'ขาว',
  parkingFloor: 'B1',
  startDate: '2026-10-06',
  endDate: '2026-10-08',
};

describe('normalizePermit', () => {
  it('removes all spaces from the plate', () => {
    expect(normalizePermit({ ...base, licensePlate: ' 1กข 4590 ' }).licensePlate).toBe('1กข4590');
  });

  it('splits the province off the plate when it was written together', () => {
    const p = normalizePermit({ ...base, licensePlate: '1กข4590 นนทบุรี', province: '' });
    expect(p).toMatchObject({ licensePlate: '1กข4590', province: 'นนทบุรี' });
  });

  it('understands Bangkok shorthand and defaults to Bangkok', () => {
    expect(normalizePermit({ ...base, licensePlate: 'ดด111 กทม.', province: '' })).toMatchObject({
      licensePlate: 'ดด111',
      province: 'กรุงเทพมหานคร',
    });
    expect(normalizePermit({ ...base, province: undefined }).province).toBe('กรุงเทพมหานคร');
  });

  it.each([
    ['B2', 'B2'],
    ['ชั้น B2', 'B2'],
    ['b2', 'B2'],
    ['2', 'B2'],
    ['B1', 'B1'],
    ['ชั้น B1', 'B1'],
    ['', 'B1'],
    ['B12', 'B1'], // a "2" somewhere inside must not flip it to B2
  ])('floor %j -> %s', (input, expected) => {
    expect(normalizePermit({ ...base, parkingFloor: input }).parkingFloor).toBe(expected);
  });

  it('repairs dates: B.E. years, time suffixes and reversed ranges', () => {
    expect(normalizePermit({ ...base, startDate: '2569-10-06', endDate: '2026-10-08T00:00:00Z' })).toMatchObject({
      startDate: '2026-10-06',
      endDate: '2026-10-08',
    });
    expect(normalizePermit({ ...base, startDate: '2026-10-08', endDate: '2026-10-06' }).endDate).toBe('2026-10-08');
    expect(normalizePermit({ ...base, endDate: undefined }).endDate).toBe('2026-10-06');
  });

  it('turns blank optional fields into undefined and keeps valid values', () => {
    const p = normalizePermit({ ...base, department: '  ', subDepartment: 'กองกลาง' });
    expect(p.department).toBeUndefined();
    expect(p.subDepartment).toBe('กองกลาง');
  });

  it('converts a Buddhist-era year in createdAt back to the Gregorian year', () => {
    expect(normalizePermit({ ...base, createdAt: '2569-10-08T10:53:31.000Z' }).createdAt).toBe('2026-10-08T10:53:31.000Z');
    expect(normalizePermit({ ...base, createdAt: '2026-10-08T10:53:31.000Z' }).createdAt).toBe('2026-10-08T10:53:31.000Z');
  });

  it('replaces an unparseable createdAt', () => {
    const p = normalizePermit({ ...base, createdAt: '8/10/2569 14:00:00' });
    expect(Number.isNaN(Date.parse(p.createdAt))).toBe(false);
  });
});

describe('generatePermitId', () => {
  it('has the date in it and does not repeat', () => {
    const ids = new Set(Array.from({ length: 2000 }, () => generatePermitId('2026-10-06')));
    expect(ids.size).toBe(2000);
    expect([...ids][0]).toMatch(/^PK-20261006-[0-9A-Z]{6}$/);
  });
});

describe('findOverlappingPermits', () => {
  const others: ParkingPermit[] = [
    { ...base, id: 'A', startDate: '2026-10-08', endDate: '2026-10-10' }, // touches the end
    { ...base, id: 'B', startDate: '2026-10-20', endDate: '2026-10-21' }, // other dates
    { ...base, id: 'C', licensePlate: '2ขค1111' }, // other car
    { ...base, id: 'D', province: 'นนทบุรี' }, // same letters, other province
  ];

  it('finds the same plate and province with a shared night', () => {
    const clashes = findOverlappingPermits(base, others);
    expect(clashes.map((p) => p.id)).toEqual(['A']);
  });

  it('ignores the permit being edited and compares plates without spaces or case', () => {
    expect(findOverlappingPermits(base, [{ ...base }])).toEqual([]);
    expect(
      findOverlappingPermits({ ...base, id: 'NEW', licensePlate: '1 กข 4590' }, [base]).map((p) => p.id)
    ).toEqual(['PK-1']);
  });
});
