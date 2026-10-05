import { describe, expect, test } from 'vitest';
import { createBoard } from '../model/board.ts';
import { createLayout } from '../model/layout.ts';
import { parseFence } from '../parser/parseFence.ts';
import { placeParts } from '../placement/place.ts';
import type { PlacedPart } from '../types.ts';
import { partObstacles, renderPart } from './parts.ts';
import { boardBodyRect } from './boardPart.ts';
import { captionDrops, captionTextBandOf } from './captions.ts';
import { NAME_CAP, haloWidth } from './partCommon.ts';
import { parseAddress } from '../model/address.ts';
import { bodyDown, bodyHalfHeight, bodyHalfWidth, bodyUp } from './threeLead.ts';
import { num } from './svg.ts';
import { resolveStyle } from './theme.ts';
import { bodySize } from 'fence-kit';

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

/** 真ん中のピンの位置。3 ピンの胴はここを中心に描かれる。 */
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
    // 胴は最初に描く矩形。TO-220 は放熱タブも同じ幅で続くので、
    // 幅と位置を別々に探すと、胴が縮んでもタブのほうに当たって気づけない。
    const body = /<rect [^>]*\/>/.exec(renderPart(part, layout, theme))?.[0] ?? '';

    expect(body).toContain(`x="${num(centerX(part) - half)}"`);
    expect(body).toContain(`width="${num(half * 2)}"`);
  });
});

describe('1 番ピンの印は向きに付いてくる', () => {
  /** 切り欠き (半径 4.5 の丸) の x。 */
  const notchX = (line: string): number => {
    const svg = renderPart(place(line), layout, theme);
    return Number(/<circle cx="([-0-9.]+)"[^>]*r="4.5"/.exec(svg)?.[1]);
  };

  /** 部品が覆う升の左右の端。 */
  const edges = (line: string) => {
    const xs = place(line).pins.map((pin) => layout.point(pin.address!).x);
    return { left: Math.min(...xs), right: Math.max(...xs) };
  };

  test('puts the notch on the left when pin 1 is written at the left', () => {
    // ここを取り違えると、図のとおりに挿した IC が 180 度回る。
    expect(notchX('U1: dip8 @ e5')).toBeLessThan(edges('U1: dip8 @ e5').left);
  });

  test('moves the notch to the right end when the chip is turned round', () => {
    expect(notchX('U1: dip8 @ e5 r180')).toBeGreaterThan(edges('U1: dip8 @ e5 r180').right);
  });

  test('moves the usb connector with pin 1, since the cable goes in that end', () => {
    // USB は 1 番ピンの側の端。付いてこないと、ケーブルを反対から挿すことになる。
    const usbX = (line: string): number =>
      Number(/<rect x="([-0-9.]+)"[^>]*fill="#c9cfd8"/.exec(renderPart(place(line), layout, theme))?.[1]);

    expect(usbX('M1: pico @ h5')).toBeLessThan(edges('M1: pico @ h5').left);
    expect(usbX('M1: pico @ h5 r180')).toBeGreaterThan(edges('M1: pico @ h5').left);
  });
});


/**
 * 名札が胴に乗らないこと。**実機で「文字と図形が被らないように文字をずらす」**
 * と、円板・箱・砲弾の 18 種類を並べて言われた回 (2026-09-06)。
 *
 * **1 つずつ見て回るのではなく、重なりを測って全部に効かせる** — 姿を足したり
 * 胴の寸法を変えたときにも、名札が乗ったままならここで止まる。
 */
describe('名札は胴の外', () => {
  /**
   * その部品の名札の基準線 (画布の座標)。**胴に刷る字と混ぜない** —
   * 極性の印や品種の 1 文字 (`N` `P` `−`) も `<text>` で描いてある。
   */
  const labelBaselineOf = (svg: string, id: string): number =>
    Number(new RegExp(`<text x="[\\d.]+" y="([\\d.]+)"[^>]*>${id}`).exec(svg)?.[1] ?? NaN);

  /** 10px 前後の字が基準線から上へ出る高さ。 */
  const capOf = (): number => theme.metrics.textSize * 0.72;

  const cases: readonly string[] = [
    'VZ1: varistor a3 a7', 'CDS1: photoresistor a3 a7',
    'TH1: thermistor a3 a7', 'TH2: thermistor-ntc a3 a7', 'TH3: thermistor-ptc a3 a7',
    'D1: diode a3 a7', 'D2: zener a3 a7', 'D3: schottky a3 a7', 'D4: led a3 a7',
    'SP1: speaker a3 a7', 'F1: fuse a3 a7', 'LA1: lamp a3 a7', 'BZ1: buzzer a3 a7',
    'BAT1: battery a3 a7', 'SO1: solar a3 a7', 'SW1: switch a3 a7', 'SW2: switch-nc a3 a7',
    // 姿の違いも見る (胴の寸法が姿で変わる種類)。
    'C1: capacitor/electrolytic a3 a7', 'C2: capacitor/tantalum a3 a7',
    'D5: diode/do41 a3 a7', 'L1: inductor/radial a3 a7', 'X1: crystal/cylinder a3 a7',
    'R1: resistor/half a3 a7',
  ];

  for (const line of cases) {
    test(`keeps the label clear of the body: ${line.split(':')[1]?.trim()}`, () => {
      const part = place(line);
      const centre = layout.point(part.pins[0]!.address!);
      const svg = renderPart(part, layout, theme);
      const baseline = labelBaselineOf(svg, part.id);
      // a 行は上のブロックなので、名札は胴の下。字の頭が胴の下の縁より下に来る。
      const half = bodySize(part, 4 * layout.pitch).height / 2;

      expect(baseline - capOf()).toBeGreaterThan(centre.y + half);
    });
  }
});


/**
 * 縦に立てた部品の名札も胴の外。**胴はピンの向きに長い**ので、立てると
 * 中心から下へ「長さの半分」伸びる。厚みだけで測っていたころは、a〜e 行に立てた
 * 抵抗の名札が一番下の色の帯に乗り、レールと a 行の間の抵抗 (教科書の 30 dB
 * パッドの図) では縁取りが胴の下端を削っていた。
 */
describe('縦に立てた部品の名札も胴の外', () => {
  const labelBaselineOf = (svg: string, id: string): number =>
    Number(new RegExp(`<text x="[\\d.]+" y="([\\d.]+)"[^>]*>${id}`).exec(svg)?.[1] ?? NaN);
  const capOf = (): number => theme.metrics.textSize * 0.72;

  const cases: readonly string[] = [
    'R1: resistor a5 e5 10k', 'R2: resistor a5 -t5 3.3', 'R3: resistor d5 h5 47',
    'R4: resistor/half a5 e5', 'C1: capacitor/electrolytic a5 e5', 'D1: diode a5 e5',
  ];

  for (const line of cases) {
    test(`keeps the label below the bottom of an upright body: ${line.split(':')[1]?.trim()}`, () => {
      const part = place(line);
      const from = layout.point(part.pins[0]!.address!);
      const to = layout.point(part.pins[1]!.address!);
      const span = Math.hypot(to.x - from.x, to.y - from.y);
      const bottom = (from.y + to.y) / 2 + bodySize(part, span).width / 2;
      const baseline = labelBaselineOf(renderPart(part, layout, theme), part.id);

      expect(baseline - capOf()).toBeGreaterThan(bottom);
    });
  }

  test('leaves a horizontal part where it was', () => {
    // 横は厚みで測る今までの式のまま。横の図が 1 px も動かないこと。
    const part = place('R1: resistor b5 b10 1k');
    const centre = layout.point(part.pins[0]!.address!);
    const baseline = labelBaselineOf(renderPart(part, layout, theme), part.id);

    const half = bodySize(part, 5 * layout.pitch).height / 2;

    expect(baseline).toBeCloseTo(centre.y + Math.max(18, half + 4 + capOf()), 5);
  });
});

describe('マイコンボードの名前', () => {
  test('keeps the name below the board, clear of the pin names written inside it', () => {
    // 基板の中に置いていたころは、長いピンの名前 (`ADC_VREF 35`) と食い合っていた
    // (実機で「文字が図形に被らないようにする」)。**ほかの部品と同じ側** —
    // 名前は胴の下 (実機で「すべての部品名は部品の下側に表示する」)。
    const part = place('U1: pico @ h5');
    const svg = renderPart(part, layout, theme);
    // 名前は `U1 Pico` (id と品名)。
    const baseline = Number(/<text x="[\d.]+" y="([\d.]+)"[^>]*>U1 /.exec(svg)?.[1] ?? NaN);
    const body = boardBodyRect(part, layout);

    expect(baseline - theme.metrics.textSize * 0.72).toBeGreaterThan(body.y + body.height);
  });
});

describe('マイコンボードのピンの番号', () => {
  test('writes the header number beside each pin name, as the schematic does', () => {
    // 実機で「pico のピン名にピン番号を表示する。circuit-editor の pico を参考に」。
    const part = place('U1: pico @ h5');
    const svg = renderPart(part, layout, theme);

    // 下の列 (ピンが下、字は上へ伸びる) は番号が先。
    expect(svg).toContain('>01 GP0<');
    // 上の列 (字は下へ伸びる) は名前が先 — **番号はどちらもピンの側の端**。
    expect(svg).toContain('>VBUS 40<');
    // 配線に書く綴りは名前のまま。
    expect(svg).not.toContain('01 GP0"');
  });
});

/**
 * 名札どうしがぶつかったら 1 行下げること。**隣り合う行に部品を置くと、
 * 上の部品の名札と下の部品の名札が同じ高さに並ぶ** (3 ピンはピンの名前の
 * 1 行下に名札が来るので、1 行違いでもぶつかる)。
 * 実機の 09-am-radio で `Q1 2SC1815` と `D1 1N60` が重なっていた回。
 */
describe('名札はぶつかったら逃げる', () => {
  const baselineOf = (svg: string, id: string): number =>
    Number(new RegExp(`<text x="[\\d.]+" y="([\\d.]+)"[^>]*>${id} `).exec(svg)?.[1] ?? NaN);

  const drawAll = (source: string): string => {
    const doc = parseFence(source).doc!;
    const placement = placeParts(doc.parts, createBoard(doc.board));
    const drops = captionDrops(placement.parts, layout, theme);
    return placement.parts.map((part) => renderPart(part, layout, theme, drops)).join('');
  };

  test('drops the later caption a line when two would sit on the same one', () => {
    const both = drawAll('parts:\n'
      + '  Q1: transistor h11(B) h12(C) h13(E) 2SC1815\n'
      + '  D1: diode i12(A) i17(K) 1N60\n');
    const alone = drawAll('parts:\n  D1: diode i12(A) i17(K) 1N60\n');

    expect(baselineOf(both, 'D1')).toBeGreaterThan(baselineOf(alone, 'D1'));
    expect(baselineOf(both, 'D1') - baselineOf(both, 'Q1')).toBeGreaterThan(theme.metrics.textSize);
  });

  test('leaves the first caption where it is, so writing a part does not move the others', () => {
    const both = drawAll('parts:\n'
      + '  Q1: transistor h11(B) h12(C) h13(E) 2SC1815\n'
      + '  D1: diode i12(A) i17(K) 1N60\n');
    const alone = drawAll('parts:\n  Q1: transistor h11(B) h12(C) h13(E) 2SC1815\n');

    expect(baselineOf(both, 'Q1')).toBe(baselineOf(alone, 'Q1'));
  });
});

/**
 * 3 ピンの名札とピンの名前が、**ピンの列の穴を全部伏せない**こと。`Q1 2SC1815` をピンの名前の
 * 1 行下に積んでいたので、横に並んだピン (h 行) の列の i と j が字の下に消え、E のピンの
 * 列を下のレールへ降ろす線 (`j13 -- -b13`) が名札の下から出ていた。
 */
describe('3 ピンの名札はピンの列の穴を空けておく', () => {
  const HOLE = 3;
  const holeSquare = (col: number, row: string) => {
    const at = layout.point(parseAddress(`${row}${col}`)!);
    return { x: at.x - HOLE, y: at.y - HOLE, width: HOLE * 2, height: HOLE * 2 };
  };
  const touches = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
    Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y);
  const legNameBaseline = (svg: string, name: string): number =>
    Number(new RegExp(`<text x="[\\d.]+" y="([\\d.]+)"[^>]*font-weight="700"[^>]*>${name}</text>`).exec(svg)?.[1] ?? NaN);

  test.each([
    ['Q1: transistor h11(B) h12(C) h13(E) 2SC1815', [11, 12, 13], ['i', 'j']],
    ['Q1: transistor b11(E) b12(B) b13(C) 2SA1015', [11, 12, 13], ['c', 'd', 'e']],
    ['Q1: transistor h28(B) h29(C) h30(E) 2SC1815', [28, 29, 30], ['i', 'j']],
  ] as const)('%s', (line, columns, rows) => {
    const part = place(line);
    const band = captionTextBandOf(part, layout, theme)!;
    for (const col of columns) {
      for (const row of rows) expect(touches(band, holeSquare(col, row)), `${row}${col}`).toBe(false);
    }
    // ピンの名前は行と行の間 (穴の上に字も縁取りも載らない)。
    const svg = renderPart(part, layout, theme);
    const baseline = legNameBaseline(svg, part.pins[0]!.name);
    const top = baseline - theme.metrics.textSize * NAME_CAP - haloWidth(theme) / 2;
    const bottom = baseline + haloWidth(theme) / 2;
    const [first, second] = [rows[0]!, rows[1]!];
    expect(top).toBeGreaterThanOrEqual(layout.point(parseAddress(`${first}${columns[0]}`)!).y + HOLE);
    expect(bottom).toBeLessThanOrEqual(layout.point(parseAddress(`${second}${columns[0]}`)!).y - HOLE);
    // 名札は基板の穴の並びの中に収まる。
    expect(band.x).toBeGreaterThanOrEqual(layout.colX(1) - layout.pitch / 2);
    expect(band.x + band.width).toBeLessThanOrEqual(layout.colX(layout.columns) + layout.pitch / 2);
  });
});

describe('3 ピンを広げて挿すと、胴からピンへ線を引く', () => {
  const lines = (line: string): number => (renderPart(place(line), layout, theme).match(/<line /g) ?? []).length;

  test('隣り合う穴のピンには線を引かない', () => {
    expect(lines('Q1: transistor j17(B) j18(C) j19(E)')).toBe(0);
  });

  test('離れた穴の B と E には胴から線を引く', () => {
    expect(lines('Q1: transistor j14(B) j18(C) j22(E)')).toBe(2);
  });
});

/**
 * ピンの名前の字を、**列番号の帯と溝に置かない**。どちらも書き手の線がよく通る所で、
 * 教科書の図 (01-circuits 第 5〜8 章) で字が埋もれた:
 *
 * - i 行の TO-92 (`i4(E) i5(C) i6(B)`) は、胴の下の行間が胴で塞がり、名前が j 行と
 *   下のレールの間 (列番号の帯) に落ちた。`E` が列番号 `5` と、E の列を下のレールへ
 *   降ろす GND の線 (`j4 -- -b4`) に重なった
 * - TO-220 は胴が大きく、名前が溝に落ちた。ピンの列を溝の向こうへ渡す線
 *   (`e8 -- f8`) の上に字が乗り、`in` `gnd` `out` どうしもくっついた
 *
 * 胴の下に行間が無ければ**胴の上の行間**へ置く。TO-220 は胴の樹脂の上に刷る
 * (DIP のピンの番号と同じ。胴の上は線が通らない)。
 */
describe('3 ピンのピンの名前は列番号の帯と溝に置かない', () => {
  const HOLE = 3;
  const nameTexts = (svg: string) => [...svg.matchAll(
    /<text x="([\d.]+)" y="([\d.]+)"(?![^>]*aria-hidden)[^>]*font-size="([\d.]+)" font-weight="700" fill="([^"]+)"[^>]*>([^<]+)<\/text>/g,
  )].map((match) => ({ x: Number(match[1]), y: Number(match[2]), size: Number(match[3]), fill: match[4]!, text: match[5]! }))
    // 胴に刻んだ型番 (明るい字) はピンの名前ではない。
    .filter((name) => name.fill !== theme.palette.chipText);
  const rowY = (row: string) => layout.point(parseAddress(`${row}1`)!).y;

  /** ピンの名前の字が縦に占める範囲 (縁取りまで)。 */
  const spanOf = (name: { y: number; size: number }) => ({
    top: name.y - name.size * NAME_CAP - haloWidth(theme) / 2,
    bottom: name.y + haloWidth(theme) / 2,
  });

  test.each([
    // 胴の下が塞がった i 行 → 胴の上の g と h の間。
    ['Q1: transistor i4(E) i5(C) i6(B) 2SC1815', 'g', 'h'],
    // 胴の下が溝になる e 行 → 胴の上の c と d の間。
    ['Q1: transistor e11(E) e12(B) e13(C) 2SC1815', 'c', 'd'],
    // 胴の下に行間がある h 行は今までどおり i と j の間。
    ['Q1: transistor h7(B) h8(C) h9(E) 2SC1815', 'i', 'j'],
  ] as const)('%s → %s と %s の間', (line, above, below) => {
    const part = place(line);
    const names = nameTexts(renderPart(part, layout, theme));
    expect(names.map((name) => name.text)).toEqual(part.pins.map((pin) => pin.name));
    for (const name of names) {
      const { top, bottom } = spanOf(name);
      expect(top, name.text).toBeGreaterThanOrEqual(rowY(above) + HOLE);
      expect(bottom, name.text).toBeLessThanOrEqual(rowY(below) - HOLE);
    }
  });

  test('keeps the caption of a TO-92 on the i row out of the column numbers under the j row', () => {
    const part = place('Q1: transistor i4(E) i5(C) i6(B) 2SC1815');
    const band = captionTextBandOf(part, layout, theme)!;
    // 列番号は j 行と下のレールの間に刷ってある。
    expect(band.y + band.height).toBeLessThanOrEqual(rowY('j'));
  });

  /** DejaVu Sans Bold (PNG を焼く sharp と Linux の既定の太字) の字の幅。 */
  const DEJAVU_BOLD: Readonly<Record<string, number>> = {
    i: 0.34, n: 0.71, g: 0.72, d: 0.72, o: 0.69, u: 0.71, t: 0.48, V: 0.77, s: 0.6, G: 0.82, N: 0.84, D: 0.83, '+': 0.84,
  };
  const dejavuWidth = (text: string) => [...text].reduce((sum, char) => sum + (DEJAVU_BOLD[char] ?? 1), 0);

  test.each([
    'U1: regulator/to220 c8(in) c9(gnd) c10(out) 7805',
    'U1: regulator/to220 h8(in) h9(gnd) h10(out) 7805',
    'U1: ic3 h9(+Vs) h10(Vout) h11(GND) LM35',
  ])('%s: neighbouring names leave a gap even in the widest bold font', (line) => {
    const names = nameTexts(renderPart(place(line), layout, theme)).sort((a, b) => a.x - b.x);
    expect(names).toHaveLength(3);
    for (let index = 1; index < names.length; index += 1) {
      const [left, right] = [names[index - 1]!, names[index]!];
      const ink = (dejavuWidth(left.text) * left.size + dejavuWidth(right.text) * right.size) / 2;
      // 字と字の間は字の大きさの 0.3 以上 (くっつくと `in gndout` と読めた)。
      expect(right.x - left.x - ink, `${left.text} ${right.text}`).toBeGreaterThanOrEqual(0.3 * left.size);
    }
  });

  /** 胴の矩形 (最初の `<rect>`) の縦の範囲。 */
  const shellSpan = (svg: string) => {
    const match = /<rect x="[\d.-]+" y="([\d.-]+)" width="[\d.-]+" height="([\d.-]+)" rx="3"/.exec(svg)!;
    return { top: Number(match[1]), bottom: Number(match[1]) + Number(match[2]) };
  };

  test.each([
    'U1: regulator/to220 c8(in) c9(gnd) c10(out) 7805',
    'U1: regulator/to220 h8(in) h9(gnd) h10(out) 7805',
  ])('%s: the TO-220 stands on its pins, tab up, and the names sit below the pins', (line) => {
    const part = place(line);
    const svg = renderPart(part, layout, theme);
    const cy = layout.point(part.pins[1]!.address!).y;
    // 胴は穴の行から上へだけ伸びる (ピンが下の縁、放熱タブが上)。
    const shell = shellSpan(svg);
    expect(shell.bottom).toBeLessThanOrEqual(cy);
    expect(cy - shell.top).toBeGreaterThanOrEqual(bodyHalfHeight(part, layout) * 2);
    // ピンの名前は胴の外、ピンの下。
    for (const name of nameTexts(svg)) {
      expect(name.y - name.size * NAME_CAP, name.text).toBeGreaterThan(cy);
      expect(Math.abs(name.x - centerX(part))).toBeLessThan(bodyHalfWidth(part, layout));
    }
  });

  test('keeps the pin holes where they were, whichever way the TO-220 body points', () => {
    const part = place('U1: regulator/to220 c8(in) c9(gnd) c10(out) 7805');

    expect(part.pins.map((pin) => pin.address)).toEqual(['c8', 'c9', 'c10'].map((text) => parseAddress(text)));
    expect(bodyDown(part, layout)).toBe(0);
    expect(bodyUp(part, layout)).toBeGreaterThan(bodyHalfHeight(part, layout) * 2);
  });

  test('engraves the part number of a regulator in the plastic, and nothing without a value', () => {
    const engraved = (line: string) => [...renderPart(place(line), layout, theme)
      .matchAll(/fill="([^"]+)"[^>]*>([^<]+)<\/text>/g)]
      .filter((match) => match[1] === theme.palette.chipText).map((match) => match[2]);

    expect(engraved('U1: regulator/to220 c8(in) c9(gnd) c10(out) 7805')).toEqual(['7805']);
    expect(engraved('U1: ic3 c8 c9 c10 LM35')).toEqual(['LM35']);
    expect(engraved('U1: regulator/to220 c8(in) c9(gnd) c10(out)')).toEqual([]);
    // トランジスタは今までどおり刻まない。
    expect(engraved('Q1: transistor/to220 c8 c9 c10 TIP31')).toEqual([]);
  });

  test('shrinks a long part number to fit the plastic', () => {
    const sizeOf = (value: string) => Number(/font-size="([\d.]+)"[^>]*fill="[^"]+"[^>]*>[^<]*<\/text>/.exec(
      [...renderPart(place(`U1: regulator/to220 c8(in) c9(gnd) c10(out) ${value}`), layout, theme)
        .matchAll(/<text[^>]*>[^<]*<\/text>/g)].map((match) => match[0]).find((text) => text.includes(theme.palette.chipText))!,
    )?.[1]);

    expect(sizeOf('AMS1117-3.3-LONGER')).toBeLessThan(sizeOf('7805'));
  });
});
