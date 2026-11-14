import { describe, expect, test } from 'vitest';
import { renderBreadboard, scenesOfBreadboard } from './index.ts';

/**
 * Pico シリーズの SWD のパッド (SWCLK・SWGND・SWDIO)。**基板の穴には挿さらない**ので、
 * ボード外の機器のピンと同じく線の端としてだけ指す (`MCU.SWCLK`)。Debug Probe の
 * 「D」のケーブルをつなぐ図を描くため。
 */
const fence = (...lines: string[]): string => ['board: full', ...lines, ''].join('\n');

const probe = (board = 'pico2', at = 'top'): string[] => [
  'parts:',
  `  MCU: ${board} @ g15`,
  '  PROBE:',
  '    type: device',
  `    at: ${at}`,
  '    label: Debug Probe',
  '    pins: [SC, GND, SD]',
];

const swd = [
  'wires:',
  '  - PROBE.SC -- MCU.SWCLK orange',
  '  - PROBE.GND -- MCU.SWGND black',
  '  - PROBE.SD -- MCU.SWDIO yellow',
];

const netOf = (netlist: readonly { readonly refs: readonly string[] }[], ref: string): readonly string[] =>
  netlist.find((net) => net.refs.includes(ref))?.refs ?? [];

/** 引き回した線の折れ線 (fence-check の Scene と同じもの)。 */
const polylines = (source: string): (readonly { readonly x: number; readonly y: number }[])[] =>
  (scenesOfBreadboard(source)[0]?.wires ?? []).map((wire) => wire.points);

describe('SWD のパッド', () => {
  test('wires a device to the three pads and puts each pair in one net', () => {
    const { errors, netlist } = renderBreadboard(fence(...probe(), ...swd));

    expect(errors).toEqual([]);
    expect(netOf(netlist, 'PROBE.SC')).toEqual(expect.arrayContaining(['PROBE.SC', 'MCU.SWCLK']));
    expect(netOf(netlist, 'PROBE.GND')).toEqual(expect.arrayContaining(['PROBE.GND', 'MCU.SWGND']));
    expect(netOf(netlist, 'PROBE.SD')).toEqual(expect.arrayContaining(['PROBE.SD', 'MCU.SWDIO']));
  });

  test('keeps the debug ground apart from the header grounds unless a wire joins them', () => {
    const { netlist } = renderBreadboard(fence(...probe(), ...swd));

    expect(netOf(netlist, 'MCU.SWGND')).not.toContain('MCU.GND3');
  });

  test('draws the pads and their names on the board', () => {
    const { svg } = renderBreadboard(fence(...probe()));

    for (const name of ['SWCLK', 'SWGND', 'SWDIO']) expect(svg).toContain(`>${name}<`);
  });

  test('ends each wire on its pad: SWCLK lowest, SWDIO highest, at the end away from the usb', () => {
    const lines = polylines(fence(...probe(), ...swd));
    const ends = lines.map((points) => points[points.length - 1]!);

    expect(lines).toHaveLength(3);
    // Pico は g15 から 20 列 (15〜34)。USB は左なので、パッドは 34 列の上 (右の端)。
    const [clock, ground, data] = ends;
    expect(clock!.x).toBe(ground!.x);
    expect(ground!.x).toBe(data!.x);
    expect(clock!.y).toBeGreaterThan(ground!.y);
    expect(ground!.y).toBeGreaterThan(data!.y);
  });

  test('does not run two pad wires on the same vertical', () => {
    const verticalXs = polylines(fence(...probe(), ...swd)).map((points) => {
      const last = points[points.length - 1]!;
      // パッドの手前で縦に降りてくる区間の x。
      return points.slice().reverse().find((point) => point.x !== last.x)?.x ?? last.x;
    });

    expect(new Set(verticalXs).size).toBe(3);
  });

  test('routes from a device below the board as well', () => {
    const { errors, netlist } = renderBreadboard(fence(...probe('pico2', 'bottom'), ...swd));

    expect(errors).toEqual([]);
    expect(netOf(netlist, 'PROBE.SD')).toContain('MCU.SWDIO');
  });

  test('wires the pads of a board turned round (r180) and of the wireless models', () => {
    for (const board of ['pico2 @ g15 r180', 'pico-w @ g15', 'pico2-w @ g15', 'pico @ g15']) {
      const source = fence(...probe(board.split(' @ ')[0]).map((line) =>
        line.startsWith('  MCU:') ? `  MCU: ${board}` : line), ...swd);
      const { errors } = renderBreadboard(source);

      expect(errors, board).toEqual([]);
      expect(polylines(source), board).toHaveLength(3);
    }
  });

  test('lists the three pads together when the name is cut short at SW', () => {
    const { errors } = renderBreadboard(fence(...probe(), 'wires:', '  - PROBE.SC -- MCU.SW orange'));

    expect(errors.map((error) => error.message).join('\n')).toContain('SWCLK, SWGND, SWDIO');
  });

  test('gives the Tang Nano 9K no pads', () => {
    const { errors, svg } = renderBreadboard(fence(
      'parts:', '  U1: tang-nano-9k @ b5', '  P: {type: device, pins: [SC]}', 'wires:', '  - P.SC -- U1.SWCLK',
    ));

    expect(errors.map((error) => error.message).join('\n')).toContain('そのピンはありません');
    expect(svg).not.toContain('>SWCLK<');
  });

  test('tells fence-check that the pad wires end on a device-like pin', () => {
    const [scene] = scenesOfBreadboard(fence(...probe(), ...swd));

    expect(scene?.wires).toHaveLength(3);
  });
});
