import { describe, expect, test } from 'vitest';
import type { Finding } from './check.ts';
import { formatRow, formatSummary, formatTop, rowsOf, summarize, topFigures } from './report.ts';
import type { FigureResult } from './report.ts';

const finding = (over: Partial<Finding> = {}): Finding => ({
  kind: 'overlap', a: 'C1', b: 'U1', amount: 6, unit: 'px', line: 5, grade: 'sure', at: { x: 0, y: 0 }, ...over,
});
const figure = (over: Partial<FigureResult> = {}): FigureResult => ({
  file: '01-circuits/05-power-supplies/04-ldo-usb.md', line: 33, fence: 'perfboard', title: '図3 ユニバーサル基板',
  sheet: null, findings: [finding()], skipped: 0, failure: null, ...over,
});

describe('rows', () => {
  test('one line per finding, at the Markdown line of the later item', () => {
    const [row] = rowsOf([figure()]);
    expect(row?.line).toBe(38);
    expect(formatRow(row!)).toBe('01-circuits/05-power-supplies/04-ldo-usb.md:38 perfboard 図3 ユニバーサル基板 overlap C1 × U1 6px');
  });

  test('a finding without a line points at the fence', () => {
    expect(rowsOf([figure({ findings: [finding({ line: null })] })])[0]?.line).toBe(33);
  });

  test('uncertain findings end in ?, points carry no amount, sheets are named', () => {
    const rows = rowsOf([figure({
      fence: 'circuit', title: null, sheet: '表',
      findings: [finding({ kind: 'crossing', unit: 'point', amount: 1, grade: 'uncertain' })],
    })]);
    expect(formatRow(rows[0]!)).toBe('01-circuits/05-power-supplies/04-ldo-usb.md:38 circuit[表] crossing C1 × U1 ?');
  });
});

describe('summary', () => {
  const figures = [
    figure(),
    figure({ fence: 'circuit', findings: [finding({ kind: 'junction4', grade: 'uncertain' }), finding({ kind: 'crossing', grade: 'uncertain' })], skipped: 3 }),
    figure({ fence: 'breadboard', findings: [] }),
    figure({ fence: 'breadboard', findings: [], failure: 'boom' }),
  ];

  test('counts fences, kinds and the rest', () => {
    const summary = summarize(figures);
    expect(summary).toMatchObject({
      fences: 4,
      byFence: { circuit: 1, breadboard: 2, perfboard: 1 },
      byKind: { overlap: 1, junction4: 1, crossing: 1, 'wire-part': 0, caption: 0 },
      uncertain: 2, figuresWithFindings: 2, skipped: 3, failures: 1,
    });
    expect(formatSummary(summary)).toContain('4 fences (circuit 1 / breadboard 2 / perfboard 1)');
  });

  test('the top figures come in order of how many findings they have', () => {
    const top = topFigures(figures, 5);
    expect(top.map((one) => one.fence)).toEqual(['circuit', 'perfboard']);
    expect(formatTop(top[0]!)).toBe('2\t01-circuits/05-power-supplies/04-ldo-usb.md:33 circuit 図3 ユニバーサル基板 (crossing 1, junction4 1)');
  });
});
