import type { Lang } from '../lang.ts';
import type { SipLook } from './chips.ts';
import type { ModuleOutline } from './moduleOutline.ts';
import { BUNDLED_CARDS } from './cards/bundled.gen.ts';
import { chipRows } from './cards/convert.ts';
import { cardPinout } from './cards/scope.ts';

/**
 * DIP の IC のピンの名前の表 (52 の docs/95)。**型番で引いて、3 つのフェンスが
 * 同じ名前を刷る** — 回路図は箱の中に名前と番号、実体配線図は胴に番号と名前。
 * 書き手がピンの名前を並べるのではなく表から引くのは、綴りの誤りを黙って図に
 * 出さず「表に無い」というお知らせにするため (52 の docs/87 の #1)。
 *
 * **名前はメーカーのデータシートの端子図 (TOP VIEW) の印字を 1 つだけ** (`CV` `THR` のような略は入れない)。
 * 確かめた資料は各カードの `source:` にある (52 の docs/160 で、ここにあった資料の表から行ごとに移した)。
 *
 * **ピンの名前として書けない印字だけは直した** (`U1.TRIG` と書けて、番号と取り違えないため):
 *
 * - 印字の `–` (en dash) は ASCII の `-` (`IN-`)。キーボードで打てる字にする
 * - CD4017B の出力の印字は数字だけ (`0`〜`9`) なので `Q` を付ける (`Q0`〜`Q9`)。
 *   数字のままだと `U1.5` が 5 番のピンか出力 5 かで割れる
 * - 空白を含む印字は略す: CD4017B の `CARRY OUT` → `CO`、`CLOCK INHIBIT` → `INH`
 * - CD4040B の 10 番の印字 `φ` は、同じ系列の CD4017B の印字に合わせて `CLOCK`
 * - 論理ゲートの出力 (`J=A+B` `G=A` のような式) は、式の左辺の文字 (`J`) だけ。
 *   CD4070B の `J=A⊕B` も CD40106B の `G=A` (A の上に線) も同じ
 * - 上に線のある印字 (負論理) は、線を落としても 1 つに決まるならそのまま
 *   (NE555 の `RESET`、MCP3008 の `CS/SHDN`、74HC595 の `OE` `SRCLR`、CD4511B の `LT` `BL`
 *   `LE/STROBE` — `/` は印字のまま)。**線を落とすと
 *   別のピンと同じ名前になるものだけ** `/` を前に付ける: CD4013B の Q の上に線 → `/Q1` `/Q2`
 * - 印字の `,` は落とす: L293D の `1,2EN` → `12EN`、`3,4EN` → `34EN`
 *   (YAML のフロー形式の区切りと取り違えないため)
 * - L293D の 4・5・12・13 番の印字 `HEAT SINK AND GROUND` は、Pin Functions の名前 `GROUND`。
 *   4 本に同じ名前なので、TL071 の `NC` と同じく名前では指せず番号で出る
 * - 74HC595 の 9 番の印字 `QH′` (プライム) は ASCII の `'` (`QH'`)。下付きの字 (`Q_A` `C_IN`) は並べて書く
 *   (`QA` `CIN` `COUT`)
 * - **大文字と小文字だけが違う印字は分ける** (回路図はピンの名前を大文字小文字を問わず引くので、
 *   `A` と `a` は同じピンに読める): CD4511B の BCD 入力 `A`〜`D` は `INA`〜`IND`、
 *   セグメント出力 `a`〜`g` は `Oa`〜`Og`。**片方だけ変えると、もう片方の印字で書いた配線が
 *   黙って別のピンに付く** (`U1.a` が入力 A に) ので両方を変え、印字のままの `A` `a` はどちらも
 *   「知らないピン」として断らせる
 * - **同じ印字が 2 本にあり、2 本を別々に結ぶピンは番号を後ろに付けて分ける**: LM386 の 1・8 番の
 *   `GAIN` → `GAIN1` `GAIN8` (利得を決める C をこの 2 本の間に付ける。同じ名前のままだと
 *   名前では指せず、働きで並べる回路図の箱 `ic` にも置けない)。TL071 の `NC` のように
 *   どこにも結ばないピンは同じ名前のまま
 * - 74HC の型番は TI の `SN` を付けない綴りが代表 (教科書の書き方)。`SN74HC04N` も書ける
 *
 * **鍵は型番の完全一致** (大文字小文字は問わない)。接尾辞を削らないのは、
 * `TL071` (1 回路) と `TL072` (2 回路) を取り違えないため。同じ印字の型番は
 * 1 つの行に並べ、**先頭が代表の綴り**。印字が違えば行を分ける
 * (`TLC555` は電源が `VDD` なので `NE555` と別の行)。
 */

export type PinoutRow = {
  /** 書ける型番。**先頭が代表の綴り** (お知らせと早見表に出す)。 */
  readonly models: readonly string[];
  /** ピンの名前 (1 番から順)。本数がパッケージのピンの数。 */
  readonly names: readonly string[];
  /** 働きの名前 (データシートの題の働き: `2 入力 AND ×4`)。部品表に型番と並べて出す。 */
  readonly role: string;
  /** 文書の表に添える一言 (上に線のピンなど)。`npm run rows` が文書の表に書き出す (52 の docs/160)。 */
  readonly note?: string;
  /** 働きの英語 (部品カードの `role-en:`)。無ければ日本語の働きのまま。 */
  readonly roleEn?: string;
  /** 回路図の `ic` の箱の左右上下の割り振り (部品カードの `ic:`)。 */
  readonly ic?: IcSides;
  /** 置き方 (部品カードの `package:`。`dip14` `sip4` `dip28/wide`)。ギャラリーと文書の表が使う。 */
  readonly package?: string;
  /** 部品カードから読んだ行 (同梱のカードは `bundled`)。 */
  readonly card?: 'bundled' | 'local';
  /** 1 列の姿 (`sipN`) を樹脂の色と胴の字で描く部品。無ければ黒い 1 列ヘッダ。 */
  readonly look?: SipLook;
  /** 面実装しか無い型番の胴。`dipN` / `sipN` を**変換基板に載せた実寸の胴**で描く。 */
  readonly chip?: AdapterChip;
  /** 1 列のヘッダに載ったモジュールの外形 (基板と胴)。`sipN` の帯の脇に描く。 */
  readonly module?: ModuleOutline;
};

/**
 * 変換基板に載せて描く面実装の胴 (mm。上から見た姿)。ピンは 2 辺に同じ数ずつ並ぶ。
 * 寸法は実物の外形図から写す。
 */
export type AdapterChip = {
  /** 胴の長さ (ピンの並ぶ向き) と幅。 */
  readonly length: number;
  readonly width: number;
  /** ピン先からピン先。 */
  readonly span: number;
  /** 同じ辺のピンの間隔と、ピンの幅。 */
  readonly pitch: number;
  readonly lead: number;
  /** 1 本だけ幅の違うピン (向きの目印)。ピンの番号と幅。 */
  readonly wide?: { readonly pin: number; readonly lead: number };
  /** 胴の印字。 */
  readonly mark: string;
};

export type Pinout = {
  /** 代表の型番 (表の行の先頭)。 */
  readonly model: string;
  readonly names: readonly string[];
  readonly look?: SipLook;
  readonly chip?: AdapterChip;
  readonly module?: ModuleOutline;
  readonly ic?: IcSides;
};

/** 回路図の `ic` の箱の 4 辺に並べるピンの名前 (circuit-fence の `IcLayout` と同じ形)。 */
export type IcSides = {
  readonly left: readonly string[];
  readonly right: readonly string[];
  readonly top: readonly string[];
  readonly bottom: readonly string[];
};

/** 4 回路の 2 入力ゲート (CD4071B・CD4081B・CD4011B・CD4001B) は同じ並び。 */
/**
 * 行は同梱の部品カード (`packages/fence-kit/parts/chips/*.part.yaml`) に移した (52 の docs/160)。
 * 型番・ピンの名前・出典 (`source:`)・文書の表の注 (`note:`)・英語の働き (`role-en:`) は各カードにある。
 */

/**
 * 表の全部。**TS の行のあとに同梱の部品カード** (`packages/fence-kit/parts/*.part.yaml` を
 * `npm run cards` で焼いた物。52 の docs/158) をつなぐ。
 */
const ROWS: readonly PinoutRow[] = chipRows(BUNDLED_CARDS, 'bundled');

/** 型番 (大文字) → 行。`Map` にするのは `constructor` のような継ぎ物の名前を拾わないため。 */
const BY_MODEL: ReadonlyMap<string, PinoutRow> = new Map(
  ROWS.flatMap((row) => row.models.map((model) => [model.toUpperCase(), row] as const)),
);

/** 同梱の表、無ければ描いている間だけ有効な手元のカード (`withCards`)。 */
const rowOf = (model: string): PinoutRow | undefined =>
  BY_MODEL.get(model.trim().toUpperCase()) ?? cardPinout(model);

/**
 * 型番とピンの本数からピンの名前を引く。**表に無い型番、本数がパッケージと合わない
 * 型番は null** (呼ぶ側は番号で描き、お知らせを出す)。
 */
export function lookupPinout(model: string | null, pins: number): Pinout | null {
  if (model === null) return null;
  const row = rowOf(model);
  if (row === undefined || row.names.length !== pins) return null;
  return {
    model: row.models[0] ?? '', names: row.names,
    ...(row.look === undefined ? {} : { look: row.look }),
    ...(row.chip === undefined ? {} : { chip: row.chip }),
    ...(row.module === undefined ? {} : { module: row.module }),
    ...(row.ic === undefined ? {} : { ic: row.ic }),
  };
}

/**
 * 型番からピンの名前を引く (**本数は問わない**)。基板の外の機器 (`device`) の `model:` が使う —
 * 機器は穴に挿さないので、パッケージの本数と突き合わせる必要が無い。表に無い型番は null。
 */
export function lookupPinoutNames(model: string): { readonly model: string; readonly names: readonly string[] } | null {
  const row = rowOf(model);
  return row === undefined ? null : { model: row.models[0] ?? '', names: row.names };
}

/** 型番から働きの名前を引く (本数は問わない)。表に無い型番は null。 */
export function lookupRole(model: string | null, lang: Lang = 'ja'): string | null {
  if (model === null) return null;
  const row = rowOf(model);
  const role = row?.role ?? null;
  if (role === null || lang === 'ja') return role;
  return row?.roleEn ?? role;
}

/** 表にある型番 (行ごとに代表の綴り 1 つ)。本数を渡すとそのパッケージの行だけ。 */
export const pinoutModels = (pins?: number): readonly string[] =>
  ROWS.filter((row) => pins === undefined || row.names.length === pins).map((row) => row.models[0] ?? '');

/** 表の全部 (早見表と文法リファレンスに並べる)。 */
export const pinoutTable = (): readonly PinoutRow[] => ROWS;

/** ゲート 1 回路のピンの番号 (1 始まり)。入力は A・B・C … の順。 */
export type GateUnit = {
  readonly inputs: readonly number[];
  readonly output: number;
};

/** ゲートとして読む行の働きの名前。シフトレジスタなどの `1A` `1Y` に似た印字を拾わないため。 */
const GATE_ROLE = /\b(N?AND|N?OR|XN?OR|NOT)\b|インバータ|バッファ/;

/**
 * 型番のゲートの回路ごとのピンの番号 (`74HC00` → A: 1・2 → 3、B: 4・5 → 6 …)。
 * **ピンの名前の表から導く** (`1A` `1B` `1Y` の印字) ので、番号の表は別に持たない。
 * 表に無い型番・ゲートでない型番・出力の名前 (`Y`) が無い型番は null。
 * 74HC30 のように回路が 1 つだけの品は印字が `A`〜`H` と `Y`。
 */
export function lookupGateUnits(model: string | null): readonly GateUnit[] | null {
  if (model === null) return null;
  const row = rowOf(model);
  if (row === undefined || !GATE_ROLE.test(row.role)) return null;

  const units = new Map<number, { inputs: [string, number][]; output: number | null }>();
  const unitOf = (key: number) => {
    const found = units.get(key) ?? { inputs: [], output: null };
    units.set(key, found);
    return found;
  };
  row.names.forEach((name, index) => {
    const indexed = /^(\d)([A-H])$/.exec(name);
    if (indexed !== null) unitOf(Number(indexed[1])).inputs.push([indexed[2] ?? '', index + 1]);
    const out = /^(\d)Y$/.exec(name);
    if (out !== null) unitOf(Number(out[1])).output = index + 1;
    // 回路が 1 つだけの品 (74HC30)。
    if (/^[A-H]$/.test(name)) unitOf(0).inputs.push([name, index + 1]);
    if (name === 'Y') unitOf(0).output = index + 1;
  });

  // CD4000 系 (`A` `B` `J` …) は印字に回路の番号が無い。**入力の字が先 (A から)、出力の字がそのあと** で、
  // k 番目の回路は k 番目の入力の組と k 番目の出力。入力の数は働きの名前 (`2 入力`、`NOT` は 1)。

  const found = [...units.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([, unit]) => (unit.output === null || unit.inputs.length === 0
      ? []
      : [{ inputs: unit.inputs.sort(([a], [b]) => a.localeCompare(b)).map(([, pin]) => pin), output: unit.output }]));
  return found.length === 0 ? lettersUnits(row) : found;
}

/** CD4011B などの回路ごとのピン (字の並びから)。読めなければ null。 */
function lettersUnits(row: PinoutRow): readonly GateUnit[] | null {
  const arity = /(\d) 入力/.exec(row.role)?.[1] ?? (/\bNOT\b/.test(row.role) ? '1' : null);
  if (arity === null) return null;
  const inputsPerUnit = Number(arity);
  const letters = row.names
    .flatMap((name, index) => (/^[A-Z]$/.test(name) ? [[name, index + 1] as const] : []))
    .sort(([a], [b]) => a.localeCompare(b));
  const count = letters.length / (inputsPerUnit + 1);
  if (!Number.isInteger(count) || count === 0) return null;

  const pins = letters.map(([, pin]) => pin);
  const inputs = pins.slice(0, count * inputsPerUnit);
  const outputs = pins.slice(count * inputsPerUnit);
  return Array.from({ length: count }, (_, index) => ({
    inputs: inputs.slice(index * inputsPerUnit, (index + 1) * inputsPerUnit),
    output: outputs[index] ?? 0,
  }));
}

