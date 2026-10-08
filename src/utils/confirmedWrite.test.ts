import { describe, it, expect, vi } from 'vitest';
import { attemptWrite } from './confirmedWrite';
import { ParkingPermit } from '../types/parking';

const permit = (id: string): ParkingPermit => ({
  id,
  createdAt: '2026-10-08T00:00:00.000Z',
  licensePlate: '1กข4590',
  province: 'กรุงเทพมหานคร',
  vehicleBrand: 'Toyota',
  vehicleColor: 'ขาว',
  parkingFloor: 'B1',
  startDate: '2026-10-08',
  endDate: '2026-10-08',
});

const UNCLEAR = new Error('lost reply');
const REFUSED = new Error('script said no');
const isUnclear = (e: unknown) => e === UNCLEAR;

const base = () => {
  const added = [permit('A')];
  return {
    isUnclear,
    verify: (list: ParkingPermit[]) => list.some((p) => p.id === 'A'),
    added,
  };
};

describe('attemptWrite', () => {
  it('saved: the write answered', async () => {
    const call = vi.fn().mockResolvedValue([permit('A')]);
    const readFresh = vi.fn();
    const out = await attemptWrite({ ...base(), call, readFresh });
    expect(out.status).toBe('saved');
    expect(call).toHaveBeenCalledTimes(1);
    expect(readFresh).not.toHaveBeenCalled();
  });

  it('a definite refusal is a failure at once: no check, no second try', async () => {
    const call = vi.fn().mockRejectedValue(REFUSED);
    const readFresh = vi.fn();
    const out = await attemptWrite({ ...base(), call, readFresh });
    expect(out).toEqual({ status: 'failed', error: REFUSED });
    expect(call).toHaveBeenCalledTimes(1);
    expect(readFresh).not.toHaveBeenCalled();
  });

  it('reply lost but the sheet has the change: saved, and NOT sent again (no duplicate)', async () => {
    const call = vi.fn().mockRejectedValue(UNCLEAR);
    const readFresh = vi.fn().mockResolvedValue([permit('A')]);
    const out = await attemptWrite({ ...base(), call, readFresh });
    expect(out).toEqual({ status: 'saved', list: [permit('A')] });
    expect(call).toHaveBeenCalledTimes(1);
    expect(readFresh).toHaveBeenCalledTimes(1);
  });

  it('reply lost and the sheet does not have it: sent again once, then saved', async () => {
    const call = vi.fn().mockRejectedValueOnce(UNCLEAR).mockResolvedValueOnce([permit('A')]);
    const readFresh = vi.fn().mockResolvedValue([]);
    const out = await attemptWrite({ ...base(), call, readFresh });
    expect(out.status).toBe('saved');
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('lost twice and the sheet never has it: failed (checked, not saved)', async () => {
    const call = vi.fn().mockRejectedValue(UNCLEAR);
    const readFresh = vi.fn().mockResolvedValue([]);
    const out = await attemptWrite({ ...base(), call, readFresh });
    expect(out).toEqual({ status: 'failed', error: UNCLEAR });
    expect(call).toHaveBeenCalledTimes(2);
    expect(readFresh).toHaveBeenCalledTimes(2);
  });

  it('lost the first time, saved by the second send even though that reply was lost too', async () => {
    const call = vi.fn().mockRejectedValue(UNCLEAR);
    const readFresh = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([permit('A')]);
    const out = await attemptWrite({ ...base(), call, readFresh });
    expect(out.status).toBe('saved');
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('cannot read the sheet either: unknown (nothing is resent, nothing is declared failed)', async () => {
    const call = vi.fn().mockRejectedValue(UNCLEAR);
    const readFresh = vi.fn().mockRejectedValue(new Error('down'));
    const out = await attemptWrite({ ...base(), call, readFresh });
    expect(out).toEqual({ status: 'unknown', error: UNCLEAR });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('the second send is refused for sure: failed with that error', async () => {
    const call = vi.fn().mockRejectedValueOnce(UNCLEAR).mockRejectedValueOnce(REFUSED);
    const readFresh = vi.fn().mockResolvedValue([]);
    const out = await attemptWrite({ ...base(), call, readFresh });
    expect(out).toEqual({ status: 'failed', error: REFUSED });
  });

  it('delete: verified when the item is gone', async () => {
    const call = vi.fn().mockRejectedValue(UNCLEAR);
    const readFresh = vi.fn().mockResolvedValue([permit('B')]);
    const out = await attemptWrite({ call, readFresh, isUnclear, verify: (l) => !l.some((p) => p.id === 'A') });
    expect(out.status).toBe('saved');
    expect(call).toHaveBeenCalledTimes(1);
  });
});
