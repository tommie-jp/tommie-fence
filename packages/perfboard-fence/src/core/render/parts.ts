import {
  REAL_INK, drawBody, drawPackage, drawsOwnLeads, element, fit, hasBody, lookupBoardPart, num,
  packageHalfWidth, packageReach, smaBody as drawSmaBody, svgText,
} from 'fence-kit';
import type { BodyInk, BodyPart } from 'fence-kit';
import { LIMITS, clampText } from '../limits.ts';
import type { Layout } from '../model/layout.ts';
import {
  BODY_HEIGHT, SMA_BASE, SMA_PLAIN, SMA_SIZE, bodyRect, edgeMountOf,
} from '../placement/geometry.ts';
import type { OrientedRect } from '../placement/geometry.ts';
import { hatchFill } from './hatch.ts';
import { isEdgeMount } from '../parts/types.ts';
import { footprintOf } from '../parts/footprint.ts';
import type { PlacedPart, Point } from '../types.ts';
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

/** 中心導体が胴から出ている長さ (穴 1 つぶん)。**書かれた穴までは伸ばさない**。 */
const SMA_PIN_REACH = 20;

/** アースの腕より先へ出す分。凹 (アース) と凸 (信号) の見分けはこの差。 */
const SMA_PIN_LEAD = 8;
const SMA_SOCKET = '#2b2f33';
/** 胴に書く姿の名前。金物の上に載るので、明るい地に読める濃さにする。 */
const SMA_LABEL = '#2b2f33';

/**
 * SMA コネクタ (上向き)。**姿は fence-kit と共通** — breadboard にも同じ
 * コネクタを置けるようにするために引き上げた。板の縁に載せる横置き
 * (`smaEdgeBody`) だけはこちらに残る — 縁の無い板には置き場が無い。
 */
const smaBody = (part: PlacedPart): string => drawSmaBody({ type: 'sma', variant: part.variant, pins: [] }, 0);

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

  // 信号線は**凹の谷から出る凸**。アースの腕より先へ出ることが形の見分けだが、
  // **書かれた穴までは伸ばさない** — 穴が板の奥にあるとき、そこまで伸ばした絵は
  // 「長い棒の付いた部品」になって実物と違う (実機で指摘された)。
  const centre = element('rect', {
    x: num(edgeX), y: -2.5,
    width: num(Math.max(SMA_PIN_REACH, groundEnd + SMA_PIN_LEAD - edgeX)), height: 5, rx: 1,
    fill: SMA_PIN,
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
  span: number,
  theme: Theme,
  mount: { readonly edgeX: number; readonly legX: number; readonly tips: readonly number[] } | null,
): string => {
  if (part.type === 'sma') {
    return mount === null
      ? smaBody(part)
      : smaEdgeBody(part, width, mount.edgeX, mount.legX, mount.tips, theme);
  }
  if (hasBody(part.type)) return drawBody(asBody(part), span, inkOf(theme));
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
 *
 * **胴が足を覆う種類 (水晶) は逆に引けない**ので、本当の間隔をそのまま渡す。
 * あちらの当たり判定も同じ間隔から出している (`bodyRect`)。
 */
const spanOf = (part: PlacedPart, from: Point, to: Point, width: number): number =>
  (part.type === 'crystal'
    ? Math.hypot(to.x - from.x, to.y - from.y)
    : width / (SPAN_RATIO[part.type] ?? 0.6));

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
  // **端面実装と、自分で足を描く胴 (水晶) には足の線を引かない。** 足を結ぶ線は
  // 「胴の両端から出たリード」の絵で、金物のコネクタでは中心導体と凹の先端を結ぶ線に
  // 見える (先端は中心線の上下にあるので、斜めに渡って余計にそう読める)。
  // 水晶の足は缶の下から出るので、穴を渡る線は実物に無い。
  const lead = mount !== null || drawsOwnLeads(part.type) ? '' : element('line', {
    x1: num(from.x), y1: num(from.y), x2: num(to.x), y2: num(to.y),
    stroke: theme.palette.lead, 'stroke-width': LEAD_WIDTH,
  });
  const body = element(
    'g',
    { transform: `translate(${num(center.x)} ${num(center.y)}) rotate(${num(angle)})` },
    bodyOf(part, width, spanOf(part, from, to, width), theme, mount),
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
/**
 * マイコンボードの基板の色。**下の板とも IC の樹脂とも違う色**にする —
 * 板と同じ緑にすると、上にもう 1 枚基板が載っていることが図から読めない。
 * **透かさない** (`fill-opacity` を掛けない) — 実物の基板は不透明で、
 * 下の穴は見えないし、そこへ配線もできない。
 */
const BOARD_FILL = '#123a52';
const BOARD_EDGE = '#0b2637';

const isBoxed = (part: PlacedPart): boolean => {
  const kind = footprintOf(part.type)?.kind;
  // マイコンボードも箱。**列の間隔が広い DIP** として同じ道を通る。
  return kind === 'dip' || kind === 'sip' || kind === 'board';
};

/**
 * 3 本足の部品。**パッケージの姿は fence-kit にある** (`parts/packages.ts`) —
 * 実物の話で板に依らないので、breadboard と同じ絵になる (52 の docs/18 の手順 4)。
 * ここに残るのは板の話 — 足の点、キャプション、どちら側に寄せるか。
 */
/**
 * 胴を回す角度 (度。0 / 90 / 180 / 270)。**1 番ピンから最後のピンへ向く向き**を
 * 見る — 「回す」(`R`) は足の番地を書き換えるので、その並びの向きがそのまま
 * パッケージの向きになる。
 *
 * **180 度も別の向きとして数える。** 軸の傾きだけを見ていたころは、回しても
 * TO-92 の平らな面が上を向いたままだった (実機で指摘された)。
 *
 * **画面の座標ではなく番地で数える。** 半田面 (裏返した板) は列を反転して
 * 描くので、点の差で数えると裏だけ 180 度回ってしまう。向きは書かれた番地の
 * ものであって、どちらから見るかで変わらない。
 */
function packageAngle(part: PlacedPart): number {
  const from = part.pins.at(0)?.address;
  const to = part.pins.at(-1)?.address;
  if (!from || !to) return 0;
  const step = Math.round(Math.atan2(to.row - from.row, to.col - from.col) / (Math.PI / 2));
  return ((step % 4) + 4) % 4 * 90;
}

function renderPackage(part: PlacedPart, layout: Layout, theme: Theme): string {
  const rect = bodyRect(part, layout);
  if (!rect) return '';

  const drawn = drawPackage(asBody(part), {
    cx: rect.cx,
    cy: rect.cy,
    reach: packageReach(asBody(part), layout.pitch),
    halfWidth: packageHalfWidth(asBody(part), layout.pitch),
    // **キャプションを置く側**。この板に溝は無いので、行の増える向きに揃える。
    side: 1,
    plate: theme.palette.plate,
    chipBody: theme.palette.chipBody,
  }, inkOf(theme));
  // **胴は足の並びに沿って回す。** 全穴が独立している板なので 3 本足をどの向きにも
  // 挿せる。回さないと TO-92 の平らな面が足の 1 本を向いてしまい、実物ではありえない
  // 向きになる (平らな面と足の並びは平行)。**キャプションは回さない** — 字は
  // いつも横で読めるほうがよく、向きは胴の形が示す。
  const angle = packageAngle(part);
  const shell = angle === 0
    ? drawn
    : element('g', { transform: `rotate(${num(angle)} ${num(rect.cx)} ${num(rect.cy)})` }, drawn);

  const leads = part.pins
    .map((pin) => {
      const point = layout.point(pin.address);
      return element('circle', {
        cx: num(point.x), cy: num(point.y), r: num(LEAD_WIDTH), fill: theme.palette.lead,
      });
    })
    .join('');

  const label = partLabel(
    caption(part),
    { cx: rect.cx, cy: rect.cy, height: packageReach(asBody(part), layout.pitch) * 2, angle: 0 },
    { x: rect.cx, y: rect.cy },
    theme,
    layout,
  );
  return `${shell}${leads}${label}`;
}

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

  // **マイコンボードは基板の色で描く。** IC の樹脂と同じ色にすると、
  // 板の上にもう 1 枚の基板が載っていることが図から読めない。
  const board = lookupBoardPart(part.type);
  const body = element('rect', {
    x: num(rect.cx - rect.width / 2), y: num(rect.cy - rect.height / 2),
    width: num(rect.width), height: num(rect.height), rx: 3,
    fill: board === null ? theme.palette.body : BOARD_FILL,
    stroke: board === null ? theme.palette.bodyEdge : BOARD_EDGE,
    'stroke-width': 1,
    ...(board === null ? { 'fill-opacity': theme.metrics.bodyOpacity } : {}),
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

  return `${body}${notch}${boardMarks(part, rect, layout)}${leads}${label}`;
}

/** マイコンボードの上に載っているもの。基板でなければ何も足さない。 */
const BOARD_INK = '#c9cfd8';
const BOARD_CHIP = '#0d1014';
const BOARD_CHIP_EDGE = '#3a4049';
/** USB は基板の端から少しだけ出る。実物の micro-B / Type-C の幅に寄せた。 */
const USB_OUT = 7;
const USB_LONG = 16;
const USB_THICK = 9;
/** 真ん中に載る本体チップの一辺。 */
const CHIP_SIDE = 22;
/** 足の名前の字と、穴からの逃がし。 */
const PIN_FONT = 6.5;
const PIN_GAP = 7;

/**
 * マイコンボードの上に載っているもの — 本体チップ・USB・アンテナ・足の名前。
 *
 * **breadboard と同じものを描くが、絵は別に持つ。** あちらは溝をまたぐ板の
 * 幾何 (`Layout` が別物) に依っていて、共有できるのは**どのボードに何番の
 * ピンがあるか**の表だけだった (52 の docs/21 の手順 3)。
 *
 * 足の名前は**基板の内側へ縦書き**。外へ出すと、隣の穴 (実際に配線を挿す
 * ところ) を字が覆う。
 */
function boardMarks(part: PlacedPart, rect: OrientedRect, layout: Layout): string {
  const board = lookupBoardPart(part.type);
  if (board === null) return '';

  const centre = { x: rect.cx, y: rect.cy };
  const chip = element('rect', {
    x: num(centre.x - CHIP_SIDE / 2), y: num(centre.y - CHIP_SIDE / 2),
    width: CHIP_SIDE, height: CHIP_SIDE, rx: 2,
    fill: BOARD_CHIP, stroke: BOARD_CHIP_EDGE, 'stroke-width': 1,
  });
  const chipName = svgText(centre.x, centre.y + 3, board.chip, {
    'font-size': 7, fill: BOARD_INK,
  });

  // **USB は 1 番ピンの側の端。** 回すと 1 番ピンの側も回るので、名前で引く
  // (並びは升で決まっていて、回すと名前のほうが巡る)。
  const first = part.pins[0];
  const at = first === undefined ? centre : layout.point(first.address);
  const tall = rect.height > rect.width;
  const usb = usbAt(rect, at, tall);
  const aerial = board.wireless ? antennaAt(rect, at, tall) : '';

  const names = part.pins.map((pin, index) => {
    const name = board.pins[index];
    if (name === undefined) return '';
    const point = layout.point(pin.address);
    // 内側へ向かって書く。**字の向きは列で揃える** (下から上へ読む) —
    // 片方だけ天地が逆になると読めない。
    const inward = tall
      ? (point.x < centre.x ? 1 : -1)
      : (point.y < centre.y ? 1 : -1);
    const x = tall ? point.x + inward * PIN_GAP : point.x + PIN_FONT * 0.35;
    const y = tall ? point.y + PIN_FONT * 0.35 : point.y + inward * PIN_GAP;
    const turn = tall ? '' : ' rotate(-90)';
    return element(
      'g',
      { transform: `translate(${num(x)} ${num(y)})${turn}` },
      svgText(0, 0, name, {
        'font-size': PIN_FONT, fill: BOARD_INK, anchor: inward > 0 ? 'end' : 'start',
      }),
    );
  }).join('');

  return `${usb}${aerial}${chip}${chipName}${names}`;
}

/** USB の口。1 番ピンのある端から外へ少し出す。 */
function usbAt(rect: OrientedRect, first: { readonly x: number; readonly y: number }, tall: boolean): string {
  const near = tall ? first.y < rect.cy : first.x < rect.cx;
  const box = tall
    ? {
      x: rect.cx - USB_LONG / 2,
      y: near ? rect.cy - rect.height / 2 - USB_OUT : rect.cy + rect.height / 2 - USB_THICK + USB_OUT,
      width: USB_LONG, height: USB_THICK,
    }
    : {
      x: near ? rect.cx - rect.width / 2 - USB_OUT : rect.cx + rect.width / 2 - USB_THICK + USB_OUT,
      y: rect.cy - USB_LONG / 2,
      width: USB_THICK, height: USB_LONG,
    };
  return element('rect', {
    x: num(box.x), y: num(box.y), width: num(box.width), height: num(box.height), rx: 2.5,
    fill: BOARD_INK, stroke: '#8a929c', 'stroke-width': 1,
  });
}

/** 無線つきの版のアンテナ。**USB と反対の端**に載っている。 */
function antennaAt(rect: OrientedRect, first: { readonly x: number; readonly y: number }, tall: boolean): string {
  const near = tall ? first.y < rect.cy : first.x < rect.cx;
  const [long, thick] = [26, 16];
  const box = tall
    ? {
      x: rect.cx - long / 2,
      y: near ? rect.cy + rect.height / 2 - thick - 4 : rect.cy - rect.height / 2 + 4,
      width: long, height: thick,
    }
    : {
      x: near ? rect.cx + rect.width / 2 - thick - 4 : rect.cx - rect.width / 2 + 4,
      y: rect.cy - long / 2,
      width: thick, height: long,
    };
  const outline = element('rect', {
    x: num(box.x), y: num(box.y), width: num(box.width), height: num(box.height), rx: 2,
    fill: 'none', stroke: BOARD_INK, 'stroke-width': 1.4,
  });
  const traces = [-7, 0, 7].map((offset) => (tall
    ? element('line', {
      x1: num(box.x + 3), y1: num(rect.cy + offset), x2: num(box.x + box.width - 3), y2: num(rect.cy + offset),
      stroke: BOARD_INK, 'stroke-width': 1.4,
    })
    : element('line', {
      x1: num(rect.cx + offset), y1: num(box.y + 3), x2: num(rect.cx + offset), y2: num(box.y + box.height - 3),
      stroke: BOARD_INK, 'stroke-width': 1.4,
    }))).join('');
  return outline + traces;
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
      const kind = footprintOf(part.type, part.variant)?.kind;
      const drawn = isBoxed(part)
        ? renderBox(part, layout, theme)
        : kind === 'three-lead' ? renderPackage(part, layout, theme) : renderTwoLead(part, layout, theme);
      return edit ? element('g', { class: 'cf-chip', 'data-part': part.id }, drawn) : drawn;
    })
    .join('');
