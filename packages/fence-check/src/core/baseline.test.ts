import { describe, expect, test } from 'vitest';
import {
  diffBaseline, formatBaselineSummary, formatFindingsJson, keyOf, readAllowList, readBaselineRows, shrunkBaseline,
} from './baseline.ts';
import type { FindingRow } from './report.ts';

const row = (over: Partial<FindingRow> = {}): FindingRow => ({
  file: '01-circuits/01-basics/03-rc-charge.md', line: 40, fence: 'breadboard', title: '図2 ブレッドボード',
  sheet: null, kind: 'wire-part', a: 'wire(d16-g16)', b: 'S1', amount: 32, unit: 'px', grade: 'sure', ...over,
});

describe('keyOf', () => {
  test('the same finding at another line and amount has the same key', () => {
    expect(keyOf(row({ line: 99, amount: 3 }))).toBe(keyOf(row()));
  });

  test('another figure, sheet, kind or partner is another key', () => {
    const keys = [
      row(), row({ title: '図3 ブレッドボード' }), row({ sheet: '表' }), row({ kind: 'caption' }), row({ b: 'R1' }),
    ].map(keyOf);
    expect(new Set(keys).size).toBe(5);
  });
});

describe('diffBaseline', () => {
  test('a finding not in the baseline is fresh; one in it is known; one gone is resolved', () => {
    const kept = row();
    const gone = row({ b: 'R1' });
    const fresh = row({ a: 'wire(a1-a5)' });
    const diff = diffBaseline([kept, fresh], [kept, gone], []);
    expect(diff.fresh).toEqual([fresh]);
    expect(diff.known).toEqual([kept]);
    expect(diff.resolved).toEqual([gone]);
  });

  test('keys are counted: a second crossing of the same two wires is fresh', () => {
    const crossing = row({ kind: 'crossing', a: 'wire(a1-a9)', b: 'wire(c3-g3)', unit: 'point', amount: 1 });
    const diff = diffBaseline([crossing, { ...crossing, line: 41 }], [crossing], []);
    expect(diff.known).toHaveLength(1);
    expect(diff.fresh).toHaveLength(1);
  });

  test('an allowed key is never fresh, however many times it appears', () => {
    const allowed = row({ kind: 'crossing' });
    const diff = diffBaseline([allowed, allowed], [], [{ ...allowed, reason: '逆挿しを見せる題' }]);
    expect(diff.fresh).toEqual([]);
    expect(diff.allowed).toHaveLength(2);
  });

  test('uncertain findings not in the baseline are shown apart and never fail', () => {
    const guess = row({ fence: 'circuit', grade: 'uncertain' });
    const diff = diffBaseline([guess], [], []);
    expect(diff.fresh).toEqual([]);
    expect(diff.freshUncertain).toEqual([guess]);
  });
});

describe('shrunkBaseline', () => {
  test('keeps only what is still there, as it is now, in key order', () => {
    const a = row({ b: 'U1' });
    const b = row({ b: 'R1' });
    const gone = row({ b: 'C1' });
    const shrunk = shrunkBaseline([{ ...a, line: 50, amount: 30 }, b, row({ b: 'Q9' })], [gone, a, b]);
    expect(shrunk).toEqual([b, { ...a, line: 50, amount: 30 }]);
  });

  test('never grows a key beyond its count in the baseline', () => {
    const crossing = row({ kind: 'crossing' });
    expect(shrunkBaseline([crossing, crossing], [crossing])).toHaveLength(1);
  });
});

describe('reading the files', () => {
  test('the baseline is the --json output (only findings are read)', () => {
    const read = readBaselineRows({ summary: {}, findings: [row()], failures: [] });
    expect(read).toEqual({ ok: true, value: [row()] });
  });

  test('a baseline without findings, or with a broken finding, is refused', () => {
    expect(readBaselineRows({}).ok).toBe(false);
    expect(readBaselineRows({ findings: [{ ...row(), kind: 'nope' }] }).ok).toBe(false);
    expect(readBaselineRows({ findings: [{ ...row(), a: 3 }] }).ok).toBe(false);
  });

  test('every allowed finding needs a reason', () => {
    const entry = { file: 'a.md', title: null, sheet: null, kind: 'crossing', a: 'x', b: 'y' };
    expect(readAllowList({ allow: [{ ...entry, reason: '比較の図' }] }).ok).toBe(true);
    expect(readAllowList({ allow: [entry] }).ok).toBe(false);
    expect(readAllowList({ allow: [{ ...entry, reason: ' ' }] }).ok).toBe(false);
    expect(readAllowList({ allow: [] })).toEqual({ ok: true, value: [] });
  });
});

describe('writing', () => {
  test('one finding per line, so that git diff reads as findings added and removed', () => {
    const text = formatFindingsJson([row(), row({ b: 'R1' })]);
    expect(JSON.parse(text)).toEqual({ findings: [row(), row({ b: 'R1' })] });
    expect(text.split('\n').filter((line) => line.includes('"kind"'))).toHaveLength(2);
  });

  test('the summary line counts each group', () => {
    const diff = diffBaseline([row(), row({ b: 'X' })], [row(), row({ b: 'R1' })], []);
    expect(formatBaselineSummary(diff)).toBe('baseline 2 → 1 (resolved 1: --write で基準から消せる) / new 1 / allowed 0 / uncertain-new 0');
  });

  test('nothing resolved, nothing said about --write', () => {
    expect(formatBaselineSummary(diffBaseline([row()], [row()], []))).toBe('baseline 1 → 1 / new 0 / allowed 0 / uncertain-new 0');
  });
});
