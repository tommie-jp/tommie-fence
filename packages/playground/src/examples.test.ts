import { describe, expect, test } from 'vitest';
import { firstDoc, groupLabel, optionLabel, parseExamples, shown } from './examples.ts';

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

/** 最初に開く文書と、欄に出す名前 (52 の docs/49 で `main.ts` から移した)。 */
describe('firstDoc', () => {
  const led = { kind: 'breadboard', broken: false, name: '01-led.md', title: 'LED', fences: 1, path: 'examples/breadboard/01-led.md', from: 'x' } as const;
  const rc = { ...led, kind: 'circuit', name: '01-rc.md', path: 'examples/circuit/01-rc.md' } as const;

  test('breadboard の 01-led.md を選ぶ (一覧の先頭ではなく)', () => {
    expect(firstDoc([rc, led])).toBe(1);
  });

  test('無ければ先頭に落ちる', () => {
    expect(firstDoc([rc])).toBe(0);
    expect(firstDoc([])).toBe(0);
  });
});

describe('optionLabel / groupLabel', () => {
  const one = { kind: 'breadboard', broken: false, name: '01-led.md', title: 'LED', fences: 1, path: 'examples/breadboard/01-led.md', from: 'x' } as const;

  test('図が 2 本以上なら本数を添える', () => {
    expect(optionLabel(one)).toBe('01-led.md — LED');
    expect(optionLabel({ ...one, fences: 3 })).toBe('01-led.md — LED (図 3 本)');
  });

  test('種類ごとの小見出し。壊した例は別の束', () => {
    expect(groupLabel(one)).toBe('breadboard（ブレッドボード図）');
    expect(groupLabel({ ...one, broken: true })).toBe('わざと壊した例 — breadboard');
  });
});
