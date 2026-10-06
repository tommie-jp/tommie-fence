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
      '  IN: port 1,1',
      '  R1: resistor 1,1 3,1 1k',
      '  G1: ground 3,1',
    )).toEqual([]);
  });

  test('points at a leg that reaches nothing', () => {
    // 片方だけつないだ抵抗。図としては描けるが、組んでも回路にならない。
    const found = noticesOf(
      'parts:',
      '  IN: port 1,1',
      '  G1: ground 1,3',
      '  R1: resistor 1,1 3,1 1k',
      'wires:',
      '  - 1,1 -- 1,3',
    );

    expect(found).toHaveLength(1);
    expect(found[0]).toContain('R1.2');
  });

  test('says nothing at all about a figure with no wire, which is a symbol chart', () => {
    // 記号を並べた図や、部品 1 つを見せる図は端が開いていて当たり前。
    // そこで叱ると、正しい図が毎回叱られて帯を読まなくなる。
    expect(noticesOf('parts:', '  R1: resistor 1,1 3,1 10k')).toEqual([]);
  });

  test('points at the legs of a many-legged part that no wire names', () => {
    // トランジスタは 3 本とも要る。指さないピンは、書き忘れか置き忘れ。
    const found = noticesOf(
      'parts:',
      '  IN: port 3,1',
      '  Q1: npn 3,3',
      'wires:',
      '  - 3,1 -| Q1.B',
    );

    expect(found).toHaveLength(1);
    expect(found[0]).toContain('Q1');
    expect(found[0]).toContain('C');
  });

  test('leaves the spare legs of a package alone', () => {
    // DIP の余ったピンは普通のこと。どのピンを使うかは型番の話で、
    // 種類名からは決まらない (`dip8` に 8 本つなげとは言えない)。
    expect(noticesOf(
      'parts:',
      '  IN: port 3,1',
      '  U1: dip8 3,3',
      'wires:',
      '  - 3,1 -| U1.1',
    )).toEqual([]);
  });

  test('leaves a leg alone once a wire runs to it, even if the wire ends nowhere', () => {
    // 交点まで線を引いて終える書き方は、記号のピンを見せる図がそうしている
    // (文法リファレンスの記号表)。線が引いてあるのは「ここまでは意図した」印。
    const found = noticesOf('parts:', '  Q1: npn 3,3', 'wires:', '  - 3,1 -| Q1.B');

    expect(found.some((one) => one.includes('Q1.base'))).toBe(false);
    // 指されていないピンは今までどおり言う。
    expect(found.some((one) => one.includes('Q1 のピン'))).toBe(true);
  });

  test('points at a part whose two legs land in one net', () => {
    // 抵抗を入れたつもりが、線で跨いでいる。
    const found = noticesOf(
      'parts:',
      '  IN: port 1,1',
      '  R1: resistor 1,1 3,1 1k',
      '  G1: ground 3,1',
      'wires:',
      '  - 1,1 -- 3,1',
    );

    expect(found.some((one) => one.includes('R1') && one.includes('短絡'))).toBe(true);
  });

  test('points at a wire that touches no leg at all', () => {
    const found = noticesOf(
      'parts:',
      '  IN: port 1,1',
      '  R1: resistor 1,1 3,1 1k',
      '  G1: ground 3,1',
      'wires:',
      '  - 1,5 -- 3,5',
    );

    expect(found.some((one) => one.includes('1,5') && one.includes('3,5'))).toBe(true);
  });

  test('leaves a named point alone, because naming it says the signal leaves here', () => {
    // `points:` で名前を付けたのは「ここから出入りする」という意思表示。
    // つなぎ忘れと言うと、正しい図が毎回叱られる。
    expect(noticesOf(
      'points:',
      '  vout: 3,1',
      'parts:',
      '  IN: port 1,1',
      '  R1: resistor 1,1 vout 1k',
    )).toEqual([]);
  });
});
