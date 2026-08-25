/**
 * 部品の種類の表。パーサ (どう書けるか) と TeX 生成 (どう描くか) の両方がここを見る。
 * 表を 2 つに割ると片方だけ増えて食い違うので、1 か所に集める。
 * 種類を増やすときはここに 1 行足す。
 *
 * **記号は実機でコンパイルを確かめたものだけを載せる** (CLAUDE.md 約束 6)。
 * 特に `eC` (電解コンデンサ) はフォントが無く、例外ではなく
 * **プロセスごと落ちる**ことを実測している。載せてはいけない
 * (電解コンデンサは曲板の `cC` で描く。こちらは実機で通る)。
 */

import type { TexTarget } from './types.ts';

/**
 * 2 端子は `\draw (…) to[symbol] (…)`、1 端子と多端子は `\node[symbol] at (…)`。
 * 多端子だけがピンを持ち、配線から `U1.out` の形で指せる。
 */
export type PartKind = 'two-terminal' | 'one-terminal' | 'multi-terminal';

export type PartType = {
  readonly kind: PartKind;
  /** circuitikz の記号名。フェンスの TeX で描けるものに限る。 */
  readonly symbol: string;
  /**
   * 書き出す `.tex` で使う記号名。フェンスで代替に置き換えている種類だけが持つ。
   * 省くと symbol をそのまま使う (代替が要らない種類はこちら)。
   */
  readonly latexSymbol?: string;
  /**
   * 書ける名前 → circuitikz のアンカー名。
   * 回路図の慣習の短い名前 (`B` `C` `E`) も、アンカー名そのものも通す。
   * 多端子部品だけが持つ。
   */
  readonly pins?: Readonly<Record<string, string>>;
  /**
   * 値に補う単位 (TeX)。値が型番や状態で単位を持たない種類は null。
   * 数式モードに置くので、単位の綴りは必ず立体にする
   * (`F` のままだと変数の F になって斜体で出る)。
   */
  readonly unitTex: string | null;
  /**
   * 同じ単位の siunitx での綴り。書き出す `.tex` でだけ使う。
   * フェンスの TeX には siunitx が無い (実測) ので、そちらは unitTex で組む。
   * siunitx なら `u` が µ で出る。
   */
  readonly unitSi: string | null;
};

/** バイポーラトランジスタ。短い名前は回路図の慣習どおり。 */
const BJT_PINS = {
  b: 'base', base: 'base',
  c: 'collector', collector: 'collector',
  e: 'emitter', emitter: 'emitter',
} as const;

/** MOSFET。 */
const FET_PINS = {
  g: 'gate', gate: 'gate',
  d: 'drain', drain: 'drain',
  s: 'source', source: 'source',
} as const;

/** オペアンプ。circuitikz のアンカーがそのまま記号になっている。 */
const AMP_PINS = { '+': '+', '-': '-', out: 'out' } as const;

/** トランスは 1 次が A、2 次が B。 */
const TRANSFORMER_PINS = { a1: 'A1', a2: 'A2', b1: 'B1', b2: 'B2' } as const;

const OHM = '\\Omega';
const FARAD = '\\mathrm{F}';
const HENRY = '\\mathrm{H}';
const VOLT = '\\mathrm{V}';
const AMPERE = '\\mathrm{A}';

const SI_OHM = '\\ohm';
const SI_FARAD = '\\farad';
const SI_HENRY = '\\henry';
const SI_VOLT = '\\volt';
const SI_AMPERE = '\\ampere';

/** 単位を持たない種類 (値は型番や定格)。 */
const NO_UNIT = { unitTex: null, unitSi: null } as const;

export const PART_TYPES = {
  // 受動部品
  resistor: { kind: 'two-terminal', symbol: 'R', unitTex: OHM, unitSi: SI_OHM },
  capacitor: { kind: 'two-terminal', symbol: 'C', unitTex: FARAD, unitSi: SI_FARAD },
  /**
   * 電解コンデンサ (有極性)。`eC` はフォントが無くてプロセスごと落ちるので、
   * 曲板の `cC` で描く。**先に書いた番地が平板 (+) 側**になる。
   * 記号そのものが向きを表すので、+ の字は書き足さない
   * (斜めに置いたときに字を置く場所を決められず、値のラベルとも近すぎる)。
   */
  ecap: { kind: 'two-terminal', symbol: 'cC', unitTex: FARAD, unitSi: SI_FARAD },
  inductor: { kind: 'two-terminal', symbol: 'L', unitTex: HENRY, unitSi: SI_HENRY },

  // ダイオード類。値は型番 (1N4148 など) なので単位を足さない。
  diode: { kind: 'two-terminal', symbol: 'D', ...NO_UNIT },
  led: { kind: 'two-terminal', symbol: 'leD', ...NO_UNIT },
  zener: { kind: 'two-terminal', symbol: 'zD', ...NO_UNIT },

  // 電源
  vsource: { kind: 'two-terminal', symbol: 'V', unitTex: VOLT, unitSi: SI_VOLT },
  sine: { kind: 'two-terminal', symbol: 'sV', unitTex: VOLT, unitSi: SI_VOLT },
  isource: { kind: 'two-terminal', symbol: 'I', unitTex: AMPERE, unitSi: SI_AMPERE },
  battery: { kind: 'two-terminal', symbol: 'battery1', unitTex: VOLT, unitSi: SI_VOLT },

  // 回路を切るもの・光るもの
  switch: { kind: 'two-terminal', symbol: 'nos', ...NO_UNIT },
  fuse: { kind: 'two-terminal', symbol: 'fuse', ...NO_UNIT },
  lamp: { kind: 'two-terminal', symbol: 'lamp', ...NO_UNIT },

  // 記号
  port: { kind: 'one-terminal', symbol: 'ocirc', ...NO_UNIT },
  ground: { kind: 'one-terminal', symbol: 'ground', ...NO_UNIT },

  // 多端子。値は型番なので単位を足さない。
  npn: { kind: 'multi-terminal', symbol: 'npn', ...NO_UNIT, pins: BJT_PINS },
  pnp: { kind: 'multi-terminal', symbol: 'pnp', ...NO_UNIT, pins: BJT_PINS },
  nmos: { kind: 'multi-terminal', symbol: 'nmos', ...NO_UNIT, pins: FET_PINS },
  pmos: { kind: 'multi-terminal', symbol: 'pmos', ...NO_UNIT, pins: FET_PINS },
  /**
   * circuitikz の `op amp` は記号の中の小さな ± に 5pt の太字数式フォントが要り、
   * フェンス側の TeX には無い。例外ではなく**プロセスごと落ちる** (実測)。
   * 三角形だけの `plain amp` に置き換え、± は普通のノードとして書き足す
   * **アンカー名は op amp と同じ**なので、
   * 書き出す `.tex` では latexSymbol に戻すだけで本物の記号になる。
   */
  opamp: { kind: 'multi-terminal', symbol: 'plain amp', latexSymbol: 'op amp', ...NO_UNIT, pins: AMP_PINS },
  transformer: { kind: 'multi-terminal', symbol: 'transformer', ...NO_UNIT, pins: TRANSFORMER_PINS },
} as const satisfies Record<string, PartType>;

export type PartTypeName = keyof typeof PART_TYPES;

export const partTypeNames = (): readonly string[] => Object.keys(PART_TYPES);

export const lookupPartType = (name: string): PartType | null =>
  Object.hasOwn(PART_TYPES, name) ? PART_TYPES[name as PartTypeName] : null;

/**
 * その TeX で使う circuitikz の記号名。
 * 知らない種類は書かれた名前をそのまま返す (検証を通っていれば起きない)。
 */
export function symbolFor(typeName: string, target: TexTarget): string {
  const type = lookupPartType(typeName);
  if (type === null) return typeName;
  return target === 'latex' ? (type.latexSymbol ?? type.symbol) : type.symbol;
}

/**
 * 書かれたピン名を circuitikz のアンカー名にする。読めなければ null。
 * `Q1.B` も `Q1.base` も同じ足を指す。
 */
export function lookupPin(type: PartType, pin: string): string | null {
  const pins = type.pins;
  if (pins === undefined) return null;

  const wanted = pin.toLowerCase();
  return Object.hasOwn(pins, wanted) ? (pins[wanted] ?? null) : null;
}

/** その種類に書けるピン名 (短い名前と正式名の両方)。 */
export const pinNames = (type: PartType): readonly string[] => Object.keys(type.pins ?? {});

/**
 * 書き間違いとみなす編集距離。短い名前ほど厳しくする。
 * 一律に 2 まで許すと、`opamp` に `lamp` を勧めるような的外れが出る
 * (短い語どうしは 2 文字違えば別物)。
 */
const allowedDistance = (name: string): number => (name.length >= 6 ? 2 : 1);

/** 1 文字ずつの編集距離。種類の名前は短いので、素直に数えて足りる。 */
function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitute = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      row.push(Math.min(substitute, (previous[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1));
    }
    previous = row;
  }

  return previous[b.length] ?? 0;
}

/**
 * 書き間違えた種類に一番近い名前。無ければ null。
 * 種類が増えるほど「使えるのは…」の羅列は読みにくくなるので、
 * 近いものが 1 つあるならそれだけを添える (LLM に直させるときにも効く)。
 */
export function closestPartType(name: string): string | null {
  if (name.length === 0) return null;

  const wanted = name.toLowerCase();
  const limit = allowedDistance(wanted);
  let best: { name: string; score: number } | null = null;

  for (const candidate of partTypeNames()) {
    // 途中まで書いた名前も拾う (`induct` → `inductor`)。
    const score = candidate.startsWith(wanted) ? 0 : distance(wanted, candidate);
    if (score > limit) continue;
    if (best === null || score < best.score) best = { name: candidate, score };
  }

  return best?.name ?? null;
}
