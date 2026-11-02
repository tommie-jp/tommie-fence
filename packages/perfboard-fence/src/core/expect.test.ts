import { describe, expect, test } from 'vitest';
import { renderPerfboard } from './index.ts';

/**
 * 想定どおりのお知らせ (`expect:`。52 の docs/145)。黙らせずに `[想定どおり: 理由]` と言い分け、
 * 当たらない承知はお知らせで言う。読み方と当て方は fence-kit (expect.test.ts) が見るので、
 * ここでは**フェンスの道筋 (知らないキーと言わない・ERC にも当たる・行) **を見る。
 */
const OVERLAP = ['board: 12x7', 'parts:', '  R1: resistor b2 b6 1k', '  R2: resistor b3 b7 1k'];
const EXPECT = ['expect:', '  - match: 重なって', '    why: 見本'];

describe('renderPerfboard の expect:', () => {
  test('当たったお知らせと ERC に理由を付け、知らないキーとは言わない', () => {
    const { errors, notices, erc } = renderPerfboard([...OVERLAP, ...EXPECT, '  - match: つながっていません', '    why: 配線は書かない', ''].join('\n'));

    expect(errors).toEqual([]);
    expect(notices.find((one) => one.message.includes('重なって'))?.message).toMatch(/^\[想定どおり: 見本\] /);
    expect(erc.every((one) => one.expected === '配線は書かない')).toBe(true);
  });

  test('当たらない承知は、その項目の行 (Markdown の行) でお知らせになる', () => {
    const { notices } = renderPerfboard(['board: 12x7', 'parts:', '  R1: resistor b2 b6 1k', ...EXPECT, ''].join('\n'), { offset: 10 });

    const stale = notices.find((one) => one.message.includes('出ていません'));
    expect(stale?.line).toBe(15);
  });

  test('トロイダルの L の目安は情報の段で出る', () => {
    const { notices } = renderPerfboard(['board: 12x7', 'parts:', '  L1: inductor/toroid b2 b8 FT37-43 10t', ''].join('\n'));

    const info = notices.find((one) => one.message.includes('µH'));
    expect(info?.info).toBe(true);
    expect(info?.message).toMatch(/^\[情報\] L1: /);
  });

  test('複数の基板では図全体の expect: を全部の枚に当てる', () => {
    const source = [
      'sheets:',
      '  - board: 12x7',
      '    parts:',
      '      R1: resistor b2 b6 1k',
      '      R2: resistor b3 b7 1k',
      '  - board: 12x7',
      '    parts:',
      '      R3: resistor b2 b6 1k',
      ...EXPECT,
      '',
    ].join('\n');
    const { notices } = renderPerfboard(source);

    expect(notices.some((one) => one.message.startsWith('[想定どおり: 見本]'))).toBe(true);
    expect(notices.some((one) => one.message.includes('出ていません'))).toBe(false);
  });
});
