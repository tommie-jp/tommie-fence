import { describe, expect, test } from 'vitest';
import { renderJoints } from './joints.ts';
import { THEME } from './theme.ts';
import { createBoard } from '../model/board.ts';
import { createLayout } from '../model/layout.ts';
import { parseAddress } from '../model/address.ts';

const layout = createLayout(createBoard({ cols: 10, rows: 6 }));
const at = (text: string) => parseAddress(text)!;

describe('renderJoints', () => {
  test('fills the hole with solder where something was connected', () => {
    const svg = renderJoints([at('b3')], layout, THEME);
    const { x, y } = layout.point(at('b3'));

    expect(svg).toContain(`cx="${x}"`);
    expect(svg).toContain(`cy="${y}"`);
    expect(svg).toContain(THEME.palette.land);
  });

  test('draws it larger than the land, the way solder sits proud of the copper', () => {
    const svg = renderJoints([at('b3')], layout, THEME);
    const radius = Number(/r="([0-9.]+)"/.exec(svg)?.[1]);

    expect(radius).toBeGreaterThan(THEME.metrics.landSize / 2);
  });

  test('draws one blob per hole, however many things meet there', () => {
    // 同じ穴に足と配線が来るのは普通のこと。2 つ描くと縁が濃くなって浮く。
    expect(renderJoints([at('b3'), at('b3')], layout, THEME).match(/<circle/g)?.length).toBe(1);
  });

  test('draws nothing where nothing was connected', () => {
    expect(renderJoints([], layout, THEME)).toBe('');
  });
});
