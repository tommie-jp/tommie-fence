import type { Layout } from '../model/layout.ts';
import type { PlacedPart } from '../types.ts';
import { DEFAULT_LED_COLOR, bandColor, ledColor } from './palette.ts';
import { LEAD_WIDTH, caption, fitToBoard, labelYOf, midpoint, partLabel } from './partCommon.ts';
import { element, num, svgText } from './svg.ts';
import type { RenderTheme } from './theme.ts';
import { parseOhms, resistorBandColors } from './values.ts';

/**
 * 2 本足の部品。**本体は 2 つの穴を結ぶ線の上に、その傾きのまま描く**ので、
 * 各部品の形は「原点が中央・x 軸が足の向き」の座標で書けばよい。
 */
export function renderTwoLead(part: PlacedPart, layout: Layout, theme: RenderTheme): string {
  const [first, second] = part.pins;
  if (!first?.address || !second?.address) return '';

  const { palette } = theme;
  const from = layout.point(first.address);
  const to = layout.point(second.address);
  const center = midpoint(from, to);
  const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  const span = Math.hypot(to.x - from.x, to.y - from.y);

  const lead = element('line', {
    x1: num(from.x), y1: num(from.y), x2: num(to.x), y2: num(to.y),
    stroke: palette.lead, 'stroke-width': LEAD_WIDTH,
  });
  const text = fitToBoard(caption(part), center.x, theme.metrics.textSize, layout);
  const label = partLabel(center.x, labelYOf(part, center, layout), text, theme);
  // 3 引数 rotate() を読まないレンダラがあるので translate と rotate に分ける。
  const body = element(
    'g',
    { transform: `translate(${num(center.x)} ${num(center.y)}) rotate(${num(angle)})` },
    bodyOf(part, span),
  );

  return `${lead}${body}${label}`;
}

/**
 * 種類 → 胴の描き方。**同じ形で色や帯だけが違うものは同じ関数を共有する**
 * (ダイオードの仲間・円板の仲間)。実物が見分けにくい部品を図の上だけで
 * 派手に描き分けると、それは実物の情報ではなくなる。
 */
const BODIES: Record<string, (part: PlacedPart, span: number) => string> = {
  resistor: resistorBody,
  capacitor: capacitorBody,
  crystal: (_part, span) => crystalBody(span),
  inductor: (_part, span) => inductorBody(span),
  buzzer: buzzerBody,
  led: (part) => domeBody(part, ledColor(part.value ?? '') ?? DEFAULT_LED_COLOR),
  // フォトダイオードは砲弾型で売られている。受光面が見えるように淡く塗り、
  // 縁は LED の赤茶ではなく灰にする (赤い縁だと図の中で LED に見える)。
  photodiode: (part) => domeBody(part, '#9fc7e8', '#5a6472'),

  diode: (part, span) => diodeBody(part, span, { fill: '#23272e', stroke: '#12151a', band: '#dfe4ee' }),
  // ツェナーは小信号用がガラス封止で、中の黒い帯が透けて見える。
  zener: (part, span) => diodeBody(part, span, { fill: '#c99a4a', stroke: '#8a6425', band: '#23272e' }),
  schottky: (part, span) => diodeBody(part, span, { fill: '#23272e', stroke: '#12151a', band: '#9aa3ad' }),
  varicap: (part, span) => diodeBody(part, span, { fill: '#23272e', stroke: '#12151a', band: '#dfe4ee', narrow: true }),
  // ダイアックは対称なので帯が無い。向きの無い部品だと形で分かる。
  diac: (part, span) => diodeBody(part, span, { fill: '#23272e', stroke: '#12151a', band: null }),

  photoresistor: (_part, span) => photoresistorBody(span),
  thermistor: (_part, span) => discBody(span, '#23272e', '#12151a'),
  'thermistor-ntc': (_part, span) => discBody(span, '#23272e', '#12151a', 'N'),
  'thermistor-ptc': (_part, span) => discBody(span, '#23272e', '#12151a', 'P'),
  // バリスタは同じ円板でも一回り大きく、青い樹脂で塗られている。
  varistor: (_part, span) => discBody(span, '#2f5fa8', '#1d3d6e', '', 1.25),

  reed: (_part, span) => reedBody(span),
  fuse: (_part, span) => fuseBody(span),
  lamp: (_part, span) => lampBody(span),
};

function bodyOf(part: PlacedPart, span: number): string {
  const body = Object.hasOwn(BODIES, part.type) ? BODIES[part.type] : undefined;
  return body ? body(part, span) : domeBody(part, DEFAULT_LED_COLOR);
}

function resistorBody(part: PlacedPart, span: number): string {
  const width = Math.min(span * 0.6, 38);
  const ohms = part.value ? parseOhms(part.value) : null;
  const bands = (ohms === null ? null : resistorBandColors(ohms)) ?? ['brown', 'black', 'black'];
  const stripes = bands
    .map((band, index) =>
      element('rect', {
        x: num(-width / 4 + index * (width / 5)), y: -6, width: 3.2, height: 12,
        fill: bandColor(band),
      }),
    )
    .join('');
  const shell = element('rect', {
    x: num(-width / 2), y: -6.5, width: num(width), height: 13, rx: 5,
    fill: '#e9d8a6', stroke: '#b08968',
  });
  return shell + stripes;
}

/**
 * コンデンサ。**姿 (`capacitor/ceramic`) が形を決める**。
 * 姿を書かなかったときはピン名 `(-)` の有無で選ぶ。既に書かれた図の
 * 見え方を変えないため、そこは今までの決め方をそのまま残してある。
 */
function capacitorBody(part: PlacedPart, span: number): string {
  // 姿を省いたときの選び分けは `-` の有無だけで決める (既に書かれた図を動かさないため)。
  const variant = part.variant ?? (part.pins.some((pin) => pin.name === '-') ? 'electrolytic' : 'film');

  if (variant === 'ceramic') return ceramicCapBody(span);
  if (variant === 'film') return filmCapBody(span);
  if (variant === 'tantalum') return tantalumCapBody(part, span);
  return electrolyticCapBody(part, span);
}

/**
 * 極性の印が付く側の足。**片方にしか印が無くても、2 本足なら反対側が決まる**。
 *
 * どちらにも印が無ければ**先に書いた穴が + 側**とする。これはフェンス全体に
 * かかる 1 文の規則で、`led` と `diode` の「2 つ目がカソード」も同じ規則の別の顔。
 * ここを「常に 2 本目」にしていると、**印がプラス側に付くタンタルだけ向きが逆**になる。
 */
function polarityIndex(part: PlacedPart, mark: '+' | '-'): number {
  const found = part.pins.findIndex((pin) => pin.name === mark);
  if (found !== -1) return found;
  const opposite = part.pins.findIndex((pin) => pin.name === (mark === '-' ? '+' : '-'));
  if (opposite !== -1) return 1 - opposite;
  return mark === '+' ? 0 : 1;
}

/** フィルム・積層セラミックの角い胴。無極性のコンデンサの既定の姿。 */
function filmCapBody(span: number): string {
  const width = Math.min(span * 0.55, 30);
  return element('rect', {
    x: num(-width / 2), y: -8, width: num(width), height: 16, rx: 3,
    fill: '#e3a72f', stroke: '#9c6f10',
  });
}

/**
 * セラミックの円板。色はフィルムと同じ系統に置いて、**形だけで見分けさせる**。
 * LED の丸とは、足の線の上に中心が乗ることと、平らな面が無いことで区別できる。
 */
function ceramicCapBody(span: number): string {
  const radius = Math.min(span * 0.45, 9.5);
  return element('circle', { cx: 0, cy: 0, r: num(radius), fill: '#d18b3c', stroke: '#8a5a22' });
}

/** 電解の缶。マイナス側に帯を描く。逆挿しは壊れるので目立たせる。 */
function electrolyticCapBody(part: PlacedPart, span: number): string {
  const width = Math.min(span * 0.6, 34);
  const stripeX = polarityIndex(part, '-') === 0 ? -width / 2 + 4.5 : width / 2 - 4.5;
  const shell = element('rect', {
    x: num(-width / 2), y: -9.5, width: num(width), height: 19, rx: 4,
    fill: '#2c3e70', stroke: '#1b2748',
  });
  const stripe = element('rect', { x: num(stripeX - 3.5), y: -9.5, width: 7, height: 19, fill: '#dfe4ee' });
  const mark = svgText(stripeX, 4, '−', { 'font-size': 12, 'font-weight': 700, fill: '#2c3e70' });
  return shell + stripe + mark;
}

/**
 * ディップタンタルの粒。**印が付くのはプラス側**で、電解の帯 (マイナス側) とは逆。
 * 同じコンデンサでも印の意味が逆なので、形を変えて取り違えられないようにする。
 */
function tantalumCapBody(part: PlacedPart, span: number): string {
  const width = Math.min(span * 0.55, 30);
  const height = 17;
  const markX = polarityIndex(part, '+') === 0 ? -width / 2 + 5 : width / 2 - 5;
  const shell = element('rect', {
    x: num(-width / 2), y: num(-height / 2), width: num(width), height, rx: num(height / 2),
    fill: '#e0b93c', stroke: '#a5822a',
  });
  const mark = svgText(markX, 4, '+', { 'font-size': 12, 'font-weight': 700, fill: '#5b4611' });
  return shell + mark;
}

/** 5mm 砲弾型が既定。3mm はひと回り小さいだけで、置き方も足の名前も変わらない。 */
const LED_RADIUS = 8.5;

/**
 * 砲弾型の玉。LED とフォトダイオードが同じ形で、違うのは色だけ。
 * カソード側に平らな面を描く。
 */
function domeBody(part: PlacedPart, color: string, edge = '#7a2018'): string {
  // 3mm は 5mm の形をそのまま縮める (5mm と省略時は今までの数字にそのまま戻る)。
  const scale = part.variant === '3mm' ? 6.5 / LED_RADIUS : 1;
  // カソード側の平らな面。部品の向きに合わせたいので、本体と同じ回転の中で置く。
  const flatX = (part.pins[0]?.name.toUpperCase() === 'K' ? -6 : 6) * scale;
  const dome = element('circle', {
    cx: 0, cy: num(-4 * scale), r: num(LED_RADIUS * scale), fill: color, 'fill-opacity': 0.85, stroke: edge,
  });
  const flat = element('line', {
    x1: num(flatX), y1: num(-11 * scale), x2: num(flatX), y2: num(3 * scale), stroke: edge, 'stroke-width': 2,
  });
  return dome + flat;
}

type DiodeLook = {
  readonly fill: string;
  readonly stroke: string;
  /** カソード帯の色。**対称な素子 (diac) は null** で、帯そのものを描かない。 */
  readonly band: string | null;
  /** バリキャップのように胴が短い品種。 */
  readonly narrow?: boolean;
};

/**
 * ダイオードの仲間。カソード側に帯を描く。
 * ピン名 `(A)` `(K)` が無いときは **2 つ目の穴をカソード**として描く
 * (「先に書いた穴が + 側 (アノード)」の規則そのもの)。
 */
function diodeBody(part: PlacedPart, span: number, look: DiodeLook): string {
  const width = Math.min(span * (look.narrow ? 0.4 : 0.55), look.narrow ? 22 : 30);
  const cathode = part.pins[0]?.name.toUpperCase() === 'K' ? -1 : 1;
  const shell = element('rect', {
    x: num(-width / 2), y: -6.5, width: num(width), height: 13, rx: 2.5,
    fill: look.fill, stroke: look.stroke,
  });
  if (look.band === null) return shell;

  const band = element('rect', {
    x: num(cathode * (width / 2 - 4.6) - 1.7), y: -6.5, width: 3.4, height: 13, fill: look.band,
  });
  return shell + band;
}

/** 円板に固めた抵抗体 (サーミスタ・バリスタ)。印は品種を見分けるための 1 文字。 */
function discBody(span: number, fill: string, stroke: string, mark = '', scale = 1): string {
  const radius = Math.min(span * 0.45, 9.5) * scale;
  const disc = element('circle', { cx: 0, cy: 0, r: num(radius), fill, stroke });
  if (!mark) return disc;

  return disc + svgText(0, radius * 0.35, mark, {
    'font-size': num(radius * 1.1), 'font-weight': 700, fill: '#dfe4ee',
  });
}

/** CdS セル。受光面の蛇行した抵抗体が、この部品の見分けどころそのもの。 */
function photoresistorBody(span: number): string {
  const radius = Math.min(span * 0.45, 9.5);
  const disc = element('circle', { cx: 0, cy: 0, r: num(radius), fill: '#d9c27a', stroke: '#8a7530' });
  const step = radius / 2.2;
  const zigzag = element('path', {
    d: `M ${num(-radius * 0.7)} ${num(-radius * 0.55)} `
      + `l ${num(step)} ${num(radius * 1.1)} l ${num(step)} ${num(-radius * 1.1)} `
      + `l ${num(step)} ${num(radius * 1.1)} l ${num(step)} ${num(-radius * 1.1)}`,
    fill: 'none', stroke: '#4a3c12', 'stroke-width': 1.6, 'stroke-linejoin': 'round',
  });
  return disc + zigzag;
}

/** ガラス管の胴。リードスイッチとヒューズが共有する。 */
function glassTube(width: number, height: number): string {
  return element('rect', {
    x: num(-width / 2), y: num(-height / 2), width: num(width), height: num(height), rx: num(height / 2),
    fill: '#e6eef5', stroke: '#8a929c', 'fill-opacity': 0.85,
  });
}

/** リードスイッチ。ガラス管の中で 2 枚の接片が向かい合う。 */
function reedBody(span: number): string {
  const width = Math.min(span * 0.6, 34);
  const blade = (from: number, to: number): string =>
    element('line', {
      x1: num(from), y1: 0, x2: num(to), y2: 0, stroke: '#5a6472', 'stroke-width': 2.4, 'stroke-linecap': 'round',
    });
  // 接点は開いた状態で描く。閉じた図にすると、磁石が無い平常時と食い違う。
  return glassTube(width, 11) + blade(-width / 2 + 3, -1.6) + blade(1.6, width / 2 - 3);
}

/** ガラス管ヒューズ。両端の金属キャップと、中を通る細い溶断線。 */
function fuseBody(span: number): string {
  const width = Math.min(span * 0.6, 34);
  const cap = (x: number): string =>
    element('rect', { x: num(x - 3), y: -6.5, width: 6, height: 13, rx: 1.5, fill: '#b9c0c9', stroke: '#7c848e' });
  const wire = element('line', {
    x1: num(-width / 2 + 3), y1: 0, x2: num(width / 2 - 3), y2: 0, stroke: '#8a6425', 'stroke-width': 1.4,
  });
  return glassTube(width, 13) + wire + cap(-width / 2 + 3) + cap(width / 2 - 3);
}

/** 豆電球。ガラス球とフィラメント、下に口金。 */
function lampBody(span: number): string {
  const radius = Math.min(span * 0.42, 10);
  const bulb = element('circle', {
    cx: 0, cy: num(-radius * 0.35), r: num(radius), fill: '#f2eac2', stroke: '#a99a54', 'fill-opacity': 0.9,
  });
  const filament = element('path', {
    d: `M ${num(-radius * 0.4)} ${num(radius * 0.15)} l ${num(radius * 0.4)} ${num(-radius * 0.7)} `
      + `l ${num(radius * 0.4)} ${num(radius * 0.7)}`,
    fill: 'none', stroke: '#a9713a', 'stroke-width': 1.6,
  });
  const base = element('rect', {
    x: num(-radius * 0.6), y: num(radius * 0.25), width: num(radius * 1.2), height: num(radius * 0.6), rx: 1.5,
    fill: '#b9c0c9', stroke: '#7c848e',
  });
  return bulb + filament + base;
}

/** HC-49 のような金属缶。中身は見えないので、缶であることだけを描く。 */
function crystalBody(span: number): string {
  const width = Math.min(span * 0.6, 30);
  const shell = element('rect', {
    x: num(-width / 2), y: -8.5, width: num(width), height: 17, rx: 8.5,
    fill: '#b9c0c9', stroke: '#7c848e',
  });
  const gloss = element('rect', {
    x: num(-width / 2 + 5), y: -5.5, width: num(Math.max(width - 10, 2)), height: 3, rx: 1.5,
    fill: '#dfe4ee',
  });
  return shell + gloss;
}

const COIL_TURNS = 4;

function inductorBody(span: number): string {
  const width = Math.min(span * 0.6, 34);
  const radius = width / (COIL_TURNS * 2);
  // 足の向きに沿って山を並べる。sweep 1 は画面の時計回りなので、山は上に膨らむ。
  const arcs = Array.from(
    { length: COIL_TURNS },
    () => `a ${num(radius)} ${num(radius)} 0 0 1 ${num(radius * 2)} 0`,
  ).join(' ');
  return element('path', {
    d: `M ${num(-width / 2)} 0 ${arcs}`,
    fill: 'none', stroke: '#a9713a', 'stroke-width': 3.4, 'stroke-linecap': 'round',
  });
}

/** 圧電・電磁ブザー。上から見た丸い缶と、音の出る穴。 */
function buzzerBody(part: PlacedPart, span: number): string {
  const radius = Math.min(span * 0.5, 15);
  const shell = element('circle', { cx: 0, cy: 0, r: num(radius), fill: '#23272e', stroke: '#12151a' });
  const vent = element('circle', { cx: 0, cy: 0, r: 3, fill: '#8a929c' });
  const plus = part.pins.findIndex((pin) => pin.name === '+');
  const mark = plus === -1
    ? ''
    : svgText(plus === 0 ? -radius * 0.55 : radius * 0.55, 4, '+', {
        'font-size': 11, 'font-weight': 700, fill: '#dfe4ee',
      });
  return shell + vent + mark;
}
