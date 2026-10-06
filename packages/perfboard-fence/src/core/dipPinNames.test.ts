import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { VERIFY_NOTES, discreteModels, pinoutModels } from 'fence-kit';
import { describe, expect, test } from 'vitest';
import { renderPerfboard } from './index.ts';

/**
 * DIP のピンの名前 (52 の docs/95 の段 3)。**型番が fence-kit のピンの名前の表にあれば**、
 * 胴に番号と名前を 2 段で刷り、ネットリストは名前で出る (回路図・ブレッドボードと同じ)。
 * この基板の配線は穴どうしを結ぶので、ピンを名前で指す書き方は無い。
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

  test('lists the pins of the ULN2003A by their names', () => {
    const { errors, netlist } = renderPerfboard(fence('parts:', '  U1: dip16 c3 ULN2003A'));
    expect(errors).toEqual([]);
    expect(netlist.flatMap((net) => net.refs)).toEqual(expect.arrayContaining(['U1.1B', 'U1.GND', 'U1.COM', 'U1.7C', 'U1.1C']));
  });

  test('lists the pins of the 3SK291 by name on a two column board (dip4) and a one column board (sip4)', () => {
    for (const type of ['dip4', 'sip4']) {
      const { errors, netlist } = renderPerfboard(fence('parts:', `  Q1: ${type} c3 3SK291`));

      expect(errors, type).toEqual([]);
      expect(netlist.flatMap((net) => net.refs), type).toEqual(expect.arrayContaining(['Q1.G1', 'Q1.G2', 'Q1.D', 'Q1.S']));
    }
  });

  test('prints the names of a one column header on the board', () => {
    const shown = texts(renderPerfboard(fence('parts:', '  Q1: sip4 c3 3SK291')).svg);

    expect(shown).toEqual(expect.arrayContaining(['G1', 'G2', 'D', 'S']));
  });

  test('leaves a one column header of an unknown model on its numbers', () => {
    const refs = renderPerfboard(fence('parts:', '  J1: sip4 c3 OLED')).netlist.flatMap((net) => net.refs);

    expect(refs).toEqual(expect.arrayContaining(['J1.1', 'J1.4']));
  });

  test('keeps the numbers for an unknown model, says so, and says nothing when no model is written', () => {
    const unknown = renderPerfboard(fence('parts:', '  U1: dip8 c3 LM9999'));

    expect(unknown.netlist.flatMap((net) => net.refs)).toContain('U1.2');
    const said = unknown.notices.map((one) => one.message).join('\n');
    expect(said).toContain('LM9999');
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

  test('prints the names inside the body, where no wire leaving a pin runs across them', () => {
    const svg = renderPerfboard(fence('parts:', '  U1: dip8 e6 NE555', '  K1: relay e11', 'wires:', '  - h6 -- j6', '  - h13 -- j13')).svg;
    const drawn = [...svg.matchAll(/<text x="([-\d.]+)" y="([-\d.]+)"(?![^>]*aria-hidden)[^>]*>([^<]*)<\/text>/g)]
      .map(([, x, y, text]) => ({ x: Number(x), y: Number(y), text }));
    const name = (text: string) => drawn.find((one) => one.text === text)!;
    // 名前と同じ x の番号 (軸の番号は x が違うか、基板の外)。
    const number = (text: string, x: number) => drawn.filter((one) => one.text === text && one.x === x).at(-1)!;
    // 1 番 (h6) は下の列。名前は番号より上 (胴の中)。
    for (const [text, low] of [['GND', '1'], ['COM1', '4']] as const) {
      const at = name(text);
      expect(at.y, text).toBeLessThan(number(low, at.x).y);
      expect(at.y - number(low, at.x).y, text).toBeGreaterThan(-20);
    }
    expect(svg).not.toMatch(/aria-hidden="true"[^>]*>(GND|COM1)</);
  });

  test('prints only the numbers for a model not in the table', () => {
    const shown = texts(renderPerfboard(fence('parts:', '  U1: dip8 c3 LM9999')).svg);
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

  test('names every model in the table of 3 pin transistors and regulators', () => {
    const syntax = readFileSync(fileURLToPath(new URL('../../docs/01-syntax.md', import.meta.url)), 'utf8');
    expect(discreteModels().filter((model) => !syntax.includes(`\`${model}\``))).toEqual([]);
  });

  test('asks to check the real part wherever the datasheets disagree (2N7000, 2SD882)', () => {
    const syntax = readFileSync(fileURLToPath(new URL('../../docs/01-syntax.md', import.meta.url)), 'utf8');
    expect(Object.values(VERIFY_NOTES).filter((sentence) => !syntax.includes(sentence))).toEqual([]);
  });
});
