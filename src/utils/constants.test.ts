import { describe, it, expect } from 'vitest';
import { PROVINCE_OPTIONS, THAI_PROVINCES } from './constants';

describe('PROVINCE_OPTIONS', () => {
  it('has every province exactly once (77) as plain text, no region headings', () => {
    expect(PROVINCE_OPTIONS).toHaveLength(77);
    expect(new Set(PROVINCE_OPTIONS).size).toBe(77);
    expect([...PROVINCE_OPTIONS].sort()).toEqual([...THAI_PROVINCES].sort());
    expect(PROVINCE_OPTIONS.every((p) => typeof p === 'string' && !p.startsWith('ภาค'))).toBe(true);
  });

  it('starts with Bangkok, then the rest in Thai alphabetical order', () => {
    expect(PROVINCE_OPTIONS[0]).toBe('กรุงเทพมหานคร');
    const rest = PROVINCE_OPTIONS.slice(1);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b, 'th')));
    expect(rest[0]).toBe('กระบี่');
  });
});
