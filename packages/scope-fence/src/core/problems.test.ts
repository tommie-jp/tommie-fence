import { describe, expect, test } from 'vitest';
import { problemsOf } from './problems.ts';

describe('problemsOf', () => {
  test('gives errors on markdown lines, without the name tag', () => {
    const rows = problemsOf('foo: 1\ntime: 1ms', 4, { erc: true });
    expect(rows[0]).toMatchObject({ kind: 'error', line: 5 });
    expect(rows[0]?.text.startsWith('scope')).toBe(false);
    expect(rows[1]).toMatchObject({ kind: 'error', line: 6 });
  });

  test('hides notices under style: debug: off', () => {
    expect(problemsOf('time: 1ms/div\nstyle:\n  debug: off', 0, { erc: false })).toEqual([]);
  });
});
