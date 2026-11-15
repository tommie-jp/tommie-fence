import { describe, expect, test } from 'vitest';
import { renderBreadboard } from './index.ts';
import { formatAddress, parseAddress } from './model/address.ts';
import { createBoard, offBoardReason, stripOf } from './model/board.ts';
import { createLayout } from './model/layout.ts';
import { parseFence } from './parser/parseFence.ts';
import { DEFAULT_BOARD } from './types.ts';

// ブレッドボードを縦に継いで 1 つの図に描く (`board: stack:`。52 の docs/159)。

const stacked = (stack: number) => createBoard({ ...DEFAULT_BOARD, size: 'full', stack });

const at = (text: string) => {
  const address = parseAddress(text);
  if (!address) throw new Error(`テストの前提が壊れている: ${text}`);
  return address;
};

const fence = (...lines: string[]) => ['board:', '  size: full', '  stack: 2', ...lines].join('\n');

describe('addresses on a stacked board', () => {
  test('reads the board number in front of a hole and a rail address', () => {
    expect(parseAddress('2:a5')).toEqual({ kind: 'hole', row: 'a', col: 5, tier: 2 });
    expect(parseAddress('2:-b62')).toEqual({ kind: 'rail', polarity: '-', side: 'b', col: 62, tier: 2 });
  });

  test('reads 1:a5 as the same address as a5', () => {
    expect(parseAddress('1:a5')).toEqual(parseAddress('a5'));
  });

  test('writes the board number back only from the second board on', () => {
    expect(formatAddress(at('2:A5'))).toBe('2:a5');
    expect(formatAddress(at('1:a5'))).toBe('a5');
  });

  test('refuses a board number beyond the boards that are stacked', () => {
    expect(offBoardReason(stacked(2), at('3:a5'))).toContain('3 枚め');
    expect(offBoardReason(createBoard('half'), at('2:a5'))).toContain('stack');
    expect(offBoardReason(stacked(2), at('2:a5'))).toBeNull();
  });

  test('keeps each board its own strips, as nothing conducts across the seam', () => {
    expect(stripOf(at('2:a5'))).not.toBe(stripOf(at('a5')));
    expect(stripOf(at('2:+t5'))).not.toBe(stripOf(at('+t5')));
  });
});

describe('the board: stack entry', () => {
  test('reads the number of boards stacked', () => {
    expect(parseFence('board:\n  size: full\n  stack: 2\n').doc.board.stack).toBe(2);
  });

  test('defaults to one board', () => {
    expect(parseFence('board: full\n').doc.board.stack).toBe(1);
  });

  test.each(['0', '5', 'two'])('refuses stack: %s with the range it takes', (value) => {
    const { errors } = parseFence(`board:\n  stack: ${value}\n`);

    expect(errors[0]?.message).toContain('stack');
    expect(errors[0]?.line).toBe(2);
  });
});

describe('the layout of stacked boards', () => {
  test('puts the second board right below the first, edge to edge', () => {
    const layout = createLayout(stacked(2));
    const [first, second] = layout.tiers;

    expect(layout.tiers).toHaveLength(2);
    expect(second!.y).toBe(first!.y + first!.height);
    expect(layout.board.height).toBe(first!.height * 2);
  });

  test('lands the same hole on the second board one board height lower', () => {
    const layout = createLayout(stacked(2));
    const height = layout.tiers[0]!.height;

    expect(layout.point(at('2:a5')).y).toBe(layout.point(at('a5')).y + height);
    expect(layout.point(at('2:a5')).x).toBe(layout.point(at('a5')).x);
  });

  test('keeps the rows on the hole grid across the seam (j to the next a is a whole number of pitches)', () => {
    const layout = createLayout(stacked(2));
    const span = (layout.point(at('2:a5')).y - layout.point(at('j5')).y) / layout.pitch;

    expect(span).toBeCloseTo(Math.round(span));
  });

  test('leaves a single board where it was', () => {
    const one = createLayout(createBoard('full'));
    const two = createLayout(stacked(2));

    expect(two.point(at('j5'))).toEqual(one.point(at('j5')));
  });
});

describe('drawing stacked boards', () => {
  test('draws one plate per board', () => {
    const one = renderBreadboard('board: full\n').svg;
    const two = renderBreadboard(fence()).svg;
    const plates = (svg: string) => (svg.match(/rx="7"/g) ?? []).length;

    expect(plates(two)).toBe(plates(one) + 1);
  });

  test('lets a wire and a two lead part cross the seam', () => {
    const { errors, notices, netlist } = renderBreadboard(fence(
      'parts:',
      '  R1: resistor j27 2:a27 330',
      '  D1: led 2:b27(A) 2:b28(K) green',
      'wires:',
      '  - 2:a28 -- 2:-t28 black',
      '  - -t62 -- 2:-b62 black',
    ));

    expect(errors).toEqual([]);
    expect(notices).toEqual([]);
    expect(JSON.stringify(netlist)).toContain('R1.2');
    expect(JSON.stringify(netlist)).toContain('D1.A');
  });

  test('names the rails of the second board with its number in the netlist', () => {
    const { netlist } = renderBreadboard(fence('parts:', '  R1: resistor 2:+t5 2:a5 1k'));

    expect(JSON.stringify(netlist)).toContain('2:+t');
  });

  test('places an anchored chip on the second board', () => {
    const { errors, netlist } = renderBreadboard(fence(
      'parts:',
      '  U1: dip8 @ 2:e10',
      'wires:',
      '  - U1.4 -- 2:-b10 black',
    ));

    expect(errors).toEqual([]);
    expect(JSON.stringify(netlist)).toContain('U1.4');
    expect(JSON.stringify(netlist)).toContain('2:-b');
  });

  test('refuses a part with more than two leads that straddles the seam', () => {
    const { errors } = renderBreadboard(fence('parts:', '  Q1: transistor j5 j6 2:a7'));

    expect(errors[0]?.message).toContain('継ぎ目');
  });

  test('reports a hole on a board that is not there', () => {
    const { errors } = renderBreadboard(fence('wires:', '  - a5 -- 3:a5'));

    expect(errors[0]?.message).toContain('3 枚め');
  });

  test('counts the boards in the parts list', () => {
    const { svg } = renderBreadboard(fence('parts:', '  R1: resistor 2:a5 2:a9 1k'));

    expect(svg).toContain('full (830 穴) × 2');
  });
});

describe('the map of stacked boards', () => {
  test('draws no layer to grab, as editing does not know the boards yet', () => {
    const { svg } = renderBreadboard(fence('parts:', '  R1: resistor 2:a5 2:a9 1k'), { edit: true });

    expect(svg).not.toContain('cf-cell');
  });

  test('keeps the layer to grab on a single board', () => {
    const { svg } = renderBreadboard('parts:\n  R1: resistor a5 a9 1k\n', { edit: true });

    expect(svg).toContain('cf-cell');
  });
});
