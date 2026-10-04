import { describe, expect, test } from 'vitest';
import { renderBreadboard } from './index.ts';
import { createBoard } from './model/board.ts';
import { formatAddress } from './model/address.ts';
import { parseFence } from './parser/parseFence.ts';
import { placeParts } from './placement/place.ts';

/**
 * 幅広 DIP (600 mil)。SRAM・EEPROM の 28 ピンや CPU の 40 ピンは、足の列の間が
 * 0.6 インチ (6 ピッチ) で、普通のブレッドボードの溝をまたいで挿さる。
 * 書き方は `dipN/wide @ 穴` (姿の書き方は `dip8/sop` と同じ)。
 * 足の行は 6 ピッチ離れた組 (b↔f・c↔g・d↔h・e↔i)。7 セグの `seg7` と同じ勘定。
 */

const fence = (...lines: string[]): string => ['board: full', ...lines, ''].join('\n');

const placed = (line: string, size = 'full') =>
  placeParts(parseFence([`board: ${size}`, 'parts:', `  ${line}`, ''].join('\n')).doc.parts, createBoard(size as 'full'));

const pinsOf = (line: string) => placed(line).parts[0]?.pins ?? [];
const holeOf = (pins: ReturnType<typeof pinsOf>, name: string): string => {
  const address = pins.find((pin) => pin.name === name)?.address;
  return address ? formatAddress(address) : '';
};
const errorsOf = (...lines: string[]): string =>
  renderBreadboard(fence(...lines)).errors.filter((one) => one.notice !== true).map((one) => one.message).join('\n');
const noticesOf = (...lines: string[]): string =>
  renderBreadboard(fence(...lines)).notices.map((one) => one.message).join('\n');
const texts = (svg: string): string[] => [...svg.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map(([, text]) => text ?? '');

const SRAM = 'U1: dip28/wide @ d10 AS6C62256-55PCN';

describe('読み方', () => {
  test('reads dipN/wide as a wide DIP with its variant', () => {
    const { parts, errors } = placed(SRAM);
    expect(errors).toEqual([]);
    expect(parts[0]?.type).toBe('dip28');
    expect(parts[0]?.variant).toBe('wide');
    expect(parts[0]?.kind).toBe('dip');
    expect(parts[0]?.pins).toHaveLength(28);
  });

  test('takes the model after the anchor like the narrow DIP', () => {
    expect(placed(SRAM).parts[0]?.label).toBe('AS6C62256-55PCN');
  });

  test('accepts the wide sizes 24, 28, 32 and 40', () => {
    for (const pins of [24, 28, 32, 40]) {
      expect(placed(`U1: dip${pins}/wide @ d5`).errors, `dip${pins}`).toEqual([]);
    }
  });
});

describe('置き方 (足の行は 6 ピッチ離れる)', () => {
  test('puts pin 1 at the lower left and counts round anticlockwise, d row above h row', () => {
    const pins = pinsOf('U1: dip28/wide @ d10');
    const hole = (number: number) => formatAddress(pins[number - 1]!.address!);
    expect(hole(1)).toBe('h10');
    expect(hole(14)).toBe('h23');
    expect(hole(15)).toBe('d23');
    expect(hole(28)).toBe('d10');
  });

  test('puts the same pins in the same holes whichever pin row the anchor names', () => {
    const fromD = pinsOf('U1: dip28/wide @ d10').map((pin) => formatAddress(pin.address!));
    const fromH = pinsOf('U1: dip28/wide @ h10').map((pin) => formatAddress(pin.address!));
    expect(fromH).toEqual(fromD);
  });

  test.each([
    ['b', 'f'], ['c', 'g'], ['d', 'h'], ['e', 'i'],
  ])('accepts the pin rows %s and %s (both 0.6 inch apart)', (upper, lower) => {
    const pins = pinsOf(`U1: dip28/wide @ ${upper}3`);
    expect(formatAddress(pins[0]!.address!)).toBe(`${lower}3`);
    expect(formatAddress(pins[27]!.address!)).toBe(`${upper}3`);
  });

  test('refuses a row that has no partner 0.6 inch across the channel, naming the rows', () => {
    for (const row of ['a', 'j']) {
      const said = errorsOf('parts:', `  U1: dip28/wide @ ${row}5`);
      expect(said, row).toContain('U1: dip28/wide は溝をまたぐので');
      expect(said, row).toContain('b・c・d・e 行か f・g・h・i 行');
    }
  });

  test('refuses a rail anchor', () => {
    expect(errorsOf('parts:', '  U1: dip28/wide @ +t5')).toContain('レールではなく穴に置きます');
  });

  test('refuses to run past the right edge of the board', () => {
    expect(errorsOf('parts:', '  U1: dip28/wide @ d55')).toContain('はみ出します');
  });

  test('turns with r180 the way the narrow DIP turns (pin 1 moves to the upper right)', () => {
    const pins = pinsOf('U1: dip28/wide @ d10 r180');
    const holeOfNumber = (number: string) => formatAddress(pins.find((pin) => (pin.number ?? pin.name) === number)?.address ?? pins[0]!.address!);
    expect(holeOfNumber('1')).toBe('d23');
    expect(holeOfNumber('15')).toBe('h10');
  });
});

describe('足の名前と配線', () => {
  test('names the AS6C62256 pins from the 62256 table and keeps their numbers', () => {
    const pins = pinsOf(SRAM);
    expect(pins.map((pin) => pin.number)).toEqual(Array.from({ length: 28 }, (_, index) => String(index + 1)));
    expect(holeOf(pins, 'A14')).toBe('h10');
    expect(holeOf(pins, 'VSS')).toBe('h23');
    expect(holeOf(pins, 'DQ3')).toBe('d23');
    expect(holeOf(pins, 'VCC')).toBe('d10');
    expect(holeOf(pins, 'WE')).toBe('d11');
  });

  test('joins each pin to the 5-hole strip of its own half, exactly as the real board', () => {
    const { errors, netlist } = renderBreadboard(fence(
      'parts:',
      `  ${SRAM}`,
      '  R1: resistor a10 a5 10k',
      '  R2: resistor j10 j5 10k',
      '  R3: resistor a11 a3 10k',
    ));
    expect(errors).toEqual([]);
    const netOf = (ref: string) => netlist.find((net) => net.refs.includes(ref))?.refs ?? [];
    // 上の半分 (a〜e) の 10 列は d10 の 28 番 VCC、下の半分 (f〜j) の 10 列は h10 の 1 番 A14。
    expect(netOf('R1.1')).toContain('U1.VCC');
    expect(netOf('R1.1')).not.toContain('U1.A14');
    expect(netOf('R2.1')).toContain('U1.A14');
    expect(netOf('R2.1')).not.toContain('U1.VCC');
    expect(netOf('R3.1')).toContain('U1.WE');
  });

  test('wires to a pin by its name or its number and lists it by its name', () => {
    for (const wire of ['U1.OE -- a5', 'U1.22 -- a5']) {
      const { errors, netlist } = renderBreadboard(fence(
        'parts:', `  ${SRAM}`, '  R1: resistor a20 a8 10k', 'wires:', `  - ${wire}`,
      ));
      expect(errors, wire).toEqual([]);
      expect(netlist.find((net) => net.refs.includes('U1.OE'))?.refs, wire).toContain('U1.OE');
    }
  });

  test('draws a plain numbered wide DIP for a model that is not in the table', () => {
    const { parts } = placed('U1: dip28/wide @ d10 28C64');
    expect(parts[0]?.pins.map((pin) => pin.name).slice(0, 2)).toEqual(['1', '2']);
  });

  test('tells that the pins of an unknown model are numbered, like the narrow DIP', () => {
    expect(noticesOf('parts:', '  U1: dip28/wide @ d10 28C64')).toContain('28C64 の足の名前は表に無い');
  });
});

describe('本体の下', () => {
  test('covers the holes between the pin rows, so another part cannot sit there', () => {
    // d↔h なら e・f・g 行の全列が胴の下。
    for (const hole of ['e10', 'f15', 'g23']) {
      const said = errorsOf('parts:', `  ${SRAM}`, `  R1: resistor ${hole} ${hole.replace(/\d+/, '30')} 10k`);
      expect(said, hole).toContain('本体の下');
    }
  });

  test('leaves the rows outside the pin rows free (a to c above, i and j below)', () => {
    const said = errorsOf('parts:', `  ${SRAM}`, '  R1: resistor a12 c12 10k', '  R2: resistor i12 j12 10k');
    expect(said).toBe('');
  });

  test('covers only the holes between when the rows are c and g', () => {
    expect(errorsOf('parts:', '  U1: dip28/wide @ c10', '  R1: resistor a12 b12 10k', '  R2: resistor h12 j12 10k')).toBe('');
  });
});

describe('描く', () => {
  const svg = renderBreadboard(fence('parts:', `  ${SRAM}`)).svg;

  test('draws one body, 28 pin stubs, and the pin-1 notch', () => {
    expect(svg.match(/rx="3"/g)?.length).toBeGreaterThanOrEqual(1);
    const stubs = (source: string): number => source.match(/width="6" height="6"/g)?.length ?? 0;
    // 足の跡は狭い DIP と同じ数 (28 本ぶん) で、ボードの穴のぶんだけ共通。
    const narrow = renderBreadboard(fence('parts:', '  U1: dip28 @ e10 AS6C62256-55PCN')).svg;
    expect(stubs(svg)).toBe(stubs(narrow));
    expect(stubs(svg)).toBeGreaterThanOrEqual(28);
    expect(svg.match(/r="4.5"/g)).toHaveLength(1);
  });

  test('prints the numbers and the names of the pins, with the model in the body', () => {
    const printed = texts(svg);
    for (const text of ['1', '14', '28', 'A14', 'VSS', 'VCC', 'DQ0', 'WE']) {
      expect(printed, text).toContain(text);
    }
    // 型番は名札 (`U1 AS6C…`) に出る。部品表のほうは働きを添えた字になる。
    expect(printed.some((text) => text.includes('AS6C62256-55PCN'))).toBe(true);
  });

  test('draws the body as deep as the two pin rows are far apart, deeper than the narrow one', () => {
    const height = (source: string): number => Number(/<rect [^>]*height="([\d.]+)"[^>]*rx="3"/.exec(source)?.[1]);
    const narrow = renderBreadboard(fence('parts:', '  U1: dip28 @ e10 AS6C62256-55PCN')).svg;
    expect(height(svg)).toBeGreaterThan(height(narrow) + 50);
  });

  test('draws the same part differently from the narrow DIP', () => {
    const narrow = renderBreadboard(fence('parts:', '  U1: dip28 @ e10 AS6C62256-55PCN')).svg;
    expect(svg).not.toBe(narrow);
  });
});

describe('断る', () => {
  test('names the wide sizes for a size that has no wide package', () => {
    for (const size of [4, 8, 14, 16, 18, 20]) {
      const said = errorsOf('parts:', `  U1: dip${size}/wide @ d5`);
      expect(said, `dip${size}`).toContain(`dip${size}/wide は書けません`);
      expect(said, `dip${size}`).toContain('24・28・32・40 ピン');
    }
  });

  test('does not offer wide to a SIP or to the other parts', () => {
    expect(errorsOf('parts:', '  U1: sip8/wide @ a3')).toContain('姿は選べません');
    expect(errorsOf('parts:', '  R1: resistor/wide a3 a8')).toContain('知らない姿です');
  });

  test('does not combine wide with the SOP adapter', () => {
    expect(errorsOf('parts:', '  U1: dip28/sop/wide @ d5')).not.toBe('');
  });
});
