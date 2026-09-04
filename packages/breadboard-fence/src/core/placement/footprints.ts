import type { BoardPart } from 'fence-kit';
import { boardPartNames, lookupBoardPart } from 'fence-kit';
import { aliasNames } from '../parts/aliases.ts';
import { safeToken } from '../errors.ts';

/** 部品の形。ここに無い種類は描けないので配置時にエラーにする。 */
export type Footprint =
  | { readonly kind: 'two-lead' }
  | { readonly kind: 'three-lead' }
  /** 溝をまたぐ 4 本足のスイッチ (6mm 角のタクトスイッチ)。 */
  | { readonly kind: 'switch' }
  | { readonly kind: 'dip'; readonly pins: number }
  | { readonly kind: 'sip'; readonly pins: number }
  | { readonly kind: 'board'; readonly board: BoardPart }
  | { readonly kind: 'device' };

/**
 * 2 本足の部品。名前は circuit-fence と揃えてある (同じノートで両方のフェンスを
 * 書くときに、頭の中の語彙を 1 つで済ませるため)。
 */
const TWO_LEAD_TYPES = new Set([
  'resistor', 'capacitor', 'led', 'diode', 'buzzer', 'crystal', 'inductor',
  // 抵抗体を円板に固めた部品。値は抵抗なので、キャプションの読み方も抵抗と同じ。
  'photoresistor', 'thermistor', 'thermistor-ntc', 'thermistor-ptc', 'varistor',
  // ダイオードの仲間。実物はどれも同じ形の胴で、カソード帯の位置が意味を持つ。
  'zener', 'schottky', 'photodiode', 'varicap', 'diac',
  // ガラス管・玉に封じた部品。
  'reed', 'fuse', 'lamp',
  // 同軸コネクタ。**足は中心導体と GND の 2 本**で書く (実物は GND が 4 本だが、
  // 図とネットリストで意味を持つのは「どこが中心でどこが GND か」の 2 つ)。
  // **板の縁に載せる横置きは perfboard だけ** — ブレッドボードに縁は無い。
  'sma',
]);
const THREE_LEAD_TYPES = new Set([
  'transistor', 'potentiometer', 'slide-switch', 'thyristor', 'triac',
  // 三端子レギュレータ。**perfboard と同じ綴り**で置けるようにしてある
  // (同じ回路を 2 つのフェンスで書くときに語彙を 1 つで済ませるため)。
  'regulator',
]);
/** タクトスイッチ。v0.2.0 の `pushbutton` は略記として `button` に畳んでから来る。 */
const SWITCH_TYPES = new Set(['button']);

const DIP_PATTERN = /^dip(\d+)$/;
const DIP_MIN_PINS = 4;
const DIP_MAX_PINS = 40;

const SIP_PATTERN = /^sip(\d+)$/;
// 1 本のヘッダは部品として意味を持たない。上限は dip に合わせる。
const SIP_MIN_PINS = 2;
const SIP_MAX_PINS = 40;

export function lookupFootprint(type: string): Footprint | null {
  if (TWO_LEAD_TYPES.has(type)) return { kind: 'two-lead' };
  if (THREE_LEAD_TYPES.has(type)) return { kind: 'three-lead' };
  if (SWITCH_TYPES.has(type)) return { kind: 'switch' };
  if (type === 'device') return { kind: 'device' };

  const board = lookupBoardPart(type);
  if (board) return { kind: 'board', board };

  const dip = DIP_PATTERN.exec(type);
  if (dip) {
    const pins = Number(dip[1]);
    if (pins >= DIP_MIN_PINS && pins <= DIP_MAX_PINS && pins % 2 === 0) return { kind: 'dip', pins };
  }

  const sip = SIP_PATTERN.exec(type);
  if (sip) {
    const pins = Number(sip[1]);
    // 片側だけの列なので、dip と違って奇数でよい。
    if (pins >= SIP_MIN_PINS && pins <= SIP_MAX_PINS) return { kind: 'sip', pins };
  }

  return null;
}

/**
 * 足の数が決まっていて、そのまま置ける種類。**`dipN` / `sipN` / ボード / 機器は
 * 入らない** (ピン数や名前を選ばないと置けない)。マップのパレットが引く。
 */
/**
 * パレットに出す**パッケージ物**。`dipN` / `sipN` は数を選べるが、一覧に全部
 * (4〜40) 並べても選べないので、**実物として売られている数**だけ出す。
 * ここに無い数も種類の欄に打てば置ける (文法は今までどおり全部読む)。
 */
const DIP_SIZES: readonly number[] = [4, 6, 8, 14, 16, 18, 20, 24, 28, 40];
const SIP_SIZES: readonly number[] = [2, 3, 4, 5, 6, 8, 10, 20, 40];

/** アンカー 1 つで置く形 (`@ 穴` と書く)。マップからは 1 クリックで置ける。 */
export const packageTypes = (): readonly string[] => [
  ...DIP_SIZES.map((pins) => `dip${pins}`),
  ...SIP_SIZES.map((pins) => `sip${pins}`),
  ...boardPartNames(),
];

export const placeableTypes = (): readonly string[] => [
  ...TWO_LEAD_TYPES, ...THREE_LEAD_TYPES, ...SWITCH_TYPES, ...packageTypes(),
];

export const knownPartTypes = (): readonly string[] => [
  ...TWO_LEAD_TYPES,
  ...THREE_LEAD_TYPES,
  ...SWITCH_TYPES,
  'dipN',
  'sipN',
  ...boardPartNames(),
  'device',
];

/**
 * 知らない種類だったときの案内。**種類が 30 を超えたので全部並べても読めない**ので、
 * 書き間違いに見えるものは候補を 1 つだけ返す (circuit-fence と同じ手口)。
 *
 * ピン数だけが範囲外の `dip9` に「dipN のことですか」と返しても直す手がかりに
 * ならないので、そこは範囲そのものを言う。
 */
export function describeUnknownType(type: string): string {
  // `capacitor/` や `/ceramic` は書きかけ。パーサは姿に割らずに丸ごと渡してくるので、
  // 全部の種類を並べるより、書き方そのものを見せたほうが直る。
  if (type.includes('/')) return '姿は「種類/姿」の形で書きます (例: capacitor/ceramic)';

  const dip = DIP_PATTERN.exec(type);
  if (dip) return `dip のピン数は ${DIP_MIN_PINS}〜${DIP_MAX_PINS} の偶数です`;

  const sip = SIP_PATTERN.exec(type);
  if (sip) return `sip のピン数は ${SIP_MIN_PINS}〜${SIP_MAX_PINS} です`;

  const near = closestPartType(type);
  if (near) return `${near} のことですか?`;
  return `使えるのは ${knownPartTypes().join(', ')}`;
}

/**
 * 書き間違いの候補。**略記も候補に入れる**: 打てば通る綴りなので、
 * `pushbuton` には `pushbutton` を返すのが一番近い直し方になる。
 */
export function closestPartType(wanted: string): string | null {
  const budget = editBudget(wanted);
  if (budget === 0) return null;

  let best: string | null = null;
  let bestDistance = budget + 1;
  for (const candidate of [...knownPartTypes(), ...aliasNames()]) {
    const distance = editDistance(wanted.toLowerCase(), candidate.toLowerCase(), bestDistance);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best === null ? null : safeToken(best);
}

/**
 * 何文字までの違いを「書き間違い」と見なすか。短い綴りに広い許容を与えると、
 * 無関係な名前 (`x` → `r`) を自信たっぷりに勧めてしまう。
 */
function editBudget(wanted: string): number {
  if (wanted.length <= 3) return 0;
  return wanted.length <= 6 ? 1 : 2;
}

/** レーベンシュタイン距離。`limit` を超えると分かった時点で打ち切る。 */
function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) >= limit) return limit;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        (previous[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
      row.push(value);
      best = Math.min(best, value);
    }
    if (best >= limit) return limit;
    previous = row;
  }
  return previous[b.length] ?? limit;
}
