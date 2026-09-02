import {
  DEFAULT_LED_COLOR, bandColor, capacitorCode, element, fit, inductorCode, ledColor, num,
  parseMicrohenries, parsePicofarads, parseResistor, resistorBands, svgText,
} from 'fence-kit';
import { LIMITS, clampText } from '../limits.ts';
import type { Layout } from '../model/layout.ts';
import {
  BODY_HEIGHT, DOME_SIZE, SMA_BASE, SMA_PLAIN, SMA_SIZE, bodyRect, edgeMountOf,
} from '../placement/geometry.ts';
import { hatchFill } from './hatch.ts';
import { isEdgeMount } from '../parts/types.ts';
import { footprintOf } from '../parts/footprint.ts';
import type { PlacedPart } from '../types.ts';
import type { Theme } from './theme.ts';

const LEAD_WIDTH = 2;
/** 胴の下端からキャプションまで。**胴の大きさで変わる部品**があるので、下端から測る。 */
const CAPTION_GAP = 8;
/**
 * カラーコードの帯の幅と、胴の端から空ける幅。**実物の帯は太い** — 細いと
 * 色が読み取りにくく、印刷や縮小で消える。
 */
const BAND_WIDTH = 6;
/** 帯どうしの隙間。**狭いほど実物に近い** — 実物の帯はほとんど隣り合っている。 */
const BAND_GAP = 2;
/** 胴の両端に残す地の色。ここが無いと、帯が胴の縁で切れているように見える。 */
const BAND_END = 5;

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

/**
 * 抵抗の胴。値が抵抗として読めるときだけカラーコードを塗る。
 * **読めない値で帯を描かない** — 実物と違う帯は、図を信じた人を間違えさせる。
 */
function resistorBody(part: PlacedPart, width: number, theme: Theme): string {
  const shell = element('rect', {
    x: num(-width / 2), y: num(-BODY_HEIGHT / 2), width: num(width), height: BODY_HEIGHT,
    rx: 4, fill: theme.palette.body, stroke: theme.palette.bodyEdge, 'stroke-width': 1,
  });

  // 値のうしろに許容差と温度係数を書ける (`10k 1% 50ppm`)。帯の本数はそれで決まる —
  // 2 桁なら 4 帯、3 桁要るなら 5 帯、温度係数を書いたら 6 帯。
  const read = part.value === null ? null : parseResistor(part.value);
  const bands = read === null
    ? null
    : resistorBands(read.ohms, { tolerance: read.tolerance, tempco: read.tempco });
  if (bands === null) return shell;

  // **帯はひとかたまりで胴の真ん中に置く。** 実物の帯は隣り合っていて、
  // 胴の両端には地の色が残る — 端まで広げると、帯が縁で切れて見える。
  // 入りきらない短い胴では、隙間ではなく**帯のほうを細くする**
  // (隙間を詰めると 2 色が 1 本に見え、読み違いになる)。
  const room = Math.max(width - BAND_END * 2, 1);
  const gaps = BAND_GAP * (bands.length - 1);
  const bandWidth = Math.max(Math.min(BAND_WIDTH, (room - gaps) / bands.length), 1);
  const step = bandWidth + BAND_GAP;
  const start = -(bandWidth * bands.length + gaps) / 2;
  // **白黒の図では帯も網に移す** (`hatch.ts`)。色を落とすと帯が読めなくなるが、
  // 網なら凡例から引ける — 部品表の色欄 (`茶黒橙茶`) と合わせて、刷った図でも
  // 手元の抵抗と読み合わせられる。
  const stripes = bands
    .map((name, index) => element('rect', {
      x: num(start + index * step), y: num(-BODY_HEIGHT / 2 + 1),
      width: num(bandWidth), height: BODY_HEIGHT - 2,
      fill: theme.hatch === true ? hatchFill(name, theme.palette.caption) : bandColor(name),
    }))
    .join('');
  return shell + stripes;
}

/**
 * LED の玉。色は書かれた値から引き、知らない色でも既定で描く (足の位置は変わらない)。
 * 大きさは当たり判定と同じ定数から取る (`placement/geometry.ts`)。
 *
 * **白黒の図では色を網に移す** (`hatch.ts`)。実物の色なのでテーマでは動かない
 * ものだが、白黒に色が 1 つだけ残ると「色で意味を持たせない」が破れる。
 */
function ledBody(part: PlacedPart, theme: Theme): string {
  const written = part.value === null ? null : part.value.toLowerCase();
  const fill = theme.hatch === true && written !== null
    ? hatchFill(written, theme.palette.caption)
    : (written === null ? null : ledColor(written)) ?? DEFAULT_LED_COLOR;
  return element('circle', {
    cx: 0, cy: 0, r: num(DOME_SIZE / 2), fill, stroke: '#00000033', 'stroke-width': 1,
  });
}

/** 同軸コネクタの金物と、中の絶縁体の色。**実物の色**なのでテーマから触らせない。 */
const SMA_METAL = '#b9bfc6';
const SMA_METAL_EDGE = '#7f868d';
const SMA_DIELECTRIC = '#f2f3f5';
/** アースの足。胴と同じ銀だと 1 つの塊に見えるので、少し濃くして際を出す。 */
const SMA_GROUND = '#9aa2ab';
/** 腕を板に留めた半田。**ランドの銀と同じ**なので、接点として読める。 */
const SMA_SOLDER = '#d7dce1';
/** 接点の印の半径。**中心導体 (厚み 5) の脇に出る**大きさにする。 */
const CONTACT = 5;
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
function smaEdgeBody(part: PlacedPart, width: number, edgeX: number, legX: number): string {
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
  // **アースの足は凹の口の中に来る。** そこが半田付けするところなので、白い接点の
  // 印を出す — アースは穴に挿さらないので埋まった穴が出ず (`index.ts` の `onArms`)、
  // 印が無いと凹のどこを付けるのかが図から読めない。
  //
  // **印は 1 つ、足の番地の上に置く。** 腕の上下に 2 つ出していたころは、
  // 配線が届く先 (足の番地) とは別の場所に印があり、どちらへ付けるのか読めなかった。
  const contacts = element('circle', {
    cx: num(legX), cy: 0, r: num(CONTACT),
    fill: SMA_SOLDER, stroke: SMA_METAL_EDGE, 'stroke-width': 1,
  });

  // 信号線は**凹の口から出て**、アースより先の穴まで届く。**アースの接点より
  // 先から描く** — 接点の上を渡らせると、アースと中心導体がつながって見える
  // (実物の中心導体はアースの腕の間を通っていて、触れていない)。
  const centre = element('rect', {
    x: num(groundEnd), y: -2.5, width: num(width / 2 - groundEnd), height: 5, rx: 1, fill: SMA_PIN,
  });

  return `${barrel}${threads}${plain}${base}${face}${mating}${ground}${contacts}${centre}`;
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
 * インダクタの胴。**実物と同じ 3 桁コードを刷る** (`100u` なら `101`、µH 基準)。
 *
 * 実物には色帯のものもあるが、**帯にすると抵抗と見分けが付かない** — 同じ形の
 * 胴なので、色だけの違いでは読めない。
 */
function inductorBody(part: PlacedPart, width: number, theme: Theme): string {
  const henries = part.value === null ? null : parseMicrohenries(part.value);
  return codedBody(part, width, theme, henries === null ? null : inductorCode(henries));
}

/**
 * コンデンサの姿ごとの見た目。**実物の色と形**なので、SMA の金物と同じく
 * テーマから触らせない (塗り替えると図が嘘になる)。
 *
 * 積層セラミックは青い小判、フィルムは黄の箱、タンタルは橙の小判、
 * アルミ電解は黒い缶。**部品箱から選ぶときに最初に見るのがこの色と形**で、
 * 値は刷り字とキャプションのほうで読む。
 */
type CapacitorLook = {
  readonly fill: string;
  readonly edge: string;
  /** 胴に刷る字の色。地の明るさで決まる。 */
  readonly ink: string;
  /** 角の丸み。小判 (`BODY_HEIGHT / 2`) か箱 (小さい値) か。 */
  readonly round: number;
};

const CAPACITOR_LOOKS: Record<string, CapacitorLook> = {
  ceramic: { fill: '#2f6fb5', edge: '#1d4a7d', ink: '#f2f5f8', round: BODY_HEIGHT / 2 },
  film: { fill: '#d9b02c', edge: '#a07f14', ink: '#3a2f08', round: 2 },
  tantalum: { fill: '#e08a1e', edge: '#a35f0c', ink: '#3a2205', round: BODY_HEIGHT / 2 },
  electrolytic: { fill: '#20242b', edge: '#0b0d10', ink: '#e8ebee', round: 3 },
};

const capacitorLook = (variant: string | null): CapacitorLook | null =>
  variant !== null && Object.hasOwn(CAPACITOR_LOOKS, variant) ? CAPACITOR_LOOKS[variant] ?? null : null;

/** アルミ缶の縁。幅と、両端から空ける幅。 */
const CAN_RING = 3;
const CAN_INSET = 2;

/**
 * アルミ電解の缶の縁。**姿の違いを色だけに預けない** — 白黒で刷ると
 * 地の色は消えるが、縁の輪は形として残る。
 */
const canRings = (width: number): string =>
  width < (CAN_RING + CAN_INSET) * 3
    ? ''
    : [-1, 1]
      .map((side) => element('rect', {
        x: num(side < 0 ? -width / 2 + CAN_INSET : width / 2 - CAN_INSET - CAN_RING),
        y: num(-BODY_HEIGHT / 2 + 1),
        width: CAN_RING, height: BODY_HEIGHT - 2, rx: 1, fill: '#c3c8cf',
      }))
      .join('');

/**
 * コンデンサの胴。**姿を書いたら姿の色と形で描く** (`capacitor/ceramic`)。
 * 書かなければ地の胴のまま — 姿の分からない部品を、あるように描かない。
 *
 * **実物と同じ 3 桁コードを刷る** (`100n` なら `104`)。手元の部品箱から
 * 選ぶときに見るのはこの数字なので、値の綴りより刷り字のほうが突き合わせやすい。
 * **アルミ電解にだけは刷らない** — 実物の缶に出ているのは容量そのもので、
 * 3 桁コードではない (刷ると実物と違うものを図が言うことになる)。
 */
function capacitorBody(part: PlacedPart, width: number, theme: Theme): string {
  const farads = part.value === null ? null : parsePicofarads(part.value);
  const code = farads === null ? null : capacitorCode(farads);
  const look = capacitorLook(part.variant);
  if (look === null) return codedBody(part, width, theme, code);

  const shell = element('rect', {
    x: num(-width / 2), y: num(-BODY_HEIGHT / 2), width: num(width), height: BODY_HEIGHT,
    rx: num(look.round), fill: look.fill, stroke: look.edge, 'stroke-width': 1,
  });
  return part.variant === 'electrolytic'
    ? shell + canRings(width)
    : shell + printedCode(width, code, look.ink);
}

/** 3 桁コードを刷った胴。刷れないときは地の胴だけ。 */
function codedBody(_part: PlacedPart, width: number, theme: Theme, code: string | null): string {
  return genericBody(width, theme) + printedCode(width, code, theme.palette.caption);
}

/**
 * 胴に刷る 3 桁コード。**胴に入らない幅では刷らない** — 切れた数字は
 * 別の容量に読めてしまう (`104` が `10` に見えると 10pF)。
 */
function printedCode(width: number, code: string | null, ink: string): string {
  if (code === null) return '';

  const size = BODY_HEIGHT * 0.75;
  // 3 桁ぶんの幅が無ければ刷らない (等幅ではないので少し余裕を見る)。
  if (width < size * code.length * 0.8) return '';

  return svgText(0, size * 0.36, code, { fill: ink, 'font-size': num(size) });
}

const bodyOf = (
  part: PlacedPart,
  width: number,
  theme: Theme,
  mount: { readonly edgeX: number; readonly legX: number } | null,
): string => {
  if (part.type === 'resistor') return resistorBody(part, width, theme);
  if (part.type === 'led') return ledBody(part, theme);
  if (part.type === 'capacitor') return capacitorBody(part, width, theme);
  if (part.type === 'inductor') return inductorBody(part, width, theme);
  if (part.type === 'sma') {
    return mount === null ? smaBody(part) : smaEdgeBody(part, width, mount.edgeX, mount.legX);
  }
  return genericBody(width, theme);
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

  const lead = element('line', {
    x1: num(from.x), y1: num(from.y), x2: num(to.x), y2: num(to.y),
    stroke: theme.palette.lead, 'stroke-width': LEAD_WIDTH,
  });
  // 3 引数 rotate() を読まないレンダラがあるので translate と rotate に分ける。
  // 端面実装は胴が板の縁から外へ張り出すので、**板の縁と足がどこに来るか**を
  // 局所座標で渡す (胴の中心と足の中点がずれるのはこの姿だけ)。
  const mount = isEdgeMount(part.type, part.variant) ? edgeMountOf(part, layout) : null;
  const body = element(
    'g',
    { transform: `translate(${num(center.x)} ${num(center.y)}) rotate(${num(angle)})` },
    bodyOf(part, width, theme, mount),
  );
  // **キャプションは足の真ん中の下**。胴の中心に置くと、板の外へ張り出す部品
  // (端面実装の SMA) で字が板から出て、地に紛れるか幅ゼロで `…` に切られる。
  // 縦は胴の下端から測る — 中心から一定の距離だと、胴の大きい部品で字が胴に載る。
  const pinMiddle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
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

  // ノッチは 1 番ピンの側の辺の真ん中。DIP でだけ描く (SIP と 3 本足には無い)。
  //
  // **どちらの辺かは 1 番ピンの位置から決める。** 箱の左端に決め打つと、
  // 板を裏返した図 (`style: back`) で列の並びが入れ替わったときに反対の端へ出て、
  // **図のとおりに挿した IC が 180 度回る** — この印はそれを防ぐためにある。
  const footprint = footprintOf(part.type);
  const left = rect.cx - rect.width / 2;
  const right = rect.cx + rect.width / 2;
  const nearFirst = layout.point(first.address).x < rect.cx ? left + NOTCH : right - NOTCH;
  const notch = footprint?.kind !== 'dip' ? '' : element('circle', {
    cx: num(nearFirst), cy: num(rect.cy),
    r: NOTCH, fill: theme.palette.plate, stroke: theme.palette.bodyEdge, 'stroke-width': 1,
  });

  // 箱は縦横のどちらにも伸びる。**縦長ならキャプションも縦**にする
  // (2 本足の部品と同じ扱い)。
  const tall = rect.height > rect.width;
  const label = partLabel(
    caption(part),
    { cx: rect.cx, cy: rect.cy, height: tall ? rect.width : rect.height, angle: tall ? Math.PI / 2 : 0 },
    { x: rect.cx, y: rect.cy },
    theme,
    layout,
  );

  return `${body}${notch}${leads}${label}`;
}

export const renderParts = (parts: readonly PlacedPart[], layout: Layout, theme: Theme): string =>
  parts
    .map((part) => (isBoxed(part) ? renderBox(part, layout, theme) : renderTwoLead(part, layout, theme)))
    .join('');
