/**
 * 部品の種類の表。パーサ (どう書けるか) と TeX 生成 (どう描くか) の両方がここを見る。
 * 表を 2 つに割ると片方だけ増えて食い違うので、1 か所に集める。
 * 種類を増やすときはここに 1 行足す。
 *
 * **記号は実機でコンパイルを確かめたものだけを載せる** (CLAUDE.md 約束 6)。
 * 落ちると分かっている記号は次の 2 つ。どちらもフォントが無く、例外ではなく
 * **プロセスごと落ちる** (実測)。載せてはいけない。
 *
 * - `eC` (電解コンデンサ) → 曲板の `cC` で描く (`ecap`)
 * - `ohmmeter` (抵抗計) → 代わりが無いので載せていない
 *   (`ammeter` と `voltmeter` は Ω が要らないので通る)
 *
 * **落ちなくても字形が壊れる記号がある**。こちらも載せない。
 *
 * - `op amp` → 三角形の `plain amp` + 手描きの ± に置き換えてある
 * - `thRn` / `thRp` (NTC / PTC サーミスタ) → 中の θ が `#` で出る。
 *   代わりが無いので `thR` (`thermistor`) だけを載せている
 */

import type { TexTarget } from './types.ts';

/**
 * 2 端子は `\draw (…) to[symbol] (…)`、1 端子と多端子は `\node[symbol] at (…)`。
 * 足を持つのは多端子と、**一部の 2 端子** (ポテンショメータのワイパー、
 * サイリスタのゲート)。どちらも配線から `U1.out` の形で指せる。
 */
export type PartKind = 'two-terminal' | 'one-terminal' | 'multi-terminal';

export type PartType = {
  readonly kind: PartKind;
  /**
   * 1 端子の記号で、ID を図のどこに出すか。出さない種類は省く。
   * `beside` は記号の横に添える (端子の白丸)、`inside` は記号そのものの
   * 文字として出す (電源レールの矢印の先)。
   * **ID を図に出す記号は、乗っているネットに名前も与える** (nets.ts)。
   */
  readonly idLabel?: 'beside' | 'inside';
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
   * **これを持つ部品だけが足を指される** (種類が多端子かどうかではない)。
   */
  readonly pins?: Readonly<Record<string, string>>;
  /**
   * 記号に必ず付ける circuitikz のオプション (DIP の足の本数など)。
   * 書き手が触れるものではないので、向き (`+up`) とは別に持つ。
   */
  readonly options?: readonly string[];
  /**
   * 型番を記号の**中**に書く種類。省くと記号の下に出る。
   * 箱で描く IC は中に書ける (そのほうが回路図の慣習に近い)。
   */
  readonly valueInside?: boolean;
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

/** IGBT。制御端子はゲートだが、あとの 2 本はバイポーラと同じ呼び名。 */
const IGBT_PINS = {
  g: 'gate', gate: 'gate',
  c: 'collector', collector: 'collector',
  e: 'emitter', emitter: 'emitter',
} as const;

/** 入力 2 本のロジックゲート。番号でも `a` `b` でも呼べる。 */
const GATE2_PINS = {
  '1': 'in 1', in1: 'in 1', a: 'in 1',
  '2': 'in 2', in2: 'in 2', b: 'in 2',
  out: 'out', y: 'out',
} as const;

/** 入力 1 本のロジックゲート (`not` / `buffer`)。 */
const GATE1_PINS = { in: 'in', a: 'in', out: 'out', y: 'out' } as const;

/** 切り替えスイッチ。共通が `in`、行き先が 2 つ。 */
const SPDT_PINS = {
  in: 'in', c: 'in', com: 'in',
  '1': 'out 1', out1: 'out 1',
  '2': 'out 2', out2: 'out 2',
} as const;

/** ポテンショメータの 3 本目。2 端子の記号にアンカーが 1 つ生えている。 */
const WIPER_PINS = { w: 'wiper', wiper: 'wiper' } as const;

/** サイリスタ・トライアックの引き金。こちらも 2 端子 + アンカー 1 つ。 */
const GATE_PINS = { g: 'gate', gate: 'gate' } as const;

/** トランスは 1 次が A、2 次が B。 */
const TRANSFORMER_PINS = { a1: 'A1', a2: 'A2', b1: 'B1', b2: 'B2' } as const;

const OHM = '\\Omega';
const FARAD = '\\mathrm{F}';
const HENRY = '\\mathrm{H}';
const VOLT = '\\mathrm{V}';
const AMPERE = '\\mathrm{A}';
const HERTZ = '\\mathrm{Hz}';

const SI_OHM = '\\ohm';
const SI_FARAD = '\\farad';
const SI_HENRY = '\\henry';
const SI_VOLT = '\\volt';
const SI_AMPERE = '\\ampere';
const SI_HERTZ = '\\hertz';

/** 単位を持たない種類 (値は型番や定格)。 */
const NO_UNIT = { unitTex: null, unitSi: null } as const;

/**
 * DIP の IC。足は本数ぶんの番号で呼ぶ (`U1.1`)。
 * 本数はパッケージごとに決まっているので、種類の名前に入れて表に並べる
 * (文法に本数の欄を足すより、`dip8` と書けるほうが短い)。
 */
const dipchip = (count: number): PartType => ({
  kind: 'multi-terminal',
  symbol: 'dipchip',
  // 型番は箱の中に書くので、既定の大きさだと足の番号に重なる (実機で確認)。
  options: [`num pins=${count}`, 'font=\\scriptsize'],
  valueInside: true,
  ...NO_UNIT,
  pins: Object.fromEntries(Array.from({ length: count }, (_, index) => [`${index + 1}`, `pin ${index + 1}`])),
});

export const PART_TYPES = {
  // 受動部品
  resistor: { kind: 'two-terminal', symbol: 'R', unitTex: OHM, unitSi: SI_OHM },
  /** 2 端子の可変抵抗。3 本目の足が要るなら potentiometer のほう。 */
  'resistor-var': { kind: 'two-terminal', symbol: 'vR', unitTex: OHM, unitSi: SI_OHM },
  /**
   * ポテンショメータ (3 端子の可変抵抗)。両端は番地で置き、ワイパーは
   * `P1.w` で指す。**ワイパーは記号の上側に出る**ので、線は上へ引く。
   */
  potentiometer: { kind: 'two-terminal', symbol: 'potentiometer', unitTex: OHM, unitSi: SI_OHM, pins: WIPER_PINS },
  capacitor: { kind: 'two-terminal', symbol: 'C', unitTex: FARAD, unitSi: SI_FARAD },
  /**
   * 電解コンデンサ (有極性)。`eC` はフォントが無くてプロセスごと落ちるので、
   * 曲板の `cC` で描く。**先に書いた番地が平板 (+) 側**になる。
   * 記号そのものが向きを表すので、+ の字は書き足さない
   * (斜めに置いたときに字を置く場所を決められず、値のラベルとも近すぎる)。
   */
  ecap: { kind: 'two-terminal', symbol: 'cC', unitTex: FARAD, unitSi: SI_FARAD },
  /** バリキャップ (可変容量ダイオード)。値は容量なので F を足す。 */
  varicap: { kind: 'two-terminal', symbol: 'varcap', unitTex: FARAD, unitSi: SI_FARAD },
  inductor: { kind: 'two-terminal', symbol: 'L', unitTex: HENRY, unitSi: SI_HENRY },

  // 感じるもの。抵抗の仲間なので値には Ω が付く。
  photoresistor: { kind: 'two-terminal', symbol: 'phR', unitTex: OHM, unitSi: SI_OHM },
  /**
   * サーミスタ。NTC / PTC の区別 (`thRn` / `thRp`) は載せていない。
   * **コンパイルは通るが字形が壊れる**: 記号の中の θ が tiny の数式フォントで、
   * フェンスの TeX には字形が無く `#` で出る (実測。`op amp` の ± と同じ)。
   * 区別が要るなら値か ID に書く (`R4: thermistor c1 c3 10k`)。
   */
  thermistor: { kind: 'two-terminal', symbol: 'thR', unitTex: OHM, unitSi: SI_OHM },
  /** バリスタ。値は型番か動作電圧なので単位を足さない。 */
  varistor: { kind: 'two-terminal', symbol: 'varistor', ...NO_UNIT },

  /** 水晶振動子・セラミック振動子。値は周波数 (`16M` → 16 MHz)。 */
  crystal: { kind: 'two-terminal', symbol: 'piezoelectric', unitTex: HERTZ, unitSi: SI_HERTZ },

  // ダイオード類。値は型番 (1N4148 など) なので単位を足さない。
  diode: { kind: 'two-terminal', symbol: 'D', ...NO_UNIT },
  led: { kind: 'two-terminal', symbol: 'leD', ...NO_UNIT },
  zener: { kind: 'two-terminal', symbol: 'zD', ...NO_UNIT },
  schottky: { kind: 'two-terminal', symbol: 'sD', ...NO_UNIT },
  photodiode: { kind: 'two-terminal', symbol: 'pD', ...NO_UNIT },
  /** ダイアック (双方向ダイオード)。トライアックの引き金に使う。 */
  diac: { kind: 'two-terminal', symbol: 'biD', ...NO_UNIT },
  /**
   * サイリスタ (SCR) とトライアック。ゲートは `T1.g` で指す。
   * 両端は番地で置くので、足として指せるのはゲートだけ。
   */
  thyristor: { kind: 'two-terminal', symbol: 'thyristor', ...NO_UNIT, pins: GATE_PINS },
  triac: { kind: 'two-terminal', symbol: 'triac', ...NO_UNIT, pins: GATE_PINS },

  // 電源
  vsource: { kind: 'two-terminal', symbol: 'V', unitTex: VOLT, unitSi: SI_VOLT },
  sine: { kind: 'two-terminal', symbol: 'sV', unitTex: VOLT, unitSi: SI_VOLT },
  square: { kind: 'two-terminal', symbol: 'sqV', unitTex: VOLT, unitSi: SI_VOLT },
  triangle: { kind: 'two-terminal', symbol: 'vsourcetri', unitTex: VOLT, unitSi: SI_VOLT },
  isource: { kind: 'two-terminal', symbol: 'I', unitTex: AMPERE, unitSi: SI_AMPERE },
  battery: { kind: 'two-terminal', symbol: 'battery1', unitTex: VOLT, unitSi: SI_VOLT },
  /** 太陽電池。 */
  solar: { kind: 'two-terminal', symbol: 'pvsource', unitTex: VOLT, unitSi: SI_VOLT },

  // 回路を切るもの・光るもの・鳴るもの
  /** `switch` は a 接点 (押すと閉じる)、`-nc` が付くほうは b 接点。 */
  switch: { kind: 'two-terminal', symbol: 'nos', ...NO_UNIT },
  'switch-nc': { kind: 'two-terminal', symbol: 'ncs', ...NO_UNIT },
  button: { kind: 'two-terminal', symbol: 'nopb', ...NO_UNIT },
  'button-nc': { kind: 'two-terminal', symbol: 'ncpb', ...NO_UNIT },
  reed: { kind: 'two-terminal', symbol: 'reed', ...NO_UNIT },
  fuse: { kind: 'two-terminal', symbol: 'fuse', ...NO_UNIT },
  lamp: { kind: 'two-terminal', symbol: 'lamp', ...NO_UNIT },
  speaker: { kind: 'two-terminal', symbol: 'loudspeaker', ...NO_UNIT },
  mic: { kind: 'two-terminal', symbol: 'mic', ...NO_UNIT },

  /**
   * 測るもの。抵抗計 (`ohmmeter`) は記号の中の Ω にフォントが要り、
   * **プロセスごと落ちる** (実測) ので入れていない。
   */
  ammeter: { kind: 'two-terminal', symbol: 'ammeter', ...NO_UNIT },
  voltmeter: { kind: 'two-terminal', symbol: 'voltmeter', ...NO_UNIT },

  // 記号
  port: { kind: 'one-terminal', symbol: 'ocirc', idLabel: 'beside', ...NO_UNIT },
  ground: { kind: 'one-terminal', symbol: 'ground', ...NO_UNIT },
  /**
   * 電源レール。名前は記号そのものの文字として出る。
   * グラウンドと違って**離して描いても自動ではつながらない**
   * (5V と 3V3 を同じ節点にしてしまうため)。つなぐなら配線を引く。
   */
  vcc: { kind: 'one-terminal', symbol: 'vcc', idLabel: 'inside', ...NO_UNIT },
  vee: { kind: 'one-terminal', symbol: 'vee', idLabel: 'inside', ...NO_UNIT },

  // 多端子。値は型番なので単位を足さない。
  npn: { kind: 'multi-terminal', symbol: 'npn', ...NO_UNIT, pins: BJT_PINS },
  pnp: { kind: 'multi-terminal', symbol: 'pnp', ...NO_UNIT, pins: BJT_PINS },
  nmos: { kind: 'multi-terminal', symbol: 'nmos', ...NO_UNIT, pins: FET_PINS },
  pmos: { kind: 'multi-terminal', symbol: 'pmos', ...NO_UNIT, pins: FET_PINS },
  /**
   * FET の残り。書くほうは回路図の言葉 (接合型 = `jfet`、エンハンスメント型 =
   * `-e`、デプレッション型 = `-d`)、描くほうは circuitikz の綴り (`igfet`)。
   * 上の `nmos` / `pmos` はチャネルを 1 本で描いた簡易記号で、
   * これはこれで記事でよく使うので残してある。
   *
   * circuitikz 1.0 には**デプレッション型 + ボディ端子の記号が無い** (実測)。
   * ボディ端子つきは載せていない (足がゲートと同じ側に出て図が読みにくい)。
   */
  njfet: { kind: 'multi-terminal', symbol: 'njfet', ...NO_UNIT, pins: FET_PINS },
  pjfet: { kind: 'multi-terminal', symbol: 'pjfet', ...NO_UNIT, pins: FET_PINS },
  'nmos-e': { kind: 'multi-terminal', symbol: 'nigfete', ...NO_UNIT, pins: FET_PINS },
  'pmos-e': { kind: 'multi-terminal', symbol: 'pigfete', ...NO_UNIT, pins: FET_PINS },
  'nmos-d': { kind: 'multi-terminal', symbol: 'nigfetd', ...NO_UNIT, pins: FET_PINS },
  'pmos-d': { kind: 'multi-terminal', symbol: 'pigfetd', ...NO_UNIT, pins: FET_PINS },
  /**
   * circuitikz の `op amp` は記号の中の小さな ± に 5pt の太字数式フォントが要り、
   * フェンス側の TeX には無い。例外ではなく**プロセスごと落ちる** (実測)。
   * 三角形だけの `plain amp` に置き換え、± は普通のノードとして書き足す
   * **アンカー名は op amp と同じ**なので、
   * 書き出す `.tex` では latexSymbol に戻すだけで本物の記号になる。
   */
  opamp: { kind: 'multi-terminal', symbol: 'plain amp', latexSymbol: 'op amp', ...NO_UNIT, pins: AMP_PINS },
  transformer: { kind: 'multi-terminal', symbol: 'transformer', ...NO_UNIT, pins: TRANSFORMER_PINS },
  nigbt: { kind: 'multi-terminal', symbol: 'nigbt', ...NO_UNIT, pins: IGBT_PINS },
  pigbt: { kind: 'multi-terminal', symbol: 'pigbt', ...NO_UNIT, pins: IGBT_PINS },
  /** 切り替えスイッチ (c 接点)。 */
  spdt: { kind: 'multi-terminal', symbol: 'spdt', ...NO_UNIT, pins: SPDT_PINS },

  // ロジックゲート。入力は番号でも `a` / `b` でも呼べる。
  and: { kind: 'multi-terminal', symbol: 'and port', ...NO_UNIT, pins: GATE2_PINS },
  or: { kind: 'multi-terminal', symbol: 'or port', ...NO_UNIT, pins: GATE2_PINS },
  nand: { kind: 'multi-terminal', symbol: 'nand port', ...NO_UNIT, pins: GATE2_PINS },
  nor: { kind: 'multi-terminal', symbol: 'nor port', ...NO_UNIT, pins: GATE2_PINS },
  xor: { kind: 'multi-terminal', symbol: 'xor port', ...NO_UNIT, pins: GATE2_PINS },
  xnor: { kind: 'multi-terminal', symbol: 'xnor port', ...NO_UNIT, pins: GATE2_PINS },
  not: { kind: 'multi-terminal', symbol: 'not port', ...NO_UNIT, pins: GATE1_PINS },
  buffer: { kind: 'multi-terminal', symbol: 'buffer port', ...NO_UNIT, pins: GATE1_PINS },

  // DIP の IC。足の本数だけが違う。
  dip8: dipchip(8),
  dip14: dipchip(14),
  dip16: dipchip(16),
  dip20: dipchip(20),
  dip28: dipchip(28),
  dip40: dipchip(40),
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

/** 数字だけの足を範囲でまとめるかどうかの境目。これを超えると並べても読めない。 */
const LISTED_PINS = 4;

/**
 * 「書ける足はこれです」と伝えるときの並べ方。
 * DIP のように数字だけの足は範囲にまとめる (40 本を並べても読めない)。
 */
export function pinHint(type: PartType): string {
  const names = pinNames(type);
  const numbered = names.length > LISTED_PINS && names.every((name) => /^\d+$/.test(name));

  return numbered ? `1〜${names.length}` : names.join(' / ');
}

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
