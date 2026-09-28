import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pinoutModels } from 'fence-kit';
import { describe, expect, test } from 'vitest';
import { renderPerfboard } from './index.ts';

/**
 * DIP の足の名前 (52 の docs/95 の段 3)。**型番が fence-kit の足の名前の表にあれば**、
 * 胴に番号と名前を 2 段で刷り、ネットリストは名前で出る (回路図・ブレッドボードと同じ)。
 * この板の配線は穴どうしを結ぶので、足を名前で指す書き方は無い。
 */

const fence = (...lines: string[]): string => ['board: 20x10', ...lines, ''].join('\n');

const texts = (svg: string): string[] => [...svg.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map(([, text]) => text ?? '');

describe('ネットリスト', () => {
  test('lists the pins of a model in the table by their printed names', () => {
    const { errors, netlist } = renderPerfboard(fence('parts:', '  U1: dip8 c3 NE555'));

    expect(errors).toEqual([]);
    const refs = netlist.flatMap((net) => net.refs);
    expect(refs).toEqual(expect.arrayContaining(['U1.GND', 'U1.TRIG', 'U1.VCC']));
    expect(refs.some((ref) => /^U1\.\d+$/.test(ref))).toBe(false);
  });

  test('calls a pin with a shared printed name (NC) by its number', () => {
    const refs = renderPerfboard(fence('parts:', '  U1: dip8 c3 TL071')).netlist.flatMap((net) => net.refs);

    expect(refs).toEqual(expect.arrayContaining(['U1.1', 'U1.IN-', 'U1.5', 'U1.8']));
    expect(refs).not.toContain('U1.NC');
  });

  test('lists the pins of the 74HC595, CD4511B and CD74HC283 by their names', () => {
    for (const [model, names] of [['74HC595', ["U1.QH'", 'U1.SRCLR', 'U1.OE']], ['CD4511B', ['U1.INA', 'U1.Oa', 'U1.LE/STROBE']], ['CD74HC283', ['U1.CIN', 'U1.COUT']]] as const) {
      const { errors, netlist } = renderPerfboard(fence('parts:', `  U1: dip16 c3 ${model}`));
      expect(errors, model).toEqual([]);
      expect(netlist.flatMap((net) => net.refs), model).toEqual(expect.arrayContaining([...names]));
    }
  });

  test('keeps the numbers for an unknown model, says so, and says nothing when no model is written', () => {
    const unknown = renderPerfboard(fence('parts:', '  U1: dip8 c3 LM741'));

    expect(unknown.netlist.flatMap((net) => net.refs)).toContain('U1.2');
    const said = unknown.notices.map((one) => one.message).join('\n');
    expect(said).toContain('LM741');
    expect(said).toContain('NE555');
    expect(renderPerfboard(fence('parts:', '  U1: dip8 c3')).notices).toEqual([]);
  });
});

describe('絵', () => {
  test('prints the numbers and the names on the body, turned or not', () => {
    for (const turn of ['', ' r90', ' r180', ' r270']) {
      const shown = texts(renderPerfboard(fence('parts:', `  U1: dip8 e6${turn} NE555`)).svg);
      expect(shown, turn).toEqual(expect.arrayContaining(['1', '8', 'GND', 'TRIG', 'VCC']));
    }
  });

  test('prints only the numbers for a model not in the table', () => {
    const shown = texts(renderPerfboard(fence('parts:', '  U1: dip8 c3 LM741')).svg);
    expect(shown).not.toContain('GND');
  });

  test('prints the numbers on a relay as well as its names', () => {
    const shown = texts(renderPerfboard(fence('parts:', '  K1: relay c3')).svg);
    expect(shown).toEqual(expect.arrayContaining(['COM1', '4', '16']));
  });
});

describe('docs/01-syntax.md', () => {
  test('names every model in the table of DIP pin names', () => {
    const syntax = readFileSync(fileURLToPath(new URL('../../docs/01-syntax.md', import.meta.url)), 'utf8');
    expect(pinoutModels().filter((model) => !syntax.includes(`\`${model}\``))).toEqual([]);
  });
});
