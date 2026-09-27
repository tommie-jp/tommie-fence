import { describe, expect, test } from 'vitest';
import { problemsOf } from './problems.ts';

describe('problemsOf', () => {
  test('gives errors on markdown lines, without the name tag', () => {
    const rows = problemsOf('device: ad2\nfoo: 1\nbar: 1', 4, { erc: true });
    expect(rows[0]).toMatchObject({ kind: 'error', line: 6 });
    expect(rows[0]?.text.startsWith('spectrum')).toBe(false);
    expect(rows[1]).toMatchObject({ kind: 'error', line: 7 });
  });

  test('hides notices under style: debug: off', () => {
    expect(problemsOf('device: ad2\nstyle:\n  debug: off', 0, { erc: false })).toEqual([]);
  });
});
