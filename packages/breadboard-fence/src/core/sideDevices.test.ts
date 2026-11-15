import { describe, expect, test } from 'vitest';
import { renderBreadboard } from './index.ts';
import { createBoard } from './model/board.ts';
import { createLayout } from './model/layout.ts';
import { routeWires } from './router/route.ts';
import { parseAddress } from './model/address.ts';
import type { Point } from './types.ts';

// ボード外の機器を基板の左右に置く (`at: left` / `at: right`。52 の docs/159)。

const battery = (at: string, wires: readonly string[] = ['  - BAT.+ -- +t30 red', '  - BAT.- -- -t30 black']) => [
  'parts:',
  '  BAT:',
  '    type: device',
  `    at: ${at}`,
  '    label: 電池',
  '    pins: ["+", "-"]',
  'wires:',
  ...wires,
].join('\n');

/** 図の中の配線の折れ線 (`d` の M と L と Q の点)。 */
const wirePaths = (svg: string): string[] => [...svg.matchAll(/ d="(M [^"]+)"/g)].map((match) => match[1]!);

describe('devices beside the board', () => {
  test.each(['left', 'right'])('places a device at %s without errors', (side) => {
    const { errors, notices, netlist } = renderBreadboard(battery(side));

    expect(errors).toEqual([]);
    expect(notices).toEqual([]);
    expect(JSON.stringify(netlist)).toContain('BAT.+');
  });

  test('widens the drawing for a device on the right and keeps the board where it was', () => {
    const plain = renderBreadboard('wires:\n  - +t30 -- a30 red\n').svg;
    const beside = renderBreadboard(battery('right')).svg;
    const widthOf = (svg: string) => Number(/viewBox="0 0 ([\d.]+)/.exec(svg)?.[1]);

    expect(widthOf(beside)).toBeGreaterThan(widthOf(plain));
  });

  test('moves the board right for a device on the left', () => {
    const plain = renderBreadboard('wires:\n  - +t30 -- a30 red\n').svg;
    const beside = renderBreadboard(battery('left', ['  - BAT.+ -- +t1 red', '  - BAT.- -- -t1 black'])).svg;
    const plateX = (svg: string) => Number(/<rect x="([\d.]+)"[^>]*rx="7"/.exec(svg)?.[1]);

    expect(plateX(beside)).toBeGreaterThan(plateX(plain));
  });

  test('adds no band above the board for a device on the side', () => {
    const top = renderBreadboard(battery('top')).svg;
    const side = renderBreadboard(battery('right')).svg;
    const heightOf = (svg: string) => Number(/viewBox="0 0 [\d.]+ ([\d.]+)/.exec(svg)?.[1]);

    expect(heightOf(side)).toBeLessThan(heightOf(top));
  });

  test('refuses a device with a drawn look on the side', () => {
    const { errors } = renderBreadboard([
      'parts:', '  PROBE:', '    type: device', '    model: RPI-DEBUG-PROBE', '    at: right',
    ].join('\n'));

    expect(errors[0]?.message).toContain('top か bottom');
  });

  test('refuses an unknown side with the four it takes', () => {
    const { errors } = renderBreadboard(battery('middle'));

    expect(errors[0]?.message).toContain('left');
  });
});

describe('wires from a device beside the board', () => {
  const layout = createLayout(createBoard('half'), { deviceRightWidth: 80, sideLanesRight: 2 });
  const at = (text: string): Point => layout.point(parseAddress(text)!);
  const band = layout.deviceBands.right!;
  const pin = (y: number): Point => ({ x: band.x - 8, y });

  test('runs down the gap beside the board and enters a rail along its row', () => {
    const [path] = routeWires([{ from: pin(band.y + 40), to: at('+t30'), hints: [] }], layout);
    const right = layout.board.x + layout.board.width;

    // ピン → 通り道 (基板の外) → レールの行 → 穴。
    expect(path!.length).toBe(4);
    expect(path![1]!.x).toBeGreaterThan(right);
    expect(path![2]!.y).toBe(at('+t30').y);
  });

  test('enters a hole between rows, not along the row of holes', () => {
    const [path] = routeWires([{ from: pin(band.y + 40), to: at('c10'), hints: [] }], layout);
    const across = path![path!.length - 2]!;

    expect(across.x).toBe(at('c10').x);
    expect(Math.abs(across.y - at('c10').y)).toBe(layout.pitch / 2);
  });

  test('gives two wires their own lanes so they do not overlap', () => {
    const paths = routeWires([
      { from: pin(band.y + 30), to: at('+t30'), hints: [] },
      { from: pin(band.y + 50), to: at('-t30'), hints: [] },
    ], layout);

    expect(paths[0]![1]!.x).not.toBe(paths[1]![1]!.x);
  });

  test('draws the wires of the battery in the figure', () => {
    const paths = wirePaths(renderBreadboard(battery('right')).svg);

    expect(paths.length).toBeGreaterThanOrEqual(2);
  });
});
