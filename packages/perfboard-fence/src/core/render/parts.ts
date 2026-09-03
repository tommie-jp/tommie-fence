import { REAL_INK, drawBody, element, fit, hasBody, num, svgText } from 'fence-kit';
import type { BodyInk, BodyPart } from 'fence-kit';
import { LIMITS, clampText } from '../limits.ts';
import type { Layout } from '../model/layout.ts';
import {
  BODY_HEIGHT, SMA_BASE, SMA_PLAIN, SMA_SIZE, bodyRect, edgeMountOf,
} from '../placement/geometry.ts';
import { hatchFill } from './hatch.ts';
import { isEdgeMount } from '../parts/types.ts';
import { footprintOf } from '../parts/footprint.ts';
import type { PlacedPart } from '../types.ts';
import { jointMark } from './joints.ts';
import type { Theme } from './theme.ts';

const LEAD_WIDTH = 2;
/** 胴の下端からキャプションまで。**胴の大きさで変わる部品**があるので、下端から測る。 */
const CAPTION_GAP = 8;
/** 図に出す名前と値。値が無ければ名前だけ。 */
const caption = (part: PlacedPart): string =>
  part.value === null ? part.id : `${part.id} ${clampText(part.value, LIMITS.labelLength)}`;

/**
 * 板からはみ出す字を切る。使える幅は**中央から近いほうの板の端まで**の 2 倍。
 *
 * `limits.ts` が切っているのは**文字数** (60) で、幅ではない。切らずに置くと
 * viewBox の外へ出て**黙って消える**ので、読む側は切れたことにも気づけない
 * (breadboard が同じ穴を踏んでいる)。切った跡を `…` で残すのはそちらと同じ約束。
 *
 * 画布ではなく板を境にするのは、字が画布の縁に貼り付くと読みにくいため。
 */
function fitToBoard(text: string, x: number, fontSize: number, layout: Layout): string {
  const { board } = layout;
  const room = Math.min(x - board.x, board.x + board.width - x) * 2;
  return fit(text, Math.max(0, room) / fontSize);
}

/** 縦に置いた部品のキャプションが、板の上下に収まる幅。 */
function fitDown(text: string, y: number, fontSize: number, layout: Layout): string {
  const { board } = layout;
  const room = Math.min(y - board.y, board.y + board.height - y) * 2;
  return fit(text, Math.max(0, room) / fontSize);
}

/**
 * 部品のキャプション。**縦に置いた部品では字も縦にする** (時計回りに 90 度)。
 *
 * 横のままだと、細長い部品の脇に長い字が伸びて隣の部品や配線に被る。
 * 字を部品と同じ向きに寝かせれば、どの部品の名前かが位置で分かる。
 * **図ごと回さない** — 回すのは字の並びだけで、読む向きは左から右のまま。
 */
function partLabel(
  text: string,
  rect: { readonly cx: number; readonly cy: number; readonly height: number; readonly angle: number },
  pins: { readonly x: number; readonly y: number },
  theme: Theme,
  layout: Layout,
): string {
  const size = theme.metrics.textSize;
  const style = {
    fill: theme.palette.plateText,
    'font-size': num(size),
    halo: theme.palette.plate,
  };
  // **横に寝ている胴はそのまま下に書く。** 図の大半はこれなので、傾きの計算に
  // 巻き込まないでおく (`sin` の丸めで字が 0.01 度ずれるようなことも起きない)。
  const tilt = turned(rect.angle);
  if (Math.abs(tilt) < UPRIGHT) {
    return svgText(pins.x, rect.cy + rect.height / 2 + CAPTION_GAP, fitToBoard(text, pins.x, size, layout), style);
  }

  // **傾いた胴には字も同じだけ傾ける。** 斜めに置いた部品の名前だけ水平だと、
  // どの部品の名前なのかが胴と離れて読めなくなる (胴の上に重なることもある)。
  // 置くのは胴の脇 — 字の下側にあたる向きへ、胴の厚みのぶんだけ寄せる。
  const away = beside(tilt);
  // 回した字は真ん中で置くので、**字の厚みの半分だけ余分に**逃がす
  // (横向きの字は下端で置くため、その半分が要らない)。
  const gap = rect.height / 2 + CAPTION_GAP + size / 2;
  const at = { x: pins.x + away.x * gap, y: pins.y + away.y * gap };
  const room = Math.abs(Math.sin(tilt)) > Math.abs(Math.cos(tilt))
    ? fitDown(text, at.y, size, layout)
    : fitToBoard(text, at.x, size, layout);

  return element(
    'g',
    { transform: `translate(${num(at.x)} ${num(at.y)}) rotate(${num(degrees(tilt))})` },
    svgText(0, 0, room, { ...style, 'dominant-baseline': 'middle' }),
  );
}

/** これより寝ていれば横向きの字として書く (1 度ぶん。丸めの揺れを拾わない)。 */
const UPRIGHT = Math.PI / 180;

/**
 * 字を回す角。**上下がひっくり返らない向きへ畳む** — 実物の部品は
 * どちら向きに挿しても同じものなので、名前が逆さまに出る理由がない。
 */
function turned(angle: number): number {
  const half = Math.PI / 2;
  const folded = Math.atan2(Math.sin(angle), Math.cos(angle));
  if (folded > half) return folded - Math.PI;
  if (folded < -half) return folded + Math.PI;
  return folded;
}

/**
 * 字を置く向き (胴からどちらへ寄せるか)。字の下側にあたる向きで、
 * **真上に立った胴だけは右脇**にする (左に寄せると板の外へ出ていきやすい)。
 */
function beside(tilt: number): { readonly x: number; readonly y: number } {
  const perpendicular = { x: -Math.sin(tilt), y: Math.cos(tilt) };
  return perpendicular.y < 1e-9 && perpendicular.x < 0
    ? { x: -perpendicular.x, y: -perpendicular.y }
    : perpendicular;
}

const degrees = (radians: number): number => (radians * 180) / Math.PI;

/** 同軸コネクタの金物と、中の絶縁体の色。**実物の色**なのでテーマから触らせない。 */
const SMA_METAL = '#b9bfc6';
const SMA_METAL_EDGE = '#7f868d';
const SMA_DIELECTRIC = '#f2f3f5';
/** アースの足。胴と同じ銀だと 1 つの塊に見えるので、少し濃くして際を出す。 */
const SMA_GROUND = '#9aa2ab';
/** 腕を板に留めた半田。**ランドの銀と同じ**なので、接点として読める。 */
const SMA_SOLDER = '#d7dce1';
/** 接点の印の半径。腕の厚みに収まる大きさ。 */
const CONTACT = 3.5;
/** 中心導体。オスはピン (金)、メスは穴 (暗い口)。 */
const SMA_PIN = '#d8b64a';
const SMA_SOCKET = '#2b2f33';
/** 胴に書く姿の名前。金物の上に載るので、明るい地に読める濃さにする。 */
const SMA_LABEL = '#2b2f33';

/**
 * SMA コネクタ。**胴は足の間隔で変わらない**金物なので、六角の胴 (6.35mm) の
 * 大きさで描く。オスは中心にピンが立ち、メスは中心が穴 — **姿で描き分ける**ので、
 * 図を見た人が合う相手を取り違えない。
 */
function smaBody(part: PlacedPart): string {
  const half = SMA_SIZE / 2;
  const shell = element('rect', {
    x: num(-half), y: num(-half), width: num(SMA_SIZE), height: num(SMA_SIZE), rx: 6,
    fill: SMA_METAL, stroke: SMA_METAL_EDGE, 'stroke-width': 1,
  });
  // 合わせ面の丸は少し上へ。**胴の下半分は姿の名前 (2 行) の場所**にする。
  const faceY = -half * 0.34;
  const barrel = element('circle', {
    cx: 0, cy: num(faceY), r: num(half * 0.46), fill: SMA_DIELECTRIC,
    stroke: SMA_METAL_EDGE, 'stroke-width': 1,
  });
  const male = part.variant === 'male';
  const centre = element('circle', {
    cx: 0, cy: num(faceY), r: num(male ? 4 : 5),
    fill: male ? SMA_PIN : SMA_SOCKET,
    ...(male ? {} : { stroke: SMA_METAL_EDGE, 'stroke-width': 1 }),
  });
  return `${shell}${barrel}${centre}`;
}

/**
 * 端面実装 (横置き) の SMA。板の縁に載せて、**首から先を板の外へ出す**形。
 * 上から見た姿なので、ねじ山は胴の横筋として出し、合わせ面は先端に来る。
 *
 * 胴の形は当たり判定と同じ矩形に収める (`placement/geometry.ts`) — はみ出して
 * 描くと、図では重なって見えるのに何も言わない、が起きる。
 */
function smaEdgeBody(
  part: PlacedPart,
  width: number,
  edgeX: number,
  legX: number,
  tips: readonly number[],
  theme: Theme,
): string {
  const half = SMA_SIZE / 2;
  const tip = -width / 2;
  // 左から**ねじ部・ねじなし・台座**。ねじ部とねじなしは同じ太さの筒で、
  // 台座だけが太い。**台座の右端が板の縁**に来る (実物もそこで板を挟む)。
  const baseFrom = edgeX - SMA_BASE;
  const plainFrom = baseFrom - SMA_PLAIN;
  const barrelHalf = half * 0.62;
  const male = part.variant === 'male-edge';

  const metal = (x: number, wide: number, tall: number, round: number): string => element('rect', {
    x: num(x), y: num(-tall / 2), width: num(wide), height: num(tall), rx: round,
    fill: SMA_METAL, stroke: SMA_METAL_EDGE, 'stroke-width': 1,
  });

  const barrel = metal(tip, plainFrom - tip, barrelHalf * 2, 2);
  const plain = metal(plainFrom, SMA_PLAIN, barrelHalf * 2, 1);
  const base = metal(baseFrom, SMA_BASE, SMA_SIZE, 3);

  // ねじ山はねじ部だけに立てる。**ねじなしと見分けが付く**ようにするため。
  const threads = [6, 12, 18, 24, 30]
    .filter((offset) => tip + offset < plainFrom - 2)
    .map((offset) => element('line', {
      x1: num(tip + offset), y1: num(-barrelHalf + 2), x2: num(tip + offset), y2: num(barrelHalf - 2),
      stroke: SMA_METAL_EDGE, 'stroke-width': 1,
    }))
    .join('');

  // 合わせ面。メスは中心が穴、オスは中心のピンがねじの先へ出る。
  const face = element('rect', {
    x: num(tip + 3), y: num(-barrelHalf * 0.55), width: 3, height: num(barrelHalf * 1.1), rx: 1,
    fill: SMA_DIELECTRIC,
  });
  const mating = male
    ? element('rect', { x: num(tip - 6), y: -2, width: 9, height: 4, rx: 1, fill: SMA_PIN })
    : element('rect', { x: num(tip + 3), y: -3, width: 3, height: 6, fill: SMA_SOCKET });

  // 板に載る側は 2 つの足。**アースが凹、信号線が凸**で、形でも見分けが付く
  // ようにする — どちらも金物なので、色だけでは区別できない。
  const armHalf = half * 0.62;
  const armThick = half * 0.34;
  const groundEnd = legX + 6;
  const web = edgeX + 4;
  // アースは口の開いた**凹**。上下の腕と、その間の谷が 1 つの部品に見える。
  const ground = element('polygon', {
    points: [
      [edgeX, -armHalf], [groundEnd, -armHalf], [groundEnd, -armHalf + armThick],
      [web, -armHalf + armThick], [web, armHalf - armThick],
      [groundEnd, armHalf - armThick], [groundEnd, armHalf], [edgeX, armHalf],
    ].map(([x = 0, y = 0]) => `${num(x)},${num(y)}`).join(' '),
    fill: SMA_GROUND, stroke: SMA_METAL_EDGE, 'stroke-width': 1,
  });
  // **アースの足は凹の両端の先端** (`parts/footprint.ts`)。そこが半田付けする
  // ところなので、**足の番地の上に**足の印を出し、**その上に半田の玉を乗せる** —
  // 足が半田の下に来るのが実物の重なり (ほかの部品の足も同じ)。配線が届く先と
  // 印が別の場所にあると、どちらへ付けるのか読めない。腕の形はそのまま
  // (先端が上下の行の銅箔に触れる)。
  const contacts = tips
    .map((tip) => element('circle', {
      cx: num(legX), cy: num(tip), r: num(CONTACT),
      fill: SMA_SOLDER, stroke: SMA_METAL_EDGE, 'stroke-width': 1,
    }) + jointMark(legX, tip, theme))
    .join('');

  // 信号線は**凹の谷から出る凸**。アースより先の穴まで届く。
  const centre = element('rect', {
    x: num(edgeX), y: -2.5, width: num(width / 2 - edgeX), height: 5, rx: 1, fill: SMA_PIN,
  });

  return `${barrel}${threads}${plain}${base}${face}${mating}${centre}${ground}${contacts}`;
}

/**
 * コネクタの胴に書く姿の名前。**オスとメスは形の細部でしか違わない**ので、
 * 字でも言う — 図を見て買う人・挿す人が、合う相手を取り違えないように。
 *
 * **胴と一緒に回さない。** 板の右の縁に載せたコネクタは胴が 180 度回るので、
 * 一緒に回すと鏡文字になる。字はいつも水平に置く。
 */
function smaBadge(part: PlacedPart, at: { x: number; y: number }, edge: boolean, theme: Theme): string {
  if (part.type !== 'sma' || part.variant === null) return '';

  const male = part.variant.startsWith('male');
  const size = theme.metrics.textSize;
  // **2 行に分ける。** 1 行だと横置きでは足や配線に被り、縦置きでは胴に入らず
  // `SMA fem…` と切れる。胴に収まる幅は「SMA」も「female」も 6 字ぶんで足りる。
  const room = (edge ? SMA_SIZE - 4 : SMA_SIZE - 6) / size;
  const first = at.y + (edge ? -size * 0.2 : SMA_SIZE * 0.16);
  const step = size * 1.15;

  return ['SMA', male ? 'male' : 'female']
    .map((line, index) => svgText(at.x, first + step * index, fit(line, room), {
      fill: SMA_LABEL,
      'font-size': num(size),
      halo: SMA_METAL,
    }))
    .join('');
}

const genericBody = (width: number, theme: Theme): string =>
  element('rect', {
    x: num(-width / 2), y: num(-BODY_HEIGHT / 2), width: num(width), height: BODY_HEIGHT,
    rx: 3, fill: theme.palette.body, stroke: theme.palette.bodyEdge, 'stroke-width': 1,
  });

/**
 * 白黒で刷る図の塗り。**名前のある色は網に移し、生の色は地の色に落とす** —
 * 実物の色をそのまま残すと、白黒の図に色だけが残って「色で意味を持たせない」が
 * 破れる (`hatch.ts` が解いた問題)。色のある図はそのまま通す。
 */
const inkOf = (theme: Theme): BodyInk => (theme.hatch === true
  ? {
    paint: (color, name) => (name === undefined
      ? monoBodyColor(color, theme)
      : hatchFill(name, theme.palette.caption)),
  }
  : REAL_INK);

/**
 * 白黒のときの、名前を持たない色の落とし先。**塗りか縁かを明るさで見分ける** —
 * 濃い色は縁として引かれているので、地に落とすと形が消える。
 */
const monoBodyColor = (color: string, theme: Theme): string =>
  (isDark(color) ? theme.palette.bodyEdge : theme.palette.body);

/** その色は暗いか (16 進の 3 成分の平均で見る)。名前や `none` は暗くない扱い。 */
function isDark(color: string): boolean {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
  if (hex === undefined) return false;
  const value = Number.parseInt(hex, 16);
  const mean = (((value >> 16) & 255) + ((value >> 8) & 255) + (value & 255)) / 3;
  return mean < 128;
}

/**
 * 胴の姿。**共有の形があればそれを使う** (`fence-kit/parts/bodies.ts`) —
 * 実物の部品の話で板に依らないので、breadboard と同じ絵になる (52 の docs/18)。
 * ここに残るのはこの板だけの姿 — 同軸コネクタと、姿を持たない種類の箱。
 */
const bodyOf = (
  part: PlacedPart,
  width: number,
  theme: Theme,
  mount: { readonly edgeX: number; readonly legX: number; readonly tips: readonly number[] } | null,
): string => {
  if (part.type === 'sma') {
    return mount === null
      ? smaBody(part)
      : smaEdgeBody(part, width, mount.edgeX, mount.legX, mount.tips, theme);
  }
  if (hasBody(part.type)) return drawBody(asBody(part), spanFor(part.type, width), inkOf(theme));
  return genericBody(width, theme);
};

/**
 * 共有の形が読む姿。**この文法に極性の印は無い**ので、足の名前は空で渡す —
 * 共有の側は「印が無ければ先に書いた穴が + 側」の規則で描く
 * (breadboard で印を書かなかったときと同じ絵)。
 */
const asBody = (part: PlacedPart): BodyPart => ({
  type: part.type,
  value: part.value,
  variant: part.variant,
  pins: part.pins.map(() => ({ name: '' })),
});

/**
 * 共有の形に渡す「足から足までの長さ」。**胴の幅から逆に引く** —
 * こちらは当たり判定と同じ胴の幅 (`bodyRect`) を持っていて、共有の形は
 * 足の間隔から胴を決めるので、同じ胴になる長さを渡す。
 */
const spanFor = (type: string, width: number): number => {
  const ratio = SPAN_RATIO[type] ?? 0.6;
  return width / ratio;
};

/**
 * 種類ごとの「胴の幅 ÷ 足の間隔」。**共有の形の数式と同じ値**
 * (`fence-kit/parts/bodies.ts` の `bodySize`)。
 */
const SPAN_RATIO: Record<string, number> = {
  resistor: 0.6, capacitor: 0.55, crystal: 0.6, inductor: 0.6, buzzer: 0.5,
  diode: 0.55, zener: 0.55, schottky: 0.55, diac: 0.55, varicap: 0.4,
  photoresistor: 0.45, thermistor: 0.45, 'thermistor-ntc': 0.45, 'thermistor-ptc': 0.45,
  varistor: 0.45, reed: 0.6, fuse: 0.6, lamp: 0.42,
};

/**
 * 2 本足の部品。**胴は 2 つの穴を結ぶ線の上に、その傾きのまま描く**ので、
 * 各部品の形は「原点が中央・x 軸が足の向き」の座標で書けばよい。
 */
function renderTwoLead(part: PlacedPart, layout: Layout, theme: Theme): string {
  const [first, second] = part.pins;
  const rect = bodyRect(part, layout);
  if (!first || !second || !rect) return '';

  const from = layout.point(first.address);
  const to = layout.point(second.address);
  // **胴の形は当たり判定と同じものを使う** (placement/geometry.ts)。
  // 別々に持つと、図では重なって見えるのに何も言わない、が起きる。
  const center = { x: rect.cx, y: rect.cy };
  const angle = (rect.angle * 180) / Math.PI;
  const width = rect.width;

  // 3 引数 rotate() を読まないレンダラがあるので translate と rotate に分ける。
  // 端面実装は胴が板の縁から外へ張り出すので、**板の縁と足がどこに来るか**を
  // 局所座標で渡す (胴の中心と足の中点がずれるのはこの姿だけ)。
  const mount = isEdgeMount(part.type, part.variant) ? edgeMountOf(part, layout) : null;
  // **端面実装に足の線は引かない。** 足を結ぶ線は「胴の両端から出たリード」の絵で、
  // 金物のコネクタでは中心導体と凹の先端を結ぶ線に見える (先端は中心線の上下に
  // あるので、斜めに渡って余計にそう読める)。
  const lead = mount !== null ? '' : element('line', {
    x1: num(from.x), y1: num(from.y), x2: num(to.x), y2: num(to.y),
    stroke: theme.palette.lead, 'stroke-width': LEAD_WIDTH,
  });
  const body = element(
    'g',
    { transform: `translate(${num(center.x)} ${num(center.y)}) rotate(${num(angle)})` },
    bodyOf(part, width, theme, mount),
  );
  // **キャプションは足の真ん中の下**。胴の中心に置くと、板の外へ張り出す部品
  // (端面実装の SMA) で字が板から出て、地に紛れるか幅ゼロで `…` に切られる。
  // 縦は胴の下端から測る — 中心から一定の距離だと、胴の大きい部品で字が胴に載る。
  // 端面実装は 2 本目の足が中心線の上下にあるので、**中心導体の行**で測る。
  const pinMiddle = mount === null
    ? { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
    : { x: (from.x + to.x) / 2, y: from.y };
  const label = partLabel(caption(part), rect, pinMiddle, theme, layout);

  // 姿の名前は**胴のブロックの真ん中**に置く。全体の中心だとねじ部まで含むので
  // 板の外へ寄りすぎ、足の側だと配線に被る。
  const edge = mount !== null;
  // 姿の名前は**板の外に出ている胴の真ん中**に置く。台座は 1mm しかないので
  // そこに寄せると板に掛かり、足の側に寄せると配線に被る。
  const blockX = mount === null ? 0 : (-width / 2 + mount.edgeX) / 2;
  const badgeAt = {
    x: rect.cx + blockX * Math.cos(rect.angle),
    y: rect.cy + blockX * Math.sin(rect.angle),
  };

  return `${lead}${body}${smaBadge(part, badgeAt, edge, theme)}${label}`;
}

/** ノッチの半径 (DIP の 1 番ピン側の切り欠き)。 */
const NOTCH = 4;

/**
 * 箱で描く部品か。**足の数ではなく形で決める** — `sip2` は足が 2 本でも
 * パッケージなので、軸物のように傾けて描いてはいけない。
 */
const isBoxed = (part: PlacedPart): boolean => {
  const kind = footprintOf(part.type)?.kind;
  return kind === 'dip' || kind === 'sip' || kind === 'three-lead';
};

/**
 * 足が 3 本以上ある部品。**足を囲む箱**として描き、足は穴まで短い線で出す。
 *
 * DIP は 1 番ピン側にノッチを描く。実物と同じ向きの目印が無いと、
 * **図を見ながら挿すときに 180 度回して挿せてしまう**。
 */
function renderBox(part: PlacedPart, layout: Layout, theme: Theme): string {
  const rect = bodyRect(part, layout);
  const first = part.pins[0];
  if (!rect || !first) return '';

  const leads = part.pins
    .map((pin) => {
      const point = layout.point(pin.address);
      return element('circle', {
        cx: num(point.x), cy: num(point.y), r: num(LEAD_WIDTH),
        fill: theme.palette.lead,
      });
    })
    .join('');

  const body = element('rect', {
    x: num(rect.cx - rect.width / 2), y: num(rect.cy - rect.height / 2),
    width: num(rect.width), height: num(rect.height), rx: 3,
    fill: theme.palette.body, stroke: theme.palette.bodyEdge, 'stroke-width': 1,
    'fill-opacity': theme.metrics.bodyOpacity,
  });

  // 箱は縦横のどちらにも伸びる (回すと入れ替わる)。**短いほうの辺が
  // パッケージの端**で、ノッチもキャプションの向きもそこから決まる。
  const tall = rect.height > rect.width;

  // ノッチは**パッケージの端の辺**の真ん中。DIP でだけ描く
  // (SIP と 3 本足には無い)。
  //
  // **端は 1 番ピンと最終ピンの間。** 実物の切り欠きは 2 列の始まりと終わりが
  // 並ぶ短い辺にあり、その中点を箱の縁へ寄せたところが印の位置になる。
  // 箱の左端に決め打つと、板を裏返した図 (`style: back`) や回した DIP で
  // 反対の端へ出て、**図のとおりに挿した IC が 180 度回る** —
  // この印はそれを防ぐためにある。
  //
  // **どちらの軸かも中点が決める。** dip8 の箱は正方形 (4 穴 × 4 行) なので、
  // 縦長か横長かでは決められない。
  const footprint = footprintOf(part.type);
  const lastPin = part.pins[part.pins.length - 1];
  const ends = [first, lastPin ?? first].map((pin) => layout.point(pin.address));
  const mid = { x: (ends[0]!.x + ends[1]!.x) / 2, y: (ends[0]!.y + ends[1]!.y) / 2 };
  const alongX = Math.abs(mid.x - rect.cx) >= Math.abs(mid.y - rect.cy);
  const nearOn = (center: number, size: number, at: number): number =>
    (at < center ? center - size / 2 + NOTCH : center + size / 2 - NOTCH);
  const notch = footprint?.kind !== 'dip' ? '' : element('circle', {
    cx: num(alongX ? nearOn(rect.cx, rect.width, mid.x) : rect.cx),
    cy: num(alongX ? rect.cy : nearOn(rect.cy, rect.height, mid.y)),
    r: NOTCH, fill: theme.palette.plate, stroke: theme.palette.bodyEdge, 'stroke-width': 1,
  });

  const label = partLabel(
    caption(part),
    { cx: rect.cx, cy: rect.cy, height: tall ? rect.width : rect.height, angle: tall ? Math.PI / 2 : 0 },
    { x: rect.cx, y: rect.cy },
    theme,
    layout,
  );

  return `${body}${notch}${leads}${label}`;
}

/**
 * 板に載せた部品を全部。`edit` のときは**掴むための印**で 1 つずつ包む
 * (図そのものをマップにするため。52 の docs/13)。既定では包まない —
 * 貼る図は 1 バイトも変わらない。
 */
export const renderParts = (
  parts: readonly PlacedPart[],
  layout: Layout,
  theme: Theme,
  edit = false,
): string =>
  parts
    .map((part) => {
      const drawn = isBoxed(part) ? renderBox(part, layout, theme) : renderTwoLead(part, layout, theme);
      return edit ? element('g', { class: 'cf-chip', 'data-part': part.id }, drawn) : drawn;
    })
    .join('');
