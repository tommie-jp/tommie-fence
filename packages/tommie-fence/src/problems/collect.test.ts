import { describe, expect, test } from 'vitest';
import type { FenceEditor } from 'fence-kit';
import { fenceEditors } from '../editor/fences.ts';
import { collectProblems } from './collect.ts';

/**
 * Problems パネルに出す行を、文書の字から集める (52 の docs/57)。
 * **本物の 3 つのフェンス**で見る — 行のずらし方はフェンスの側が持っている。
 */
const doc = (...lines: readonly string[]): string => `${lines.join('\n')}\n`;

/** 開き記号が 3 行目の circuit (読める) と、開き記号が 9 行目の perfboard (中の 3 行目が読めない)。 */
const MIXED = doc(
  '# 見出し',
  '',
  '```circuit',
  'parts:',
  '  R1: resistor a1 a3 10k',
  '```',
  '',
  '文の段落。',
  '```perfboard',
  'board: 12x7',
  'parts:',
  '  R1: resistr b2 b6',
  '```',
);

/** つないでいない抵抗 (ERC だけが言う)。開き記号は 1 行目。 */
const LOOSE = doc('```perfboard', 'board: 12x7', 'parts:', '  R1: resistor b2 b6 1k', '```');

describe('collectProblems', () => {
  test('puts an unreadable line of any fence on its Markdown line', () => {
    // Act
    const problems = collectProblems(MIXED, fenceEditors(), { erc: false });

    // Assert — 12 行目 (perfboard の中の 3 行目)。読める circuit は何も言わない。
    expect(problems.filter((one) => one.kind === 'error')).toEqual([
      { language: 'perf', line: 12, kind: 'error', message: expect.stringContaining('resistr') },
    ]);
    expect(problems.every((one) => one.language === 'perf')).toBe(true);
    // perfboard は「読めないので ERC を掛けていない」とも言う (行を持たないので開き記号の行)。
    expect(problems).toContainEqual({ language: 'perf', line: 9, kind: 'notice', message: expect.stringContaining('ERC') });
  });

  test('adds ERC only when asked', () => {
    expect(collectProblems(LOOSE, fenceEditors(), { erc: false })).toEqual([]);

    const loud = collectProblems(LOOSE, fenceEditors(), { erc: true });
    expect(loud.length).toBeGreaterThan(0);
    expect(loud.every((one) => one.kind === 'erc' && one.language === 'perf')).toBe(true);
  });

  test('reads every fence of a language, not just the first', () => {
    const twice = doc('```breadboard', 'board: half', 'parts:', '  R1: resistr a5 a10', '```',
      '```breadboard', 'board: half', 'parts:', '  R2: capacitr a5 a10', '```');

    expect(collectProblems(twice, fenceEditors(), { erc: false }).map((one) => one.line)).toEqual([4, 9]);
  });

  // 52 の docs/08。短い綴りが正、長い綴りは別名。**どちらで書いても Problems に出る。**
  test('reads a fence in either spelling, and names it by the short one', () => {
    const both = doc('```bread', 'board: half', 'parts:', '  R1: resistr a5 a10', '```',
      '```breadboard', 'board: half', 'parts:', '  R2: capacitr a5 a10', '```');

    const problems = collectProblems(both, fenceEditors(), { erc: false });

    expect(problems.map((one) => [one.language, one.line])).toEqual([['bread', 4], ['bread', 9]]);
  });

  test('says nothing about a markdown file without fences', () => {
    expect(collectProblems(doc('# ただの文書', '```yaml', 'a: [', '```'), fenceEditors(), { erc: true })).toEqual([]);
  });

  test('puts a row without a line on the opening line, instead of dropping it', () => {
    // Arrange — 行の分からない報告を返すフェンス (帯では押せない行になるもの)。
    const lineless = { language: 'circuit', problems: () => [{ kind: 'error', line: null, text: '図が大きすぎます' }] };

    // Act
    const problems = collectProblems(doc('本文', '```circuit', 'parts:', '```'), [lineless as unknown as FenceEditor], { erc: false });

    // Assert
    expect(problems).toEqual([{ language: 'circuit', line: 2, kind: 'error', message: '図が大きすぎます' }]);
  });

  test('skips a fence whose editor has no rows for the Problems panel', () => {
    const silent = { language: 'circuit' } as unknown as FenceEditor;

    expect(collectProblems(MIXED, [silent], { erc: true })).toEqual([]);
  });
});
