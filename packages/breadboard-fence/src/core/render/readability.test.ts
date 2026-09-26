import { describe, expect, test } from 'vitest';
import { renderBreadboard } from '../index.ts';
import { createBoard } from '../model/board.ts';
import { createLayout } from '../model/layout.ts';
import { DEFAULT_THEME } from './theme.ts';
import { DEFAULT_WIRE_COLOR, WIRE_COLORS } from './palette.ts';
import { WIRE_OUTLINE, renderWire, wireOutline } from './wires.ts';

/**
 * 実体配線図の読みやすさ。教科書の図を 1 枚ずつ見て分けた症状を、
 * **色と座標で**見張る (見た目の好みではなく、読み違えの原因になったもの)。
 */
const fence = (...lines: string[]) => renderBreadboard(lines.join('\n'));

describe('wires stand out from the board and from the leads', () => {
  const plate = DEFAULT_THEME.palette.plate;

  test('a white wire gets an outline because it is the same brightness as the board', () => {
    // AD の図の 2− の白線が板に溶けて、どこへ行くのか読めなかった。
    expect(wireOutline(WIRE_COLORS.white!, plate)).toBe(WIRE_OUTLINE);
  });

  test('the default gray wire gets an outline so it does not read as a lead', () => {
    expect(DEFAULT_WIRE_COLOR).not.toBe(DEFAULT_THEME.palette.lead);
    expect(wireOutline(DEFAULT_WIRE_COLOR, plate)).toBe(WIRE_OUTLINE);
  });

  test('colours that already stand out are left as they are', () => {
    for (const name of ['red', 'black', 'blue', 'green', 'yellow', 'orange']) {
      expect(wireOutline(WIRE_COLORS[name]!, plate), name).toBeNull();
    }
  });

  test('the outline is laid under the line and is wider than it', () => {
    const paint = renderWire([{ x: 0, y: 0 }, { x: 100, y: 0 }], WIRE_COLORS.white!, DEFAULT_THEME);
    const width = (svg: string) => Number(/stroke-width="([\d.]+)"/.exec(svg)?.[1]);

    expect(paint.halo).toContain(`stroke="${WIRE_OUTLINE}"`);
    expect(width(paint.halo)).toBeGreaterThan(width(paint.line));
  });

  test('a theme that already rims every wire keeps its own rim', () => {
    const { svg } = fence('style: dark', 'wires:', '  - a5 -- a12 white');
    expect(svg).not.toContain(`stroke="${WIRE_OUTLINE}"`);
  });
});

describe('part captions sit on a clean patch of board', () => {
  const layout = createLayout(createBoard('half'));
  const holeSize = DEFAULT_THEME.metrics.holeSize;

  /** 描かれた穴 (四角) の中心。 */
  const holes = (svg: string) => [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="\3" rx="1"/g)]
    .filter((match) => Number(match[3]) === holeSize)
    .map((match) => ({ x: Number(match[1]) + holeSize / 2, y: Number(match[2]) + holeSize / 2 }));

  test('no hole peeks out under the caption of a resistor', () => {
    // 「R1 1k」の下に c 行の穴の欠片が `ˌ ˌ` と覗き、足の目盛りのように見えていた。
    const { svg } = fence('parts:', '  R1: resistor b5 b10 1k');
    const label = /<text x="([\d.]+)" y="([\d.]+)"[^>]*class="bf-caption"[^>]*>R1 1k</.exec(svg)!;
    const [x, y] = [Number(label[1]), Number(label[2])];

    const drawn = holes(svg);
    // 名札の真下にあった c 行の穴 (6〜9 列) は描かれない。
    for (const col of [7, 8]) {
      expect(drawn).not.toContainEqual({ x: layout.colX(col), y: layout.rowY('c') });
    }
    // 名札から離れた穴は今までどおり描く。
    expect(drawn).toContainEqual({ x: layout.colX(20), y: layout.rowY('c') });
    // 名札の字の範囲に掛かる穴は 1 つも無い。
    const halfWidth = 'R1 1k'.length * 7 / 2;
    const touching = drawn.filter((hole) =>
      Math.abs(hole.x - x) < halfWidth && hole.y + holeSize / 2 > y - 10 && hole.y - holeSize / 2 < y + 3);
    expect(touching).toEqual([]);
  });

  test('a caption is drawn above every part body, even ones written later', () => {
    // 水晶発振の図で `Rd 330` が後に書いた水晶の缶の下に消えていた。
    const { svg } = fence(
      'parts:',
      '  Rd: resistor h6 h15 330',
      '  X1: crystal/hc49 i5 i15',
    );
    const caption = svg.indexOf('>Rd 330<');
    const lastBody = svg.lastIndexOf('<g transform=');

    expect(caption).toBeGreaterThan(lastBody);
  });
});

describe('parts are drawn where they were written unless they cannot be', () => {
  test('a part slid off a wire end stays silent (the documented way of writing)', () => {
    const { notices } = fence('parts:', '  R1: resistor c3 c8 470', 'wires:', '  - c8 -- c12 orange');
    expect(notices).toEqual([]);
  });

  test('a long wire to a rail no longer pushes parts out of the rows it used to cover', () => {
    // 電圧フォロワの図の形: `+t8 -- i8` が 8 列の上を縦に走っていたころは、
    // g8 に書いた R1 が通り道を避けて i 行まで寄っていた。
    const { svg } = fence('parts:', '  R1: resistor g8 g12 100k', 'wires:', '  - +t8 -- i8 red');
    const layout = createLayout(createBoard('half'));
    expect(svg).toContain(`x1="${layout.colX(8)}" y1="${layout.rowY('g')}" x2="${layout.colX(12)}"`);
  });

  test('two resistors written over each other on one row are pulled apart', () => {
    // 電圧フォロワの図の形: `R1 g8 g12` と `RL g10 g6` の胴が g 行で重なる。
    const { svg, notices } = fence(
      'parts:',
      '  R1: resistor g8 g12 100k',
      '  RL: resistor g10 g6 1k',
    );
    const layout = createLayout(createBoard('half'));

    // 先に書いた R1 は書いたまま、RL が寄る。
    expect(svg).toContain(`x1="${layout.colX(8)}" y1="${layout.rowY('g')}" x2="${layout.colX(12)}"`);
    expect(svg).not.toContain(`x1="${layout.colX(10)}" y1="${layout.rowY('g')}"`);
    expect(notices.map((notice) => notice.message)).toEqual([expect.stringContaining('部品 R1 の胴と重なるので')]);
  });

  test('a part written where it can be built is not moved and not reported', () => {
    const { notices } = fence('parts:', '  R1: resistor c3 c8 470', 'wires:', '  - b8 -- b12 orange');
    expect(notices).toEqual([]);
  });
});
