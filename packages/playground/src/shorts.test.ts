import { describe, expect, test } from 'vitest';
import { parseShorts, shortFor } from './shorts.ts';

const LONG = 'https://tommie-jp.github.io/tommie-fence/#breadboard/dGl0bGU6IOWbszAx';
const SHORT = 'https://s.tommie.jp/fence/bread/01-led';

describe('parseShorts', () => {
  test('行き先 → 短縮リンクの表にする', () => {
    // Arrange / Act
    const table = parseShorts({ [LONG]: SHORT });

    // Assert
    expect(table.get(LONG)).toBe(SHORT);
  });

  /** 外から来たものなので、形の合わない行は落とす (黙って使わない)。 */
  test('https でない値は落とす', () => {
    const table = parseShorts({ [LONG]: 'javascript:alert(1)', b: 'http://s/x', c: 7 });

    expect(table.size).toBe(0);
  });

  test('読めなければ空の表 (頁は長い URL のまま動く)', () => {
    expect(parseShorts(null).size).toBe(0);
    expect(parseShorts([LONG]).size).toBe(0);
    expect(parseShorts('やあ').size).toBe(0);
  });
});

describe('shortFor', () => {
  const table = parseShorts({ [LONG]: SHORT });

  test('表にあれば短縮リンクを返す', () => {
    expect(shortFor(LONG, table)).toBe(SHORT);
  });

  /** `?dev` は頁の都合で、図の中身ではない。同じ図は同じ鍵で引く。 */
  test('問い合わせが付いていても引ける', () => {
    const asked = 'https://tommie-jp.github.io/tommie-fence/?dev#breadboard/dGl0bGU6IOWbszAx';

    expect(shortFor(asked, table)).toBe(SHORT);
  });

  test('表に無ければ null (長いまま出す)', () => {
    expect(shortFor('https://tommie-jp.github.io/tommie-fence/#circuit/xxxx', table)).toBeNull();
  });

  /** 元がもともと短ければ入れ替える意味がない。 */
  test('短くならないなら null', () => {
    const same = parseShorts({ 'https://a.jp/x': 'https://s.tommie.jp/fence/very/long/name' });

    expect(shortFor('https://a.jp/x', same)).toBeNull();
  });
});
