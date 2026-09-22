import { describe, expect, test } from 'vitest';
import { renderPerfboard } from './index.ts';
import { parsePartLine } from './parser/parts.ts';
import { footprintOf, pinsOf } from './parts/footprint.ts';
import { holesOf, partName, partPrefix } from './parts/catalog.ts';
import { isKnownType, placeableNames, splitPartType } from './parts/types.ts';
import { orientOf } from './parts/orient.ts';

/**
 * USB コネクタ (52 の docs/58)。**書いた穴がそのまま足**で、足の名前は表の順
 * (`VBUS GND D+ D-`、Type-C は `CC1 CC2` まで)。書いた数だけ使う。
 */

const fence = (...lines: string[]): string => ['board: 20x6', ...lines, ''].join('\n');

describe('種類と姿', () => {
  test('knows both kinds and lets them be placed', () => {
    for (const type of ['usb-a', 'usb-c']) {
      expect(isKnownType(type), type).toBe(true);
      expect(placeableNames(), type).toContain(type);
      expect(partPrefix(type), type).toBe('J');
    }
    expect(partName('usb-c')).toBe('USB Type-C コネクタ');
  });

  test('takes a plug or a receptacle, and nothing else', () => {
    expect(splitPartType('usb-c/male')).toEqual({ type: 'usb-c', variant: 'male', problem: null });
    expect(splitPartType('usb-a/female').problem).toBeNull();
    expect(splitPartType('usb-c/female-edge').problem).toContain('male / female');
  });

  test('is written hole by hole, from two up to the length of the table', () => {
    expect(footprintOf('usb-a')).toEqual({ kind: 'connector', pins: 4, holes: 4, minHoles: 2 });
    expect(footprintOf('usb-c')).toEqual({ kind: 'connector', pins: 6, holes: 6, minHoles: 2 });
    // パレットからは 2 つの穴を結んで置く (電源だけの変換基板)。
    expect(holesOf('usb-c')).toBe(2);
    // 足の向きは穴の順そのものなので、向きの語は書けない。
    expect(orientOf('usb-c')).toBe('none');
  });

  test('puts the pins where they were written, in the order they were written', () => {
    const holes = [{ row: 3, col: 3 }, { row: 3, col: 6 }, { row: 3, col: 4 }];
    expect(pinsOf(footprintOf('usb-a')!, holes)).toEqual(holes);
  });
});

describe('書き方', () => {
  test('reads two holes as the power pair', () => {
    const read = parsePartLine('J1', 'usb-c/female a11 a10');
    expect(read.ok && read.value.holes).toEqual(['a11', 'a10']);
  });

  test('reads as many holes as the table has', () => {
    const read = parsePartLine('J1', 'usb-c c1 c2 c3 c4 c5 c6');
    expect(read.ok && read.value.holes).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6']);
  });

  test('keeps a trailing value that does not look like a hole', () => {
    const read = parsePartLine('J1', 'usb-a a1 a2 a3 a4 5V');
    expect(read.ok && read.value.value).toBe('5V');
  });

  test('refuses a single hole, naming the order the holes go in', () => {
    const read = parsePartLine('J1', 'usb-c a1');
    expect(read.ok).toBe(false);
    expect(!read.ok && read.error.message).toContain('VBUS GND D+ D- CC1 CC2');
  });

  test('refuses one hole more than the table has', () => {
    const read = parsePartLine('J1', 'usb-a a1 a2 a3 a4 a5');
    expect(read.ok).toBe(false);
    expect(!read.ok && read.error.message).toContain('4 つまで');
  });
});

describe('ネットリストと ERC', () => {
  test('names the pins after the table, so the netlist reads like the breakout', () => {
    const { netlist, errors } = renderPerfboard(fence(
      'parts:',
      '  J1: usb-c/female a11 a10',
      '  R1: resistor c4 c9 1k',
      'wires:',
      '  - a11 -- c4',
      '  - a10 -- c9',
    ));

    expect(errors).toEqual([]);
    const refs = netlist.flatMap((net) => net.refs);
    expect(refs).toContain('J1.VBUS');
    expect(refs).toContain('J1.GND');
    expect(refs).not.toContain('J1.1');
  });

  test('says which named pin is left unwired, and nothing about pins that were not written', () => {
    const { erc } = renderPerfboard(fence(
      'parts:',
      '  J1: usb-a a5 a6 a7 a8',
      '  R1: resistor c4 c9 1k',
      'wires:',
      '  - a5 -- c4',
      '  - a6 -- c9',
    ));
    const said = erc.map((one) => one.message).join('\n');

    expect(said).toContain('J1.D+');
    expect(said).toContain('J1.D-');
    expect(said).not.toContain('J1.VBUS');
  });
});

describe('図', () => {
  test('draws the breakout with the pin names printed on it', () => {
    const { svg } = renderPerfboard(fence('parts:', '  J1: usb-c c5 c6'));
    expect(svg).toContain('>VBUS<');
    expect(svg).toContain('>GND<');
    expect(svg).toContain('>J1<');
  });

  test('widens the canvas when the connector hangs off the edge, instead of cutting it', () => {
    const inside = renderPerfboard(fence('parts:', '  J1: usb-c c5 c6')).svg;
    const edge = renderPerfboard(fence('parts:', '  J1: usb-c a5 a6')).svg;
    const heightOf = (svg: string): number => Number(/viewBox="[-\d.]+ [-\d.]+ [-\d.]+ ([-\d.]+)"/.exec(svg)?.[1]);

    expect(heightOf(edge)).toBeGreaterThan(heightOf(inside));
  });

  test('pushes the band for off-board devices past the connector, instead of overlapping it', () => {
    const { svg } = renderPerfboard(fence(
      'parts:', '  BAT:', '    type: device', '    at: top', '    pins: + -', '  J1: usb-a/male a3 a4',
    ));
    const metalTop = Math.min(...[...svg.matchAll(/<rect x="[-\d.]+" y="([-\d.]+)"[^>]*fill="#c3c8ce"/g)]
      .map((match) => Number(match[1])));
    // 機器の箱は角丸 4 で、板の地の色ではない矩形 (`render/devices.ts`)。
    const box = /<rect x="[-\d.]+" y="([-\d.]+)" width="[-\d.]+" height="([-\d.]+)" rx="4" fill="#efe4cd"/.exec(svg);

    expect(box).not.toBeNull();
    expect(metalTop).toBeGreaterThanOrEqual(Number(box?.[1]) + Number(box?.[2]));
  });

  test('says the bodies overlap when another part sits under the breakout', () => {
    const { notices } = renderPerfboard(fence('parts:', '  J1: usb-c c5 c6', '  R1: resistor b4 b8 1k'));
    expect(notices.some((one) => one.message.includes('J1') && one.message.includes('重なって'))).toBe(true);
  });
});
