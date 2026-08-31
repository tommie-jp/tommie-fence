import { describe, expect, test } from 'vitest';
import { createBoard } from '../model/board.ts';
import { createLayout } from '../model/layout.ts';
import { parseFence } from '../parser/parseFence.ts';
import { placeParts } from '../placement/place.ts';
import type { PlacedPart } from '../types.ts';
import { partObstacles, renderPart } from './parts.ts';
import { bodyHalfHeight, bodyHalfWidth } from './threeLead.ts';
import { num } from './svg.ts';
import { resolveStyle } from './theme.ts';

const board = createBoard('half');
const layout = createLayout(board);
const theme = resolveStyle(parseFence('parts:\n').doc!.style).style.theme;

/** 部品 1 つのフェンスを組んで、置かれた部品を取り出す。 */
function place(line: string): PlacedPart {
  const doc = parseFence(`parts:\n  ${line}\n`).doc;
  const part = placeParts(doc!.parts, board).parts[0];
  if (!part) throw new Error(`置けなかった: ${line}`);
  return part;
}

/** 真ん中の足の位置。3 本足の胴はここを中心に描かれる。 */
const centerX = (part: PlacedPart): number => layout.point(part.pins[1]!.address!).x;

/** 端の比較は丸め誤差ぶんだけ緩める (px として意味のない差)。 */
const EPSILON = 1e-9;

describe('bodyHalfWidth', () => {
  test('is the same as the body half height for the round TO-92 package', () => {
    const part = place('Q1: transistor a3 a4 a5');

    expect(bodyHalfWidth(part, layout)).toBe(bodyHalfHeight(part, layout));
  });

  test.each([
    ['Q1: transistor/to220 a3 a4 a5'],
    ['VR1: potentiometer a3 a4 a5'],
    ['SW1: slide-switch a3 a4 a5'],
  ])('is wider than the body half height for %s, whose shell is drawn wide', (line) => {
    const part = place(line);

    expect(bodyHalfWidth(part, layout)).toBeGreaterThan(bodyHalfHeight(part, layout));
  });
});

describe('partObstacles for three lead parts', () => {
  test.each([
    ['Q1: transistor a3 a4 a5'],
    ['Q1: transistor/to220 a3 a4 a5'],
    ['VR1: potentiometer a3 a4 a5'],
    ['SW1: slide-switch a3 a4 a5'],
  ])('covers the full width of the shell drawn for %s', (line) => {
    const part = place(line);
    const [rect] = partObstacles(part, layout, theme);
    const half = bodyHalfWidth(part, layout);
    const center = centerX(part);

    expect(rect!.x).toBeLessThanOrEqual(center - half + EPSILON);
    expect(rect!.x + rect!.width).toBeGreaterThanOrEqual(center + half - EPSILON);
  });

  test('covers a caption that sticks out past the body with a band of its own', () => {
    const part = place('SW1: slide-switch a3 a4 a5 l="SPDT 6A 125VAC"');
    const [body, label] = partObstacles(part, layout, theme);

    expect(body!.width).toBe(bodyHalfWidth(part, layout) * 2);
    expect(label!.width).toBeGreaterThan(body!.width);
    // 字の帯は字の高さぶんだけ。胴の高さいっぱいに広げると、何も描いていない
    // ところまで塞いで、空いているレーンを配線に諦めさせてしまう。
    expect(label!.height).toBeLessThan(body!.height);
  });

  test('puts the caption band where the caption is actually drawn', () => {
    const part = place('VR1: potentiometer a3 a4 a5 10k');
    const [, label] = partObstacles(part, layout, theme);
    const svg = renderPart(part, layout, theme);
    const baseline = Number(/<text x="[\d.]+" y="([\d.]+)"[^>]*>VR1 10k</.exec(svg)?.[1]);

    expect(baseline).toBeGreaterThanOrEqual(label!.y);
    expect(baseline).toBeLessThanOrEqual(label!.y + label!.height);
  });

  test('gives the wide slide switch a wider obstacle than the round transistor', () => {
    const [wide] = partObstacles(place('SW1: slide-switch a3 a4 a5'), layout, theme);
    const [round] = partObstacles(place('Q1: transistor a3 a4 a5'), layout, theme);

    expect(wide!.width).toBeGreaterThan(round!.width);
  });
});

describe('three lead shells', () => {
  // 描画と障害物が別々の係数を持つと、また片方だけずれる。同じ関数から出ていることを見張る。
  test.each([
    ['Q1: transistor/to220 a3 a4 a5'],
    ['VR1: potentiometer a3 a4 a5'],
    ['SW1: slide-switch a3 a4 a5'],
  ])('draws the body of %s exactly as wide as bodyHalfWidth reports', (line) => {
    const part = place(line);
    const half = bodyHalfWidth(part, layout);
    const svg = renderPart(part, layout, theme);

    expect(svg).toContain(`x="${num(centerX(part) - half)}" y=`);
    expect(svg).toContain(`width="${num(half * 2)}"`);
  });
});
