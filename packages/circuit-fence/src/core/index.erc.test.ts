import { describe, expect, test } from 'vitest';
import { compileCircuit } from './index.ts';

/**
 * **ERC は `notices` に混ぜず、`erc` として別に返す** (52 の docs/55)。
 *
 * 帯の「検査 N」の釦が ERC だけを畳めるようにするため。混ざったままだと、
 * 畳む側が文面で見分けることになる (どちらも「読めたが思ったとおりに出ない」)。
 * CLI と図の下の帯は `[...notices, ...erc]` で今までどおり。
 */

/** 片方しかつないでいない抵抗。図は描けるが、組んでも回路にならない。 */
const LOOSE = ['parts:', '  IN: port a1', '  R1: resistor a1 a3 1k', 'wires:', '  - a1 -- a3', ''].join('\n');

describe('compileCircuit の erc', () => {
  test('頼まれたら ERC を erc で返す', () => {
    const { erc } = compileCircuit(LOOSE, { erc: true });

    expect(erc.length).toBeGreaterThan(0);
  });

  test('ERC は notices に混ざらない', () => {
    const { notices, erc } = compileCircuit(LOOSE, { erc: true });

    expect(erc.length).toBeGreaterThan(0);
    for (const one of erc) expect(notices).not.toContain(one);
  });

  test('頼まなければ数えない', () => {
    expect(compileCircuit(LOOSE).erc).toEqual([]);
  });

  // **`check: off` は ERC にも効く。** 書いた人が検査を外したのだから、
  // 別の名前の検査だけ生き残るのは筋が通らない。
  test('check: off の図では、頼まれても数えない', () => {
    const off = `${LOOSE}style:\n  check: off\n`;

    expect(compileCircuit(off, { erc: true }).erc).toEqual([]);
  });

  test('図が 1 枚も組めないときも erc はある (空)', () => {
    expect(compileCircuit('parts:\n  R1: [unclosed\n', { erc: true }).erc).toEqual([]);
  });
});
