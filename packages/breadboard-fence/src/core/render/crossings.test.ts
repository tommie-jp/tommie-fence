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
