import { describe, expect, test } from 'vitest';
import { renderBreadboard } from './index.ts';
import { holesOf, partName, partPrefix } from './parts/catalog.ts';
import { variantsOf } from './parts/variants.ts';
import { knownPartTypes, lookupFootprint, placeableTypes } from './placement/footprints.ts';

/**
 * USB コネクタ (52 の docs/58)。**perfboard と同じ表**を読む — 書いた穴がそのまま足で、
 * 足の名前は表の順 (`VBUS GND D+ D-`、Type-C は `CC1 CC2` まで)。書いた数だけ使う。
 */

const fence = (...lines: string[]): string => ['board: half', ...lines, ''].join('\n');

const errorsOf = (...lines: string[]): string =>
  renderBreadboard(fence(...lines)).errors.map((one) => one.message).join('\n');

describe('種類と姿', () => {
  test('knows both kinds and lets them be placed', () => {
    for (const type of ['usb-a', 'usb-c']) {
      expect(lookupFootprint(type)?.kind, type).toBe('connector');
      expect(placeableTypes(), type).toContain(type);
      expect(knownPartTypes(), type).toContain(type);
      expect(partPrefix(type), type).toBe('J');
      expect(variantsOf(type), type).toEqual(['male', 'female']);
    }
    expect(partName('usb-a')).toBe('USB Type-A コネクタ');
    // パレットからは 2 つの穴を結んで置く (電源だけの変換基板)。
    expect(holesOf('usb-c')).toBe(2);
  });
});

describe('置き方', () => {
  test('names the pins after the table, so a wire can say J1.VBUS', () => {
    const { errors, netlist } = renderBreadboard(fence(
      'parts:',
      '  J1: usb-c/female a10 a11',
      '  R1: resistor f10 f14 1k',
      'wires:',
      '  - J1.VBUS -- f10 red',
      '  - J1.GND -- f14 black',
    ));

    expect(errors).toEqual([]);
    const refs = netlist.flatMap((net) => net.refs);
    expect(refs).toContain('J1.VBUS');
    expect(refs).toContain('J1.GND');
  });

  test('takes up to the length of the table and no more', () => {
    expect(errorsOf('parts:', '  J1: usb-a a10 a11 a12 a13')).toBe('');
    expect(errorsOf('parts:', '  J1: usb-a a10 a11 a12 a13 a14')).toContain('2〜4');
    expect(errorsOf('parts:', '  J1: usb-c a10')).toContain('VBUS GND D+ D- CC1 CC2');
  });

  test('refuses pin names written on the holes, since the table decides them', () => {
    expect(errorsOf('parts:', '  J1: usb-c a10(GND) a11')).toContain('表の順');
  });

  test('refuses a pin that is not in the table', () => {
    expect(errorsOf('parts:', '  J1: usb-c a10 a11', 'wires:', '  - J1.D+ -- f10')).toContain('そのピンはありません');
  });
});

describe('図', () => {
  test('draws the breakout with the pin names printed on it', () => {
    const { svg } = renderBreadboard(fence('parts:', '  J1: usb-c c10 c11'));
    expect(svg).toContain('>VBUS<');
    expect(svg).toContain('>GND<');
    expect(svg).toContain('>J1<');
  });

  test('faces away from the ravine', () => {
    const top = renderBreadboard(fence('parts:', '  J1: usb-c c10 c11')).svg;
    const bottom = renderBreadboard(fence('parts:', '  J1: usb-c h10 h11')).svg;
    const nameY = (svg: string): number => Number(/<text x="[-\d.]+" y="([-\d.]+)"[^>]*>VBUS</.exec(svg)?.[1]);
    const yOf = (svg: string, row: string): number =>
      Number(new RegExp(`<text[^>]*y="([-\\d.]+)"[^>]*>${row}<`).exec(svg)?.[1]);

    // 上の段では名前が足の上 (差し込み口は上)、下の段では足の下。
    expect(nameY(top)).toBeLessThan(yOf(top, 'c'));
    expect(nameY(bottom)).toBeGreaterThan(yOf(bottom, 'h') - 10);
  });

  test('widens the canvas sideways too, when the pins run down a column', () => {
    // 溝をまたいで縦に書くと、差し込み口は左右を向く。
    const { svg } = renderBreadboard(fence('parts:', '  J1: usb-a e1 f1'));
    const xs = [...svg.matchAll(/<rect x="([-\d.]+)"/g)].map((match) => Number(match[1]));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
  });

  test('keeps the connector out of the band for off-board devices', () => {
    const { svg } = renderBreadboard([
      'board:', '  size: half', '  rails: none',
      'parts:',
      '  AD:', '    type: device', '    at: top', '    pins: [W1, GND]',
      '  J1: usb-a/male a3 a4',
      '',
    ].join('\n'));
    // 機器の箱の下端より、コネクタの上端 (いちばん上の矩形) が下にあること。
    const rects = [...svg.matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"[^>]*fill="#c3c8ce"/g)]
      .map((match) => Number(match[2]));
    // 機器の箱は角丸 6 の矩形 (`render/devices.ts`)。
    const box = /<rect x="[-\d.]+" y="([-\d.]+)" width="[-\d.]+" height="([-\d.]+)" rx="6"/.exec(svg);
    expect(rects.length).toBeGreaterThan(0);
    expect(box).not.toBeNull();
    expect(Math.min(...rects)).toBeGreaterThanOrEqual(Number(box?.[1]) + Number(box?.[2]));
  });

  test('widens the canvas when the connector hangs off the board, instead of cutting it', () => {
    const inside = renderBreadboard(fence('parts:', '  J1: usb-c e10 e11')).svg;
    const edge = renderBreadboard(fence('parts:', '  J1: usb-a/male a10 a11')).svg;
    const heightOf = (svg: string): number => Number(/viewBox="[-\d.]+ [-\d.]+ [-\d.]+ ([-\d.]+)"/.exec(svg)?.[1]);

    expect(heightOf(edge)).toBeGreaterThan(heightOf(inside));
  });
});
