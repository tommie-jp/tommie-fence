import { describe, expect, test } from 'vitest';
import { buildCircuit } from './circuit.ts';
import { computeNets } from './nets.ts';
import { checkErc } from './erc.ts';
import { parseFence } from '../parser/parseFence.ts';

const noticesOf = (...rows: string[]): readonly string[] => {
  const { doc } = parseFence(`${rows.join('\n')}\n`);
  if (doc === null) throw new Error('YAML を読めませんでした');
  const { circuit } = buildCircuit(doc);
  return checkErc(circuit, computeNets(circuit)).map((one) => one.message);
};

describe('checkErc', () => {
  test('says nothing about a circuit whose every leg is wired', () => {
    expect(noticesOf(
      'parts:',
      '  IN: port a1',
      '  R1: resistor a1 a3 1k',
      '  G1: ground a3',
    )).toEqual([]);
  });

  test('points at a leg that reaches nothing', () => {
    // 片方だけつないだ抵抗。図としては描けるが、組んでも回路にならない。
    const found = noticesOf(
      'parts:',
      '  IN: port a1',
      '  G1: ground c1',
      '  R1: resistor a1 a3 1k',
      'wires:',
      '  - a1 -- c1',
    );

    expect(found).toHaveLength(1);
    expect(found[0]).toContain('R1.2');
  });

  test('says nothing at all about a figure with no wire, which is a symbol chart', () => {
    // 記号を並べた図や、部品 1 つを見せる図は端が開いていて当たり前。
    // そこで叱ると、正しい図が毎回叱られて帯を読まなくなる。
    expect(noticesOf('parts:', '  R1: resistor a1 a3 10k')).toEqual([]);
  });

  test('points at the legs of a many-legged part that no wire names', () => {
    // トランジスタは 3 本とも要る。指さない足は、書き忘れか置き忘れ。
    const found = noticesOf(
      'parts:',
      '  IN: port a3',
      '  Q1: npn c3',
      'wires:',
      '  - a3 -| Q1.B',
    );

    expect(found).toHaveLength(1);
    expect(found[0]).toContain('Q1');
    expect(found[0]).toContain('C');
  });

  test('leaves the spare legs of a package alone', () => {
    // DIP の余った足は普通のこと。どのピンを使うかは型番の話で、
    // 種類名からは決まらない (`dip8` に 8 本つなげとは言えない)。
    expect(noticesOf(
      'parts:',
      '  IN: port a3',
      '  U1: dip8 c3',
      'wires:',
      '  - a3 -| U1.1',
    )).toEqual([]);
  });

  test('leaves a leg alone once a wire runs to it, even if the wire ends nowhere', () => {
    // 交点まで線を引いて終える書き方は、記号の足を見せる図がそうしている
    // (文法リファレンスの記号表)。線が引いてあるのは「ここまでは意図した」印。
    const found = noticesOf('parts:', '  Q1: npn c3', 'wires:', '  - a3 -| Q1.B');

    expect(found.some((one) => one.includes('Q1.base'))).toBe(false);
    // 指されていない足は今までどおり言う。
    expect(found.some((one) => one.includes('Q1 の足'))).toBe(true);
  });

  test('points at a part whose two legs land in one net', () => {
    // 抵抗を入れたつもりが、線で跨いでいる。
    const found = noticesOf(
      'parts:',
      '  IN: port a1',
      '  R1: resistor a1 a3 1k',
      '  G1: ground a3',
      'wires:',
      '  - a1 -- a3',
    );

    expect(found.some((one) => one.includes('R1') && one.includes('短絡'))).toBe(true);
  });

  test('points at a wire that touches no leg at all', () => {
    const found = noticesOf(
      'parts:',
      '  IN: port a1',
      '  R1: resistor a1 a3 1k',
      '  G1: ground a3',
      'wires:',
      '  - e1 -- e3',
    );

    expect(found.some((one) => one.includes('e1') && one.includes('e3'))).toBe(true);
  });

  test('leaves a named point alone, because naming it says the signal leaves here', () => {
    // `points:` で名前を付けたのは「ここから出入りする」という意思表示。
    // つなぎ忘れと言うと、正しい図が毎回叱られる。
    expect(noticesOf(
      'points:',
      '  vout: a3',
      'parts:',
      '  IN: port a1',
      '  R1: resistor a1 vout 1k',
    )).toEqual([]);
  });
});
