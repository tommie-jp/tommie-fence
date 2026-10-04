import { describe, expect, test } from 'vitest';
import { textWidth } from 'fence-kit';
import { renderPerfboard } from '../index.ts';

/**
 * 部品の名札と行の名前が、線・胴に重ならないこと。教科書の図で
 * `R1 100` が真下の GND の線に取り消し線のように重なり、3 本足の真ん中の足から
 * 下ろした線が型番を縦に貫き、縁の SMA が行の名前 `H` `I` `J` を隠していた。
 */
type Text = { readonly x: number; readonly y: number; readonly anchor: string; readonly size: number; readonly body: string; readonly middle: boolean };
type Line = { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly width: number };
type Box = { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number };

const texts = (svg: string): Text[] =>
  [...svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)" text-anchor="(\w+)"(?![^>]*aria-hidden)([^>]*)>([^<]*)<\/text>/g)]
    .map((match) => ({
      x: Number(match[1]), y: Number(match[2]), anchor: match[3]!,
      size: Number(/font-size="([\d.]+)"/.exec(match[4]!)?.[1] ?? 0),
      middle: match[4]!.includes('dominant-baseline="middle"'),
      body: match[5]!,
    }));

/** 板の上の配線 (縁取りの線。太いほう)。 */
const wires = (svg: string): Line[] =>
  [...svg.matchAll(/<line x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)" class="cf-wire-outline"[^>]*stroke-width="([\d.]+)"/g)]
    .map((match) => ({
      x1: Number(match[1]), y1: Number(match[2]), x2: Number(match[3]), y2: Number(match[4]), width: Number(match[5]),
    }));

const boxOf = (text: Text): Box => {
  const width = textWidth(text.body) * text.size;
  const left = text.anchor === 'start' ? text.x : text.anchor === 'end' ? text.x - width : text.x - width / 2;
  const top = text.middle ? text.y - text.size * 0.46 : text.y - text.size * 0.72;
  const bottom = text.middle ? text.y + text.size * 0.46 : text.y + text.size * 0.2;
  return { left, right: left + width, top, bottom };
};

/** 線 (縦か横) が字の箱に掛かるか。 */
const crosses = (line: Line, box: Box): boolean => {
  const half = line.width / 2;
  return Math.min(line.x1, line.x2) - half < box.right && Math.max(line.x1, line.x2) + half > box.left
    && Math.min(line.y1, line.y2) - half < box.bottom && Math.max(line.y1, line.y2) + half > box.top;
};

const find = (svg: string, pattern: RegExp): Text => {
  const found = texts(svg).find((text) => pattern.test(text.body));
  expect(found, String(pattern)).toBeDefined();
  return found!;
};

const GND_UNDER = [
  'board:',
  '  size: 7x5cm',
  'parts:',
  '  J1: sma/female-edge i1 h0 j0',
  '  J2: sma/female-edge i24 j25',
  '  R1: resistor i6 i11 100',
  'wires:',
  '  - i1 -- i6',
  '  - i11 -- i24',
  '  - j0 -- j25 black',
].join('\n');

describe('part captions keep clear of the wires', () => {
  test('a caption whose place below is taken by a wire moves to a free side', () => {
    const { svg } = renderPerfboard(GND_UNDER);
    const caption = boxOf(find(svg, /^R1 100$/));
    for (const line of wires(svg)) expect(crosses(line, caption), JSON.stringify(line)).toBe(false);
  });

  test('a caption with nothing in the way stays below the body', () => {
    const free = GND_UNDER.replace('  - j0 -- j25 black', '  - j0 -- j2 black');
    const before = find(renderPerfboard(free).svg, /^R1 100$/);
    const resistorRow = 202;
    expect(before.y).toBeGreaterThan(resistorRow);
  });

  test('the wire down from the middle lead of a three-lead part misses its name', () => {
    const { svg } = renderPerfboard([
      'board:',
      '  size: 7x5cm',
      'parts:',
      '  FL1: ic3 i7 i8 i9 SFELF10M7',
      'wires:',
      '  - i8 -- l8 black',
    ].join('\n'));
    const caption = boxOf(find(svg, /SFELF10M7/));
    for (const line of wires(svg)) expect(crosses(line, caption), JSON.stringify(line)).toBe(false);
  });

  test('the wire down from the middle lead of a SIP misses its name', () => {
    const { svg } = renderPerfboard([
      'board:',
      '  size: 7x5cm',
      'parts:',
      '  FL1: sip3 i7 SFELF10M7',
      'wires:',
      '  - i8 -- l8 black',
    ].join('\n'));
    const names = texts(svg).filter((text) => /FL1|SFELF/.test(text.body));
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      for (const line of wires(svg)) expect(crosses(line, boxOf(name)), `${name.body} ${JSON.stringify(line)}`).toBe(false);
    }
  });
});

describe('row names beside an edge-mounted SMA', () => {
  test('every row name the connector would cover moves out past the connector', () => {
    const { svg } = renderPerfboard(GND_UNDER);
    const rows = texts(svg).filter((text) => /^[A-R]$/.test(text.body) && text.middle);
    const named = (name: string): Text => rows.find((text) => text.body === name)!;
    const plain = named('A').x;
    for (const name of ['H', 'I', 'J']) {
      // 胴の先端 (板の縁から 3 段ぶん外) より外。
      expect(named(name).x, name).toBeLessThan(plain - 40);
    }
    for (const name of ['G', 'K']) expect(named(name).x, name).toBe(plain);
  });

  test('the moved names stay inside the picture', () => {
    const { svg } = renderPerfboard(GND_UNDER);
    // 張り出しのぶんは図全体を右へずらして入れる (`translate`)。
    const shift = Number(/<g transform="translate\(([\d.-]+) /.exec(svg)?.[1] ?? 0);
    const moved = texts(svg).filter((text) => text.body === 'I' && text.middle);
    expect(moved).toHaveLength(1);
    for (const name of moved) expect(boxOf(name).left + shift).toBeGreaterThanOrEqual(0);
  });
});
