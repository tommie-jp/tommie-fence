import { describe, expect, test } from 'vitest';
import { compileCircuit } from './index.ts';

/**
 * 想定どおりのお知らせ (`expect:`。52 の docs/145)。circuit は ERC を check でしか走らせないので、
 * **ERC を走らせないときは、当たらない承知を古びたと言わない**。
 */
/** 片方だけつないだ抵抗。ERC が `R1.2` を言う (model/erc.test.ts と同じ形)。 */
const OPEN = [
  'parts:',
  '  IN: port 1,1',
  '  G1: ground 1,3',
  '  R1: resistor 1,1 3,1 1k',
  'wires:',
  '  - 1,1 -- 1,3',
  'expect:',
  '  - match: R1.2',
  '    why: 片側を開けた見本',
  '',
].join('\n');

describe('compileCircuit の expect:', () => {
  test('知らないキーとは言わない', () => {
    expect(compileCircuit(OPEN).errors).toEqual([]);
  });

  test('ERC を走らせないときは、当たらない承知を言わない', () => {
    expect(compileCircuit(OPEN).notices.some((one) => one.message.includes('expect:'))).toBe(false);
  });

  test('ERC を走らせたときは、当たった ERC に理由を付ける', () => {
    const { erc, notices } = compileCircuit(OPEN, { erc: true });

    expect(erc.map((one) => one.message)).toEqual([expect.stringMatching(/^\[想定どおり: 片側を開けた見本\] .*R1\.2/)]);
    expect(notices.some((one) => one.message.includes('expect:'))).toBe(false);
  });

  test('ERC を走らせて当たらなければ、その行でお知らせになる', () => {
    const { notices } = compileCircuit(OPEN.replace('R1.2', 'R9.9'), { erc: true });

    expect(notices.find((one) => one.message.includes('出ていません'))?.line).toBe(8);
  });
});
