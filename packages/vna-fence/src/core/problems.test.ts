import { describe, expect, test } from 'vitest';
import { problemsOf } from './problems.ts';

describe('problemsOf', () => {
  test('gives errors and notices on markdown lines, without the name tag', () => {
    const rows = problemsOf('foo: 1\ndevice: h4\nsweep: 1M-3G', 4, { erc: true });
    // 読めなかった行が先 (帯と同じ並び)。
    expect(rows[0]).toMatchObject({ kind: 'error', line: 5 });
    expect(rows).toContainEqual({ kind: 'notice', line: null, text: 'NanoVNA-H4 は 1.5 GHz までです (掃引の終わりが 3 GHz)' });
  });

  test('hides notices under style: debug: off', () => {
    const rows = problemsOf('sweep: 1M-2M\nstyle:\n  debug: off', 0, { erc: false });
    expect(rows).toEqual([]);
  });

  test('reads data: through the host when given', () => {
    const rows = problemsOf('sweep: 1M-2M\ndata: a.s1p', 0, { erc: false }, () => null);
    expect(rows[0]?.text).toContain('見つかりません');
  });
});
