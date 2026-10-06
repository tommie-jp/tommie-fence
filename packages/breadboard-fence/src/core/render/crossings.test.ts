import { describe, expect, test } from 'vitest';
import { crossingPoints } from './crossings.ts';
import { renderBreadboard } from '../index.ts';

describe('crossingPoints', () => {
  test('gives the crossing to the later wire only', () => {
    const hops = crossingPoints([
      [{ x: 0, y: 0 }, { x: 40, y: 40 }],
      [{ x: 40, y: 0 }, { x: 0, y: 40 }],
    ]);
    expect(hops).toEqual([[], [{ x: 20, y: 20 }]]);
  });

  test('finds a crossing on a bent wire', () => {
    const hops = crossingPoints([
      [{ x: 20, y: 0 }, { x: 20, y: 60 }],
      [{ x: 0, y: 10 }, { x: 0, y: 30 }, { x: 40, y: 30 }],
    ]);
    expect(hops).toEqual([[], [{ x: 20, y: 30 }]]);
  });

  test('does not hop where wires meet at a shared hole', () => {
    const hops = crossingPoints([
      [{ x: 0, y: 0 }, { x: 20, y: 20 }],
      [{ x: 20, y: 20 }, { x: 40, y: 0 }],
    ]);
    expect(hops).toEqual([[], []]);
  });

  test('does not hop where wires run along each other', () => {
    const hops = crossingPoints([
      [{ x: 0, y: 0 }, { x: 40, y: 0 }],
      [{ x: 20, y: 0 }, { x: 60, y: 0 }],
    ]);
    expect(hops).toEqual([[], []]);
  });
});

describe('wires that cross', () => {
  test('draws the later wire hopping over the earlier one', () => {
    const { svg } = renderBreadboard([
      'board: mini',
      'wires:',
      '  - e3 -- f12 brown',
      '  - e4 -- f5 purple',
    ].join('\n'));
    expect(svg).toMatch(/<path d="[^"]* A [^"]*"/);
  });

  test('draws wires that do not cross without a hop', () => {
    const { svg } = renderBreadboard([
      'board: mini',
      'wires:',
      '  - e3 -- f3 blue',
      '  - e8 -- f8 purple',
    ].join('\n'));
    expect(svg).not.toMatch(/<path d="[^"]* A [^"]*"/);
  });
});

describe('短い線の跨ぎ', () => {
  test('draws the hop in the coloured cover too, when it sits next to the stripped end', () => {
    // 溝をまたぐ 2 穴の緑の線が、溝の脇を走る橙の線を跨ぐ。跨ぎは端から 10 px で、
    // 剥いた所 (9 px) に弧の始まりが掛かる。被覆にも弧が無いと、芯線の弧だけが浮いて見えた。
    const { svg } = renderBreadboard([
      'board: half',
      'wires:',
      '  - e9 -- e19 orange [v10]',
      '  - e13 -- f13 green',
    ].join('\n'));
    const green = [...svg.matchAll(/<path d="([^"]*)" fill="none" stroke="#2a9d4b"/g)].map((match) => match[1]);
    expect(green).toHaveLength(1);
    expect(green[0]).toContain(' A ');
  });
});
