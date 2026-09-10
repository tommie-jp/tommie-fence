import { describe, expect, test } from 'vitest';
import { parseExamples, shown } from './examples.ts';

const one = {
  kind: 'breadboard',
  broken: false,
  name: '01-led.md',
  title: 'LED と抵抗',
  fences: 1,
  path: 'examples/breadboard/01-led.md',
  from: 'packages/breadboard-fence/examples/01-led.md',
};

describe('parseExamples', () => {
  test('形の合ったものを読む', () => {
    // Act
    const { examples, dropped } = parseExamples([one]);

    // Assert
    expect(examples).toEqual([one]);
    expect(dropped).toBe(0);
  });

  test('欠けているものは落として、数を返す', () => {
    const { examples, dropped } = parseExamples([one, { kind: 'breadboard' }, null, 7]);

    expect(examples).toEqual([one]);
    expect(dropped).toBe(3);
  });

  test('知らない種類は落とす', () => {
    expect(parseExamples([{ ...one, kind: 'vector' }]).dropped).toBe(1);
  });

  /**
   * **道は外から来た字。** `dist/` の中に限る — そうしないと、古い JSON や
   * 差し替えられた JSON で別の出所を取りに行かせられる。
   */
  test('examples/ の外を指す道は落とす', () => {
    expect(parseExamples([{ ...one, path: 'https://example.test/x.md' }]).dropped).toBe(1);
    expect(parseExamples([{ ...one, path: 'examples/../../secret.md' }]).dropped).toBe(1);
  });

  test('配列でなければ空で返す (読み込みに失敗したとき)', () => {
    expect(parseExamples({ examples: [one] })).toEqual({ examples: [], dropped: 0 });
    expect(parseExamples(null)).toEqual({ examples: [], dropped: 0 });
  });
});

describe('shown', () => {
  const broken = { ...one, broken: true, name: 'bad.md' };

  test('わざと壊した例は既定で外す', () => {
    expect(shown(parseExamples([one, broken]).examples)).toEqual([one]);
  });

  test('broken を立てると並ぶ (?dev で開いたとき)', () => {
    expect(shown(parseExamples([one, broken]).examples, true)).toEqual([one, broken]);
  });
});
