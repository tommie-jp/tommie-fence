import { dipBox, dipSocketBox } from 'fence-kit';
import { describe, expect, test } from 'vitest';
import { renderPerfboard } from './index.ts';

/**
 * IC ソケット (`dip8/socket`。52 の docs/140)。**IC は同じ型番のまま** — ピンの名前もネットリストも
 * ソケットの無い DIP と同じで、図に枠が増え、部品表の種類に `/socket` が付く。
 * ブレッドボードには挿さないので、この基板だけの姿。
 */

const fence = (...lines: string[]): string => ['board: 20x10', ...lines, ''].join('\n');

const widths = (svg: string): number[] =>
  [...svg.matchAll(/<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)"/g)].map(([, , , width]) => Number(width));

describe('IC ソケット', () => {
  test('keeps the printed pin names of the chip on the socket', () => {
    const { errors, netlist } = renderPerfboard(fence('parts:', '  U1: dip8/socket c3 NE555'));

    expect(errors).toEqual([]);
    expect(netlist.flatMap((net) => net.refs)).toEqual(expect.arrayContaining(['U1.GND', 'U1.TRIG', 'U1.VCC']));
  });

  test('draws a frame wider than the chip, and only for the socket', () => {
    const plain = renderPerfboard(fence('parts:', '  U1: dip8 c3 NE555')).svg;
    const seated = renderPerfboard(fence('parts:', '  U1: dip8/socket c3 NE555')).svg;

    const chipWidth = Math.max(...widths(plain).filter((width) => width < 200));
    expect(widths(seated).some((width) => width > chipWidth && width < 200)).toBe(true);
  });

  test('names the socket in the parts list', () => {
    const { svg } = renderPerfboard(fence('parts:', '  U1: dip8/socket c3 NE555', 'notes:', '  - parts'));

    expect(svg).toContain('dip8/socket');
  });

  test('the socket box is the one fence-kit draws', () => {
    const points = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 60 }, { x: 0, y: 60 }];
    expect(dipSocketBox(points, 20).width).toBeGreaterThan(dipBox(points, 20).width);
  });

  test('refuses the socket on a part that is not a DIP', () => {
    const { errors } = renderPerfboard(fence('parts:', '  J1: sip4/socket c3'));

    expect(errors.length).toBeGreaterThan(0);
  });
});
