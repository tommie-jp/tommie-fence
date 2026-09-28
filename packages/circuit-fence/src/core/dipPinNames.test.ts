import { describe, expect, test } from 'vitest';
import { compileCircuit } from './index.ts';
import { gridMap } from './edit/map.ts';
import { lookupPin, partTypeOf, pinHint } from './parts.ts';
import { parseFence } from './parser/parseFence.ts';

/**
 * DIP の足の名前 (52 の docs/95 の段 2)。**型番が fence-kit の足の名前の表にあれば**、
 * 箱の中に名前と番号を刷り (Pico と同じ道)、名前でも番号でも指せる。
 * 表に無い型番は今までどおり番号だけで、お知らせを出す。
 */

const circuit = (...rows: string[]): string => [...rows, ''].join('\n');

const typeOf = (line: string) => {
  const part = parseFence(circuit('parts:', `  ${line}`)).doc.parts[0];
  return part === undefined ? null : partTypeOf(part);
};

describe('種類', () => {
  test('names the pins of a DIP whose model is in the table, and still takes the numbers', () => {
    const timer = typeOf('U1: dip8 c2 NE555')!;

    expect(timer.pinLabels).toEqual(['GND', 'TRIG', 'OUT', 'RESET', 'CONT', 'THRES', 'DISCH', 'VCC']);
    expect(timer.pinNumbers).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(lookupPin(timer, 'TRIG')).toBe(lookupPin(timer, '2'));
    expect(lookupPin(timer, 'trig')).toBe('pin 2');
    expect(lookupPin(timer, 'VCC')).toBe('pin 8');
  });

  test('pads the numbers to the width of the largest one, as the Pico does', () => {
    expect(typeOf('U1: dip16 c2 CD4017B')?.pinNumbers?.slice(0, 2)).toEqual(['01', '02']);
  });

  test('keeps a number a number even when a name could be read as one', () => {
    const counter = typeOf('U1: dip16 c2 CD4017B')!;

    // 5 番の足は Q6。出力 Q5 は 1 番。
    expect(lookupPin(counter, '5')).toBe('pin 5');
    expect(lookupPin(counter, 'Q5')).toBe('pin 1');
  });

  test('does not take a name printed on more than one pin (TL071 NC)', () => {
    const amp = typeOf('U1: dip8 c2 TL071')!;

    expect(lookupPin(amp, 'NC')).toBeNull();
    expect(lookupPin(amp, '1')).toBe('pin 1');
    expect(lookupPin(amp, 'IN-')).toBe('pin 2');
    expect(pinHint(amp)).toContain('1〜8');
    expect(pinHint(amp)).toContain('IN-');
    expect(pinHint(amp)).not.toContain('NC');
  });

  test('draws only numbers for a model not in the table, for a count that does not match and for no model', () => {
    for (const line of ['U1: dip8 c2 LM741', 'U1: dip14 c2 NE555', 'U1: dip8 c2']) {
      const type = typeOf(line)!;
      expect(type.pinLabels).toBeUndefined();
      expect(type.options).not.toContain('hide numbers');
    }
  });

  test('hides the numbers circuitikz would print and widens the box for the names', () => {
    const named = typeOf('U1: dip8 c2 NE555')!;
    const plain = typeOf('U1: dip8 c2')!;

    expect(named.options).toContain('hide numbers');
    expect(named.options?.some((option) => option.includes('dipchip/width='))).toBe(true);
    expect(plain.options).not.toContain('hide numbers');
    // 反転は今の dipN と同じく断る (板が裏返しを断るので、突き合わせられない)。
    expect(named.orient).toEqual(plain.orient);
  });
});

describe('箱の幅', () => {
  const widthOf = (line: string): number =>
    Number(/dipchip\/width=([\d.]+)/.exec(typeOf(line)?.options?.join(' ') ?? '')?.[1] ?? 0);

  test('grows with the longest name and leaves room for the part number when lying down', () => {
    expect(widthOf('U1: dip16 c2 CD4017B')).toBeGreaterThan(widthOf('U1: dip14 c2 CD4071B'));
    expect(widthOf('U1: dip8 c2 NE555 r90')).toBeGreaterThan(widthOf('U1: dip8 c2 NE555'));
    expect(widthOf('U1: dip8 c2 NE555 r270')).toBe(widthOf('U1: dip8 c2 NE555 r90'));
    expect(widthOf('U1: dip8 c2 NE555 r180')).toBe(widthOf('U1: dip8 c2 NE555'));
  });
});

describe('図とネットリスト', () => {
  const timer = circuit(
    'parts:',
    '  U1: dip8 c4 NE555',
    '  R1: resistor a1 a3 10k',
    '  C1: capacitor e1 e3 10n',
    'wires:',
    '  - a3 |- U1.TRIG',
    '  - e3 |- U1.4',
  );

  test('wires to a pin by its name and lists it by its name', () => {
    const result = compileCircuit(timer);

    expect(result.errors).toEqual([]);
    const refs = result.netlist.flatMap((net) => net.refs);
    expect(refs).toContain('U1.TRIG');
    expect(refs).toContain('U1.RESET');
    expect(refs.some((ref) => /^U1\.\d+$/.test(ref))).toBe(false);
  });

  test('prints the name and the number on each pin, the number at the outer end', () => {
    const result = compileCircuit(timer);
    const texts = result.notes.map((note) => note.text);

    expect(texts).toContain('1 GND');
    expect(texts).toContain('VCC 8');
    expect(result.tex).toContain('hide numbers');
  });

  test('writes the same words into the exported .tex', () => {
    const tex = compileCircuit(timer, { target: 'latex' }).tex ?? '';

    expect(tex).toContain('{1 GND}');
    expect(tex).toContain('{VCC 8}');
  });

  test('keeps the names upright on all four turns', () => {
    for (const turn of ['', ' r90', ' r180', ' r270']) {
      const result = compileCircuit(circuit('parts:', `  U1: dip8 c4 NE555${turn}`));
      expect(result.errors).toEqual([]);
      expect(result.notes.filter((note) => /GND|VCC/.test(note.text))).toHaveLength(2);
    }
  });

  test('refuses to mirror a named DIP, as it refuses a plain one', () => {
    expect(compileCircuit(circuit('parts:', '  U1: dip8 c4 NE555 mirror')).errors).not.toEqual([]);
  });

  test('tells which model was not in the table and draws numbers, without calling it an error', () => {
    const result = compileCircuit(circuit('parts:', '  U1: dip8 c4 LM741'));

    expect(result.errors).toEqual([]);
    const notice = result.notices.map((one) => one.message).join('\n');
    expect(notice).toContain('LM741');
    expect(notice).toContain('番号');
    expect(notice).toContain('NE555');
    expect(result.tex).not.toContain('hide numbers');
  });

  test('says nothing when no model is written', () => {
    expect(compileCircuit(circuit('parts:', '  U1: dip8 c4')).notices).toEqual([]);
  });

  test('does not report the pins left unused', () => {
    const result = compileCircuit(timer, { erc: true });
    expect(result.erc.map((one) => one.message).join('\n')).not.toContain('U1');
  });

  test('calls a pin printed with a shared name (NC) by its number, in the netlist and on the map', () => {
    const source = circuit(
      'parts:',
      '  U1: dip8 c4 TL071',
      'wires:',
      '  - a1 |- U1.1',
      '  - e1 |- U1.5',
      '  - a7 -| U1.8',
      '  - e7 -| U1.OUT',
    );
    const refs = compileCircuit(source).netlist.flatMap((net) => net.refs);

    expect(refs).toEqual(expect.arrayContaining(['U1.1', 'U1.5', 'U1.8', 'U1.OUT']));
    expect(refs).not.toContain('U1.NC');
    const names = (gridMap(source).chips[0]?.pins ?? []).map((pin) => pin.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('offers the pins on the map by the printed names', () => {
    const map = gridMap(circuit('parts:', '  U1: dip8 c4 NE555'));
    const names = (map.chips[0]?.pins ?? []).map((pin) => pin.name);

    expect(names).toContain('TRIG');
    expect(names).toContain('VCC');
  });
});
