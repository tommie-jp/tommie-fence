import { describe, expect, test } from 'vitest';
import { buildCircuit } from '../model/circuit.ts';
import { parseFence } from '../parser/parseFence.ts';
import { generateTex } from './generate.ts';

/**
 * 図の字が記号の飾り (光の矢・足の番号・足の名前) に重ならないこと。
 *
 * TeX は走らせずに、**書いた TeX の座標とアンカーから字の占める箱を見積もり**、
 * 飾りの占める範囲と突き合わせる。飾りの寸法は circuitikz 1.0 を焼いた SVG で
 * 測った値 (下の定数)。字の幅は多めに見積もる — 狭く見積もると重なりを見逃す。
 */

const generate = (...rows: string[]): string => {
  const { doc } = parseFence(`${rows.join('\n')}\n`);
  if (doc === null) throw new Error('YAML を読めませんでした');
  return generateTex(buildCircuit(doc).circuit, { style: doc.style }).tex;
};

type Box = { readonly left: number; readonly right: number; readonly bottom: number; readonly top: number };

type Point = readonly [number, number];

const cornersOf = (box: Box): Point[] =>
  [[box.left, box.bottom], [box.right, box.bottom], [box.right, box.top], [box.left, box.top]];

/**
 * 凸な多角形 2 つが重なるか (分離軸)。どちらかの辺の法線の上で影が離れていれば
 * 重ならない。斜めに置いた記号を軸に沿った箱で包むと広すぎるので、こちらで見る。
 */
function polygonsOverlap(a: readonly Point[], b: readonly Point[]): boolean {
  const axes = [a, b].flatMap((shape) => shape.map((point, index) => {
    const next = shape[(index + 1) % shape.length] ?? point;
    return [point[1] - next[1], next[0] - point[0]] as const;
  }));
  return axes.every(([ax, ay]) => {
    const project = (shape: readonly Point[]): number[] => shape.map(([x, y]) => x * ax + y * ay);
    const [pa, pb] = [project(a), project(b)];
    return Math.min(...pa) < Math.max(...pb) && Math.min(...pb) < Math.max(...pa);
  });
}

/** 番地の間隔 (cm)。既定の pitch。 */
const PITCH = 2;

/** 本文の大きさ (10pt) の字の幅と高さ (cm)。立体の英字は 0.2 cm に収まる。 */
const CHAR_WIDTH = 0.2;
const TEXT_HEIGHT = 0.35;

/** ノードの縁から字までの間 (cm)。TikZ の既定の inner sep (0.3333em ≈ 0.12 cm) を少なめに。 */
const INNER_SEP = 0.1;

/** アンカーの点から、字の占める箱を作る (TikZ のアンカーの向きどおり。inner sep の内側)。 */
function textBox(x: number, y: number, anchor: string, chars: number): Box {
  const width = chars * CHAR_WIDTH;
  const left = anchor.includes('west') ? x + INNER_SEP : anchor.includes('east') ? x - INNER_SEP - width : x - width / 2;
  const bottom = anchor.includes('south')
    ? y + INNER_SEP
    : anchor.includes('north') ? y - INNER_SEP - TEXT_HEIGHT : y - TEXT_HEIGHT / 2;
  return { left, right: left + width, bottom, top: bottom + TEXT_HEIGHT };
}

describe('LED・フォトダイオードの値は光の矢に重ならない', () => {
  /**
   * 記号と矢の占める範囲 (cm)。中心線の向き (from → to) に沿って ±0.3 (三角形) と
   * 矢の -0.1〜+0.29、`a^` の側 (向きの左) へ 0.6 まで矢、反対側へ 0.3 まで三角形。
   * `leD` / `pD` を横に焼いた SVG で測った (矢の先は 17.07pt)。
   */
  const ALONG: readonly [number, number] = [-0.3, 0.3];
  const ARROW_SIDE = 0.6;
  const BODY_SIDE = 0.3;

  /** 番地 (列, 行) から、記号と矢の占める範囲 (回った長方形の 4 隅) を作る。 */
  function symbolCorners(from: readonly [number, number], to: readonly [number, number]): Point[] {
    const [fx, fy] = [from[0] * PITCH, -from[1] * PITCH];
    const [tx, ty] = [to[0] * PITCH, -to[1] * PITCH];
    const length = Math.hypot(tx - fx, ty - fy);
    const [ux, uy] = [(tx - fx) / length, (ty - fy) / length];
    const [nx, ny] = [-uy, ux];
    const [cx, cy] = [(fx + tx) / 2, (fy + ty) / 2];
    return [[ALONG[0], -BODY_SIDE], [ALONG[1], -BODY_SIDE], [ALONG[1], ARROW_SIDE], [ALONG[0], ARROW_SIDE]]
      .map(([s, t]) => [cx + ux * (s ?? 0) + nx * (t ?? 0), cy + uy * (s ?? 0) + ny * (t ?? 0)] as const);
  }

  /** 値のノード (`\node[anchor=…] at (x,y) {…}`) を拾う。 */
  function valueNode(tex: string, text: string): { x: number; y: number; anchor: string } {
    const escaped = text.replace(/[\\$^{}]/gu, (c) => `\\${c}`);
    const found = new RegExp(`\\\\node\\[anchor=([a-z ]+)\\] at \\((-?[\\d.]+),(-?[\\d.]+)\\) \\{${escaped}\\}`, 'u').exec(tex);
    if (found === null) throw new Error(`値のノードがありません:\n${tex}`);
    return { anchor: found[1] ?? '', x: Number(found[2]), y: Number(found[3]) };
  }

  // [書き方, from (列, 行), to (列, 行)]。列・行は 0 始まり (a1 = (0, 0))。
  const PLACES: readonly (readonly [string, readonly [number, number], readonly [number, number]])[] = [
    ['c3 e3', [2, 2], [2, 4]], // 下向き
    ['e3 c3', [2, 4], [2, 2]], // 上向き
    ['c3 c5', [2, 2], [4, 2]], // 右向き
    ['c5 c3', [4, 2], [2, 2]], // 左向き
    ['c3 e5', [2, 2], [4, 4]], // 斜め
  ];

  for (const type of ['led', 'photodiode'] as const) {
    for (const [at, from, to] of PLACES) {
      test(`${type} ${at}: the value stays clear of the arrows and the body`, () => {
        const tex = generate('parts:', `  D1: ${type} ${at} yellow`);
        const node = valueNode(tex, '$\\mathrm{yellow}$');

        const text = textBox(node.x, node.y, node.anchor, 'yellow'.length);
        expect(polygonsOverlap(cornersOf(text), symbolCorners(from, to))).toBe(false);
      });
    }
  }

  test('leaves the value to circuitikz for symbols without light arrows', () => {
    // 矢の無い記号まで別ノードにすると、図が変わる (`a^` で重ならない)。
    expect(generate('parts:', '  D1: diode c3 c5 1N4148')).toContain('a^=$\\mathrm{1N4148}$');
  });

  test('keeps the name on the side away from the arrows', () => {
    const tex = generate('parts:', '  D1: led c3 e3 red');

    expect(tex).toContain('\\draw (c3) to[leD, l_=$D_{1}$] (e3);');
    expect(tex).not.toContain('a^=');
  });
});

describe('DIP の型番は足の番号に重ならない', () => {
  /** アンカー名 → 箱の中の向き (中心から見た単位ベクトル)。 */
  const ANCHOR_DIRECTION: Readonly<Record<string, readonly [number, number]>> = {
    north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0],
  };

  /** 箱と一緒に回ったアンカーが、画面のどちらを向くか (`rotate=-θ` は時計回り)。 */
  function onScreen(anchor: string, rotate: number): readonly [number, number] {
    const [x, y] = ANCHOR_DIRECTION[anchor] ?? [0, 0];
    const radians = (-rotate * Math.PI) / 180;
    return [
      Math.round(x * Math.cos(radians) - y * Math.sin(radians)),
      Math.round(x * Math.sin(radians) + y * Math.cos(radians)),
    ];
  }

  // 立てた箱は足の番号が左右の縁から中へ並び、真ん中に字の入る幅が無い。
  for (const [turn, rotate] of [['', 0], [' r180', 180]] as const) {
    test(`puts a long part number under the upright box${turn}`, () => {
      const tex = generate('parts:', `  U1: dip16 c3 CD74HC283${turn}`);

      // 箱の中には何も書かない (番号の列の間に置くと掛かる)。
      expect(tex).toMatch(/\\node\[dipchip, num pins=16, font=\\scriptsize[^\]]*\] \(part-U1\) at \(c3\) \{\};/u);
      const found = /\\node\[font=\\scriptsize, anchor=(\w+)\] at \(part-U1\.(\w+)\) \{\$\\mathrm\{CD74HC283\}\$\}/u.exec(tex);
      expect(found).not.toBeNull();
      // 掛けたアンカーは画面の下の縁 (番号は縁より内側にしか無い)。
      expect(onScreen(found?.[2] ?? '', rotate)).toEqual([0, -1]);
      // 字はそこから下へ伸びる (`anchor=north`) ので、縁より上の番号に届かない。
      expect(found?.[1]).toBe('north');
      // 名札は上 (型番と取り合わない)。
      expect(tex).toMatch(/\\node\[anchor=south\] at \(part-U1\.\w+\) \{\$U_\{1\}\$\}/u);
    });
  }

  test('keeps the part number inside a box laid on its side', () => {
    // 寝かせた箱は長い辺が横になり、番号の列の間に 1 行ぶんの帯が空く。
    const tex = generate('parts:', '  U1: dip16 c3 CD74HC283 r90');

    expect(tex).toContain('\\node[font=\\scriptsize] at (part-U1.center) {$\\mathrm{CD74HC283}$};');
  });
});

describe('機器の名前は反転しても足の名前に重ならない', () => {
  /** 機器の名前の字の幅 (\scriptsize。`deviceBox` の見積もりと同じ)。 */
  const LABEL_CHAR = 0.15;

  /** 形の名前 (`dev3w13n5`) から、半幅と足の名前の列の幅 (cm) を読む。 */
  function boxOf(tex: string, id: string): { halfWidth: number; nameArea: number; shape: string } {
    const found = new RegExp(`\\\\node\\[(dev\\d+w(\\d+)n(\\d+))[^\\]]*\\] \\(part-${id}\\)`, 'u').exec(tex);
    if (found === null) throw new Error('機器の記号がありません');
    return { shape: found[1] ?? '', halfWidth: Number(found[2]) / 10, nameArea: Number(found[3]) / 10 };
  }

  /** 形の中で宣言したアンカーの x (cm)。 */
  function anchorX(tex: string, shape: string, anchor: string): number {
    const body = tex.slice(tex.indexOf(`\\pgfdeclareshape{${shape}}`));
    const found = new RegExp(`\\\\anchor\\{${anchor}\\}\\{\\\\pgfpoint\\{(-?[\\d.]+)cm\\}`, 'u').exec(body);
    if (found === null) throw new Error(`アンカー ${anchor} がありません`);
    return Number(found[1]);
  }

  const DEVICE = (turn: string | null): string[] => [
    'parts:',
    '  PIR:',
    '    type: device',
    '    at: d5',
    '    label: PIR module',
    '    pins: [VCC, OUT, GND]',
    ...(turn === null ? [] : [`    turn: ${turn}`]),
  ];

  // 反転 (と r180) は箱の左右を入れ替える。足の名前の列は右の縁に来る。
  for (const turn of ['mirror', 'r180'] as const) {
    test(`places the label clear of the pin-name column (${turn})`, () => {
      const tex = generate(...DEVICE(turn));
      const { shape, halfWidth, nameArea } = boxOf(tex, 'PIR');

      expect(tex).toContain('\\node[font=\\scriptsize] at (part-PIR.value) {$\\mathrm{PIR\\ module}$};');
      // 箱の中では字の場所の真ん中。画面では左右が入れ替わる。
      const x = -anchorX(tex, shape, 'value');
      const width = 'PIR module'.length * LABEL_CHAR;
      const label = { left: x - width / 2, right: x + width / 2 };
      const pinNames = { left: halfWidth - nameArea, right: halfWidth };

      expect(label.right).toBeLessThanOrEqual(pinNames.left);
      expect(label.left).toBeGreaterThanOrEqual(-halfWidth);
    });
  }

  test('puts the value anchor in the middle of the space right of the pin names', () => {
    const tex = generate(...DEVICE(null));
    const { shape, halfWidth, nameArea } = boxOf(tex, 'PIR');

    // 足の名前の列 [-hw, -hw + nameArea] の右に残る場所の真ん中。
    expect(anchorX(tex, shape, 'value')).toBeCloseTo((-halfWidth + nameArea + halfWidth) / 2, 5);
  });

  test('uses the same place for a pin header turned over', () => {
    const tex = generate('parts:', '  J1: sip4 c3 UART mirror');

    expect(tex).toContain('at (part-J1.value) {$\\mathrm{UART}$};');
  });
});
