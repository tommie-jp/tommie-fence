import { describe, expect, test } from 'vitest';
import { problemsOf } from './problems.ts';

describe('problemsOf', () => {
  test('gives errors on markdown lines, without the name tag', () => {
    const rows = problemsOf('device: ad3\ntime: 1s/div\nfoo: 1\nbar: 1', 4, { erc: true });
    expect(rows[0]).toMatchObject({ kind: 'error', line: 7 });
    expect(rows[0]?.text.startsWith('logic')).toBe(false);
    expect(rows[1]).toMatchObject({ kind: 'error', line: 8 });
  });

  test('gives notices as their own kind', () => {
    const rows = problemsOf('device: ad3\ntime: 1us/div\nsample: 200MHz\nsignals:\n  A: high', 0, { erc: false });
    expect(rows.map((row) => row.kind)).toEqual(['notice']);
  });

  test('hides notices under style: debug: off', () => {
    expect(problemsOf('device: ad3\ntime: 1us/div\nsample: 200MHz\nstyle:\n  debug: off', 0, { erc: false })).toEqual([]);
  });
});
