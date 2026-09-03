import { describe, expect, test } from 'vitest';
import { NO_TURN } from '../parts/orient.ts';
import { THEME } from './theme.ts';
import { renderParts } from './parts.ts';
import { createBoard } from '../model/board.ts';
import { createLayout } from '../model/layout.ts';
import { formatAddress, parseAddress } from '../model/address.ts';
import { placeParts } from '../placement/place.ts';
import { SMA_SIZE, edgeMountOf } from '../placement/geometry.ts';
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

    expect(boxes.length).toBe(5); // 胴 1 + 帯 4 (数字 2 + 乗数 + 許容差)
    for (const band of boxes.slice(1)) {
      expect(band.x).toBeGreaterThanOrEqual(shell.x);
      expect(band.right).toBeLessThanOrEqual(shell.right);
    }
  });
});

describe('SMA コネクタ', () => {
  const sma = (variant: string | null) => placeParts(
    [{ id: 'J1', type: 'sma', variant, holes: ['c4', 'c6'], value: null, written: 'sma c4 c6', turn: NO_TURN, line: 1 }],
    board,
  ).parts;

  test('draws a pin in the middle of a male one and a socket in a female one', () => {
    const male = renderParts(sma('male'), layout, THEME);
    const female = renderParts(sma('female'), layout, THEME);

    // 合う相手を取り違えないように、姿で描き分ける。
    expect(male).not.toBe(female);
    expect(male).toContain('#d8b64a');
    expect(female).toContain('#2b2f33');
  });

  test('keeps the body the same size however far apart the legs are', () => {
    // 金物なので、足を広げても胴は伸びない (玉の部品と同じ扱い)。
    const near = renderParts(sma('female'), layout, THEME);
    const far = renderParts(
      placeParts(
        [{ id: 'J1', type: 'sma', variant: 'female', holes: ['c4', 'c9'], value: null, written: 'sma c4 c9', turn: NO_TURN, line: 1 }],
        board,
      ).parts,
      layout,
      THEME,
    );
    const widthOf = (svg: string): string => /<rect x="[-0-9.]+" y="[-0-9.]+" width="([0-9.]+)"/.exec(svg)?.[1] ?? '';

    expect(widthOf(far)).toBe(widthOf(near));
  });
});

describe('SMA の横置き (端面実装)', () => {
  const edge = (variant: string) => placeParts(
    [{ id: 'J1', type: 'sma', variant, holes: ['c4', 'b2', 'd2'], value: null, written: `sma/${variant} c4 b2 d2`, turn: NO_TURN, line: 1 }],
    board,
  ).parts;

  test('reaches past the GND leg, which is the end that sits at the board edge', () => {
    const svg = renderParts(edge('female-edge'), layout, THEME);
    const body = /<g transform="translate\(([-0-9.]+) /.exec(svg);
    const gnd = layout.point(parseAddress('b2')!);
    const centre = layout.point(parseAddress('c4')!);

    // 胴の中心は凹の先端 (2 列目) より外側 — 中心導体 (c4) から見て向こう側にある。
    expect(Number(body?.[1])).toBeLessThan(gnd.x);
    expect(gnd.x).toBeLessThan(centre.x);
  });

  test('draws threads, which the upright form has none of', () => {
    const flat = renderParts(edge('female-edge'), layout, THEME);
    const upright = renderParts(
      placeParts(
        [{ id: 'J1', type: 'sma', variant: 'female', holes: ['c4', 'c2'], value: null, written: 'sma c4 c2', turn: NO_TURN, line: 1 }],
        board,
      ).parts,
      layout,
      THEME,
    );

    expect((flat.match(/<line /g) ?? []).length).toBeGreaterThan((upright.match(/<line /g) ?? []).length);
  });

  test('keeps the caption over the legs, not over the body that hangs off the board', () => {
    const svg = renderParts(edge('male-edge'), layout, THEME);
    const label = /<text x="([0-9.]+)"[^>]*>J1<\/text>/.exec(svg);

    expect(Number(label?.[1])).toBe((layout.point(parseAddress('c4')!).x + layout.point(parseAddress('b2')!).x) / 2);
  });
});

describe('SMA 横置きの足の形', () => {
  const edge = placeParts(
    [{ id: 'J1', type: 'sma', variant: 'female-edge', holes: ['c4', 'b2', 'd2'], value: null, written: 'sma/female-edge c4 b2 d2', turn: NO_TURN, line: 1 }],
    board,
  ).parts;

  test('draws ground as one concave piece, so it is not read as two loose legs', () => {
    // アースは口の開いた凹。上下の腕と谷が 1 つの形になっている。
    const svg = renderParts(edge, layout, THEME);
    const points = /<polygon points="([^"]+)"/.exec(svg)?.[1] ?? '';
    const ys = points.split(' ').map((pair) => Number(pair.split(',')[1]));

    expect(ys.length).toBe(8);
    // 軸を挟んで上下に同じだけ広がる。
    expect(Math.min(...ys)).toBeCloseTo(-Math.max(...ys), 5);
  });

  test('reaches the centre conductor further in than the ground, so it is the convex one', () => {
    const svg = renderParts(edge, layout, THEME);
    const centre = /<rect x="([-0-9.]+)" y="-2.5" width="([0-9.]+)"[^>]*fill="#d8b64a"/.exec(svg);
    const points = /<polygon points="([^"]+)"/.exec(svg)?.[1] ?? '';
    const groundRight = Math.max(...points.split(' ').map((pair) => Number(pair.split(',')[0])));
    const centreRight = Number(centre?.[1]) + Number(centre?.[2]);

    expect(centreRight).toBeGreaterThan(groundRight);
  });

  test('lands the base on the edge of the board, not over the holes', () => {
    // 台座の右端が板の縁。実物もそこで板を挟む。
    const mount = edgeMountOf(edge[0]!, layout)!;

    expect(mount.edgeX).toBeLessThan(mount.legX);
    expect(layout.board.x).toBeCloseTo(mount.rect.cx + mount.edgeX, 5);
  });
});

describe('SMA 横置きの 3 本足 (凹の両端)', () => {
  const edge = placeParts(
    [{ id: 'J1', type: 'sma', variant: 'female-edge', holes: ['c4', 'b2', 'd2'], value: null, written: 'sma/female-edge c4 b2 d2', turn: NO_TURN, line: 1 }],
    board,
  ).parts;

  test('takes three pins — the centre conductor and the two tips of the notch', () => {
    expect(edge[0]?.pins.map((pin) => formatAddress(pin.address))).toEqual(['c4', 'b2', 'd2']);
  });

  test('keeps the body level — the axis follows the board edge, not the legs', () => {
    const mount = edgeMountOf(edge[0]!, layout)!;

    expect(mount.rect.angle).toBe(0);
    expect(mount.rect.cy).toBe(layout.point(parseAddress('c4')!).y);
  });

  test('puts one contact mark on each tip pin, above and below the centre line', () => {
    const svg = renderParts(edge, layout, THEME);
    const ys = [...svg.matchAll(/<circle cx="[-0-9.]+" cy="([-0-9.]+)" r="[0-9.]+" fill="#d7dce1"/g)]
      .map((match) => Number(match[1]))
      .sort((one, other) => one - other);

    expect(ys).toEqual([-layout.pitch, layout.pitch]);
  });

  test('lays the solder over the tip pins, the way it sits on any other leg', () => {
    const svg = renderParts(edge, layout, THEME);
    const pin = svg.indexOf('fill="#d7dce1"');
    const solder = svg.indexOf(`fill="${THEME.palette.land}"`, pin);

    expect(pin).toBeGreaterThan(-1);
    // 足の印のあとに半田の玉が来る (あとに描いたものが上に乗る)。
    expect(solder).toBeGreaterThan(pin);
  });

  test('keeps the arms as they were — the tips only reach the pads, not the holes', () => {
    const svg = renderParts(edge, layout, THEME);
    const points = /<polygon points="([^"]+)"/.exec(svg)?.[1] ?? '';
    const ys = points.split(' ').map((pair) => Number(pair.split(',')[1]));

    expect(Math.max(...ys)).toBeLessThan(layout.pitch);
    expect(Math.min(...ys)).toBeCloseTo(-Math.max(...ys), 5);
  });

  test('draws no lead line between the legs — it would read as a short', () => {
    const svg = renderParts(edge, layout, THEME);
    const c4 = layout.point(parseAddress('c4')!);
    const b2 = layout.point(parseAddress('b2')!);

    expect(svg).not.toContain(`<line x1="${c4.x}" y1="${c4.y}" x2="${b2.x}" y2="${b2.y}"`);
  });

  test('is still one edge mount, not a box, when it sits on the right-hand edge', () => {
    const right = placeParts(
      [{ id: 'J2', type: 'sma', variant: 'female-edge', holes: ['c7', 'b9', 'd9'], value: null, written: 'sma/female-edge c7 b9 d9', turn: NO_TURN, line: 1 }],
      board,
    ).parts;
    const mount = edgeMountOf(right[0]!, layout)!;

    expect(Math.abs(mount.rect.angle)).toBeCloseTo(Math.PI, 5);
    expect(mount.rect.height).toBe(SMA_SIZE);
  });
});

describe('縦に置いた部品のキャプション', () => {
  test('turns the text a quarter clockwise, so it lies along the part', () => {
    // 横のままだと、細長い部品の脇に長い字が伸びて隣の部品や配線に被る。
    const upright = draw(part({ holes: ['b3', 'e3'], value: '10k' }));

    expect(upright).toContain('rotate(90)');
  });

  test('leaves a part lying across the board with level text', () => {
    expect(draw(part({ holes: ['b3', 'b6'], value: '10k' }))).not.toContain('rotate(90)');
  });

  test('puts the turned text beside the body, not on top of it', () => {
    const upright = draw(part({ holes: ['b3', 'e3'], value: '10k' }));
    // 胴の group も rotate(90) なので、**字を抱えているほう**を見る。
    const at = /<g transform="translate\(([0-9.]+) ([0-9.]+)\) rotate\(90\)"><text/.exec(upright);
    const hole = layout.point(parseAddress('b3')!);

    expect(Number(at?.[1])).toBeGreaterThan(hole.x);
    // 足の真ん中の高さに来る (胴の中心ではなく、部品そのものの位置)。
    expect(Number(at?.[2])).toBeCloseTo((hole.y + layout.point(parseAddress('e3')!).y) / 2, 5);
  });
});
