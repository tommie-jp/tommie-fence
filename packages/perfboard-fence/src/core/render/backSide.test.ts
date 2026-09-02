import { describe, expect, test } from 'vitest';
import { backSideLayout, renderBackSide } from './backSide.ts';
import { THEME } from './theme.ts';
import { createBoard } from '../model/board.ts';
import { createLayout } from '../model/layout.ts';
import { parseAddress } from '../model/address.ts';
import { placeParts } from '../placement/place.ts';

const board = createBoard({ cols: 16, rows: 8 });
const labels = { row: 'alpha', col: 'numeric', case: 'upper', sides: ['left', 'top'] } as const;
const at = (text: string) => parseAddress(text)!;

const dip = placeParts(
  [{ id: 'IC1', type: 'dip8', variant: null, holes: ['b3'], value: null, written: 'dip8 b3', line: 1 }],
  board,
).parts;

const draw = (layout = backSideLayout(board, labels)): string =>
  renderBackSide(board, layout, { wires: [], parts: dip, soldered: [] }, THEME, labels, 0);

/** 1 番ピンの穴の中心 x。 */
const pinOneX = (layout = backSideLayout(board, labels)): number =>
  layout.point(dip[0]!.pins[0]!.address).x;

describe('renderBackSide', () => {
  test('names itself, so it cannot be taken for the component side', () => {
    expect(draw()).toContain('半田面');
  });

  test('puts the pin-1 notch on the pin-1 side, even though the board is mirrored', () => {
    // ここを取り違えると、図のとおりに挿した IC が 180 度回る。
    const svg = draw();
    const notch = /<circle cx="([0-9.]+)"[^>]*r="4"/.exec(svg);
    const front = renderBackSide(board, createLayout(board, { title: true }), { wires: [], parts: dip, soldered: [] }, THEME, labels, 0);
    const frontNotch = /<circle cx="([0-9.]+)"[^>]*r="4"/.exec(front);

    expect(Math.abs(Number(notch?.[1]) - pinOneX())).toBeLessThan(20);
    expect(Math.abs(Number(frontNotch?.[1]) - pinOneX(createLayout(board, { title: true })))).toBeLessThan(20);
  });
});

describe('裏返した板の縁の銅箔', () => {
  const slotted = { ...createBoard({ cols: 16, rows: 8 }), slots: true };

  test('is drawn on the solder side too, since the copper is on the board itself', () => {
    const layout = backSideLayout(slotted, labels);
    const svg = renderBackSide(slotted, layout, { wires: [], parts: [], soldered: [] }, THEME, labels, 0);

    // 銅箔は角丸の矩形。板 1 枚と、行ごとに左右 1 つずつ。
    expect((svg.match(/<rect /g) ?? []).length).toBe(1 + slotted.rows * 2);
  });
});

describe('半田面の重ね順', () => {
  test('draws the parts behind the wires and the joints, and dims them', () => {
    // 半田面で見るのは半田付けする穴と、そこを渡るジャンパ。部品は板の向こう側。
    const board = createBoard({ cols: 16, rows: 8 });
    const layout = backSideLayout(board, labels);
    const svg = renderBackSide(
      board,
      layout,
      { wires: [{ from: at('b3'), to: at('b6'), color: null, line: 1 }], parts: dip, soldered: [at('b3')] },
      THEME,
      labels,
      0,
    );

    expect(svg).toContain('opacity="0.35"');
    // 部品 → 配線 → 半田点 の順に並ぶ (あとに書いたものが手前)。
    expect(svg.indexOf('opacity="0.35"')).toBeLessThan(svg.indexOf('<line'));
    expect(svg.lastIndexOf('<line')).toBeLessThan(svg.lastIndexOf('<circle'));
  });
});
