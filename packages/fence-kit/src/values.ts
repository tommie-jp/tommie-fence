/**
 * 抵抗値の読みとカラーコード。**実物の部品の話で、盤面には依らない**ので、
 * 穴のある盤面を描くフェンスが 2 つになった時点で引き上げた
 * (breadboard と perfboard)。中身は breadboard から 1 行も変えていない。
 */

const MULTIPLIERS: Record<string, number> = { r: 1, k: 1e3, m: 1e6 };

const DIGIT_COLORS = ['black', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'gray', 'white'];

const MULTIPLIER_COLORS: Record<number, string> = {
  [-2]: 'silver',
  [-1]: 'gold',
  0: 'black',
  1: 'brown',
  2: 'red',
  3: 'orange',
  4: 'yellow',
  5: 'green',
  6: 'blue',
  7: 'violet',
};

const PLAIN = /^(\d+(?:\.\d+)?)([rkm]?)$/i;
const INFIX = /^(\d+)([rkm])(\d+)$/i;

/** `10k` `4k7` `1R` `2.2M` などの抵抗値表記をオームに直す。読めなければ null。 */
export function parseOhms(text: string): number | null {
  const cleaned = text.trim().replace(/(Ω|Ω|ohms?)$/iu, '').trim();

  const infix = INFIX.exec(cleaned);
  if (infix) {
    const [, whole, unit, fraction] = infix;
    return Number(`${whole}.${fraction}`) * (MULTIPLIERS[(unit ?? 'r').toLowerCase()] ?? 1);
  }

  const plain = PLAIN.exec(cleaned);
  if (plain) {
    const [, digits, unit] = plain;
    const value = Number(digits) * (unit ? MULTIPLIERS[unit.toLowerCase()] ?? 1 : 1);
    return Number.isFinite(value) ? value : null;
  }

  return null;
}

/**
 * 許容差の帯の色。**既定は ±1% (茶)** — 金属皮膜 (金皮) の標準で、
 * いま手に入る抵抗のほとんどがこれ。カーボン皮膜なら `5` (金) を書く。
 */
const TOLERANCE_COLORS: Record<number, string> = {
  0.05: 'gray',
  0.1: 'violet',
  0.25: 'blue',
  0.5: 'green',
  1: 'brown',
  2: 'red',
  5: 'gold',
  10: 'silver',
};

/** 温度係数 (ppm/K) の帯の色。6 本目に来る。 */
const TEMPCO_COLORS: Record<number, string> = {
  250: 'black',
  100: 'brown',
  50: 'red',
  15: 'orange',
  25: 'yellow',
  20: 'green',
  10: 'blue',
  5: 'violet',
};

export const DEFAULT_TOLERANCE = 1;

/**
 * カラーコードの帯。**本数は書かれた値と付けた語で決まる。**
 *
 * - 2 桁で表せる値 (`10k` `4k7`) → **4 帯** (数字 2 + 乗数 + 許容差)。E24 の並び
 * - 3 桁要る値 (`4k99`) → **5 帯** (数字 3 + 乗数 + 許容差)。E96 の並び
 * - 温度係数を書いたとき → **6 帯** (5 帯 + 温度係数)
 * - 0Ω (ジャンパ) → **黒 1 本**
 *
 * 実物も同じ分かれ方をする。**桁数から決める**ので、書いた値がそのまま帯になり、
 * 「5 帯で描きたいから桁を足す」という書き換えが要らない。
 *
 * 色を持っていない許容差・温度係数は **null** を返す (勝手に近い値へ丸めない —
 * 実物と違う帯は、図を信じた人を間違えさせる)。
 */
export function resistorBands(
  ohms: number,
  options: { readonly tolerance?: number; readonly tempco?: number } = {},
): readonly string[] | null {
  // **0Ω (ジャンパ) は黒の帯 1 本。** 実物も許容差・温度係数の帯を持たない。
  if (ohms === 0) return options.tolerance === undefined && options.tempco === undefined ? ['black'] : null;
  if (!Number.isFinite(ohms) || ohms < 0) return null;

  const tolerance = TOLERANCE_COLORS[options.tolerance ?? DEFAULT_TOLERANCE];
  if (tolerance === undefined) return null;

  // **色を持っていない温度係数は断る** (近い値へ丸めると、実物と違う帯が出る)。
  const tail: string[] = [];
  if (options.tempco !== undefined) {
    const tempco = TEMPCO_COLORS[options.tempco];
    if (tempco === undefined) return null;
    tail.push(tempco);
  }

  // 2 桁で表せるか。表せない値だけ 3 桁にする (実物の E24 と E96 の分かれ方)。
  // **温度係数を書いたときは必ず 3 桁** — 6 帯は 5 帯に 1 本足した形なので、
  // 数字が 2 桁の 6 帯という実物は無い。
  const figures = options.tempco !== undefined || !fitsInFigures(ohms, 2) ? 3 : 2;
  const exponent = Math.floor(Math.log10(ohms));
  let digits = Math.round(ohms / 10 ** (exponent - figures + 1));
  let multiplier = exponent - figures + 1;
  if (digits >= 10 ** figures) {
    digits = Math.round(digits / 10);
    multiplier += 1;
  }

  const scale = MULTIPLIER_COLORS[multiplier];
  if (!scale) return null;

  const written: string[] = [];
  for (let place = figures - 1; place >= 0; place -= 1) {
    const color = DIGIT_COLORS[Math.floor(digits / 10 ** place) % 10];
    if (!color) return null;
    written.push(color);
  }

  return [...written, scale, tolerance, ...tail];
}

/** その桁数で書ける値か。丸めても同じ値に戻るなら書ける。 */
function fitsInFigures(ohms: number, figures: number): boolean {
  const exponent = Math.floor(Math.log10(ohms));
  const scale = 10 ** (exponent - figures + 1);
  return Math.abs(Math.round(ohms / scale) * scale - ohms) < ohms * 1e-9;
}

/** 3 本のカラーコード (数字 2 本 + 乗数 1 本)。表せない値は null。 */
export function resistorBandColors(ohms: number): readonly [string, string, string] | null {
  if (!Number.isFinite(ohms) || ohms <= 0) return null;

  const exponent = Math.floor(Math.log10(ohms));
  let digits = Math.round(ohms / 10 ** (exponent - 1));
  let multiplier = exponent - 1;
  if (digits >= 100) {
    digits = Math.round(digits / 10);
    multiplier += 1;
  }

  const first = DIGIT_COLORS[Math.floor(digits / 10)];
  const second = DIGIT_COLORS[digits % 10];
  const scale = MULTIPLIER_COLORS[multiplier];

  return first && second && scale ? [first, second, scale] : null;
}

/**
 * 値の綴りから、抵抗値と許容差と温度係数を読む。
 *
 *     10k          → 10kΩ、許容差は既定 (±1%)
 *     4k99 0.5%    → 4.99kΩ、±0.5%
 *     10k 1% 50ppm → 10kΩ、±1%、50ppm/K (6 帯)
 *
 * **抵抗として読めない綴りは null。** 読めなかったものを既定値で埋めると、
 * 書き間違いが図に出ないまま通る。
 */
export function parseResistor(text: string): {
  readonly ohms: number;
  readonly tolerance: number | undefined;
  readonly tempco: number | undefined;
} | null {
  const words = text.trim().split(/\s+/).filter((word) => word !== '');
  const [head, ...rest] = words;
  if (head === undefined) return null;

  const ohms = parseOhms(head);
  if (ohms === null) return null;

  let tolerance: number | undefined;
  let tempco: number | undefined;
  for (const word of rest) {
    const percent = /^±?([0-9]+(?:\.[0-9]+)?)%$/.exec(word);
    if (percent) {
      // **2 つ書かれたら後は見ない** (どちらが効くのか読む人にも決まらない)。
      if (tolerance !== undefined) return null;
      tolerance = Number(percent[1]);
      continue;
    }
    const ppm = /^([0-9]+)ppm(?:\/k)?$/i.exec(word);
    if (ppm) {
      if (tempco !== undefined) return null;
      tempco = Number(ppm[1]);
      continue;
    }
    // 値のうしろの語は帯にしか関わらないので、知らない語は**帯を描かない**印にする。
    return null;
  }

  return { ohms, tolerance, tempco };
}

/** 静電容量の単位。**基準は pF** — 3 桁のコードが pF で書かれているため。 */
const FARAD_UNITS: Record<string, number> = { p: 1, n: 1e3, u: 1e6, µ: 1e6, μ: 1e6, m: 1e9, f: 1e12 };

/**
 * 接頭辞か `F` の少なくとも一方が要る。**素の数 (`47`) は読まない** — pF のつもりか
 * F のつもりか決まらない (以前は pF で読み、circuit は F で読んでいた。直下の
 * CLAUDE.md の文法の方針 1)。
 */
const FARAD_PLAIN = /^([0-9]+(?:\.[0-9]+)?)\s*(?:([pnuµμm])f?|f)$/i;
const FARAD_INFIX = /^([0-9]+)([pnuµμ])([0-9]+)f?$/i;

/**
 * `100n` `0.1u` `10p` `4n7` などの静電容量をピコファラドに直す。読めなければ null。
 *
 * **接頭辞の無い素の数は null** (`47` も、3 桁コードの `104` も)。
 */
export function parsePicofarads(text: string): number | null {
  const cleaned = text.trim();

  const infix = FARAD_INFIX.exec(cleaned);
  if (infix) {
    const [, whole, unit, fraction] = infix;
    const scale = FARAD_UNITS[(unit ?? 'p').toLowerCase()] ?? 1;
    return Number(`${whole}.${fraction}`) * scale;
  }

  const plain = FARAD_PLAIN.exec(cleaned);
  if (!plain) return null;
  const [, digits, unit] = plain;
  const scale = FARAD_UNITS[(unit ?? 'f').toLowerCase()] ?? 1;
  const value = Number(digits) * scale;
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * コンデンサの 3 桁コード。**pF を「数字 2 桁 + 0 の数」で書いたもの**で、
 * `100n` (= 100,000pF) なら `104`。実物のセラミックにはこれが刷ってある。
 *
 * **10pF 未満は 3 桁で書けない** (実物も `4.7` のように直に刷る) ので null。
 * 3 桁に丸めると別の容量になる値も null — 実物と違う数字は、図を信じた人を
 * 間違えさせる。
 */
export const capacitorCode = (picofarads: number): string | null => threeDigitCode(picofarads);

/**
 * 3 桁コード。**基準の単位で「数字 2 桁 + 0 の数」**に書いたもの。
 * コンデンサは pF 基準 (`100n` = 100,000pF → `104`)、インダクタは µH 基準
 * (`100u` = 100µH → `101`)。実物の胴にはこれが刷ってある。
 *
 * **基準の 10 倍未満は 3 桁で書けない** (実物も `4.7` のように直に刷る) ので null。
 * 3 桁に丸めると別の値になるものも null — 実物と違う数字は、図を信じた人を
 * 間違えさせる。
 */
function threeDigitCode(value: number): string | null {
  if (!Number.isFinite(value) || value < 10) return null;

  const exponent = Math.floor(Math.log10(value)) - 1;
  const digits = Math.round(value / 10 ** exponent);
  if (digits < 10 || digits > 99 || exponent < 0 || exponent > 9) return null;
  // 丸めで別の値になっていないか。**近い値へ寄せない。**
  if (Math.abs(digits * 10 ** exponent - value) > value * 1e-9) return null;

  return `${digits}${exponent}`;
}

/** インダクタンスの単位。**基準は µH** — 3 桁のコードが µH で書かれているため。 */
const HENRY_UNITS: Record<string, number> = { n: 1e-3, u: 1, µ: 1, μ: 1, m: 1e3, h: 1e6 };

/** 接頭辞か `H` の少なくとも一方が要る。**素の数 (`470`) は読まない** (容量と同じ理由)。 */
const HENRY_PLAIN = /^([0-9]+(?:\.[0-9]+)?)\s*(?:([nuµμm])h?|h)$/i;
const HENRY_INFIX = /^([0-9]+)([nuµμm])([0-9]+)h?$/i;

/**
 * `100u` `10m` `4u7` などのインダクタンスをマイクロヘンリーに直す。読めなければ null。
 * **接頭辞の無い素の数は null。**
 */
export function parseMicrohenries(text: string): number | null {
  const cleaned = text.trim();

  const infix = HENRY_INFIX.exec(cleaned);
  if (infix) {
    const [, whole, unit, fraction] = infix;
    return Number(`${whole}.${fraction}`) * (HENRY_UNITS[(unit ?? 'u').toLowerCase()] ?? 1);
  }

  const plain = HENRY_PLAIN.exec(cleaned);
  if (!plain) return null;
  const [, digits, unit] = plain;
  const value = Number(digits) * (HENRY_UNITS[(unit ?? 'h').toLowerCase()] ?? 1);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * インダクタの 3 桁コード。**µH 基準** (`100u` なら `101`)。
 *
 * 実物の軸物インダクタには色帯のものもあるが、**帯にすると抵抗と見分けが付かない**
 * ので、図では数字で書く (形が同じ胴なので、色だけの違いでは読めない)。
 */
export const inductorCode = (microhenries: number): string | null => threeDigitCode(microhenries);

const RESISTOR_HINT = '抵抗値は 330 / 4k7 / 1M / 10k 5% のように書きます';
const CAPACITOR_HINT = '容量は 100n / 47p / 10u のように接頭辞を付けます';
const INDUCTOR_HINT = 'インダクタンスは 100u / 10m / 4u7 のように接頭辞を付けます';
const TOLERANCE_WORDS = Object.keys(TOLERANCE_COLORS).map(Number).sort((a, b) => a - b).join(' / ');
const TEMPCO_WORDS = Object.keys(TEMPCO_COLORS).map(Number).sort((a, b) => b - a).join(' / ');

/** 接頭辞も単位も無い数 (`47` `0.1` `.5`)。 */
const BARE_NUMBER = /^(?:\d+(?:\.\d+)?|\.\d+)$/;

/**
 * 部品の値の綴りを見て、**読めない・取り違えうる**なら断る理由を返す (無ければ null)。
 * breadboard と perfboard が同じ物を見る (直下の CLAUDE.md の文法の方針 1)。
 *
 * - **抵抗**: 読めない値 (`whatever`、許容差が 2 つ) と色帯の無い値 (`10k 3%`) は断る。
 *   以前は既定の帯 (茶黒黒金) を黙って描いていた。素の数 (`330`) は Ω に決まるので受ける
 * - **コンデンサ・インダクタ**: 頭の語が素の数なら断る (`47` は pF とも F とも読める)。
 *   頭が数でない語 (`電解`) はラベルとして受ける — 数として読んでいないので取り違えは無い
 */
export function partValueProblem(type: string, value: string | null): string | null {
  if (value === null || value.trim() === '') return null;
  if (type === 'resistor') return resistorValueProblem(value);
  const head = value.trim().split(/\s+/)[0] ?? '';
  if (!BARE_NUMBER.test(head)) return null;
  if (type === 'capacitor') return `容量に接頭辞がありません: ${head} (${CAPACITOR_HINT})`;
  if (type === 'inductor') return `インダクタンスに接頭辞がありません: ${head} (${INDUCTOR_HINT})`;
  return null;
}

function resistorValueProblem(value: string): string | null {
  const read = parseResistor(value);
  if (read === null) {
    const [head = '', ...rest] = value.trim().split(/\s+/);
    // 値は読めて、うしろの語 (許容差・温度係数) が読めないなら、そちらを言う。
    if (parseOhms(head) !== null) {
      return `抵抗値のうしろが読めません: ${rest.join(' ')} (許容差と温度係数は 1 つずつ。${RESISTOR_HINT})`;
    }
    return `抵抗値として読めません: ${head} (${RESISTOR_HINT})`;
  }
  if (read.tolerance !== undefined && TOLERANCE_COLORS[read.tolerance] === undefined) {
    return `許容差 ${read.tolerance}% の色帯はありません (書けるのは ${TOLERANCE_WORDS} %)`;
  }
  if (read.tempco !== undefined && TEMPCO_COLORS[read.tempco] === undefined) {
    return `温度係数 ${read.tempco}ppm の色帯はありません (書けるのは ${TEMPCO_WORDS} ppm)`;
  }
  if (resistorBands(read.ohms, read) === null) {
    return `抵抗値 ${value.trim()} は色帯で書けません (${RESISTOR_HINT})`;
  }
  return null;
}

/**
 * 周波数の読み書き。**vna と copper の 2 つが同じ物を持っていた**ので、綴りの
 * 受け方を揃えて引き上げた (scope が 3 つ目の使い手)。
 *
 * - **接頭辞は k・M・G だけ。** vna は `m` を M と読んでいたが、ミリと取り違えると
 *   10^9 倍違う値を黙って描く (直下の CLAUDE.md の文法の方針 1)。copper の断り方に揃えた
 * - **単位は `Hz` だけ** (`hz` `HZ` は受けない。正の書き方は 1 つ)
 * - 素の数 (`1000`) も受ける (vna の `sweep:`)。**単位の無い数を断る欄** (波の周波数) は
 *   呼ぶ側が素の数を先に断る — 接頭辞だけ (`100M`) と `Hz` 付き (`100MHz`) はどの欄でも同じに読む
 */
const HERTZ = /^(\d+(?:\.\d+)?|\.\d+)\s*([kMG]?)(Hz)?$/;
const HERTZ_SCALE: Readonly<Record<string, number>> = { '': 1, k: 1e3, M: 1e6, G: 1e9 };

/** 周波数を Hz に。読めなければ null。0 以下も null。 */
export function parseHertz(text: string): number | null {
  const found = HERTZ.exec(text.trim());
  if (found === null) return null;
  const value = Number(found[1]) * (HERTZ_SCALE[found[2] ?? ''] ?? 1);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** 周波数の単位 (Hz〜GHz)。 */
export const hertzUnit = (hz: number): readonly [number, string] => {
  const size = Math.abs(hz);
  if (size >= 1e9) return [1e9, 'GHz'];
  if (size >= 1e6) return [1e6, 'MHz'];
  if (size >= 1e3) return [1e3, 'kHz'];
  return [1, 'Hz'];
};

/** 読み値の綴り。**小数の桁を揃える** (既定 3 桁 — NanoVNA のマーカーの `10.000 MHz`)。 */
export function formatHertz(hz: number, digits = 3): string {
  const [scale, unit] = hertzUnit(hz);
  return `${(hz / scale).toFixed(digits)} ${unit}`;
}

/**
 * 目盛の綴り。**末尾の 0 を落とす** (`150 MHz` `1.5 GHz` `50 kHz`)。
 * `separator` は数と単位の間 (copper は詰めて `2.4GHz`)。
 */
export function formatHertzShort(hz: number, separator = ' '): string {
  const [scale, unit] = hertzUnit(hz);
  const value = Math.round((hz / scale) * 1000) / 1000;
  return `${value}${separator}${unit}`;
}
