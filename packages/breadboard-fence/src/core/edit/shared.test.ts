import { describe, expect, test } from 'vitest';
import { parseAddress } from '../model/address.ts';
import type { Address } from '../types.ts';
import { addressTokensOn, applyEdits, locateTokens } from './shared.ts';

const at = (text: string): Address => {
  const address = parseAddress(text);
  if (address === null) throw new Error(`番地ではありません: ${text}`);
  return address;
};

const NO_POINTS = new Map<string, Address>();

describe('locateTokens', () => {
  test('finds the holes of a part, in the order they are written', () => {
    const found = locateTokens('  R1: resistor a5 a10 330', [at('a5'), at('a10')], NO_POINTS);

    expect(found?.tokens).toEqual([{ column: 15, length: 2 }, { column: 18, length: 3 }]);
  });

  test('leaves the key alone, since a name can read as an address', () => {
    // `C1` は番地 `c1` としても読める。鍵を書き換えると部品ごと改名になる。
    const found = locateTokens('  C1: capacitor c1 c5', [at('c1'), at('c5')], NO_POINTS);

    expect(found?.tokens[0]?.column).toBe(16);
  });

  test('finds the address inside a tagged hole, leaving the tag alone', () => {
    // `b12(A)` の `(A)` は極性の印。番地だけを書き換える。
    const found = locateTokens('  D1: led b12(A) b13(K) red', [at('b12'), at('b13')], NO_POINTS);

    expect(found?.tokens).toEqual([{ column: 10, length: 3 }, { column: 17, length: 3 }]);
  });

  test('finds the one hole a DIP is placed by', () => {
    const found = locateTokens('  U1: dip8 @ e5 NJM4556A', [at('e5')], NO_POINTS);

    expect(found?.tokens).toEqual([{ column: 13, length: 2 }]);
  });

  test('finds a rail address', () => {
    const found = locateTokens('  R1: resistor +t5 a5', [at('+t5'), at('a5')], NO_POINTS);

    expect(found?.tokens).toEqual([{ column: 15, length: 3 }, { column: 19, length: 2 }]);
  });

  test('follows a name that points: gave a hole', () => {
    const points = new Map([['vin', at('a5')]]);
    const found = locateTokens('  R1: resistor vin a10', [at('a5'), at('a10')], points);

    expect(found?.tokens[0]).toEqual({ column: 15, length: 3 });
  });

  test('gives up rather than half-finding, which would break the drawing', () => {
    expect(locateTokens('  R1: resistor a5 a10', [at('a5'), at('b9')], NO_POINTS)).toBeNull();
  });

  test('stops at a comment, so a value in it is not mistaken for a hole', () => {
    expect(locateTokens('  R1: resistor a5 a10 # b3 も試した', [at('a5'), at('b3')], NO_POINTS)).toBeNull();
  });

  test('starts from where the last part stopped, for a flow line', () => {
    const line = '  {R1: r a1 a3, R2: r a5 a7}';
    const first = locateTokens(line, [at('a1'), at('a3')], NO_POINTS);
    const second = locateTokens(line, [at('a5'), at('a7')], NO_POINTS, first?.end ?? 0);

    expect(second?.tokens[0]?.column).toBeGreaterThan(first?.end ?? 0);
  });
});

describe('addressTokensOn', () => {
  test('finds every endpoint of a wire line', () => {
    const found = addressTokensOn('  - a10 -- b12 -- b20 red');

    expect(found.map((token) => token.column)).toEqual([4, 11, 18]);
  });

  test('finds endpoints written without spaces', () => {
    expect(addressTokensOn('  - a10--b12').map((token) => token.column)).toEqual([4, 9]);
  });

  test('leaves the colour and the hints alone', () => {
    // 色も迂回ヒントも番地ではない。拾うと配線の意味が変わる。
    const found = addressTokensOn('  - j20 -- -b20 black [v-20, h30]');

    expect(found).toHaveLength(2);
  });

  test('finds a rail endpoint, which starts with a sign', () => {
    expect(addressTokensOn('  - +t5 -- a5').map((token) => token.column)).toEqual([4, 11]);
  });

  test('counts a name only when asked, since names come along on their own', () => {
    const points = new Map([['vin', at('a5')]]);

    expect(addressTokensOn('  - vin -- a10')).toHaveLength(1);
    expect(addressTokensOn('  - vin -- a10', points)).toHaveLength(2);
  });
});

describe('applyEdits', () => {
  test('replaces from the right, so earlier columns do not shift', () => {
    const source = 'parts:\n  R1: resistor a9 b9 10k\n';
    const edits = [
      { line: 2, column: 15, length: 2, text: 'a10' },
      { line: 2, column: 18, length: 2, text: 'b10' },
    ];

    expect(applyEdits(source, edits)).toContain('resistor a10 b10 10k');
  });

  test('leaves everything else exactly as written', () => {
    const source = 'parts:\n  # 手で書いた覚え\n  R1: resistor a5 a10 330\n';

    expect(applyEdits(source, [{ line: 3, column: 15, length: 2, text: 'b5' }]))
      .toBe('parts:\n  # 手で書いた覚え\n  R1: resistor b5 a10 330\n');
  });
});
