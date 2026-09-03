import { DEFAULT_LED_COLOR, bandColor, ledColor } from '../colors.ts';
import { element } from '../markup.ts';
import { num, svgText } from '../svg.ts';
import { capacitorCode, parsePicofarads, parseResistor, resistorBands } from '../values.ts';

/**
 * 2 本足の部品の**胴の姿**。板に依らないので、breadboard と perfboard が共有する
 * (52 の docs/18)。
 *
 * **座標は「原点が中央・x 軸が足の向き」。** 胴は 2 つの穴を結ぶ線の上に、その
 * 傾きのまま描かれるので、形の側は傾きも位置も知らなくてよい。両方の板が
 * 元からこの約束で描いていたので、引き上げは形をそのまま移すだけで済んだ。
 *
 * **色は実物の色。** テーマでは動かない (抵抗はどの板に挿してもベージュ)。
 * ただし白黒で刷る図のために、塗りは `ink` を通す — perfboard はそこで
 * 網に移す (`render/hatch.ts`)。名前のある色 (帯・LED) は名前も渡すので、
 * 網と凡例が引き当てられる。
 *
 * **大きさは `bodySize` が 1 か所で決める。** perfboard は当たり判定に同じ形を
 * 使うので (図では重なって見えるのに何も言わない、を避けるため)、描く側と
 * 数える側が別々に持たないようにする。
 */

/** 胴を描くのに要る部品の情報。**両方の `PlacedPart` がそのまま当てはまる形**。 */
export type BodyPart = {
  readonly type: string;
  readonly value?: string | null;
  /** 姿 (`capacitor/electrolytic` の `electrolytic`、LED の `3mm`)。 */
  readonly variant?: string | null;
  /** 足。極性の印 (`+` `-` `A` `K`) を読む。 */
  readonly pins: readonly { readonly name: string }[];
};

/**
 * 塗りの差し替え口。`name` は**実物の色の名前**が分かっているとき
 * (抵抗の帯、LED の色) だけ付く。白黒の図はそこで網に移す。
 */
export type BodyInk = {
  readonly paint: (color: string, name?: string) => string;
};

/** そのままの色で描く (色のある図)。 */
export const REAL_INK: BodyInk = { paint: (color) => color };

/** CdS の受光面の折り返しの数と、豆電球のフィラメントの巻き数。 */
const CDS_FINGERS = 5;
const FILAMENT_TURNS = 3;

/** 水晶の缶。足より張り出す幅と、缶の高さ・持ち上げ。 */
const CAN_OVERHANG = 6;
const CAN_MIN_WIDTH = 26;
const CAN_MAX_WIDTH = 44;
const CAN_HEIGHT = 17;
const CAN_LIFT = 3;

/**
 * 円筒型の水晶 (時計用の 32.768kHz などに多い 3mm 径 8mm 長)。
 * HC-49 と同じ縮尺で持つ — 実物は径 3mm・長さ 8mm、HC-49 は幅 11mm。
 */
const TUBE_WIDTH = 9;
const TUBE_HEIGHT = 24;

/** 缶の下の口金 (巻き締め) の高さ。ここに足の出口の窪みが並ぶ。 */
const CAN_COLLAR = 4;

/** コイルの芯の太さの半分と、巻線 1 本の幅・高さの半分。 */
const CORE_HALF = 4.5;
const TURN_WIDTH = 3;
const TURN_HALF = 6.5;

/** 抵抗の帯の幅と、胴の端に残す地の色。 */
const BAND_WIDTH = 3.2;
const BAND_EDGE = 0.5;

/** 5mm 砲弾型が既定。3mm はひと回り小さいだけで、置き方も足の名前も変わらない。 */
const LED_RADIUS = 8.5;

const domeScale = (part: BodyPart): number => (part.variant === '3mm' ? 6.5 / LED_RADIUS : 1);

/**
 * 印が付く側の足。**片方にしか印が無くても、2 本足なら反対側が決まる**。
 *
 * どちらにも印が無ければ**先に書いた穴が + 側 (アノード)** とする。
 * これはフェンス全体にかかる 1 文の規則で、コンデンサの `(+)` `(-)` も
 * ダイオードの `(A)` `(K)` も同じ規則の別の顔。**片方だけ見て決めると、
 * 反対側だけを書いた図 (`diode a5 a10(A)`) が逆向きに描かれる。**
 *
 * @param whenBare どちらの印も無いときに返す足 (0 = 先に書いた穴)
 */
function markedIndex(part: BodyPart, mark: string, opposite: string, whenBare: number): number {
  const names = part.pins.map((pin) => pin.name.toUpperCase());
  const found = names.indexOf(mark);
  if (found !== -1) return found;
  const other = names.indexOf(opposite);
  if (other !== -1) return 1 - other;
  return whenBare;
}

/** 電解の帯 (マイナス側) とタンタルの印 (プラス側)。既定の向きは規則から決まる。 */
const polarityIndex = (part: BodyPart, mark: '+' | '-'): number =>
  (mark === '+' ? markedIndex(part, '+', '-', 0) : markedIndex(part, '-', '+', 1));

/** カソード側の足。ダイオードの帯と LED の平らな面がここを見る。 */
const cathodeIndex = (part: BodyPart): number => markedIndex(part, 'K', 'A', 1);

/**
 * コンデンサの姿。**書かれていなければピン名 `(-)` の有無で選ぶ** —
 * 既に書かれた図の見え方を変えないため、そこは今までの決め方をそのまま残す。
 */
const capacitorLook = (part: BodyPart): string =>
  part.variant ?? (part.pins.some((pin) => pin.name === '-') ? 'electrolytic' : 'film');

function resistorBody(part: BodyPart, span: number, ink: BodyInk): string {
  const width = Math.min(span * 0.6, 38);
  // 値のうしろに許容差と温度係数を書ける (`10k 1% 50ppm`)。帯の本数はそれで決まる。
  const read = part.value ? parseResistor(part.value) : null;
  const bands = (read === null
    ? null
    : resistorBands(read.ohms, { tolerance: read.tolerance, tempco: read.tempco }))
    ?? ['brown', 'black', 'black', 'gold'];
  // **帯は胴からはみ出さない。** 隣り合う穴に挿した抵抗は胴が短く、間隔を
  // 決め打つと帯が板の地や隣の穴の上に乗る。入りきらないときは**間隔と幅を
  // 一緒に詰める** — 隙間だけ詰めると 2 色が 1 本に見え、読み違いになる。
  const start = -width / 4;
  const room = Math.max(width / 2 - BAND_EDGE - start, 1);
  const needed = (bands.length - 1) * (width / 5) + BAND_WIDTH;
  const fit = needed > room ? room / needed : 1;
  const stripes = bands
    .map((band, index) =>
      element('rect', {
        x: num(start + index * (width / 5) * fit), y: -6, width: num(BAND_WIDTH * fit), height: 12,
        fill: ink.paint(bandColor(band), band),
      }),
    )
    .join('');
  const shell = element('rect', {
    x: num(-width / 2), y: -6.5, width: num(width), height: 13, rx: 5,
    fill: ink.paint('#e9d8a6'), stroke: ink.paint('#b08968'),
  });
  return shell + stripes;
}

/**
 * コンデンサの胴に刷る 3 桁コード (`100n` なら `104`)。
 *
 * **無極性のもの (セラミック・フィルム) にだけ刷る。** 実物の電解とタンタルは
 * 容量をそのまま (`100µF`) 刷るので、3 桁コードを載せると別物の顔になる。
 *
 * 胴に入らない幅では刷らない — 切れた `104` は `10` (= 10pF) に読める。
 */
function capacitorCodeOn(part: BodyPart, room: number, size: number, ink: BodyInk): string {
  const farads = part.value ? parsePicofarads(part.value) : null;
  const code = farads === null ? null : capacitorCode(farads);
  if (code === null || room < size * code.length * 0.7) return '';

  return svgText(0, size * 0.35, code, { 'font-size': num(size), fill: ink.paint('#4a3208') });
}

/** フィルム・積層セラミックの角い胴。無極性のコンデンサの既定の姿。 */
function filmCapBody(part: BodyPart, span: number, ink: BodyInk): string {
  const width = Math.min(span * 0.55, 30);
  const shell = element('rect', {
    x: num(-width / 2), y: -8, width: num(width), height: 16, rx: 3,
    fill: ink.paint('#e3a72f'), stroke: ink.paint('#9c6f10'),
  });
  return shell + capacitorCodeOn(part, width - 4, 9, ink);
}

/**
 * セラミックの円板。色はフィルムと同じ系統に置いて、**形だけで見分けさせる**。
 * LED の丸とは、足の線の上に中心が乗ることと、平らな面が無いことで区別できる。
 */
function ceramicCapBody(part: BodyPart, span: number, ink: BodyInk): string {
  const radius = Math.min(span * 0.45, 9.5);
  const shell = element('circle', {
    cx: 0, cy: 0, r: num(radius), fill: ink.paint('#d18b3c'), stroke: ink.paint('#8a5a22'),
  });
  // 円板は狭いので字も一回り小さく。入らなければ刷らない。
  return shell + capacitorCodeOn(part, radius * 1.9, 7, ink);
}

/** 電解の缶。マイナス側に帯を描く。逆挿しは壊れるので目立たせる。 */
function electrolyticCapBody(part: BodyPart, span: number, ink: BodyInk): string {
  const width = Math.min(span * 0.6, 34);
  const stripeX = polarityIndex(part, '-') === 0 ? -width / 2 + 4.5 : width / 2 - 4.5;
  const shell = element('rect', {
    x: num(-width / 2), y: -9.5, width: num(width), height: 19, rx: 4,
    fill: ink.paint('#2c3e70'), stroke: ink.paint('#1b2748'),
  });
  const stripe = element('rect', {
    x: num(stripeX - 3.5), y: -9.5, width: 7, height: 19, fill: ink.paint('#dfe4ee'),
  });
  const mark = svgText(stripeX, 4, '−', { 'font-size': 12, 'font-weight': 700, fill: ink.paint('#2c3e70') });
  return shell + stripe + mark;
}

/**
 * ディップタンタルの粒。**印が付くのはプラス側**で、電解の帯 (マイナス側) とは逆。
 * 同じコンデンサでも印の意味が逆なので、形を変えて取り違えられないようにする。
 */
function tantalumCapBody(part: BodyPart, span: number, ink: BodyInk): string {
  const width = Math.min(span * 0.55, 30);
  const height = 17;
  const markX = polarityIndex(part, '+') === 0 ? -width / 2 + 5 : width / 2 - 5;
  const shell = element('rect', {
    x: num(-width / 2), y: num(-height / 2), width: num(width), height, rx: num(height / 2),
    fill: ink.paint('#e0b93c'), stroke: ink.paint('#a5822a'),
  });
  const mark = svgText(markX, 4, '+', { 'font-size': 12, 'font-weight': 700, fill: ink.paint('#5b4611') });
  return shell + mark;
}

function capacitorBody(part: BodyPart, span: number, ink: BodyInk): string {
  const look = capacitorLook(part);
  if (look === 'ceramic') return ceramicCapBody(part, span, ink);
  if (look === 'film') return filmCapBody(part, span, ink);
  if (look === 'tantalum') return tantalumCapBody(part, span, ink);
  return electrolyticCapBody(part, span, ink);
}

/**
 * 砲弾型の玉。LED とフォトダイオードが同じ形で、違うのは色だけ。
 * カソード側に平らな面を描く。
 */
function domeBody(part: BodyPart, color: string, ink: BodyInk, edge = '#7a2018', name?: string): string {
  // 3mm は 5mm の形をそのまま縮める (5mm と省略時は今までの数字にそのまま戻る)。
  const scale = domeScale(part);
  // カソード側の平らな面。部品の向きに合わせたいので、本体と同じ回転の中で置く。
  const flatX = (cathodeIndex(part) === 0 ? -6 : 6) * scale;
  const painted = ink.paint(edge);
  const dome = element('circle', {
    cx: 0, cy: num(-4 * scale), r: num(LED_RADIUS * scale),
    fill: ink.paint(color, name), 'fill-opacity': 0.85, stroke: painted,
  });
  const flat = element('line', {
    x1: num(flatX), y1: num(-11 * scale), x2: num(flatX), y2: num(3 * scale), stroke: painted, 'stroke-width': 2,
  });
  return dome + flat;
}

/** LED の色。書かれた値から引き、知らない色でも既定で描く。 */
const ledLook = (part: BodyPart): { readonly color: string; readonly name?: string } => {
  const written = part.value ?? '';
  const found = ledColor(written);
  return found === null ? { color: DEFAULT_LED_COLOR } : { color: found, name: written.toLowerCase() };
};

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
function diodeBody(part: BodyPart, span: number, look: DiodeLook, ink: BodyInk): string {
  const width = Math.min(span * (look.narrow === true ? 0.4 : 0.55), look.narrow === true ? 22 : 30);
  const cathode = cathodeIndex(part) === 0 ? -1 : 1;
  const shell = element('rect', {
    x: num(-width / 2), y: -6.5, width: num(width), height: 13, rx: 2.5,
    fill: ink.paint(look.fill), stroke: ink.paint(look.stroke),
  });
  if (look.band === null) return shell;

  const band = element('rect', {
    x: num(cathode * (width / 2 - 4.6) - 1.7), y: -6.5, width: 3.4, height: 13, fill: ink.paint(look.band),
  });
  return shell + band;
}

/** 円板に固めた抵抗体 (サーミスタ・バリスタ)。印は品種を見分けるための 1 文字。 */
function discBody(span: number, fill: string, stroke: string, ink: BodyInk, mark = '', scale = 1): string {
  const radius = Math.min(span * 0.45, 9.5) * scale;
  const disc = element('circle', {
    cx: 0, cy: 0, r: num(radius), fill: ink.paint(fill), stroke: ink.paint(stroke),
  });
  if (!mark) return disc;

  return disc + svgText(0, radius * 0.35, mark, {
    'font-size': num(radius * 1.1), 'font-weight': 700, fill: ink.paint('#dfe4ee'),
  });
}

/**
 * CdS セル。**受光面の櫛形の抵抗体**が、この部品の見分けどころそのもの。
 *
 * 前は山が 2 つの折れ線 (`W`) を 1 本引いていたが、それは**抵抗の回路記号**で
 * あって実物ではない。実物は細い帯が何度も折り返して face を覆っている。
 */
function photoresistorBody(span: number, ink: BodyInk): string {
  const radius = Math.min(span * 0.45, 9.5);
  const disc = element('circle', {
    cx: 0, cy: 0, r: num(radius), fill: ink.paint('#d9c27a'), stroke: ink.paint('#8a7530'),
  });

  // 折り返す帯。**円に収まる範囲で**縦の指を並べ、上下を交互につなぐ。
  const fingers = CDS_FINGERS;
  const reach = radius * 0.72;
  const step = (reach * 2) / (fingers - 1);
  const top = -radius * 0.62;
  const bottom = radius * 0.62;
  const path = Array.from({ length: fingers }, (_, index) => {
    const x = -reach + index * step;
    const down = index % 2 === 0;
    const start = index === 0 ? `M ${num(x)} ${num(down ? top : bottom)}` : '';
    return `${start} L ${num(x)} ${num(down ? bottom : top)}`
      + (index === fingers - 1 ? '' : ` L ${num(x + step)} ${num(down ? bottom : top)}`);
  }).join(' ');

  const track = element('path', {
    d: path, fill: 'none', stroke: ink.paint('#4a3c12'),
    'stroke-width': num(Math.max(radius * 0.13, 0.8)), 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
  });
  return disc + track;
}

/** ガラス管の胴。リードスイッチとヒューズが共有する。 */
function glassTube(width: number, height: number, ink: BodyInk): string {
  return element('rect', {
    x: num(-width / 2), y: num(-height / 2), width: num(width), height: num(height), rx: num(height / 2),
    fill: ink.paint('#e6eef5'), stroke: ink.paint('#8a929c'), 'fill-opacity': 0.85,
  });
}

/** リードスイッチ。ガラス管の中で 2 枚の接片が向かい合う。 */
function reedBody(span: number, ink: BodyInk): string {
  const width = Math.min(span * 0.6, 34);
  const blade = (from: number, to: number): string =>
    element('line', {
      x1: num(from), y1: 0, x2: num(to), y2: 0,
      stroke: ink.paint('#5a6472'), 'stroke-width': 2.4, 'stroke-linecap': 'round',
    });
  // 接点は開いた状態で描く。閉じた図にすると、磁石が無い平常時と食い違う。
  return glassTube(width, 11, ink) + blade(-width / 2 + 3, -1.6) + blade(1.6, width / 2 - 3);
}

/** ガラス管ヒューズ。両端の金属キャップと、中を通る細い溶断線。 */
function fuseBody(span: number, ink: BodyInk): string {
  const width = Math.min(span * 0.6, 34);
  const cap = (x: number): string =>
    element('rect', {
      x: num(x - 3), y: -6.5, width: 6, height: 13, rx: 1.5,
      fill: ink.paint('#b9c0c9'), stroke: ink.paint('#7c848e'),
    });
  const wire = element('line', {
    x1: num(-width / 2 + 3), y1: 0, x2: num(width / 2 - 3), y2: 0,
    stroke: ink.paint('#8a6425'), 'stroke-width': 1.4,
  });
  return glassTube(width, 13, ink) + wire + cap(-width / 2 + 3) + cap(width / 2 - 3);
}

/**
 * 豆電球。**ガラス球と、下のねじ口金**。
 *
 * 前はフィラメントを大きな `Λ` で描いていたが、それは**回路記号の中の絵**で
 * あって実物ではない。実物は細い線を巻いたフィラメントが 2 本の支柱に架かり、
 * 下にねじ山の見える金属の口金が付く。
 */
function lampBody(span: number, ink: BodyInk): string {
  const radius = Math.min(span * 0.42, 10);
  const glass = ink.paint('#f2eac2');
  const metal = ink.paint('#b9c0c9');
  const edge = ink.paint('#7c848e');
  const wire = ink.paint('#a9713a');

  const bulb = element('circle', {
    cx: 0, cy: num(-radius * 0.45), r: num(radius), fill: glass, stroke: ink.paint('#a99a54'), 'fill-opacity': 0.9,
  });
  // 支柱 2 本と、その間に架かる巻きフィラメント。
  const post = (side: number): string => element('line', {
    x1: num(side * radius * 0.3), y1: num(radius * 0.2), x2: num(side * radius * 0.3), y2: num(-radius * 0.45),
    stroke: wire, 'stroke-width': num(Math.max(radius * 0.1, 0.8)),
  });
  const coil = element('path', {
    d: `M ${num(-radius * 0.3)} ${num(-radius * 0.45)} `
      + Array.from({ length: FILAMENT_TURNS }, () =>
        `a ${num(radius * 0.1)} ${num(radius * 0.1)} 0 0 1 ${num((radius * 0.6) / FILAMENT_TURNS)} 0`).join(' '),
    fill: 'none', stroke: wire, 'stroke-width': num(Math.max(radius * 0.12, 0.9)),
  });
  // ねじ口金。ねじ山を 2 本の線で示す (実物の見分けどころ)。
  const baseTop = radius * 0.2;
  const baseHeight = radius * 0.75;
  const base = element('rect', {
    x: num(-radius * 0.62), y: num(baseTop), width: num(radius * 1.24), height: num(baseHeight), rx: 1.5,
    fill: metal, stroke: edge,
  });
  const threads = [0.35, 0.65]
    .map((at) => element('line', {
      x1: num(-radius * 0.62), y1: num(baseTop + baseHeight * at),
      x2: num(radius * 0.62), y2: num(baseTop + baseHeight * at),
      stroke: edge, 'stroke-width': 0.8,
    }))
    .join('');
  return bulb + post(-1) + post(1) + coil + base + threads;
}

/**
 * 水晶振動子。**缶から下に 2 本足が出る**部品なので、軸物のように両端から足を
 * 出さない — 缶は足の上に立ち、そこから 2 本が板へ下りる。
 *
 * 姿は 2 通り。実物でよく出回っているのがこの 2 つで、**輪郭がまるで違う**ので
 * 描き分ける。
 *
 * - `hc49` (既定) — 平たい缶。肩が丸く、下に口金がある。実物は幅 11mm、
 *   足の間隔 4.88mm。**胴が足の間に収まらない**ので、幅は足の間隔ではなく
 *   缶そのものの寸法で決める
 * - `cylinder` — 円筒。径 3mm・長さ 8mm ほどの細い筒で、**足は同じ端から
 *   2 本出て、穴の間隔まで開く**
 */
function crystalBody(part: BodyPart, span: number, ink: BodyInk): string {
  const { width, height } = canOf(part, span);
  const top = -(height + CAN_LIFT);
  const bottom = top + height;
  const metal = ink.paint('#b9c0c9');
  const edge = ink.paint('#7c848e');
  const round = part.variant === 'cylinder';

  const can = element('path', {
    d: round ? tubeOutline(width, top, bottom) : canOutline(width, top, bottom),
    fill: metal, stroke: edge,
  });
  // 足の出口。**缶の幅の内側**に収める (実物も缶の端からは出ない)。
  const legX = Math.min(span / 2, Math.max(width / 2 - 4, 1));
  const collarY = bottom - CAN_COLLAR;
  // 口金 (巻き締め)。円筒は先端をかしめてあるだけなので線 1 本。
  const collar = round
    ? element('line', {
      x1: num(-width / 2 + 1), y1: num(collarY), x2: num(width / 2 - 1), y2: num(collarY),
      stroke: edge, 'stroke-width': 1,
    })
    : element('rect', {
      x: num(-width / 2), y: num(collarY), width: num(width), height: num(CAN_COLLAR),
      fill: ink.paint('#a2aab4'), stroke: edge,
    });
  // 足の出口の窪み。実物の HC-49 は口金にこの 2 つが見える。
  const eyelets = round ? '' : [-1, 1]
    .map((at) => element('circle', {
      cx: num(at * legX), cy: num(collarY + CAN_COLLAR / 2), r: 1.6, fill: ink.paint('#7c848e'),
    }))
    .join('');
  // つや。平たい缶は横に、円筒は縦に走る。
  const gloss = round
    ? element('rect', {
      x: num(-width / 2 + 2), y: num(top + 3), width: 2.5, height: num(Math.max(height - 8, 2)), rx: 1.2,
      fill: ink.paint('#dfe4ee'),
    })
    : element('rect', {
      x: num(-width / 2 + 4), y: num(top + 3), width: num(Math.max(width - 8, 2)), height: 3, rx: 1.5,
      fill: ink.paint('#dfe4ee'),
    });
  // 足は缶の出口から穴まで。**穴が缶より外なら開く** — 実物も足を開いて挿す。
  const legs = [-1, 1]
    .map((at) => element('line', {
      x1: num(at * legX), y1: num(bottom), x2: num((at * span) / 2), y2: 0,
      stroke: edge, 'stroke-width': 1.6,
    }))
    .join('');

  return legs + can + collar + eyelets + gloss;
}

/**
 * 平たい缶の輪郭。**肩が丸い**のが実物の見分けどころなので、上の 2 隅だけを
 * 大きく落とす (`rect` の `rx` は 4 隅に同じ丸みしか付けられない)。
 */
function canOutline(width: number, top: number, bottom: number): string {
  const half = width / 2;
  const r = Math.min(half * 0.55, (bottom - top) * 0.5);
  return `M ${num(-half)} ${num(bottom)} L ${num(-half)} ${num(top + r)}`
    + ` Q ${num(-half)} ${num(top)} ${num(-half + r)} ${num(top)}`
    + ` L ${num(half - r)} ${num(top)} Q ${num(half)} ${num(top)} ${num(half)} ${num(top + r)}`
    + ` L ${num(half)} ${num(bottom)} Z`;
}

/** 円筒の輪郭。**上端は丸く、下端はかしめてあるので平ら**。 */
function tubeOutline(width: number, top: number, bottom: number): string {
  const half = width / 2;
  return `M ${num(-half)} ${num(bottom)} L ${num(-half)} ${num(top + half)}`
    + ` A ${num(half)} ${num(half)} 0 0 1 ${num(half)} ${num(top + half)}`
    + ` L ${num(half)} ${num(bottom)} Z`;
}

/**
 * 缶の大きさ。平たい缶は**足の間隔より広い**が、狭い間隔でも潰さない下限を持つ。
 * 円筒は足の間隔によらず実物の太さのまま (細いのが見分けどころなので広げない)。
 */
const canOf = (part: BodyPart, span: number): { readonly width: number; readonly height: number } =>
  (part.variant === 'cylinder'
    ? { width: TUBE_WIDTH, height: TUBE_HEIGHT }
    : { width: Math.min(Math.max(span + CAN_OVERHANG * 2, CAN_MIN_WIDTH), CAN_MAX_WIDTH), height: CAN_HEIGHT });

function inductorBody(span: number, ink: BodyInk): string {
  const width = Math.min(span * 0.6, 34);
  const core = element('rect', {
    x: num(-width / 2), y: num(-CORE_HALF), width: num(width), height: num(CORE_HALF * 2),
    rx: num(CORE_HALF), fill: ink.paint('#4a3a2c'), stroke: ink.paint('#2e241b'),
  });

  // 巻線は胴の端から少し内側に、等間隔で。**芯より高く**描くので、巻き付いて
  // いるように見える (端では芯が見えて、そこが線の出どころになる)。
  const inset = CORE_HALF;
  const room = Math.max(width - inset * 2, 1);
  const turns = Math.max(3, Math.round(room / (TURN_WIDTH * 1.6)));
  const step = turns === 1 ? 0 : room / (turns - 1);
  const coils = Array.from({ length: turns }, (_, index) => {
    const cx = -width / 2 + inset + index * step;
    return element('rect', {
      x: num(cx - TURN_WIDTH / 2), y: num(-TURN_HALF), width: num(TURN_WIDTH), height: num(TURN_HALF * 2),
      rx: num(TURN_WIDTH / 2), fill: ink.paint('#c68b46'), stroke: ink.paint('#8a5c2a'), 'stroke-width': 0.7,
    });
  }).join('');

  return core + coils;
}

/** 圧電・電磁ブザー。上から見た丸い缶と、音の出る穴。 */
function buzzerBody(part: BodyPart, span: number, ink: BodyInk): string {
  const radius = Math.min(span * 0.5, 15);
  const shell = element('circle', {
    cx: 0, cy: 0, r: num(radius), fill: ink.paint('#23272e'), stroke: ink.paint('#12151a'),
  });
  const vent = element('circle', { cx: 0, cy: 0, r: 3, fill: ink.paint('#8a929c') });
  const plus = part.pins.findIndex((pin) => pin.name === '+');
  const mark = plus === -1
    ? ''
    : svgText(plus === 0 ? -radius * 0.55 : radius * 0.55, 4, '+', {
      'font-size': 11, 'font-weight': 700, fill: ink.paint('#dfe4ee'),
    });
  return shell + vent + mark;
}

/**
 * 種類 → 胴の描き方。**同じ形で色や帯だけが違うものは同じ関数を共有する**
 * (ダイオードの仲間・円板の仲間)。実物が見分けにくい部品を図の上だけで
 * 派手に描き分けると、それは実物の情報ではなくなる。
 */
const BODIES: Record<string, (part: BodyPart, span: number, ink: BodyInk) => string> = {
  resistor: resistorBody,
  capacitor: capacitorBody,
  crystal: crystalBody,
  inductor: (_part, span, ink) => inductorBody(span, ink),
  buzzer: buzzerBody,
  led: (part, _span, ink) => domeBody(part, ledLook(part).color, ink, '#7a2018', ledLook(part).name),
  // フォトダイオードは砲弾型で売られている。受光面が見えるように淡く塗り、
  // 縁は LED の赤茶ではなく灰にする (赤い縁だと図の中で LED に見える)。
  photodiode: (part, _span, ink) => domeBody(part, '#9fc7e8', ink, '#5a6472'),

  diode: (part, span, ink) =>
    diodeBody(part, span, { fill: '#23272e', stroke: '#12151a', band: '#dfe4ee' }, ink),
  // ツェナーは小信号用がガラス封止で、中の黒い帯が透けて見える。
  zener: (part, span, ink) =>
    diodeBody(part, span, { fill: '#c99a4a', stroke: '#8a6425', band: '#23272e' }, ink),
  schottky: (part, span, ink) =>
    diodeBody(part, span, { fill: '#23272e', stroke: '#12151a', band: '#9aa3ad' }, ink),
  varicap: (part, span, ink) =>
    diodeBody(part, span, { fill: '#23272e', stroke: '#12151a', band: '#dfe4ee', narrow: true }, ink),
  // ダイアックは対称なので帯が無い。向きの無い部品だと形で分かる。
  diac: (part, span, ink) =>
    diodeBody(part, span, { fill: '#23272e', stroke: '#12151a', band: null }, ink),

  photoresistor: (_part, span, ink) => photoresistorBody(span, ink),
  thermistor: (_part, span, ink) => discBody(span, '#23272e', '#12151a', ink),
  'thermistor-ntc': (_part, span, ink) => discBody(span, '#23272e', '#12151a', ink, 'N'),
  'thermistor-ptc': (_part, span, ink) => discBody(span, '#23272e', '#12151a', ink, 'P'),
  // バリスタは同じ円板でも一回り大きく、青い樹脂で塗られている。
  varistor: (_part, span, ink) => discBody(span, '#2f5fa8', '#1d3d6e', ink, '', 1.25),

  reed: (_part, span, ink) => reedBody(span, ink),
  fuse: (_part, span, ink) => fuseBody(span, ink),
  lamp: (_part, span, ink) => lampBody(span, ink),
};

/** その種類の胴を描けるか。無ければ呼ぶ側が自前の姿を出す。 */
export const hasBody = (type: string): boolean => Object.hasOwn(BODIES, type);

/**
 * 胴を描く。`span` は**足から足までの長さ**で、胴の大きさはそこから決まる
 * (`bodySize` と同じ数式)。知らない種類は砲弾型で描く。
 */
export function drawBody(part: BodyPart, span: number, ink: BodyInk = REAL_INK): string {
  const body = Object.hasOwn(BODIES, part.type) ? BODIES[part.type] : undefined;
  return body ? body(part, span, ink) : domeBody(part, DEFAULT_LED_COLOR, ink);
}

/**
 * 胴の大きさ。**当たり判定と描画で同じ数字を使う**ための 1 か所
 * (perfboard は重なりの判定にこれを読む)。
 *
 * 丸い胴は直径、角い胴は外形。足の線はここに入らない (胴の外)。
 */
export function bodySize(part: BodyPart, span: number): { readonly width: number; readonly height: number } {
  const twice = (radius: number): { readonly width: number; readonly height: number } =>
    ({ width: radius * 2, height: radius * 2 });

  switch (part.type) {
    case 'resistor':
      return { width: Math.min(span * 0.6, 38), height: 13 };
    case 'capacitor': {
      const look = capacitorLook(part);
      if (look === 'ceramic') return twice(Math.min(span * 0.45, 9.5));
      if (look === 'tantalum') return { width: Math.min(span * 0.55, 30), height: 17 };
      if (look === 'electrolytic') return { width: Math.min(span * 0.6, 34), height: 19 };
      return { width: Math.min(span * 0.55, 30), height: 16 };
    }
    case 'led':
    case 'photodiode':
      return twice(LED_RADIUS * domeScale(part));
    case 'diode':
    case 'zener':
    case 'schottky':
    case 'diac':
      return { width: Math.min(span * 0.55, 30), height: 13 };
    case 'varicap':
      return { width: Math.min(span * 0.4, 22), height: 13 };
    case 'photoresistor':
    case 'thermistor':
    case 'thermistor-ntc':
    case 'thermistor-ptc':
      return twice(Math.min(span * 0.45, 9.5));
    case 'varistor':
      return twice(Math.min(span * 0.45, 9.5) * 1.25);
    case 'reed':
      return { width: Math.min(span * 0.6, 34), height: 11 };
    case 'fuse':
      return { width: Math.min(span * 0.6, 34), height: 13 };
    case 'lamp':
      return twice(Math.min(span * 0.42, 10));
    // 缶は足の上に立つので、当たり判定は缶と足を合わせた高さで見る。
    case 'crystal': {
      const can = canOf(part, span);
      return { width: can.width, height: can.height + CAN_LIFT };
    }
    // 巻線が芯より高いので、高さは巻線のぶん。
    case 'inductor':
      return { width: Math.min(span * 0.6, 34), height: TURN_HALF * 2 };
    case 'buzzer':
      return twice(Math.min(span * 0.5, 15));
    default:
      return twice(LED_RADIUS * domeScale(part));
  }
}
