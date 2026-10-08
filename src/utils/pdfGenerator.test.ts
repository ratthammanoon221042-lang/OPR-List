import { describe, it, expect } from 'vitest';
import { paginate, rowsPerPage } from './pdfGenerator';

describe('paginate', () => {
  const items = (n: number) => Array.from({ length: n }, (_, i) => i);

  it('always returns at least one page, even with no rows', () => {
    expect(paginate([])).toEqual([[]]);
  });

  it('keeps a short list on one page', () => {
    expect(paginate(items(10))).toHaveLength(1);
  });

  it('never loses or duplicates a row, however many there are', () => {
    for (const n of [1, rowsPerPage(true), rowsPerPage(true) + 1, 100, 250, 1000]) {
      const pages = paginate(items(n));
      expect(pages.flat()).toEqual(items(n));
      pages.forEach((page, i) => expect(page.length).toBeLessThanOrEqual(rowsPerPage(i === 0)));
    }
  });

  it('page 1 holds fewer rows than later pages (it has the big title block)', () => {
    expect(rowsPerPage(true)).toBeLessThan(rowsPerPage(false));
    expect(rowsPerPage(true)).toBeGreaterThan(20);
  });
});
