import { describe, expect, test } from 'vitest';
import { buildCircuit } from './model/circuit.ts';
import { parseFence } from './parser/parseFence.ts';

/**
 * 3 ピンのディスクリートの型番 (52 の docs/117)。回路図の記号はピンの名前を決めているので、
 * 型番の極性が記号と食い違うときだけお知らせを出す。図は書かれた記号のまま。
 */

const notices = (...rows: string[]): readonly string[] => {
  const { doc } = parseFence(`${['parts:', ...rows].join('\n')}\n`);
  if (doc === null) throw new Error('YAML を読めませんでした');
  return buildCircuit(doc).notices.map((notice) => notice.message);
};

describe('記号と型番の極性', () => {
  test('stays quiet when the symbol matches the model', () => {
    expect(notices('  Q1: npn b3 2SC1815', '  Q2: pnp b6 2SA1015', '  Q3: njfet b9 2SK170', '  Q4: nmos b12 2N7000')).toEqual([]);
  });

  test('says so when a PNP model is drawn with the NPN symbol', () => {
    const [notice] = notices('  Q1: npn b3 2SA1015');
    expect(notice).toContain('2SA1015');
    expect(notice).toContain('PNP');
  });

  test('says so when a JFET model is drawn as a MOSFET', () => {
    expect(notices('  Q1: nmos b3 2SK170')).toHaveLength(1);
  });

  test('stays quiet for an unknown model and for a part without one', () => {
    expect(notices('  Q1: npn b3 BC547', '  Q2: npn b6')).toEqual([]);
  });
});
