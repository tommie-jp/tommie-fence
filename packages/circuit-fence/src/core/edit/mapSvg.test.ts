import { textWidth } from 'fence-kit';
import { describe, expect, test } from 'vitest';
import { gridMap } from './map.ts';
import { glyphOf, glyphSpan, glyphTall } from './mapGlyphs.ts';
import { renderMapHtml } from './mapSvg.ts';
import { lookupPartType, partTypeNames } from '../parts.ts';

const draw = (source: string): string => renderMapHtml(gridMap(source));

/** 10px の字がベースラインから上へ出る高さ。名前の頭がどこに来るかを測るのに使う。 */
const NAME_CAP = 7.5;

/** 記号と名前の間に見えていてほしい隙間。 */
const NAME_GAP = 3;

describe('renderMapHtml が描くもの', () => {
  test('draws one svg that scales to the panel', () => {
    const svg = draw('parts:\n  R1: resistor a1 a3\n');

    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 ');
  });

  test('draws a line for every wire', () => {
    expect(draw('wires:\n  - a1 -- a3\n')).toContain('class="cf-wire"');
  });

  test('dashes a wire whose end was only approximated', () => {
    // ピンの足の位置は TeX しか知らない。実線で引くと嘘の精度になる。
    const svg = draw('parts:\n  Q1: npn b2\nwires:\n  - Q1.C -- a4\n');

    expect(svg).toContain('cf-approx');
  });

  test('draws the part between its two ends, not in one cell', () => {
    // 2 端子は両端の間に胴を置いて回す。片方の升に押し込めない。
    const svg = draw('parts:\n  R1: resistor a1 a3\n');

    expect(svg).toContain('class="cf-lead"');
    expect(svg).toMatch(/rotate\(/);
  });

  test('names every part next to its shape', () => {
    expect(draw('parts:\n  R1: resistor a1 a3\n')).toContain('>R1</text>');
  });

  test('marks the crossings, so the grid reads as places to drop on', () => {
    expect(draw('parts:\n  R1: resistor a1 a3\n')).toContain('cf-grid-dot');
  });

  test('labels the rows and columns, so an address can be counted off', () => {
    const svg = draw('parts:\n  R1: resistor a1 a3\n');

    expect(svg).toContain('class="cf-axis"');
    expect(svg).toContain('>a</text>');
  });

  test('lays a drop target over every crossing', () => {
    const svg = draw('parts:\n  R1: resistor a1 a3\n');

    expect(svg).toContain('class="cf-cell" data-address="a1"');
    expect(svg).toContain('data-address="b2"');
  });

  test('lays the drop targets edge to edge, one pitch square, since the shell divides the pointer offset by this width', () => {
    // Ctrl で 1/4 升 (52 の docs/23): 殻は升の四角の中の位置を幅で割って端数を出す。
    // 隙間を空けたり縦横を変えたりすると、1/4 の刻みがずれる。
    const svg = draw('parts:\n  R1: resistor a1 a3\n');
    const cellOf = (address: string) => {
      const found = new RegExp(`<rect class="cf-cell" data-address="${address}"([^>]*)>`).exec(svg);
      const attr = (name: string): number => Number(new RegExp(` ${name}="([-\\d.]+)"`).exec(found?.[1] ?? '')?.[1]);
      return { x: attr('x'), y: attr('y'), width: attr('width'), height: attr('height') };
    };
    const [a1, a2, b1] = [cellOf('a1'), cellOf('a2'), cellOf('b1')];

    expect(a1.width).toBeGreaterThan(0);
    expect(a1.width).toBe(a1.height);
    expect(a2.x - a1.x).toBe(a1.width);
    expect(b1.y - a1.y).toBe(a1.height);
  });

  test('offsets two parts spanning the same pair, so neither hides the other', () => {
    // 並列の RC は普通に書く。ぴったり重ねると後ろの 1 つを掴めない。
    const svg = draw('parts:\n  R1: resistor a1 c1\n  C1: capacitor a1 c1\n');
    const bodies = svg.match(/translate\([-\d.]+,[-\d.]+\) rotate\(/g) ?? [];

    expect(bodies).toHaveLength(2);
    expect(new Set(bodies).size).toBe(2);
  });

  test('offsets a pair written end-for-end, which is the same two crossings', () => {
    // `a1 a3` と `a3 a1` は同じ 2 交点。並びで鍵を作ると別物になり、重なる。
    const svg = draw('parts:\n  R1: resistor a1 c1\n  C1: capacitor c1 a1\n');
    const bodies = svg.match(/translate\([-\d.]+,[-\d.]+\) rotate\(/g) ?? [];

    expect(new Set(bodies).size).toBe(2);
  });

  test('offsets two standing parts on one crossing, so neither hides the other', () => {
    const svg = draw('parts:\n  IN: port a1\n  G1: ground a1\n');

    expect(svg).toContain('data-part="IN"');
    expect(svg).toContain('data-part="G1"');
    expect(svg).toContain('translate(0,7)');
  });

  test('escapes what came from the fence, in text and in attributes', () => {
    const svg = draw('parts:\n  R1: resistor a1 a3 "<img src=x>"\n');

    expect(svg).not.toContain('<img');
  });

  test('says so when the fence cannot be read, instead of an empty grid', () => {
    expect(draw('parts: [')).toContain('読めません');
  });
});

describe('向き', () => {
  test('draws a stub with its name for each pin of a multi-terminal part', () => {
    const svg = draw('parts:\n  Q1: npn b2\n');

    expect(svg).toContain('class="cf-pin"');
    expect(svg).toContain('>B</text>');
  });

  test('moves the stub to the side the pin turned to', () => {
    // 立っているとベースは左 (x が負) へ、r90 では上 (y が負) へ出る。
    expect(draw('parts:\n  Q1: npn b2\n')).toContain('x2="-20"');
    expect(draw('parts:\n  Q1: npn b2 r90\n')).toContain('y2="-15"');
  });

  test('turns a standing glyph that has no pins, so ground shows its direction', () => {
    expect(draw('parts:\n  G1: ground b2 r90\n')).toContain('rotate(90)');
  });

  test('leaves the box unturned, since its shape says nothing (the pins do)', () => {
    // **箱に落ちる種類で見る。** 記号を持つ種類 (npn) は回して見せる —
    // 形に向きの意味があるので、回さないと書いた向きが図に出ない。
    const svg = draw('parts:\n  U1: dip8 b2 r90\n');

    expect(svg).not.toContain('rotate(90)');
  });
});

describe('読めなかった行の印', () => {
  const badly = (source: string, bad: readonly number[]): string =>
    renderMapHtml(gridMap(source), new Set(bad));

  test('carries the line a part was written on, so the band can point at it', () => {
    expect(draw('parts:\n  R1: resistor a1 a3\n')).toContain('data-line="2"');
  });

  test('marks the part written on a line the band complained about', () => {
    const svg = badly('parts:\n  R1: resistor a1 a3\n  C1: capacitor a3 c3\n', [2]);

    expect(svg).toContain('class="cf-chip cf-bad" data-part="R1"');
    expect(svg).toContain('class="cf-chip" data-part="C1"');
  });

  test('marks the wire written on a line the band complained about', () => {
    const svg = badly('wires:\n  - a1 -- a3\n', [2]);

    expect(svg).toContain('cf-wire cf-bad');
  });

  test('marks nothing when the fence reads cleanly', () => {
    expect(draw('parts:\n  R1: resistor a1 a3\n')).not.toContain('cf-bad');
  });
});

describe('部品の名前の置き場', () => {
  const nameAt = (source: string, id: string): { x: number; y: number; anchor: string } => {
    const found = new RegExp(`<text x="([-\\d.]+)" y="([-\\d.]+)" text-anchor="(\\w+)"[^>]*class="cf-name"[^>]*>${id}<`)
      .exec(draw(source));
    return { x: Number(found?.[1] ?? 0), y: Number(found?.[2] ?? 0), anchor: found?.[3] ?? '' };
  };

  test('puts the name below a part laid across, the side the figure uses', () => {
    // 実機で「部品の文字列の位置が回路図と違う」。図は横置きなら記号の下
    // (上は値の場所)。
    const { y } = nameAt('parts:\n  R1: resistor c1 c3\n', 'R1');

    expect(y).toBeGreaterThan(0);
    // 記号の真ん中 (c 行) より下。
    expect(y).toBeGreaterThan(Number(/cy="([\d.]+)"/.exec(draw('parts:\n  R1: resistor c1 c3\n'))?.[1] ?? 0));
  });

  test('puts the name to the left of a part stood up, again as the figure does', () => {
    const { anchor } = nameAt('parts:\n  R1: resistor c3 e3\n', 'R1');

    expect(anchor).toBe('end');
  });

  test('turns it to the right at the left edge, where the row labels are', () => {
    // 1 列目に立てた部品の名前は、左に置くと行の見出しに重なって読めない。
    const { anchor } = nameAt('parts:\n  R1: resistor c1 e1\n', 'R1');

    expect(anchor).toBe('start');
  });

  test('puts the name of a transistor to its right, the side the figure uses', () => {
    // 実機で「Q1 が記号の真上にある。回路図では記号の右」。上がコレクタ・
    // 下がエミッタ・左がベースなので、空いているのは右しかない。
    const { x, y, anchor } = nameAt('parts:\n  Q1: npn c3\n', 'Q1');

    expect(x).toBeGreaterThan(0);
    expect(anchor).toBe('start');
    // 高さは記号の真ん中あたり。上 (足の名前 C) や下 (E) には出ない。
    expect(Math.abs(y)).toBeLessThan(10);
  });

  test('keeps the name off the sides that have legs, whichever way the part is turned', () => {
    // 足は記号と一緒に回るので、名札の逃げ場も回る。図 (nameNode) と同じ順で探す。
    expect(nameAt('parts:\n  Q1: npn c3 r180\n', 'Q1').anchor).toBe('end');
    expect(nameAt('parts:\n  Q1: npn c3 mirror\n', 'Q1').anchor).toBe('end');
    // r90 はベースが上・コレクタが右・エミッタが左なので、空くのは下。
    const turned = nameAt('parts:\n  Q1: npn c3 r90\n', 'Q1');

    expect(turned.x).toBe(0);
    expect(turned.y).toBeGreaterThan(10);
  });

  test('puts the name above the parts whose top is free', () => {
    // 足が左右にしかない種類 (オペアンプ・論理ゲート) は上。
    for (const source of ['parts:\n  U1: opamp c3\n', 'parts:\n  U1: and c3\n']) {
      const { x, y, anchor } = nameAt(source, 'U1');

      expect([x, anchor]).toEqual([0, 'middle']);
      expect(y).toBeLessThan(-11);
    }
  });

  test('keeps the name clear of the shape, not just below its centre', () => {
    // 実機で「diac, 部品名が図形に被らないようにする」と、同じ形の 18 種類を
    // 並べて言われた回。**字の頭**が張り出しより下に来なければ被る —
    // 基準線は字の下端なので、張り出しに字の高さを足すまでが要る。
    for (const type of ['diac', 'diode', 'zener', 'varicap', 'triac', 'vsource', 'sine',
      'square', 'isource', 'battery', 'solar', 'triangle', 'lamp', 'ammeter', 'voltmeter',
      'ohmmeter', 'wattmeter', 'galvanometer', 'detector']) {
      const source = `parts:\n  X1: ${type} c1 c3\n`;
      // 記号を置いた点 (`translate`) が記号の中心。名前の y はそこからの隔たり。
      const centre = Number(/translate\(\d+,(\d+)\) rotate/.exec(draw(source))?.[1] ?? 0);
      const top = nameAt(source, 'X1').y - centre - NAME_CAP;

      // 0.5px 空いていても目には触れて見える。**読める隙間**まで離す。
      expect([type, top >= glyphTall(glyphOf(type).name) + NAME_GAP]).toEqual([type, true]);
    }
  });

  test('clears the box, which grows with the number of legs', () => {
    // **箱は足の本数で伸びる。** 決め打ちの距離だと、足の多い DIP で名前が
    // 箱の中や切り欠きの上に乗る (実機で「切り欠きも表示する」と言われた回)。
    const small = nameAt('parts:\n  U1: dip4 c3\n', 'U1');
    const big = nameAt('parts:\n  U1: dip40 c3\n', 'U1');

    expect(small.y).toBeLessThan(-12);
    expect(big.y).toBeLessThan(small.y);
  });
});

describe('2 交点をつなぐ線', () => {
  const leads = (svg: string): number => (svg.match(/class="cf-lead"/g) ?? []).length;

  test('stops the line at the symbol, so no centre line crosses it', () => {
    // 実機で「R, C, L の中心線を非表示に」。コンデンサは「切れている」ことが
    // 記号の意味なので、線を通すと嘘の図になる。
    const svg = draw('parts:\n  C1: capacitor a1 a3\n');

    expect(leads(svg)).toBe(2);
  });

  test('leaves a short whole, since the line is the whole of it', () => {
    expect(leads(draw('parts:\n  S1: short a1 a3\n'))).toBe(1);
  });

  test('leaves the line whole under a part nudged off it', () => {
    // 同じ 2 交点に並べた部品 (並列の RC) は胴が線から外れている。
    // 切ると誰も居ないところに隙間が空く。
    const svg = draw('parts:\n  R1: resistor a1 a3\n  C1: capacitor a1 a3\n');

    expect(leads(svg)).toBe(3);
  });

  test('keeps the gap wide enough for the symbol it holds', () => {
    // コイルは折れ線より長い。同じ幅で切ると、線が山をまたいで出てくる。
    const gapOf = (source: string): number => {
      const found = [...draw(source).matchAll(/class="cf-lead" x1="([-\d.]+)"[^/]*x2="([-\d.]+)"/g)];
      const ends = found.map((one) => [Number(one[1]), Number(one[2])] as const);
      return ends.length < 2 ? 0 : Math.abs((ends[1]?.[0] ?? 0) - (ends[0]?.[1] ?? 0));
    };

    expect(gapOf('parts:\n  L1: inductor a1 a3\n')).toBeGreaterThan(gapOf('parts:\n  C1: capacitor a1 a3\n'));
  });
});

describe('画布の広さ', () => {
  const boxOf = (source: string): readonly number[] =>
    (/class="cf-map" viewBox="([-\d. ]+)"/.exec(draw(source))?.[1] ?? '').split(' ').map(Number);

  test('grows to hold a part that is bigger than the cells it sits on', () => {
    // 実機で「pico を置いても回路図が広がらない」。40 本のボードは升 1 つに
    // 置くが、箱は 20 行ぶんある。升目の大きさで切ると図が丸ごと外へ出る。
    const [, top, , height] = boxOf('parts:\n  U1: pico b2\n');
    const dots = [...draw('parts:\n  U1: pico b2\n')
      .matchAll(/class="cf-pin-dot" cx="[-\d.]+" cy="([-\d.]+)"/g)].map((one) => Number(one[1]));
    // 足は部品の中の座標。b 行 (y=66) に足して、画布の中に収まっていること。
    const legs = dots.map((cy) => 66 + cy);

    expect(Math.min(...legs)).toBeGreaterThan(top ?? 0);
    expect(Math.max(...legs)).toBeLessThan((top ?? 0) + (height ?? 0));
  });

  test('opens the canvas above the origin, since a tall part reaches up', () => {
    // 部品は升の中心を軸に上下へ伸びる。画布の原点は 0 とは限らない。
    expect(boxOf('parts:\n  U1: pico b2\n')[1]).toBeLessThan(0);
  });

  test('runs the row letters down beside a part that is taller than the cells', () => {
    // 実機で「GND があると行英字が広がるのに、pico だけだと広がらない」。
    // 点と見出しだけ升目の数で出していたので、部品の横に行の字が無かった。
    const letters = (source: string): number =>
      (draw(source).match(/class="cf-axis"/g) ?? []).length;

    expect(letters('parts:\n  U1: pico b2\n')).toBeGreaterThan(letters('parts:\n  R1: resistor a1 a3\n'));
  });

  test('puts a hole to grab under the part it grew for', () => {
    // 見出しだけ伸ばしても、そこへ置けなければ意味が無い。
    const svg = draw('parts:\n  U1: pico b2\n');

    // b2 に置いた 40 本の箱は f 行まで届く (升目そのものは 4 行しか無い)。
    expect(svg).toContain('data-address="f1"');
    expect(draw('parts:\n  R1: resistor a1 a3\n')).not.toContain('data-address="f1"');
  });

  test('stays on the cells when nothing sticks out', () => {
    const [left, top] = boxOf('parts:\n  R1: resistor a1 a3\n');

    expect(left).toBe(0);
    expect(top).toBe(0);
  });
});

describe('多端子部品の足', () => {
  test('puts a connection point on every leg, named as the fence spells it', () => {
    // 実機で「足に接続点を表示し、配線で押して接続して」。綴りをそのまま
    // 名札にしておくと、殻は綴りを知らないまま `addWire` へ返せる。
    const svg = draw('parts:\n  Q1: npn b2\n');

    expect(svg).toContain('class="cf-pin-dot"');
    expect(svg).toContain('data-pin="Q1.B"');
    expect(svg).toContain('data-pin="Q1.C"');
    expect(svg).toContain('data-pin="Q1.E"');
  });

  test('puts the point where the symbol draws the leg, not at an even spacing', () => {
    // 実機で「足の位置＝接続点にして」。オペアンプの ± は三角の背の
    // 上下 1/4、AND の入力も同じ高さ。等間隔の決め打ちだと記号からずれる。
    const dots = (source: string): number[] =>
      [...draw(source).matchAll(/class="cf-pin-dot" cx="[-\d.]+" cy="([-\d.]+)"/g)]
        .map((one) => Number(one[1]))
        .sort((a, b) => a - b);

    expect(dots('parts:\n  U1: opamp b2\n')).toEqual([-4.5, 0, 4.5]);
    expect(dots('parts:\n  G1: and b2\n')).toEqual([-4.5, 0, 4.5]);
    // トランスは巻線の両端 (±9)、切り替えは接点の高さ (±6)。
    expect(dots('parts:\n  T1: transformer b2\n')).toEqual([-9, -9, 9, 9]);
    expect(dots('parts:\n  S1: spdt b2\n')).toEqual([-6, 0, 6]);
  });

  test('spreads a DIP evenly, since its box grows to hold them', () => {
    const dots = [...draw('parts:\n  U1: dip8 b2\n')
      .matchAll(/class="cf-pin-dot" cx="[-\d.]+" cy="([-\d.]+)"/g)]
      .map((one) => Number(one[1]));

    expect([...new Set(dots)].sort((a, b) => a - b)).toEqual([-18, -6, 6, 18]);
  });

  test('writes the opamp signs inside the triangle, as the figure draws them', () => {
    // 実機で「回路図ではオペアンプの中に ＋・− があるのに editor では外にある」。
    const svg = draw('parts:\n  U1: opamp b2\n');
    const nameAt = (name: string): number =>
      Number(new RegExp(`<text x="([-\\d.]+)"[^>]*class="cf-pin-name"[^>]*>\\${name}<`).exec(svg)?.[1] ?? NaN);
    const dotAt = (cy: string): number =>
      Number(new RegExp(`class="cf-pin-dot" cx="([-\\d.]+)" cy="${cy}"`).exec(svg)?.[1] ?? NaN);

    // ± は左の丸より内側 (胴の中)、出口は右の丸より外側。
    expect(nameAt('-')).toBeGreaterThan(dotAt('-4.5'));
    expect(nameAt('+')).toBeGreaterThan(dotAt('4.5'));
  });

  test('puts a leg name inside the body, not out at the leg end', () => {
    // 実機で「すべての部品でピン名は内側に」。外に出すと隣の升へはみ出し、
    // 部品を並べたときに名前どうしがぶつかる。**これが既定** — 胴が棒だけで
    // 中の空いていないトランジスタ族だけが例外 (下の 2 つ)。
    const svg = draw('parts:\n  VR1: regulator b2\n');
    const name = Number(/<text x="([-\d.]+)"[^>]*class="cf-pin-name"[^>]*>IN</.exec(svg)?.[1] ?? NaN);
    const dot = Number(/class="cf-pin-dot" cx="([-\d.]+)" cy="0"/.exec(svg)?.[1] ?? NaN);

    expect(name).toBeGreaterThan(dot);
  });

  /**
   * 3 本足のトランジスタと、その足の名前の出る辺。**p 形は上下が入れ替わる**
   * (`BJT_SIDE_P` / `FET_SIDE_P`)。
   */
  const THREE_LEGGED = [
    { type: 'nmos', left: 'G', top: 'D', bottom: 'S' },
    { type: 'pmos', left: 'G', top: 'S', bottom: 'D' },
    { type: 'njfet', left: 'G', top: 'D', bottom: 'S' },
    { type: 'nmos-e', left: 'G', top: 'D', bottom: 'S' },
    { type: 'npn', left: 'B', top: 'C', bottom: 'E' },
    { type: 'pnp', left: 'B', top: 'E', bottom: 'C' },
    { type: 'nigbt', left: 'G', top: 'C', bottom: 'E' },
    { type: 'pigbt', left: 'G', top: 'E', bottom: 'C' },
  ] as const;

  /** その字の `<text>` の左上。 */
  const nameAt = (svg: string, text: string): { readonly x: number; readonly y: number } => {
    const found = new RegExp(`<text x="([-\\d.]+)" y="([-\\d.]+)"[^>]*class="cf-pin-name"[^>]*>${text}<`)
      .exec(svg);
    return { x: Number(found?.[1] ?? NaN), y: Number(found?.[2] ?? NaN) };
  };

  const dotsOf = (svg: string): { readonly x: number; readonly y: number }[] =>
    [...svg.matchAll(/class="cf-pin-dot" cx="([-\d.]+)" cy="([-\d.]+)"/g)]
      .map((found) => ({ x: Number(found[1]), y: Number(found[2]) }));

  test('keeps the transistor leg names off the symbol, beside each pin', () => {
    // 実機で「FET の G・D・S を図形と重ならないように」、続けて「NPN・PNP も
    // 同様に」「nigbt・pigbt も同様」。中に書くと制御端子の字が棒に乗り、
    // 接合形では**矢の上に**乗って、n 形と p 形を分ける印が読めなかった。
    // 置き場所は言われたとおり — 左ピンの下、上ピンの右、下ピンの右。
    for (const part of THREE_LEGGED) {
      const svg = draw(`parts:\n  X1: ${part.type} b2\n`);
      const dots = dotsOf(svg);
      const left = dots.find((dot) => dot.x < 0) ?? { x: NaN, y: NaN };
      const top = dots.find((dot) => dot.y < 0) ?? { x: NaN, y: NaN };
      const bottom = dots.find((dot) => dot.y > 0) ?? { x: NaN, y: NaN };

      // 制御端子 (B / G) は左ピンの真下。
      expect(nameAt(svg, part.left).x, part.type).toBe(left.x);
      expect(nameAt(svg, part.left).y, part.type).toBeGreaterThan(left.y);
      // あとの 2 本は上下のピンの右、ピンと同じ高さ。
      expect(nameAt(svg, part.top).x, part.type).toBeGreaterThan(top.x);
      expect(Math.abs(nameAt(svg, part.top).y - top.y), part.type).toBeLessThan(6);
      expect(nameAt(svg, part.bottom).x, part.type).toBeGreaterThan(bottom.x);
      expect(Math.abs(nameAt(svg, part.bottom).y - bottom.y), part.type).toBeLessThan(6);
    }
  });

  test('leaves the transistor names outside the symbol, not on its bars', () => {
    // 重ならないことが頼まれたことなので、図形の張り出しと比べて確かめる。
    // どの胴も原点から 13 まで (glyphSpan)、高さは 9 まで (glyphTall)。
    for (const part of THREE_LEGGED) {
      const svg = draw(`parts:\n  X1: ${part.type} b2\n`);
      const names = [...svg.matchAll(/<text x="([-\d.]+)" y="([-\d.]+)"[^>]*class="cf-pin-name"/g)]
        .map((found) => ({ x: Number(found[1]), y: Number(found[2]) }));

      expect(names, part.type).toHaveLength(3);
      for (const at of names) {
        expect(Math.abs(at.x) > 13 || Math.abs(at.y) > 9, `${part.type} (${at.x},${at.y})`).toBe(true);
      }
    }
  });

  /**
   * 胴の中に足の名前を書いてよい記号。**中が空いているものだけ。**
   * 箱は名前を入れるための姿そのもので、オペアンプの ± は circuitikz が
   * 記号の一部として三角の中に描く (図と揃えるため中に置いている)。
   */
  const INSIDE_ON_PURPOSE: ReadonlySet<string> = new Set(['box', 'opamp']);

  /** 描いた足の名前を、字の箱として読み直す (基準線は下端)。 */
  const nameBoxes = (svg: string): {
    readonly left: number; readonly right: number;
    readonly top: number; readonly bottom: number; readonly text: string;
  }[] =>
    [...svg.matchAll(/<text x="([-\d.]+)" y="([-\d.]+)"[^>]*text-anchor="(\w+)"[^>]*class="cf-pin-name"[^>]*>([^<]*)</g)]
      .map((found) => {
        const [x, y, anchor, text] = [Number(found[1]), Number(found[2]), found[3], found[4] ?? ''];
        const width = textWidth(text) * 8;
        const left = anchor === 'end' ? x - width : anchor === 'start' ? x : x - width / 2;
        return { left, right: left + width, top: y - 8, bottom: y, text };
      });

  test('never writes a leg name on top of the symbol', () => {
    // 実機で「他の部品でもピン名が図形と重なっているものは FET 同様にする」。
    // **部品を 1 つずつ見て回るのではなく、重なりを測って全部に効かせる** —
    // 部品を足したときにも、名前が記号に乗ったままならここで止まる。
    // 記号の張り出しは `glyphSpan` (横) と `glyphTall` (縦) が持っている。
    const seen: string[] = [];
    for (const type of partTypeNames()) {
      if (lookupPartType(type)?.kind !== 'multi-terminal') continue;
      const glyph = glyphOf(type).name;
      if (INSIDE_ON_PURPOSE.has(glyph)) continue;
      seen.push(type);

      const svg = draw(`parts:\n  X1: ${type} b3\n`);
      const [span, tall] = [glyphSpan(glyph), glyphTall(glyph)];
      for (const box of nameBoxes(svg)) {
        const over = box.right > -span && box.left < span && box.bottom > -tall && box.top < tall;
        expect(over, `${type}: ${box.text} (${box.left}..${box.right}, ${box.top}..${box.bottom})`).toBe(false);
      }
    }
    // 見落としで 0 件になっていないことを確かめる (通ったのは空回りでは無い)。
    expect(seen.length).toBeGreaterThan(20);
  });

  test('leaves the logic gate output unnamed, since the shape already says it', () => {
    // 実機で「ロジックゲートの 2 本足の部品はピン名を表示しない。3 本足の
    // out は非表示に」。三角の向きが入口と出口を言っているので、字で繰り返さない。
    // **接続点は残る** — `G1.out -- a5` と書けなくなっては困る。
    for (const type of ['and', 'or', 'xor', 'nand', 'nor', 'xnor'] as const) {
      const svg = draw(`parts:\n  G1: ${type} b3\n`);
      const names = [...svg.matchAll(/class="cf-pin-name"[^>]*>([^<]*)</g)].map((found) => found[1]);

      expect(names.sort(), type).toEqual(['1', '2']);
      // 入口 2 本と出口で、丸は 3 つとも出ている。
      expect([...svg.matchAll(/class="cf-pin-dot"/g)], type).toHaveLength(3);
      expect(svg, type).toContain('data-pin="G1.out"');
    }
  });

  test('leaves both legs of a one-input gate unnamed', () => {
    // 2 本足 (`not` / `buffer`) は入口と出口しか無い。どちらがどちらかは
    // 三角の向きで読めるので、字は 1 つも出さない。
    for (const type of ['not', 'buffer'] as const) {
      const svg = draw(`parts:\n  G1: ${type} b3\n`);

      expect(svg, type).not.toContain('cf-pin-name');
      expect([...svg.matchAll(/class="cf-pin-dot"/g)], type).toHaveLength(2);
      expect(svg, type).toContain('data-pin="G1.in"');
      expect(svg, type).toContain('data-pin="G1.out"');
    }
  });

  test('writes the board kind inside the box, where the real chip sits', () => {
    // 実機で「マイコンの種類を内側に」。40 本の足の名前は縁に寄るので、
    // 真ん中が空いている。
    const svg = draw('parts:\n  U1: pico2 c3\n');

    expect(svg).toContain('>pico2<');
    // 名前は箱の外なので、2 つが重ならない。
    expect(svg).toContain('>U1<');
  });

  test('widens the box so two names facing each other do not touch', () => {
    // レギュレータの `IN` と `OUT` は狭い箱だとくっついて 1 語に読める。
    const svg = draw('parts:\n  VR1: regulator b2\n');
    const names = [...svg.matchAll(/<text x="([-\d.]+)"[^>]*class="cf-pin-name"/g)]
      .map((one) => Number(one[1]));

    expect(names.length).toBeGreaterThan(1);
    expect(Math.max(...names) - Math.min(...names)).toBeGreaterThan(24);
  });

  test('makes the target bigger than the dot, since 2.6px is too small to hit', () => {
    const svg = draw('parts:\n  Q1: npn b2\n');
    const dot = /class="cf-pin-dot"[^/]*r="([\d.]+)"/.exec(svg);
    const hit = /class="cf-pin-hit"[^/]*r="([\d.]+)"/.exec(svg);

    expect(Number(hit?.[1] ?? 0)).toBeGreaterThan(Number(dot?.[1] ?? 0));
  });

  test('runs the wire to the point, not to the middle of the cell', () => {
    // 実機で「接続点から配線するように表示すること」。
    const svg = draw('parts:\n  Q1: npn b2\nwires:\n  - Q1.C -- a5\n');
    const wire = /class="cf-wire cf-approx"[^>]*points="([-\d., ]+)"/.exec(svg);
    const first = (wire?.[1] ?? '').split(' ')[0] ?? '';
    // 記号の中の座標に、部品の升の座標を足したものが接続点。
    const cell = { x: 20 + 34, y: 32 + 34 };
    const legs = [...svg.matchAll(/class="cf-pin-dot" cx="([-\d.]+)" cy="([-\d.]+)"/g)]
      .map((one) => `${cell.x + Number(one[1])},${cell.y + Number(one[2])}`);

    expect(legs).toContain(first);
  });

  test('keeps a bent wire square even when one end sits on a leg', () => {
    // 実機で「斜め線を使わずに」。角を升の真ん中に置いたままだと、
    // 足へずらした端との間だけ斜めになる。
    const svg = draw('parts:\n  Q1: npn b2\nwires:\n  - Q1.C -| d6\n');
    const points = (/class="cf-wire cf-approx"[^>]*points="([-\d., ]+)"/.exec(svg)?.[1] ?? '')
      .split(' ').map((pair) => pair.split(',').map(Number));

    expect(points).toHaveLength(3);
    // `-|` は先に横 — 1 本目は水平、2 本目は垂直。
    expect(points[0]?.[1]).toBe(points[1]?.[1]);
    expect(points[1]?.[0]).toBe(points[2]?.[0]);
  });

  test('leaves a two-lead part alone, since its ends are the holes themselves', () => {
    expect(draw('parts:\n  R1: resistor a1 a3\n')).not.toContain('cf-pin-dot');
  });
});

describe('注釈', () => {
  const NOTE = 'parts:\n  R1: resistor a1 a3\nnotes:\n  - text b1: ここ\n';

  test('shows a text note as the words alone, with no frame around them', () => {
    // 実機で「text に枠は要らない」。字がそのまま読めるものに枠を足すと、
    // 字と枠の幅が食い違ったときに枠のほうが目立つ。
    const svg = draw(NOTE);

    expect(svg).toContain('ここ');
    expect(svg).not.toContain('cf-note-tag');
  });

  test('puts the frame back when the reader asks for it', () => {
    // 好みが分かれるところなので設定で戻せる。**既定は付けない**。
    const svg = renderMapHtml(gridMap(NOTE), undefined, { noteFrame: true });

    expect(svg).toContain('cf-note-tag');
  });

  test('keeps the frame on notes that have no words of their own', () => {
    // `circle` などは種類の名を出すだけなので、枠が「これは札だ」と言う。
    const svg = draw('parts:\n  R1: resistor a1 a3\nnotes:\n  - circle R1\n');

    expect(svg).toContain('cf-note-tag');
  });

  test('keeps the whole note on the tag, since the drawn words are cut', () => {
    const long = `parts:\n  R1: resistor a1 a3\nnotes:\n  - text b1: ${'あ'.repeat(30)}\n`;
    const svg = draw(long);

    expect(svg).toContain('…');
    expect(svg).toContain(`<title>${'あ'.repeat(30)}</title>`);
  });
});

describe('配線を掴む', () => {
  test('lays a fat invisible line over each wire, since 1.5px is too thin to hit', () => {
    const svg = draw('wires:\n  - a1 -- a3\n');

    expect(svg).toContain('cf-wire-hits');
    expect(svg).toContain('class="cf-wire-hit" data-line="2"');
  });

  test('puts the grab layer under the parts, so a part still takes the click', () => {
    const svg = draw('parts:\n  R1: resistor a1 a3\nwires:\n  - a1 -- c1\n');

    expect(svg.indexOf('cf-wire-hits')).toBeLessThan(svg.indexOf('cf-parts'));
  });
});


describe('図と同じ見え方にする細工', () => {
  test('centres the letter in the meter circle, which the figure does', () => {
    // 実機で「ammeter, \"A\" を円の中心に表示する (現在は微妙に下にずれている)。
    // meter 類は全て同様に直す」。9px の字は、基準線を大文字の高さの半分だけ
    // 下げたところで丸の中心に来る。
    const svg = draw('parts:\n  A1: ammeter c1 c3\n');
    const centre = Number(/translate\(\d+,(\d+)\) rotate/.exec(svg)?.[1] ?? 0);
    const mark = /<text x="[-\d.]+" y="([-\d.]+)"[^>]*class="cf-mark"[^>]*>A</.exec(svg);

    // 9px の大文字は高さ 6.5 ほど。中心に置くならその半分だけ下げる。
    expect(Number(mark?.[1]) - centre).toBeCloseTo(3.2, 1);
  });

  test('keeps the haloed leg numbers off the box outline, so the edge stays whole', () => {
    // 実機で「DIP の上部が欠けている (直線が途切れている)」「SIP40 も同様」。
    // 足の番号は地の色で縁を取ってあり (`halo`)、箱の縁に近すぎると線を消す。
    // 箱の中は既に地の色で塗ってあるので、中に書く字に縁取りは要らない。
    for (const type of ['dip40', 'sip40']) {
      const svg = draw(`parts:\n  U1: ${type} c3\n`);
      const legs = [...svg.matchAll(/<text[^>]*class="cf-pin-name"[^>]*>/g)].map((one) => one[0]);

      expect(legs.length).toBeGreaterThan(0);
      expect(legs.every((one) => !one.includes('stroke='))).toBe(true);
    }
  });

  test('writes the transformer leg names over their leads, as the figure does', () => {
    // 実機で「transformer, ピン名の位置を変更する。図 1 に近づける」。
    // 図 (KiCad の `Transformer_1P_1S`) は番号を**足の棒の上**に置く。
    // 棒の外 (丸の更に外側) に出すと、巻線から遠くてどちらの端か読みにくい。
    const svg = draw('parts:\n  T1: transformer c3\n');
    const named = [...svg.matchAll(
      /<text x="(-?[\d.]+)" y="(-?[\d.]+)"([^>]*)class="cf-pin-name"[^>]*>(\w+)</g,
    )].map(([, x, y, rest, name]) => ({ x: Number(x), y: Number(y), rest: rest ?? '', name }));

    expect(named.map((one) => one.name)).toEqual(['a1', 'a2', 'b1', 'b2']);
    // 足は y=∓9。字はその上 (棒に乗らない)。
    expect(named.map((one) => one.y)).toEqual([-14.6, 3.4, -14.6, 3.4]);
    // **外へ伸ばす。** 巻線の膨らみ (-11.5) の外から書き始めないと、下の足の
    // 名前が巻線に乗る。
    expect(named.map((one) => one.x)).toEqual([-13.4, -13.4, 13.4, 13.4]);
    expect(named.map((one) => /text-anchor="(\w+)"/.exec(one.rest)?.[1]))
      .toEqual(['end', 'end', 'start', 'start']);
  });

  test('writes the regulator GND inside the box, standing up, as the figure does', () => {
    // 実機で「regulator, GND を箱の中に表示する。図 1 に近づける」。
    // 図 (circuitikz) も KiCad も箱の中に立てて書く。横に寝かせると IN・OUT と
    // ぶつかるので、**縦に回して**下の縁の内側へ入れる。
    const svg = draw('parts:\n  U1: regulator c3\n');
    const gnd = /<text x="(-?[\d.]+)" y="(-?[\d.]+)"[^>]*transform="rotate\((-?\d+)[^)]*\)"[^>]*>GND</
      .exec(svg);
    const halfH = Number(/<rect class="cf-glyph" x="-?[\d.]+" y="(-[\d.]+)"/.exec(svg)?.[1] ?? 0);

    expect(gnd).not.toBeNull();
    // 下から上へ読む (反時計回り)。
    expect(Number(gnd?.[3])).toBe(-90);
    // 縁の内側。字は上へ伸びるので、箱はその長さを飲み込むだけ高い。
    expect(Number(gnd?.[2])).toBeCloseTo(-halfH - 3, 1);
    expect(-halfH * 2).toBeGreaterThan(textWidth('GND') * 8 + 6);
  });

  test('runs the lead up to the body on both sides of a lopsided part', () => {
    // 実機で「配線と部品の間を接続する」。c1 と c3 は 68px 離れていて中心は 54。
    // 電解コンデンサは左が真っ直ぐな極板 (3)、右が曲がった極板 (5)。
    const svg = draw('parts:\n  EC1: ecap c1 c3\n');
    const leads = [...svg.matchAll(/<line class="cf-lead" x1="([\d.]+)" y1="[\d.]+" x2="([\d.]+)"/g)]
      .map(([, from, to]) => [Number(from), Number(to)]);

    expect(leads).toEqual([[20, 51], [59, 88]]);
  });

  test('starts the opamp output at the tip, not out where the box would be', () => {
    // 実機で「opamp, 出力をピンと接続する」。三角の中に ± を書くぶん幅を
    // 取っていたので、**出口の側**に隙間が空いていた。箱でない記号の縁は
    // 記号そのものが持っている (三角の先は 8)。
    const svg = draw('parts:\n  U1: opamp c3\n');
    const right = [...svg.matchAll(/<line class="cf-pin" x1="([\d.]+)"/g)].map(([, x]) => Number(x));

    expect(Math.min(...right)).toBe(8);
  });

  test('starts a gate leg at the back of its body, not out past the bubble', () => {
    // 実機で「配線と部品の間を接続する」。`nor` は前に反転の丸が付くぶん幅を
    // 取るので、1 つの数で両側を出すと**入口の側に大きな隙間**が空いていた。
    const stubIn = (type: string): number => {
      const svg = draw(`parts:\n  G1: ${type} c3\n`);
      const left = [...svg.matchAll(/<line class="cf-pin" x1="(-[\d.]+)"/g)].map(([, x]) => Number(x));
      return Math.max(...left);
    };

    // 反った背は入口の高さで -6.1。丸の有る無しで入口の側は変わらない。
    expect(stubIn('nor')).toBe(-6);
    expect(stubIn('or')).toBe(stubIn('nor'));
    expect(stubIn('nand')).toBe(-8);
    expect(stubIn('not')).toBe(-7);
  });

  test('writes the header number beside each board leg, as the figure does', () => {
    // 実機で「pico のピン番号が付いていない」(升目)。図と同じ字を出す —
    // 左の列は番号が先、右の列は名前が先 (番号は常に箱の外側の端)。
    const svg = draw('parts:\n  PI1: pico c3\n');

    expect(svg).toContain('>01 GP0<');
    expect(svg).toContain('>VBUS 40<');
    // **配線に書く綴りは名前のまま。** 番号を混ぜると `PI1.GP0` が書けなくなる。
    expect(svg).toContain('data-pin="PI1.GP0"');
    expect(svg).not.toContain('data-pin="PI1.01 GP0"');
  });

  test('widens the board box for the numbered legs, so the two columns stay apart', () => {
    // 番号のぶん字が伸びるので、箱もそのぶん広げないと左右の列がぶつかる。
    // いちばん長い組は 6 行目の `06 GP4` と `ADC_VREF 35`。
    const halfW = -Number(/<rect class="cf-glyph" x="(-[\d.]+)"/.exec(draw('parts:\n  PI1: pico c3\n'))?.[1] ?? 0);
    const both = (textWidth('06 GP4') + textWidth('ADC_VREF 35')) * 8;

    expect(halfW * 2).toBeGreaterThan(both);
  });

  test('runs only the core lead to the centre of the coax, not the shield', () => {
    // 実機で「SMA の図が間違っている。アースは中心に接続しない」。図と同じで、
    // 中心導体だけが中心の点まで届き、外皮の足は丸の縁で止まる。
    const svg = draw('parts:\n  J1: sma c3\n');
    const legs = [...svg.matchAll(/<line class="cf-pin" x1="([-\d.]+)" y1="([-\d.]+)"/g)]
      .map(([, px, py]) => ({ x: Number(px), y: Number(py) }));

    expect(legs).toHaveLength(2);
    // 中心導体 (1 番) は原点から、外皮 (2 番) は縁から。
    expect(legs.filter((one) => one.x === 0 && one.y === 0)).toHaveLength(1);
  });
});
