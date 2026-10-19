import { CONNECTOR_PLATE, lookupConnector } from './connectors.ts';
import type { SipLook } from './chips.ts';
import type { BodyInk } from './ink.ts';
import { lookupPinout } from './pinouts.ts';
import { smdLook } from './smd.ts';
import { ADAPTER_BOARD } from './smdDraw.ts';

/**
 * **部品の基板の色** (部品の行の末尾の `blue`)。キットやモジュールの基板・変換基板は
 * 実物どおり緑や青で描くが、ユニバーサル基板も緑なので、同じ色だと基板の縁が
 * 図から読めない (52 の 05-etc 第 5 章の図3)。書く人が見分けの付く色を選べるようにする。
 *
 * **語彙はユニバーサル基板の `board: color:` と同じ** (perfboard の `render/finish.ts`)。
 * ただし `bare` (レジスト無しの生基板) は部品の基板には無いので外す。
 * 名前のほかは `#RRGGBB` (`#RGB`) の綴りだけを通す — 色は SVG の属性へそのまま流れる。
 */
export const PART_PLATE_COLORS: Record<string, string> = {
  green: '#2c7a4b',
  blue: '#1f5c9e',
  red: '#9e2b2b',
  black: '#26292c',
  white: '#e8eaec',
  yellow: '#c9a227',
  purple: '#5b3a86',
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/;

export const partPlateNames = (): readonly string[] => Object.keys(PART_PLATE_COLORS);

/** 書かれた色を実際の色に直す。名前でも `#RRGGBB` でもなければ null。 */
export function partPlateColor(text: string): string | null {
  const written = text.trim().toLowerCase();
  if (Object.hasOwn(PART_PLATE_COLORS, written)) return PART_PLATE_COLORS[written] ?? null;
  return HEX.test(written) ? written : null;
}

const channels = (color: string): readonly [number, number, number] => {
  const hex = color.replace('#', '');
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  const at = (i: number): number => Number.parseInt(full.slice(i, i + 2), 16);
  return [at(0), at(2), at(4)];
};

/** 縁の色。**塗りから作る** — 色ごとに縁の表を持たずに済む。 */
export function darkenColor(color: string, amount = 0.35): string {
  return `#${channels(color).map((value) => Math.round(value * (1 - amount)).toString(16).padStart(2, '0')).join('')}`;
}

/** 明るい色か (白い字が読めない色か)。明るさの目安は ITU-R BT.601。 */
export function isLightColor(color: string): boolean {
  const [r, g, b] = channels(color);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}

/** 明るい基板に刷るシルクの色 (白いシルクの代わり)。 */
const DARK_SILK = '#23272e';

/** 色を書ける部品か。種類の名前 (`sip8`)・姿 (`sop`)・値 (型番) で決まる。 */
export type PlatePart = {
  readonly type: string;
  readonly variant: string | null;
  readonly value: string | null;
};

const pinCountOf = (type: string): number => Number(/^(?:dip|sip)(\d+)$/.exec(type)?.[1] ?? 0);

/**
 * **基板を持つ部品だけが色を持つ。** USB の変換基板、面実装を載せた変換基板 (`sot23-dip`・`dip8/sop`)、
 * 型番が基板や胴を決める 1 列・2 列の部品 (`105404` のキット・KY-040 などのモジュール・3SK291 の変換基板)。
 * 抵抗や DIP の IC には基板が無いので、書いたら断る (黙って捨てると、効いたと思ったまま図が出る)。
 */
export function takesPlateColor(part: PlatePart): boolean {
  if (lookupConnector(part.type) !== null) return true;
  if (smdLook(part.variant)?.onAdapter === true) return true;
  const pins = pinCountOf(part.type);
  if (pins === 0) return false;
  const pinout = lookupPinout(part.value, pins);
  return pinout?.look !== undefined || pinout?.module !== undefined || pinout?.chip !== undefined;
}

/** 部品の行の末尾から色を外す。色の語でなければ null。 */
export function splitPlateColor(tail: readonly string[]): { readonly rest: readonly string[]; readonly color: string } | null {
  const last = tail.at(-1);
  if (last === undefined || partPlateColor(last) === null) return null;
  return { rest: tail.slice(0, -1), color: last };
}

/** 色を書けない部品に書いたときの言い方。両方のフェンスで同じ文にする。 */
export const plateColorRefusal = (id: string, color: string): string =>
  `${id} に基板の色 (${color}) は書けません。色を書けるのは、基板のある部品 (キットやモジュール・変換基板・USB の基板) だけです`;

/** 基板があり得る形か (1 列・2 列・USB・変換基板)。ここに書いた末尾の色の語は、値ではなく基板の色のつもり。 */
const mayHavePlate = (type: string, variant: string | null): boolean =>
  pinCountOf(type) > 0 || lookupConnector(type) !== null || smdLook(variant)?.onAdapter === true;

export type PlateColorRead = {
  /** 色を外した残り (値や型番)。 */
  readonly rest: readonly string[];
  /** 書かれたままの色の綴り。無ければ null。 */
  readonly color: string | null;
  /** 断る理由。色を書けない部品に書いたとき。 */
  readonly refusal: string | null;
};

/**
 * 部品の行の末尾の色を読む (perfboard と breadboard で同じ読み方)。
 * - 基板のある部品なら外して色にする
 * - 基板があり得る形 (`sipN` `dipN` USB 変換基板) なのに基板が無ければ断る (効かない色を黙って字にしない)
 * - それ以外 (LED の `blue` など) は値の続きとして残す
 *
 * `id` は呼ぶ側が報告用に整えた綴りを渡す。
 */
export function readPlateColor(id: string, type: string, variant: string | null, tail: readonly string[]): PlateColorRead {
  const split = splitPlateColor(tail);
  if (split === null) return { rest: tail, color: null, refusal: null };
  const value = split.rest.length === 0 ? null : split.rest.join(' ');
  if (takesPlateColor({ type, variant, value })) return { rest: split.rest, color: split.color, refusal: null };
  if (mayHavePlate(type, variant)) return { rest: tail, color: split.color, refusal: plateColorRefusal(id, split.color) };
  return { rest: tail, color: null, refusal: null };
}

/** 1 列のモジュールの胴を、書いた色で。 */
export const plateLook = (color: string): SipLook => ({ body: color, edge: darkenColor(color) });

/**
 * 変換基板の塗りを書いた色に差し替える塗り。**描く関数には手を入れない** —
 * 変換基板の色は決まった定数 (`ADAPTER_BOARD`・`CONNECTOR_PLATE`) から塗られるので、
 * 塗りの口でその定数だけを置き換える。明るい色では白いシルクを濃い色に替える (白い基板に白い字は読めない)。
 * **名前のある色 (帯・LED) は触らない** — それは基板ではない。
 */
export function plateInk(base: BodyInk, color: string): BodyInk {
  const edge = darkenColor(color);
  const light = isLightColor(color);
  const swap: Record<string, string> = {
    [ADAPTER_BOARD.fill]: color,
    [ADAPTER_BOARD.edge]: edge,
    [CONNECTOR_PLATE.fill]: color,
    [CONNECTOR_PLATE.edge]: edge,
    ...(light ? { [ADAPTER_BOARD.silk]: DARK_SILK, [CONNECTOR_PLATE.silk]: DARK_SILK } : {}),
  };
  return {
    paint: (painted, name) => (name !== undefined || !Object.hasOwn(swap, painted)
      ? base.paint(painted, name)
      : base.paint(swap[painted] as string)),
  };
}
