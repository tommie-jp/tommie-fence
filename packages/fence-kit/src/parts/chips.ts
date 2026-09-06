import { element } from '../markup.ts';
import { num, svgText } from '../svg.ts';
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
  /** 足の番号 (`1`〜)。**書かれた順**。 */
  readonly names: readonly string[];
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

  const numbers = points
    .map((point, index) => {
      const step = inward(point) * NUMBER_IN;
      return svgText(
        point.x + (alongX ? 0 : step),
        point.y + (alongX ? step + NUMBER_MIDDLE : NUMBER_MIDDLE),
        names[index] ?? '',
        { 'font-size': num(scale * NUMBER_FONT), fill: ink.pin },
      );
    })
    .join('');

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

  return `${stubs}${shell}${notch}${numbers}${chipCaption(caption, box, alongX, scale, ink)}`;
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

export type SipOptions = {
  readonly points: readonly ChipPoint[];
  readonly names: readonly string[];
  readonly pitch: number;
  readonly caption: string;
  readonly scale: number;
  /** 足の名前を出す側 (+1 / -1)。横に寝た帯なら下が +1、縦なら右が +1。 */
  readonly nameSide: 1 | -1;
  readonly ink: ChipInk;
};

/**
 * 1 列に並んだヘッダ。ヘッダ 1 列のモジュール (OLED や測距センサ) をこれで賄うので、
 * **ピン名は本体の外**に出す。どの穴が何なのかが、図の中だけで分かる必要がある。
 */
export function sipHeader(options: SipOptions): string {
  const { points, names, pitch, caption, scale, nameSide, ink } = options;
  const first = points[0];
  if (!first) return '';

  const bar = sipBox(points, pitch);
  const alongX = chipAlongX(points);
  const across = alongX ? bar.height : bar.width;

  const shell = element('rect', {
    x: num(bar.x), y: num(bar.y), width: num(bar.width), height: num(bar.height), rx: 3,
    fill: ink.body, stroke: CHIP_EDGE,
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

  const gap = across / 2 + SIP_NAME_HALO / 2 + SIP_NAME_CLEAR + scale * SIP_NAME_FONT * SIP_NAME_CAP;
  const nameStyle = {
    'font-size': num(scale * SIP_NAME_FONT),
    fill: ink.outside,
    halo: ink.halo,
    haloWidth: SIP_NAME_HALO,
  };
  const legends = points
    .map((point, index) => (alongX
      ? svgText(point.x, point.y + nameSide * gap, names[index] ?? '', nameStyle)
      : svgText(
        point.x + nameSide * gap,
        point.y + NUMBER_MIDDLE,
        names[index] ?? '',
        { ...nameStyle, anchor: nameSide > 0 ? 'start' : 'end' },
      )))
    .join('');

  const centre = centreOf(bar);
  const size = fittedFontSize(caption, alongX ? bar.width : bar.height, scale);
  const label = alongX
    ? svgText(centre.x, first.y + 3.5, caption, { 'font-size': num(size), fill: ink.chipText })
    : element(
      'g',
      { transform: `translate(${num(first.x)} ${num(centre.y)}) rotate(-90)` },
      svgText(0, 3.5, caption, { 'font-size': num(size), fill: ink.chipText }),
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
export function boardBox(points: readonly ChipPoint[], pitch: number): ChipBox {
  const alongX = chipAlongX(points);
  return boxOf(
    points,
    (alongX ? EDGE_ALONG : EDGE_ACROSS) * pitch,
    (alongX ? EDGE_ACROSS : EDGE_ALONG) * pitch,
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
  readonly caption: string;
  readonly scale: number;
  readonly ink: ChipInk;
  /** 板からはみ出す字を切る (盤面の話なので呼ぶ側が持つ)。 */
  readonly fit?: (text: string, at: ChipPoint, fontSize: number) => string;
};

/**
 * マイコンボード。**ピン名は基板の中に縦書きで置く**: 外に出すと、隣の列の穴
 * (実際に配線を挿すところ) を字が覆ってしまう。USB は必ずピン 1 の側の端に描く。
 * 実物のピンアウト図と同じ向きで読めるようにするため。
 */
export function boardChip(options: BoardChipOptions): string {
  const { points, names, definition, pinOne = 0, pitch, caption, scale, ink, fit } = options;
  const first = points[pinOne] ?? points[0];
  if (!first) return '';

  const box = boardBox(points, pitch);
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

  const labelSize = scale * 10;
  const label = boardLabel(caption, centre, chipSide, labelSize, alongX, ink, fit);

  return `${usb}${shell}${antenna(definition, box, centre, alongX, nearStart, ink.pin)}`
    + `${chip}${chipName}${stubs}${legends}${label}`;
}

/** 基板の名前。**チップの手前**に右揃えで置くので、伸びるのは 1 方向だけ。 */
function boardLabel(
  caption: string,
  centre: ChipPoint,
  chipSide: number,
  size: number,
  alongX: boolean,
  ink: ChipInk,
  fit?: BoardChipOptions['fit'],
): string {
  const gap = chipSide / 2 + 10;
  const at = alongX ? { x: centre.x - gap, y: centre.y } : { x: centre.x, y: centre.y - gap };
  const text = fit ? fit(caption, at, size) : caption;
  const style = { 'font-size': num(size), fill: ink.chipText, anchor: 'end' as const };
  return alongX
    ? svgText(at.x, at.y + 4, text, style)
    : element(
      'g',
      { transform: `translate(${num(at.x)} ${num(at.y)}) rotate(-90)` },
      svgText(0, 4, text, style),
    );
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
