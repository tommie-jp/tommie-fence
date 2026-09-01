import { describe, expect, test } from 'vitest';
import { THEME } from './theme.ts';
import { renderParts } from './parts.ts';
import { createBoard } from '../model/board.ts';
import { createLayout } from '../model/layout.ts';
import { parseAddress } from '../model/address.ts';
import type { PlacedPart } from '../types.ts';

const board = createBoard({ cols: 10, rows: 6 });
const layout = createLayout(board);

const part = (over: Partial<PlacedPart> & { holes: readonly string[] }): PlacedPart => ({
  id: over.id ?? 'R1',
  type: over.type ?? 'resistor',
  variant: over.variant ?? null,
  value: over.value ?? null,
  line: over.line ?? null,
  pins: over.holes.map((hole) => ({ address: parseAddress(hole)!, strip: hole })),
});

const draw = (p: PlacedPart): string => renderParts([p], layout, THEME);

describe('renderParts', () => {
  test('runs a lead from one hole to the other', () => {
    const svg = draw(part({ holes: ['b3', 'b7'] }));
    const from = layout.point(parseAddress('b3')!);
    const to = layout.point(parseAddress('b7')!);

    expect(svg).toContain(`x1="${from.x}"`);
    expect(svg).toContain(`x2="${to.x}"`);
    expect(svg).toContain(`y1="${from.y}"`);
  });

  test('turns the body to follow the leads', () => {
    // 斜めに置いた部品は、実物と同じく 2 穴を結ぶ線の上に寝る。
    expect(draw(part({ holes: ['b3', 'd5'] }))).toContain('rotate(45)');
    expect(draw(part({ holes: ['b3', 'b7'] }))).toContain('rotate(0)');
  });

  test('paints the colour code when the value is a resistance it can read', () => {
    const svg = draw(part({ holes: ['b3', 'b7'], value: '10k' }));

    // 10k = 茶 (1) 黒 (0) 橙 (×1000)
    expect(svg).toContain('#6b4423');
    expect(svg).toContain('#1b1d21');
    expect(svg).toContain('#e07b1e');
  });

  test('leaves the bands off when the value is not a resistance', () => {
    const svg = draw(part({ holes: ['b3', 'b7'], value: 'ヒューズ用' }));

    expect(svg).not.toContain('#e07b1e');
  });

  test('gives an led the colour that was written', () => {
    expect(draw(part({ id: 'D1', type: 'led', holes: ['c5', 'c7'], value: 'green' }))).toContain('#37b34a');
  });

  test('falls back to the default led colour instead of dropping an unknown one', () => {
    const svg = draw(part({ id: 'D1', type: 'led', holes: ['c5', 'c7'], value: 'nosuch' }));

    expect(svg).toContain('#e0392c');
  });

  test('writes the id and the value under the part', () => {
    const svg = draw(part({ holes: ['b3', 'b7'], value: '10k' }));

    expect(svg).toContain('>R1 10k</text>');
  });

  test('escapes the value, so a fence cannot inject markup', () => {
    const svg = draw(part({ holes: ['b3', 'b7'], value: '<img src=x>' }));

    expect(svg).not.toContain('<img');
    expect(svg).toContain('&lt;img');
  });

  test('draws nothing for a part with no pins', () => {
    expect(renderParts(
      [{ id: 'R1', type: 'resistor', variant: null, value: null, line: null, pins: [] }],
      layout,
      THEME,
    ))
      .toBe('');
  });
  test('cuts a caption that would run off the board, and marks the cut', () => {
    // 切らずに置くと viewBox の外へ出て**黙って消える**ので、読む側は
    // 切れたことにも気づけない (breadboard が同じ穴を踏んでいる)。
    const svg = draw(part({ holes: ['b1', 'b2'], value: 'とても長い日本語のラベルをわざと書いてみる' }));
    const shown = /<text[^>]*>([^<]*)<\/text>/.exec(svg)?.[1] ?? '';

    expect(shown.endsWith('…')).toBe(true);
    expect(shown.length).toBeLessThan(24);
  });

  test('leaves a caption that fits untouched', () => {
    expect(draw(part({ holes: ['e3', 'e7'], value: '10k' }))).toContain('>R1 10k</text>');
  });
  test('keeps the colour bands inside the body on a short part', () => {
    // 隣り合う穴に挿した抵抗は胴が短い。帯の間隔を決め打つと、
    // **帯が板の地の上や隣の穴の上に乗る**。
    const svg = draw(part({ holes: ['b3', 'b4'], value: '10k' }));
    // `[^>]*width=` は stroke-width も拾うので、空白付きで見る。
    const boxes = [...svg.matchAll(/<rect x="(-?[0-9.]+)"[^>]*?\swidth="([0-9.]+)"/g)]
      .map(([, x, w]) => ({ x: Number(x), right: Number(x) + Number(w) }));
    const shell = boxes[0]!;

    expect(boxes.length).toBe(4); // 胴 1 + 帯 3
    for (const band of boxes.slice(1)) {
      expect(band.x).toBeGreaterThanOrEqual(shell.x);
      expect(band.right).toBeLessThanOrEqual(shell.right);
    }
  });
});
