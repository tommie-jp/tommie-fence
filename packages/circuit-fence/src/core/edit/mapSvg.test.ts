import { describe, expect, test } from 'vitest';
import { gridMap } from './map.ts';
import { renderMapHtml } from './mapSvg.ts';

const draw = (source: string): string => renderMapHtml(gridMap(source));

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

  test('keeps the names of other parts outside, where the leg ends', () => {
    const svg = draw('parts:\n  Q1: npn b2\n');
    const name = Number(/<text x="([-\d.]+)"[^>]*class="cf-pin-name"[^>]*>B</.exec(svg)?.[1] ?? NaN);
    const dot = Number(/class="cf-pin-dot" cx="([-\d.]+)" cy="0"/.exec(svg)?.[1] ?? NaN);

    expect(name).toBeLessThan(dot);
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
