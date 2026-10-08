import { describe, it, expect, beforeEach } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * Runs apps-script/Code.gs against in-memory fakes of the Google services.
 * The fake sheet mimics one Sheets quirk that matters: text typed into cells that
 * are not formatted as plain text ("@") is converted, e.g. 2026-10-06 becomes a Date.
 */

const source = readFileSync(new URL('./Code.gs', import.meta.url), 'utf8');

type Cell = string | number | Date;

class FakeSheet {
  data: Cell[][] = [];
  textFormatted = new Set<string>();

  getLastRow() {
    return this.data.length;
  }
  getRange(row: number, col: number, numRows: number, numCols: number) {
    const sheet = this;
    return {
      getValues: () =>
        Array.from({ length: numRows }, (_, r) =>
          Array.from({ length: numCols }, (_, c) => sheet.data[row - 1 + r]?.[col - 1 + c] ?? '')
        ),
      setValues: (values: Cell[][]) => {
        values.forEach((vals, r) => {
          const rowIdx = row - 1 + r;
          sheet.data[rowIdx] ??= [];
          vals.forEach((v, c) => {
            const isText = sheet.textFormatted.has(`${rowIdx}:${col - 1 + c}`);
            sheet.data[rowIdx][col - 1 + c] =
              !isText && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T00:00:00+07:00') : v;
          });
        });
      },
      setNumberFormat: (fmt: string) => {
        if (fmt !== '@') return;
        for (let r = 0; r < numRows; r++)
          for (let c = 0; c < numCols; c++) sheet.textFormatted.add(`${row - 1 + r}:${col - 1 + c}`);
      },
      setBackground: () => undefined,
      setFontColor: () => undefined,
      setFontWeight: () => undefined,
      setHorizontalAlignment: () => undefined,
    };
  }
  deleteRow(n: number) {
    this.data.splice(n - 1, 1);
  }
  setFrozenRows() {
    return undefined;
  }
}

function createEnvironment() {
  const sheets = new Map<string, FakeSheet>();
  const props = new Map<string, string>();
  const cache = new Map<string, string>();

  const env = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (name: string) => sheets.get(name) ?? null,
        insertSheet: (name: string) => {
          const s = new FakeSheet();
          sheets.set(name, s);
          return s;
        },
      }),
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (text: string) => ({ getContent: () => text, setMimeType() { return this; } }),
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest: (_alg: string, text: string) => Array.from(createHash('sha256').update(text, 'utf8').digest(), (b) => (b > 127 ? b - 256 : b)),
      getUuid: () => randomUUID(),
      formatDate: (d: Date, tz: string) => d.toLocaleDateString('en-CA', { timeZone: tz }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => props.get(k) ?? null,
        setProperty: (k: string, v: string) => void props.set(k, v),
        deleteProperty: (k: string) => void props.delete(k),
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k: string) => cache.get(k) ?? null,
        put: (k: string, v: string) => void cache.set(k, v),
        remove: (k: string) => void cache.delete(k),
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }) },
  };

  const factory = new Function(
    ...Object.keys(env),
    `${source}\nreturn { doGet, doPost, resetPassword };`
  );
  const api = factory(...Object.values(env)) as {
    doGet: (e: unknown) => { getContent(): string };
    doPost: (e: unknown) => { getContent(): string };
    resetPassword: () => void;
  };

  const post = (body: Record<string, unknown>) =>
    JSON.parse(api.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
  const list = () => JSON.parse(api.doGet({ parameter: { action: 'list' } }).getContent());

  return { api, post, list, sheets, props, cache };
}

const permit = (over: Record<string, unknown> = {}) => ({
  id: 'PK-1',
  createdAt: '2026-10-06T03:00:00.000Z',
  licensePlate: '1กข 4590',
  province: 'กรุงเทพมหานคร',
  vehicleBrand: 'Toyota',
  vehicleColor: 'ขาว',
  parkingFloor: 'B1',
  department: 'สร.',
  subDepartment: '',
  startDate: '2026-10-06',
  endDate: '2026-10-08',
  ...over,
});

describe('Code.gs', () => {
  let t: ReturnType<typeof createEnvironment>;
  let token: string;

  beforeEach(() => {
    t = createEnvironment();
    token = t.post({ action: 'login', password: '1234' }).token;
  });

  describe('authentication', () => {
    it('accepts the default password once and asks for a change', () => {
      const res = t.post({ action: 'login', password: '1234' });
      expect(res.status).toBe('success');
      expect(res.mustChange).toBe(true);
      expect(typeof res.token).toBe('string');
    });

    it('rejects a wrong password', () => {
      const res = t.post({ action: 'login', password: 'nope' });
      expect(res).toMatchObject({ status: 'error', code: 'invalid_password' });
    });

    it('locks out after 5 wrong attempts, even for the right password', () => {
      for (let i = 0; i < 5; i++) t.post({ action: 'login', password: 'bad' });
      expect(t.post({ action: 'login', password: '1234' })).toMatchObject({ status: 'error', code: 'locked' });
    });

    it('refuses writes without a valid token', () => {
      expect(t.post({ action: 'add', permit: permit() })).toMatchObject({ code: 'unauthorized' });
      expect(t.post({ action: 'add', token: 'forged', permit: permit() })).toMatchObject({ code: 'unauthorized' });
      expect(t.post({ action: 'delete', token: 'forged', id: 'PK-1' })).toMatchObject({ code: 'unauthorized' });
      expect(t.list().data).toEqual([]);
    });

    it('changes the password, invalidates old tokens and never stores it in plain text', () => {
      expect(t.post({ action: 'changePassword', token, oldPassword: '1234', newPassword: '123' }).code).toBe('weak_password');
      expect(t.post({ action: 'changePassword', token, oldPassword: '1234', newPassword: '1234' }).code).toBe('weak_password');
      expect(t.post({ action: 'changePassword', token, oldPassword: 'wrong', newPassword: 'secret-pass' }).code).toBe('invalid_password');

      const changed = t.post({ action: 'changePassword', token, oldPassword: '1234', newPassword: 'secret-pass' });
      expect(changed.status).toBe('success');

      expect(t.post({ action: 'add', token, permit: permit() }).code).toBe('unauthorized'); // old session
      expect(t.post({ action: 'add', token: changed.token, permit: permit() }).status).toBe('success');

      expect(t.post({ action: 'login', password: '1234' }).code).toBe('invalid_password');
      const relogin = t.post({ action: 'login', password: 'secret-pass' });
      expect(relogin).toMatchObject({ status: 'success', mustChange: false });

      expect([...t.props.values()].some((v) => v.includes('secret-pass'))).toBe(false);
    });

    it('resetPassword() restores the default password', () => {
      t.post({ action: 'changePassword', token, oldPassword: '1234', newPassword: 'secret-pass' });
      t.api.resetPassword();
      expect(t.post({ action: 'login', password: '1234' })).toMatchObject({ status: 'success', mustChange: true });
    });

    it('logout invalidates the token', () => {
      t.post({ action: 'logout', token });
      expect(t.post({ action: 'add', token, permit: permit() }).code).toBe('unauthorized');
    });
  });

  describe('data', () => {
    it('adds a permit and returns dates as plain YYYY-MM-DD text', () => {
      expect(t.post({ action: 'add', token, permit: permit() }).status).toBe('success');
      const [row] = t.list().data;
      expect(row).toMatchObject({
        id: 'PK-1',
        licensePlate: '1กข4590',
        startDate: '2026-10-06',
        endDate: '2026-10-08',
        parkingFloor: 'B1',
        department: 'สร.',
        subDepartment: '',
      });
    });

    it('treats a repeated add with the same id as a no-op', () => {
      t.post({ action: 'add', token, permit: permit() });
      const again = t.post({ action: 'add', token, permit: permit() });
      expect(again).toMatchObject({ status: 'success', duplicate: true });
      expect(t.list().data).toHaveLength(1);
    });

    it('deletes only the row with the given id, not other permits of the same plate', () => {
      t.post({ action: 'add', token, permit: permit({ id: 'PK-1', startDate: '2026-10-06', endDate: '2026-10-07' }) });
      t.post({ action: 'add', token, permit: permit({ id: 'PK-2', startDate: '2026-10-20', endDate: '2026-10-21' }) });
      expect(t.post({ action: 'delete', token, id: 'PK-1' })).toMatchObject({ status: 'success', deleted: 1 });
      expect(t.list().data.map((p: { id: string }) => p.id)).toEqual(['PK-2']);
    });

    it('refuses to delete without an id', () => {
      t.post({ action: 'add', token, permit: permit() });
      expect(t.post({ action: 'delete', token, id: '' }).code).toBe('bad_request');
      expect(t.list().data).toHaveLength(1);
    });

    it('updates a permit in place and reports unknown ids', () => {
      t.post({ action: 'add', token, permit: permit() });
      expect(t.post({ action: 'update', token, permit: permit({ parkingFloor: 'B2', endDate: '2026-10-09' }) }).status).toBe('success');
      expect(t.list().data[0]).toMatchObject({ parkingFloor: 'B2', endDate: '2026-10-09' });
      expect(t.post({ action: 'update', token, permit: permit({ id: 'PK-404' }) }).code).toBe('not_found');
    });

    it.each([
      ['end before start', { startDate: '2026-10-08', endDate: '2026-10-06' }],
      ['impossible date', { startDate: '2026-02-31', endDate: '2026-03-01' }],
      ['bad date format', { startDate: '06/10/2026' }],
      ['unknown floor', { parkingFloor: 'B3' }],
      ['blank plate', { licensePlate: '   ' }],
      ['missing brand', { vehicleBrand: '' }],
    ])('rejects invalid data: %s', (_name, over) => {
      expect(t.post({ action: 'add', token, permit: permit(over) })).toMatchObject({ status: 'error', code: 'bad_request' });
      expect(t.list().data).toEqual([]);
    });

    it('imports only permits that are not in the sheet yet', () => {
      t.post({ action: 'add', token, permit: permit({ id: 'PK-1' }) });
      const res = t.post({
        action: 'import',
        token,
        permits: [permit({ id: 'PK-1' }), permit({ id: 'PK-2', licensePlate: '2ขค1111' }), permit({ id: 'PK-3', parkingFloor: 'X' })],
      });
      expect(res).toMatchObject({ status: 'success', added: 1, skipped: 2 });
      expect(t.list().data.map((p: { id: string }) => p.id)).toEqual(['PK-1', 'PK-2']);
    });

    it('reads legacy rows whose dates were turned into Date objects or dd/mm/yyyy (B.E.) text', () => {
      t.list(); // creates the sheet and header
      const sheet = t.sheets.get('รายการขอจอดรถ')!;
      sheet.data.push(
        ['L1', '1กข4590', 'กรุงเทพมหานคร', 'B2', 'Honda', 'ดำ', 'สร.', '-', new Date('2026-10-06T00:00:00+07:00'), new Date('2026-10-07T00:00:00+07:00'), ''],
        ['L2', '2ขค2222', 'นนทบุรี', 'B1', 'Mazda', 'แดง', '-', '-', '06/10/2569', '07/10/2569', '8/10/2569 14:00:00']
      );
      const rows = t.list().data;
      expect(rows[0]).toMatchObject({ id: 'L1', parkingFloor: 'B2', startDate: '2026-10-06', endDate: '2026-10-07', department: 'สร.', subDepartment: '' });
      expect(rows[1]).toMatchObject({ id: 'L2', startDate: '2026-10-06', endDate: '2026-10-07' });
    });
  });

  it('answers ping and unknown GET actions', () => {
    expect(JSON.parse(t.api.doGet({ parameter: { action: 'ping' } }).getContent()).status).toBe('success');
    expect(JSON.parse(t.api.doGet({ parameter: { action: 'zzz' } }).getContent()).status).toBe('error');
    expect(t.post({ action: 'ping' }).status).toBe('success');
  });
});
