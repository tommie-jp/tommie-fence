import { describe, expect, test } from 'vitest';
import { renderBreadboard } from './index.ts';

/**
 * 面実装 (52 の docs/64)。**この板が受け取るのは変換基板に載せた姿だけ**
 * (`transistor/sot346-dip`、`dip8/sop`)。直付けの姿はユニバーサル基板のもので、
 * 断るときは理由と書き直し先を言う。
 */

const fence = (...lines: string[]): string => ['board: half', ...lines, ''].join('\n');

const errorsOf = (...lines: string[]): string =>
  renderBreadboard(fence(...lines)).errors.map((one) => one.message).join('\n');

describe('変換基板', () => {
  test('draws S-Mini on an adapter, different from SOT-23', () => {
    const drawn = (look: string) => renderBreadboard(fence('parts:', `  Q1: transistor/${look} f3(B) f4(E) f5(C) 2SC2712`));
    const smini = drawn('sot346-dip');
    expect(smini.errors).toEqual([]);
    expect(smini.svg).not.toBe(drawn('sot23-dip').svg);
    expect(smini.svg).not.toBe(drawn('sot89-dip').svg);
  });

  test('draws an SOP on a DIP adapter, wired the same as the DIP', () => {
    const adapter = renderBreadboard(fence('parts:', '  U1: dip8/sop @ e10 NJM4580'));
    const plain = renderBreadboard(fence('parts:', '  U1: dip8 @ e10 NJM4580'));
    expect(adapter.errors).toEqual([]);
    expect(adapter.svg).toContain('#1f6b45');
    expect(adapter.svg).not.toBe(plain.svg);
    expect(adapter.netlist).toEqual(plain.netlist);
  });

  test('turns the adapter the way it turns the DIP', () => {
    expect(errorsOf('parts:', '  U1: dip8/tssop @ e10 r180')).toBe('');
  });
});

describe('直付けの姿を断る', () => {
  test('says a chip cannot go into a breadboard, and where it can', () => {
    const said = errorsOf('parts:', '  R1: resistor/2012 a3 a4 10k');
    expect(said).toContain('R1: 2012 は面実装なので、ブレッドボードには挿せません');
    expect(said).toContain('perfboard');
  });

  test('points a bare SOT at its adapter', () => {
    expect(errorsOf('parts:', '  Q1: transistor/sot346 f3 f4 f5')).toContain('transistor/sot346-dip と書きます');
  });

  test('points the other names at the adapter spelling', () => {
    expect(errorsOf('parts:', '  Q1: transistor/s-mini f3 f4 f5')).toContain('s-mini は sot346-dip と書きます');
  });

  test('refuses a look the part does not come in', () => {
    const said = errorsOf('parts:', '  U1: sip8/sop @ a3');
    expect(said).toContain('姿は選べません');
    // `dipN` は正規表現で読む種類だが、姿を選べる種類として名前を挙げる。
    expect(said).toContain('dipN');
  });

  test('does not send a look to the perfboard when the perfboard refuses it too', () => {
    // `2012` は抵抗・コンデンサ・LED の大きさで、ダイオードには無い。
    for (const line of ['  D1: diode/2012 a3 a4', '  U1: regulator/sot346 f3 f4 f5']) {
      const said = errorsOf('parts:', line);
      expect(said, line).toContain('知らない姿です');
      expect(said, line).not.toContain('perfboard');
    }
  });
});
