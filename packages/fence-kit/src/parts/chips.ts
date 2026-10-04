import { element } from '../markup.ts';
import { BOARD_HALO_OPACITY, BOARD_INK_OPACITY, num, svgText } from '../svg.ts';
import { textWidth } from '../textFit.ts';
import type { BoardPart } from './boards.ts';

/**
 * DIP・SIP・マイコンボードの姿。**実物のパッケージの話で盤面に依らない**ので、
 * breadboard と perfboard で同じ絵にする (実機で「pico など、全ての部品の
 * 見た目を breadboard と perfboard で共通にする。breadboard を基準にする」)。
 *
 * 板ごとに違うのは**足がどの座標に落ちるか**だけなので、受け取るのは穴の点と
 * ピッチと色だけにする。`Layout` も `Theme` も知らない (盤面の話は呼ぶ側に残る)。
 *
 * **足の並びは 1 番から**。2 列のものは 1 番の列を先に並べ、折り返して
 * 反対の列を戻る (実物の DIP と同じ数え方)。だから `points[0]` と `points[1]` の
 * 差が**列の向き**になり、縦に置いた板でも同じ絵が描ける。
 */

export type ChipPoint = { readonly x: number; readonly y: number };
export type ChipBox = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/** パッケージを描く色。**部品の色**なので、盤面のテーマから引いて渡す。 */
export type ChipInk = {
  /** 樹脂。 */
  readonly body: string;
  /** 足の跡と、樹脂の上に書く足の番号。 */
  readonly pin: string;
  /** 樹脂の上に載る字 (キャプション・チップ名)。 */
  readonly chipText: string;
  /** 切り欠きを抜く色。**板の地の色**を渡す (実物も樹脂に開いた窪み)。 */
  readonly plate: string;
  /** 樹脂の外に置く字 (足の名前)。 */
  readonly outside: string;
  /** その字の縁取り (下の穴に食われないように)。 */
  readonly halo: string;
  readonly haloWidth: number;
};

/** 樹脂の縁。**どのテーマでも黒に近い** — 実物のパッケージの縁は影になる。 */
const CHIP_EDGE = '#14171c';

/** 本体の枠と字の間に残す余白。 */
const CHIP_LABEL_PAD = 14;

/**
 * パッケージの幅からはみ出さないところまで字を詰める。
 * **幅は文字数ではなく `textWidth` で数える**。全角を半角の幅で数えていたときは、
 * 日本語のラベルが枠から飛び出していた (dip8 の本体 78px に対して字が 95px)。
 */
const fittedFontSize = (text: string, width: number, scale: number): number =>
  Math.min(scale * 9.5, (width - CHIP_LABEL_PAD) / textWidth(text));

/**
 * 足の列が横に並んでいるか。**1 番と 2 番は同じ列の隣どうし**なので、
 * その 2 つの差が列の向きになる。板を回して縦に置いても付いてくる。
 */
export function chipAlongX(points: readonly ChipPoint[]): boolean {
  const [first, second] = points;
  if (!first || !second) return true;
  return Math.abs(second.x - first.x) >= Math.abs(second.y - first.y);
}

/** 点を囲む箱に、向きごとの余白を足したもの。 */
function boxOf(points: readonly ChipPoint[], padX: number, padY: number): ChipBox {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x0 = Math.min(...xs) - padX;
  const x1 = Math.max(...xs) + padX;
  const y0 = Math.min(...ys) - padY;
  const y1 = Math.max(...ys) + padY;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

const centreOf = (box: ChipBox): ChipPoint => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

/** 足の並ぶ向きの余白 (ピッチ比) と、列と列の向きの余白 (px)。 */
const DIP_ALONG = 0.45;
const DIP_ACROSS = 5;

/** DIP の樹脂。**当たり判定と描画で同じ形を使う**ので、外にも出す。 */
export function dipBox(points: readonly ChipPoint[], pitch: number): ChipBox {
  const alongX = chipAlongX(points);
  return boxOf(points, alongX ? DIP_ALONG * pitch : DIP_ACROSS, alongX ? DIP_ACROSS : DIP_ALONG * pitch);
}

/** 足の跡 (6px 角) を、穴から樹脂の内側へ 2px 寄せて置く量。 */
const STUB_IN = 2;
/**
 * 足の番号を穴から樹脂の内側へ置く距離と、字を下へずらす量。
 * **基準線は字の下端**なので、内側へ寄せるだけでは上の列と下の列で
 * 字の見える位置が揃わない (上の列は 12、下の列は 7 になるのがこの内訳)。
 */
const NUMBER_IN = 9.5;
const NUMBER_MIDDLE = 2.5;
const NUMBER_FONT = 6.5;
/** 切り欠きの半径。 */
const NOTCH = 4.5;

export type DipOptions = {
  readonly points: readonly ChipPoint[];
  /**
   * 足に刷る字 (`points` と同じ順)。番号だけの DIP は番号 (`1`〜)、名前のある DIP は
   * 名前。`numbers` が無ければ胴の縁 (足のすぐ内側) に刷る。
   */
  readonly names: readonly string[];
  /**
   * 足の番号 (`points` と同じ順)。**渡すと 2 段になる** — 番号を胴の縁、`names` を
   * 胴の外の足の向こう側に刷る (52 の docs/95 の決め 2 と判断の記録の代案。実物の胴に
   * 名前は無いので、切り欠きから数えるための番号は消さない)。
   */
  readonly numbers?: readonly string[];
  /**
   * `numbers` と一緒に渡すと、名前を胴の外ではなく**胴の中、番号のすぐ内側**に刷る。
   * 足の穴から線が出る板 (perfboard) で、線が名前を横切らないように。
   */
  readonly namesInside?: boolean;
  /** 1 番ピンの添字。回すと名前のほうが巡るので、呼ぶ側が名前で引いて渡す。 */
  readonly pinOne: number;
  readonly pitch: number;
  readonly caption: string;
  /** 字の倍率 (テーマの字の大きさ / 既定)。 */
  readonly scale: number;
  readonly ink: ChipInk;
};

/**
 * DIP パッケージ。**切り欠きは 1 番ピンの側の端**に描く。実物と同じ向きの
 * 目印が無いと、図を見ながら挿すときに 180 度回して挿せてしまう。
 */
export function dipChip(options: DipOptions): string {
  const { points, names, pinOne, pitch, caption, scale, ink } = options;
  if (points.length === 0) return '';

  const box = dipBox(points, pitch);
  const centre = centreOf(box);
  const alongX = chipAlongX(points);
  // 足から樹脂の中心へ向かう向き。**列ごとに向きが変わる**。
  const inward = (point: ChipPoint): number =>
    (alongX ? Math.sign(centre.y - point.y) : Math.sign(centre.x - point.x)) || 1;

  const stubs = points
    .map((point) => {
      const step = inward(point) * STUB_IN;
      return element('rect', {
        x: num(point.x - 3 + (alongX ? 0 : step)),
        y: num(point.y - 3 + (alongX ? step : 0)),
        width: 6, height: 6, fill: ink.pin,
      });
    })
    .join('');

  const edgeLabels = options.numbers ?? names;
  const numbers = points
    .map((point, index) => {
      const step = inward(point) * NUMBER_IN;
      return svgText(
        point.x + (alongX ? 0 : step),
        point.y + (alongX ? step + NUMBER_MIDDLE : NUMBER_MIDDLE),
        edgeLabels[index] ?? '',
        { 'font-size': num(scale * NUMBER_FONT), fill: ink.pin },
      );
    })
    .join('');
  const outer: { svg: string; band: 'below' | null } = options.numbers === undefined
    ? { svg: '', band: null }
    : pinNames(points, names, inward, alongX, pitch, box, scale, ink, options.namesInside === true);

  const shell = element('rect', {
    x: num(box.x), y: num(box.y), width: num(box.width), height: num(box.height), rx: 3,
    fill: ink.body, stroke: CHIP_EDGE,
  });

  const first = points[pinOne] ?? points[0]!;
  const notch = element('circle', {
    cx: num(alongX ? (first.x < centre.x ? box.x : box.x + box.width) : centre.x),
    cy: num(alongX ? centre.y : (first.y < centre.y ? box.y : box.y + box.height)),
    r: NOTCH, fill: ink.plate,
  });

  const label = outer.band === null
    ? chipCaption(caption, box, alongX, scale, ink)
    : bandCaption(caption, box, scale, ink);
  return `${stubs}${shell}${notch}${numbers}${outer.svg}${label}`;
}

/**
 * 足の名前だけを、DIP と同じ**胴の外、足の向こう側**に刷る。変換基板 (`smdDraw.ts`) が、
 * 板の上に名前の入る場所が無いとき (ブレッドボードの溝をまたぐ 2 行) に使う。
 */
export function dipOutsideNames(options: DipOptions): string {
  const { points, names, pitch, scale, ink } = options;
  if (points.length === 0) return '';
  const box = dipBox(points, pitch);
  const centre = centreOf(box);
  const alongX = chipAlongX(points);
  const inward = (point: ChipPoint): number =>
    (alongX ? Math.sign(centre.y - point.y) : Math.sign(centre.x - point.x)) || 1;
  return pinNames(points, names, inward, alongX, pitch, box, scale, ink, false).svg;
}

/** 板の上 (胴の外) に出す字の書式。縁取りつきで、下の穴に食われない。 */
export const outsideTextStyle = (size: number, ink: ChipInk): Record<string, string | number> => ({
  'font-size': num(size), fill: ink.outside, halo: ink.halo, haloWidth: NAME_HALO, haloOpacity: BOARD_HALO_OPACITY, inkOpacity: BOARD_INK_OPACITY,
});

/**
 * 足の名前。**既定は胴の外、足の向こう側** (胴の縁と隣の穴の列のあいだ) に刷る。
 *
 * 計画 (52 の docs/95 の決め 2) は番号の 1 段内側だったが、ブレッドボードの胴は溝を
 * またぐ 2 行 (e・f) の間しか無く、番号とキャプションの間に名前の段が入らなかった
 * (焼いて確かめた。判断の記録の代案)。1 列ヘッダの名前と同じ置き場で、縁取りを付けて
 * 下の穴に食われないようにする。ブレッドボードの線は同じ 5 穴の組の別の穴に挿すので、
 * 足の向こう側の帯を通らない。
 *
 * **`namesInside` なら胴の中、番号のすぐ内側** (perfboard)。ユニバーサル基板の線は足の
 * 穴そのものから出るので、胴の外の帯に書くと、足から出る線が必ず名前を横切った
 * (リレーの NC1・COM1、DIP の GND。焼いて確かめた)。胴は 3 穴の奥行きがあり、番号と
 * 真ん中のキャプションの間に 1 段入る。**縦に立てた胴** (perfboard の `r90` / `r270`) は
 * どちらでも胴の中、番号の内側に書く — 横書きの字は外へ出すと隣の穴の列に乗る。
 *
 * **字の大きさは列 (胴の片側) ごとに 1 つ** (`sideFontSize`)。足ごとに縮めると、同じ胴の
 * 上で `V-` と `IN1+` の字の大きさが揃わなかった。
 */
const NAME_FONT = 6;
/**
 * 列の字をこれより小さくしない。焼いた PNG (1.5 倍) でも 1 字ずつ読める下限。
 * これでも入らない名前は、隣の名前との隙間を詰めて (はみ出して) 書く。
 */
const MIN_NAME_FONT = 4.5;
/** 隣り合う名前の字と字の隙間。縁取りは半分透けるので、重なってよいのは縁だけ。 */
const NAME_GAP = 1.5;
/**
 * 足の名前は大文字ばかり (`RESET` `THRES`) で、`textWidth` の半角 0.55 より広い
 * (焼いて測ると 1.25 倍ほど)。狭く見積もると隣の名前やキャプションに食い込む。
 */
const NAME_CAPS = 1.25;
const NAME_HALO = 2;
const NAME_CLEAR = 0.5;
const NAME_CAP = 0.72;
/** 胴の中に書くとき、足の穴の中心から名前の字の真ん中まで (番号の真ん中は `NUMBER_IN`)。 */
const NAME_IN = 18;
/** 立てた胴で、番号の中心から名前の書き出しまで。 */
const NAME_BESIDE = 5;
/**
 * **列の字を縮めると読めなくなる名前だけ、決まった略で刷る** (印字は表のまま。
 * ネットリストと配線の名前は変わらない)。`GROUND` は L293D の 4 本で、同じ名前が 2 本
 * 以上あるので名前では指せず番号で呼ぶ — 絵の字を変えても書き方は変わらない。
 * `GND` は同じ働きの足の印字として NE555・74HC などの表にある綴り。
 */
const SHORT_NAMES: ReadonlyMap<string, string> = new Map([['GROUND', 'GND']]);

type SideName = {
  readonly index: number;
  /** 足の並ぶ向きの座標。 */
  readonly at: number;
  readonly name: string;
};

/** 字の大きさ 1 のときの名前の幅 (大文字の見積もり)。 */
const nameWidth = (name: string): number => textWidth(name) * NAME_CAPS;

/**
 * 列 (胴の片側) の名前の字の大きさと、端の名前を内へ寄せる量。
 *
 * 名前は足の真上に中央揃え。**隣どうしの幅の和の半分 + 隙間が足の間隔に収まる**
 * 大きさにする (長い名前は、短い隣の名前が空けた所へはみ出してよい — NE555 の `RESET` は
 * 隣が `OUT` なので縮まない)。列の端の名前は、胴の端から `endRoom` まで出てよく、
 * それでも出るなら隣が空けた分だけ内へ寄せる。大きさは `[MIN_NAME_FONT, largest]`。
 */
function sideFontSize(
  side: readonly SideName[],
  largest: number,
  gap: number,
  endRoom: number,
): { size: number; wanted: number; shift: ReadonlyMap<number, number> } {
  const sorted = [...side].sort((a, b) => a.at - b.at);
  let size = largest;
  for (let i = 1; i < sorted.length; i += 1) {
    const [a, b] = [sorted[i - 1]!, sorted[i]!];
    const both = (nameWidth(a.name) + nameWidth(b.name)) / 2;
    if (both > 0) size = Math.min(size, (Math.abs(b.at - a.at) - gap) / both);
  }
  const ends = sorted.length === 0 ? [] : [[sorted[0]!, sorted[1]], [sorted[sorted.length - 1]!, sorted[sorted.length - 2]]] as const;
  for (const [end, next] of ends) {
    const own = nameWidth(end.name);
    if (own === 0) continue;
    const spare = next === undefined ? 0 : Math.abs(next.at - end.at) - gap;
    const neighbour = next === undefined ? 0 : nameWidth(next.name);
    size = Math.min(size, Math.max(endRoom / (own / 2), (endRoom + spare) / (own + neighbour / 2)));
  }
  const wanted = size;
  size = Math.max(MIN_NAME_FONT, size);

  const shift = new Map<number, number>();
  for (const [end, next] of ends) {
    const over = (nameWidth(end.name) * size) / 2 - endRoom;
    if (over <= 0) continue;
    const inward = next === undefined ? 0 : Math.sign(next.at - end.at);
    shift.set(end.index, inward * over);
  }
  return { size, wanted, shift };
}

/**
 * 列ごとに略を当てるか決める。**印字のままで入るなら印字のまま。**
 *
 * 1. 既定の大きさを割るなら `SHORT_NAMES` (`GROUND` → `GND`)
 * 2. それでも下限 (`MIN_NAME_FONT`) を割るなら、`/` で 2 つの働きを並べた名前は前の働きだけ
 *    (`LE/STROBE` → `LE`、`CS/SHDN` → `CS`)。前が空の名前 (`/Q1` — 上に線の印) はそのまま
 */
function shownNames(
  side: readonly SideName[],
  fits: (side: readonly SideName[]) => boolean,
  readable: (side: readonly SideName[]) => boolean,
): readonly SideName[] {
  if (fits(side)) return side;
  const short = side.map((one) => ({ ...one, name: SHORT_NAMES.get(one.name) ?? one.name }));
  if (readable(short)) return short;
  return short.map((one) => ({ ...one, name: firstRole(one.name) }));
}

/** `LE/STROBE` の `LE`。`/` が無いか先頭にある名前はそのまま。 */
const firstRole = (name: string): string => {
  const slash = name.indexOf('/');
  return slash > 0 ? name.slice(0, slash) : name;
};

function pinNames(
  points: readonly ChipPoint[],
  names: readonly string[],
  inward: (point: ChipPoint) => number,
  alongX: boolean,
  pitch: number,
  box: ChipBox,
  scale: number,
  ink: ChipInk,
  inside: boolean,
): { svg: string; band: 'below' | null } {
  const largest = scale * NAME_FONT;
  // 列は足から胴の中心への向きで分ける (2 列の DIP の上下、立てた胴の左右)。
  const sides = [1, -1].map((sign) => points
    .map((point, index) => ({ index, point, name: names[index] ?? '' }))
    .filter((one) => one.name !== '' && inward(one.point) === sign)
    .map(({ index, point, name }) => ({ index, name, at: alongX ? point.x : point.y })));

  if (!alongX) {
    const centre = centreOf(box).x;
    const svg = sides.map((side) => uprightNames(side, points, inward, centre, scale, ink)).join('');
    return { svg, band: sides.some((side) => side.length > 0) ? 'below' : null };
  }

  // 胴の中なら端の名前は胴の端まで、外なら隣の列との真ん中まで。
  const endRoom = inside ? DIP_ALONG * pitch - 1 : pitch / 2;
  const gap = inside ? NAME_GAP + 0.5 : NAME_GAP;
  const svg = sides
    .map((raw) => {
      const side = shownNames(raw, (one) => sideFontSize(one, largest, gap, endRoom).size >= largest, (one) => sideFontSize(one, largest, gap, endRoom).wanted >= MIN_NAME_FONT);
      const { size, shift } = sideFontSize(side, largest, gap, endRoom);
      return side
        .map(({ index, name }) => {
          const point = points[index]!;
          const x = point.x + (shift.get(index) ?? 0);
          if (inside) {
            // 番号の内側。字の真ん中を足から `NAME_IN` の所に置く (基準線は字の下端)。
            const y = point.y + inward(point) * NAME_IN + (size * NAME_CAP) / 2;
            return svgText(x, y, name, { 'font-size': num(size), fill: ink.chipText });
          }
          // 字は基準線から上へ伸びるので、下へ出す側だけ字の高さを足す。
          const clear = DIP_ACROSS + NAME_HALO / 2 + NAME_CLEAR;
          const y = inward(point) < 0 ? point.y + clear + size * NAME_CAP : point.y - clear;
          return svgText(x, y, name, {
            'font-size': num(size), fill: ink.outside, halo: ink.halo, haloWidth: NAME_HALO, haloOpacity: BOARD_HALO_OPACITY, inkOpacity: BOARD_INK_OPACITY,
          });
        })
        .join('');
    })
    .join('');
  return { svg, band: null };
}

/**
 * **立てた胴 (perfboard で回したとき) は胴の中。** 外へ横書きで出すと隣の穴の列に
 * 字が乗った (焼いて確かめた)。胴は 3 穴の幅しか無く、両側の番号と名前でほぼ埋まるので、
 * キャプションは胴の下に出し (`bandCaption`)、名前は番号の内側から胴の真ん中までを使う。
 * 列の字は一番長い名前に合わせて 1 つの大きさ (下限は `MIN_NAME_FONT`)。
 */
function uprightNames(
  side: readonly SideName[],
  points: readonly ChipPoint[],
  inward: (point: ChipPoint) => number,
  centre: number,
  scale: number,
  ink: ChipInk,
): string {
  const first = side[0];
  if (first === undefined) return '';
  const room = Math.abs(centre - points[first.index]!.x) - NUMBER_IN - NAME_BESIDE - NAME_GAP / 2;
  const wantedOf = (list: readonly SideName[]): number =>
    Math.min(scale * NAME_FONT, ...list.map((one) => room / Math.max(nameWidth(one.name), 1e-9)));
  const shown = shownNames(side, (list) => wantedOf(list) >= scale * NAME_FONT, (list) => wantedOf(list) >= MIN_NAME_FONT);
  const size = Math.max(MIN_NAME_FONT, wantedOf(shown));
  return shown
    .map(({ index, name }) => {
      const point = points[index]!;
      const outward = -inward(point);
      return svgText(point.x - outward * (NUMBER_IN + NAME_BESIDE), point.y + NUMBER_MIDDLE, name, {
        'font-size': num(size), fill: ink.chipText, anchor: outward > 0 ? 'end' : 'start',
      });
    })
    .join('');
}

/**
 * 立てた胴に名前を書いたときのキャプション。**胴の下に横書きで出す** (縁取りつき)。
 * 胴の真ん中に寝かせて置くと、両側の名前に重なった (焼いて確かめた)。
 */
function bandCaption(text: string, box: ChipBox, scale: number, ink: ChipInk): string {
  const size = Math.min(scale * 9.5, fittedFontSize(text, box.width + 2 * CHIP_LABEL_PAD, scale));
  return svgText(centreOf(box).x, box.y + box.height + size * NAME_CAP + 2, text, {
    'font-size': num(size), fill: ink.outside, halo: ink.halo, haloWidth: NAME_HALO, haloOpacity: BOARD_HALO_OPACITY, inkOpacity: BOARD_INK_OPACITY,
  });
}

/** 樹脂の真ん中に置くキャプション。**縦に置いた胴では字も寝かせる**。 */
function chipCaption(text: string, box: ChipBox, alongX: boolean, scale: number, ink: ChipInk): string {
  const centre = centreOf(box);
  const size = fittedFontSize(text, alongX ? box.width : box.height, scale);
  const style = { 'font-size': num(size), fill: ink.chipText };
  if (alongX) return svgText(centre.x, centre.y + 3.5, text, style);
  return element(
    'g',
    { transform: `translate(${num(centre.x)} ${num(centre.y)}) rotate(-90)` },
    svgText(0, 3.5, text, style),
  );
}

/** 1 列ヘッダの本体が覆う帯 (ピッチに対する比)。 */
const SIP_HALF = 0.5;
const SIP_NAME_FONT = 6.5;
/**
 * ピン名の縁取り。**普通の縁取りより細くする** — 本体の縁と次の穴の列のあいだは
 * 半ピッチ足らずしか無く、太い縁取りは本体の縁を削る
 * (実機で「sip*、部品に文字が被らないようにする」)。
 */
const SIP_NAME_HALO = 2;
/**
 * ピン名は**本体の縁と次の穴の列のあいだ**に置く。字は基準線から上へ伸びるので、
 * **字の高さも足して**縁から離す。
 */
const SIP_NAME_CLEAR = 0.5;
const SIP_NAME_CAP = 0.72;

/** 1 列ヘッダの樹脂。**当たり判定と描画で同じ形を使う**ので、外にも出す。 */
export function sipBox(points: readonly ChipPoint[], pitch: number): ChipBox {
  // **縦横で同じ余白。** 帯の長さは足の並びが決めるので、余白は半ピッチの正方。
  const half = SIP_HALF * pitch;
  return boxOf(points, half, half);
}

/** 樹脂の色と胴の字を持つ 1 列の部品 (セラミックフィルタ)。黒い樹脂の代わりに使う。 */
export type SipLook = {
  readonly body: string;
  readonly edge: string;
  /** 胴の字の色。 */
  readonly text: string;
  /** 胴に刷る字。キャプションの代わり (型番の全文は部品表に出る)。 */
  readonly mark: string;
};

export type SipOptions = {
  readonly points: readonly ChipPoint[];
  readonly names: readonly string[];
  readonly pitch: number;
  readonly caption: string;
  readonly scale: number;
  /** 足の名前を出す側 (+1 / -1)。横に寝た帯なら下が +1、縦なら右が +1。 */
  readonly nameSide: 1 | -1;
  readonly ink: ChipInk;
  readonly look?: SipLook;
};

/**
 * 1 列ヘッダの足の名前。**本体の外、`nameSide` の側**に縁取りつきで刷る。
 * 1 列の変換基板 (`smdDraw.ts`) も同じ置き場に同じ字で出す。
 */
export function sipLegends(options: SipOptions): string {
  const { points, names, pitch, scale, nameSide, ink } = options;
  const bar = sipBox(points, pitch);
  const alongX = chipAlongX(points);
  const across = alongX ? bar.height : bar.width;
  const gap = across / 2 + SIP_NAME_HALO / 2 + SIP_NAME_CLEAR + scale * SIP_NAME_FONT * SIP_NAME_CAP;
  const nameStyle = {
    'font-size': num(scale * SIP_NAME_FONT),
    fill: ink.outside,
    halo: ink.halo,
    haloWidth: SIP_NAME_HALO,
    haloOpacity: BOARD_HALO_OPACITY, inkOpacity: BOARD_INK_OPACITY,
  };
  return points
    .map((point, index) => (alongX
      ? svgText(point.x, point.y + nameSide * gap, names[index] ?? '', nameStyle)
      : svgText(
        point.x + nameSide * gap,
        point.y + NUMBER_MIDDLE,
        names[index] ?? '',
        { ...nameStyle, anchor: nameSide > 0 ? 'start' : 'end' },
      )))
    .join('');
}

/**
 * 1 列に並んだヘッダ。ヘッダ 1 列のモジュール (OLED や測距センサ) をこれで賄うので、
 * **ピン名は本体の外**に出す。どの穴が何なのかが、図の中だけで分かる必要がある。
 */
export function sipHeader(options: SipOptions): string {
  const { points, pitch, scale, nameSide, ink, look } = options;
  const caption = look?.mark ?? options.caption;
  const first = points[0];
  if (!first) return '';

  const bar = sipBox(points, pitch);
  const alongX = chipAlongX(points);
  const across = alongX ? bar.height : bar.width;

  const shell = element('rect', {
    x: num(bar.x), y: num(bar.y), width: num(bar.width), height: num(bar.height), rx: 3,
    fill: look?.body ?? ink.body, stroke: look?.edge ?? CHIP_EDGE,
  });
  // 足は本体の縁からピン名の側へ覗かせる。本体の真ん中に重ねるとキャプションと
  // 食い合い、本体の下に隠すとどの穴に挿さっているのかが読めなくなる。
  const edge = (alongX ? first.y : first.x) + (nameSide * across) / 2;
  const stubs = points
    .map((point) => element('rect', {
      x: num(alongX ? point.x - 3 : edge - 2.5),
      y: num(alongX ? edge - 2.5 : point.y - 3),
      width: alongX ? 6 : 5,
      height: alongX ? 5 : 6,
      fill: ink.pin,
    }))
    .join('');

  const legends = sipLegends(options);

  const centre = centreOf(bar);
  const size = fittedFontSize(caption, alongX ? bar.width : bar.height, scale);
  const label = alongX
    ? svgText(centre.x, first.y + 3.5, caption, { 'font-size': num(size), fill: look?.text ?? ink.chipText })
    : element(
      'g',
      { transform: `translate(${num(first.x)} ${num(centre.y)}) rotate(-90)` },
      svgText(0, 3.5, caption, { 'font-size': num(size), fill: look?.text ?? ink.chipText }),
    );

  return `${shell}${stubs}${legends}${label}`;
}

/** 基板の縁がピン列の外へ出る量 (ピッチに対する比)。Pico は 21mm 幅 / ピン間隔 0.7 インチ。 */
const EDGE_ALONG = 0.55;
const EDGE_ACROSS = 0.63;

// USB micro-B は幅 7.5mm ほど。基板の端から少しだけ出る。
const USB_OVERHANG = 8;
const USB_WIDTH = 20;
const USB_HEIGHT = 2.6;
const PIN_FONT = 6.8;
const PIN_NAME_GAP = 8;
const CHIP_SIDE = 2.2;
/** 足の番号の桁 (`01` `40`)。揃えると名前の頭が縦に並ぶ。 */
const PIN_NUMBER_DIGITS = 2;

/** マイコンボードの外形。**当たり判定と描画で同じ形を使う**ので、外にも出す。 */
export function boardBox(points: readonly ChipPoint[], pitch: number, definition: BoardPart | null = null): ChipBox {
  const alongX = chipAlongX(points);
  const along = definition?.reach ?? EDGE_ALONG;
  return boxOf(
    points,
    (alongX ? along : EDGE_ACROSS) * pitch,
    (alongX ? EDGE_ACROSS : along) * pitch,
  );
}

export type BoardChipOptions = {
  readonly points: readonly ChipPoint[];
  /** 足の名前 (`GP0`)。無い足は番号だけ。 */
  readonly names: readonly string[];
  readonly definition: BoardPart | null;
  /** 1 番ピンの添字。**USB の側**を決める (既定は書かれた 1 つ目の穴)。 */
  readonly pinOne?: number;
  readonly pitch: number;
  readonly scale: number;
  readonly ink: ChipInk;
};

/**
 * マイコンボード。**ピン名は基板の中に縦書きで置く**: 外に出すと、隣の列の穴
 * (実際に配線を挿すところ) を字が覆ってしまう。USB は必ずピン 1 の側の端に描く。
 * 実物のピンアウト図と同じ向きで読めるようにするため。
 *
 * **部品の名前 (`U1`) はここでは描かない。** 基板の中に置くと長い足の名前
 * (`ADC_VREF 35`) と食い合う。ほかの部品と同じで**胴の下**に出す — どこに
 * 出せるかは板の話なので、呼ぶ側が板の物差しで置く
 * (実機で「すべての部品名は部品の下側に表示する」)。
 */
export function boardChip(options: BoardChipOptions): string {
  const { points, names, definition, pinOne = 0, pitch, scale, ink } = options;
  const first = points[pinOne] ?? points[0];
  if (!first) return '';

  const box = boardBox(points, pitch, definition);
  const centre = centreOf(box);
  const alongX = chipAlongX(points);
  // **USB はピン 1 の側の端。** 回すと 1 番も回るので、点から見る。
  const nearStart = alongX ? first.x < centre.x : first.y < centre.y;

  // USB は基板の下から出ているので、本体より先に描いて縁を隠す。
  const usbLong = USB_OVERHANG + USB_WIDTH;
  const usbThick = USB_HEIGHT * pitch;
  const usbStart = (start: number, size: number): number =>
    (nearStart ? start - USB_OVERHANG : start + size - USB_WIDTH);
  const usb = element('rect', {
    x: num(alongX ? usbStart(box.x, box.width) : centre.x - usbThick / 2),
    y: num(alongX ? centre.y - usbThick / 2 : usbStart(box.y, box.height)),
    width: num(alongX ? usbLong : usbThick),
    height: num(alongX ? usbThick : usbLong), rx: 2.5,
    fill: '#c9cfd8', stroke: '#8a929c',
  });
  const shell = element('rect', {
    x: num(box.x), y: num(box.y), width: num(box.width), height: num(box.height), rx: 5,
    fill: ink.body, stroke: CHIP_EDGE,
  });

  const chipSide = CHIP_SIDE * pitch;
  const chip = element('rect', {
    x: num(centre.x - chipSide / 2), y: num(centre.y - chipSide / 2),
    width: num(chipSide), height: num(chipSide),
    rx: 2, fill: '#0d1014', stroke: '#3a4049',
  });
  const chipName = definition
    ? svgText(centre.x, centre.y + 3, definition.chip, { 'font-size': num(scale * 7), fill: ink.chipText })
    : '';

  const stubs = points
    .map((point) => element('rect', {
      x: num(point.x - 3), y: num(point.y - 3), width: 6, height: 6, fill: ink.pin,
    }))
    .join('');

  const fontSize = scale * PIN_FONT;
  const legends = points
    .map((point, index) => {
      const name = names[index];
      if (name === undefined) return '';
      // 基板の内側へ向かって縦書きにする。**字の向きは列で揃える** (下から上へ読む):
      // 伸ばす向きは anchor で切り替え、回す角度は変えない。
      // 片方だけ天地が逆になると読めない。
      const inward = (alongX ? Math.sign(centre.y - point.y) : Math.sign(centre.x - point.x)) || 1;
      // **ヘッダの番号を名前に添える** (`01 GP0`)。実物のピンアウト図と突き合わせる
      // ときに、名前だけだと何番目の足かを数え直すことになる。
      // **番号は足の側の端**へ — 字は足から内側へ伸びるので、伸びる向きで前後が入れ替わる。
      const number = String(index + 1).padStart(PIN_NUMBER_DIGITS, '0');
      const text = inward > 0 ? `${name} ${number}` : `${number} ${name}`;
      const style = {
        'font-size': num(fontSize),
        fill: ink.chipText,
        anchor: (inward > 0 ? 'end' : 'start') as 'end' | 'start',
      };
      // 3 引数 rotate() を読まないレンダラがあるので translate と rotate に分ける。
      return alongX
        ? element(
          'g',
          {
            transform:
              `translate(${num(point.x + fontSize * 0.35)} ${num(point.y + inward * PIN_NAME_GAP)}) rotate(-90)`,
          },
          svgText(0, 0, text, style),
        )
        : svgText(point.x + inward * PIN_NAME_GAP, point.y + fontSize * 0.35, text, style);
    })
    .join('');

  return `${usb}${hdmi(definition, box, centre, alongX, nearStart, pitch)}${shell}${antenna(definition, box, centre, alongX, nearStart, ink.pin)}`
    + `${chip}${chipName}${stubs}${legends}`;
}

/** HDMI の幅 (ピッチ数) と、基板の端から外へ出る量 (px)。USB と反対の端に付く。 */
const HDMI_WIDTH = 6;
const HDMI_LENGTH = 24;
const HDMI_OVERHANG = 4;

/** HDMI つきの版 (Tang Nano 9K) は、USB と反対の端にコネクタが出ている。基板より先に描いて縁を隠す。 */
function hdmi(
  definition: BoardPart | null,
  box: ChipBox,
  centre: ChipPoint,
  alongX: boolean,
  nearStart: boolean,
  pitch: number,
): string {
  if (!definition?.hdmi) return '';

  const thick = HDMI_WIDTH * pitch;
  const start = (from: number, size: number): number => (nearStart ? from + size - HDMI_LENGTH + HDMI_OVERHANG : from - HDMI_OVERHANG);
  return element('rect', {
    x: num(alongX ? start(box.x, box.width) : centre.x - thick / 2),
    y: num(alongX ? centre.y - thick / 2 : start(box.y, box.height)),
    width: num(alongX ? HDMI_LENGTH : thick),
    height: num(alongX ? thick : HDMI_LENGTH), rx: 2.5,
    fill: '#d9dde3', stroke: '#8a929c',
  });
}

/** 無線つきの版は USB と反対の端にアンテナが載っている。 */
function antenna(
  definition: BoardPart | null,
  box: ChipBox,
  centre: ChipPoint,
  alongX: boolean,
  nearStart: boolean,
  ink: string,
): string {
  if (!definition?.wireless) return '';

  const width = 20;
  const height = 30;
  const along = nearStart
    ? (alongX ? box.x + box.width - width - 6 : box.y + box.height - width - 6)
    : (alongX ? box.x + 6 : box.y + 6);
  const outline = element('rect', {
    x: num(alongX ? along : centre.x - height / 2),
    y: num(alongX ? centre.y - height / 2 : along),
    width: num(alongX ? width : height),
    height: num(alongX ? height : width), rx: 2,
    fill: 'none', stroke: ink, 'stroke-width': 1.6,
  });
  const traces = [-8, 0, 8]
    .map((offset) => element('line', {
      x1: num(alongX ? along + 4 : centre.x + offset),
      y1: num(alongX ? centre.y + offset : along + 4),
      x2: num(alongX ? along + width - 4 : centre.x + offset),
      y2: num(alongX ? centre.y + offset : along + width - 4),
      stroke: ink, 'stroke-width': 1.6,
    }))
    .join('');
  return outline + traces;
}

/** 7 セグの桁の高さ (2 列の間に対する比) と、幅・太さ (高さに対する比)。 */
const DIGIT_HEIGHT = 0.5;
const DIGIT_WIDTH = 0.55;
const SEGMENT_THICK = 0.12;
/** 消えているセグメントの色。**実物の面と同じく、点いていなくても形は見える**。 */
const SEGMENT_OFF = '#9aa0a8';

/**
 * 7 セグの面 (「8.」)。樹脂の上に重ねて描く (52 の docs/66)。
 * **桁の上は `up` の向き** — 呼ぶ側が a の足 (上の辺) のある列の向きを渡す。
 * 足の無い向き (2 列の間) に桁を立てるので、回した部品でも桁が寝ない。
 */
export function segmentFace(options: {
  readonly centre: ChipPoint;
  /** 2 列の間の距離 (px)。桁の大きさはここから決める。 */
  readonly rowGap: number;
  /** 桁の上の向き (単位ベクトル。SVG の座標で)。 */
  readonly up: ChipPoint;
}): string {
  const { centre, rowGap, up } = options;
  const h = rowGap * DIGIT_HEIGHT;
  const w = h * DIGIT_WIDTH;
  const t = h * SEGMENT_THICK;
  // 桁の座標は y が上向き (a が +h/2)。SVG へは y を反転して描き、`up` へ回す。
  const bar = (x0: number, y0: number, x1: number, y1: number): string => element('rect', {
    x: num(Math.min(x0, x1) - t / 2), y: num(-Math.max(y0, y1) - t / 2),
    width: num(Math.abs(x1 - x0) + t), height: num(Math.abs(y1 - y0) + t),
    rx: num(t / 2), fill: SEGMENT_OFF,
  });
  const inset = t * 0.8;
  const segments = [
    bar(-w / 2 + inset, h / 2, w / 2 - inset, h / 2), // a
    bar(w / 2, h / 2 - inset, w / 2, inset), // b
    bar(w / 2, -inset, w / 2, -h / 2 + inset), // c
    bar(-w / 2 + inset, -h / 2, w / 2 - inset, -h / 2), // d
    bar(-w / 2, -inset, -w / 2, -h / 2 + inset), // e
    bar(-w / 2, h / 2 - inset, -w / 2, inset), // f
    bar(-w / 2 + inset, 0, w / 2 - inset, 0), // g
  ].join('');
  const dot = element('circle', { cx: num(w / 2 + t * 1.8), cy: num(h / 2), r: num(t * 0.8), fill: SEGMENT_OFF });
  const angle = (Math.atan2(up.x, -up.y) * 180) / Math.PI;
  return element(
    'g',
    { transform: `translate(${num(centre.x)} ${num(centre.y)}) rotate(${num(angle)})` },
    `${segments}${dot}`,
  );
}
