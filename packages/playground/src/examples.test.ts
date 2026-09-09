import { describe, expect, test } from 'vitest';
import { forKind, parseExamples } from './examples.ts';

const one = {
  kind: 'breadboard',
  broken: false,
  label: '図01 LED と抵抗',
  source: 'board: half\n',
  from: 'packages/breadboard-fence/examples/01-led.md',
};

describe('parseExamples', () => {
  test('形の合ったものを読む', () => {
    // Arrange / Act
    const { examples, dropped } = parseExamples([one]);

    // Assert
    expect(examples).toEqual([one]);
    expect(dropped).toBe(0);
  });

  test('知らない種類は落として数える', () => {
    const { examples, dropped } = parseExamples([one, { ...one, kind: 'vector' }]);

    expect(examples).toHaveLength(1);
    expect(dropped).toBe(1);
  });

  test('欄が欠けているもの・型が違うものは落とす', () => {
    const { examples, dropped } = parseExamples([
      { ...one, label: 42 },
      { ...one, broken: 'yes' },
      { ...one, source: '   ' },
      null,
      'breadboard',
    ]);

    expect(examples).toHaveLength(0);
    expect(dropped).toBe(5);
  });

  test('配列でなければ空で返す (読み込みに失敗したとき)', () => {
    expect(parseExamples({ examples: [one] })).toEqual({ examples: [], dropped: 0 });
    expect(parseExamples(null)).toEqual({ examples: [], dropped: 0 });
  });
});

describe('forKind', () => {
  test('その種類だけを返す', () => {
    const perf = { ...one, kind: 'perfboard' as const };

    expect(forKind(parseExamples([one, perf]).examples, 'perfboard')).toEqual([perf]);
  });

  /**
   * わざと壊した例はエラーの帯を確かめるためのもの。**初めて来た人の欄には
   * 出さない** (52 の docs/41)。`?dev` で開いた人にだけ足す。
   */
  test('わざと壊した例は既定で外す', () => {
    const broken = { ...one, broken: true, label: 'わざと壊した例' };
    const all = parseExamples([one, broken]).examples;

    expect(forKind(all, 'breadboard')).toEqual([one]);
  });

  test('broken を立てると壊した例も並ぶ (?dev で開いたとき)', () => {
    const broken = { ...one, broken: true, label: 'わざと壊した例' };
    const all = parseExamples([one, broken]).examples;

    expect(forKind(all, 'breadboard', true)).toEqual([one, broken]);
  });
});
