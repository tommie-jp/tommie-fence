import { LIMITS } from '../limits.ts';

/**
 * グリッドの交点 1 つ。row は上から (a = 0)、col は左から (1 = 0) 数える。
 * 書き方は `a1` `b3`、交点の間なら `a1a5` `a1f5`。**この 0 始まりの形が
 * 中間モデルでの正**で、綴りは入口 (parseAddress) と出口 (formatAddress) にしか
 * 出てこない。交点の間は整数でない値になるので、row も col も整数とは限らない。
 */
export type Address = { readonly row: number; readonly col: number };

export type Point = { readonly x: number; readonly y: number };

/** 1 マスの大きさ (cm)。隣り合うマスの間に 2 端子部品 1 個が収まる。 */
export const DEFAULT_PITCH = 2;

/** 使える英字の数 (a〜z)。 */
const LETTER_COUNT = 26;
const FIRST_LETTER = 'a'.charCodeAt(0);

/** 最後の行。交点の間を書いても、この行より下へは出られない。 */
export const LAST_ROW = LIMITS.rows - 1;

/**
 * 行番号 (0 始まり) → 行の英字。**表計算の列名と同じ bijective base-26** で、
 * `z` の次は `aa`、`az` の次は `ba`、`zz` の次は `aaa` と桁が増える。
 *
 * 0 始まりの 26 進数**ではない**。`aa` は 26 進数として読むと 0 と同じ値に
 * なってしまい、`a` と区別が付かない。1 始まりの番号を毎回 1 引いてから
 * 割ることで、どの桁にも「0 に当たる字」が現れない綴りになる。
 *
 * 以前は英字 1 文字ぶんしか出せず、**z で頭打ち**だった (実機で「z 以降も
 * 作れるように」と頼まれた)。
 */
export function rowLetters(row: number): string {
  let count = Math.floor(row) + 1;
  let letters = '';
  while (count > 0) {
    count -= 1;
    letters = String.fromCharCode(FIRST_LETTER + (count % LETTER_COUNT)) + letters;
    count = Math.floor(count / LETTER_COUNT);
  }
  return letters;
}

/**
 * 行の英字 → 行番号 (0 始まり)。`rowLetters` の逆。
 * **必ず対で直すこと** — 片方だけ変えると、書いた綴りと読んだ場所が静かにずれる。
 */
export function rowOfLetters(letters: string): number {
  let count = 0;
  for (const letter of letters) count = count * LETTER_COUNT + (letter.charCodeAt(0) - FIRST_LETTER + 1);
  return count - 1;
}

/** 端数の 1 桁を表す英字。**`a` = 0** で、行の英字 (`a` = 0 行) と同じ数え方。 */
const FRACTION_LETTERS = 'abcdefghij';

/**
 * 番地の綴り。`a1` の後ろに**「行の英字 + 列の数字」の組**を足すと交点の間を指す
 * (`a1a5` は列が半分、`a1f0` は行が半分、`a1f5` は両方)。組 1 つで小数第 1 位、
 * 2 つで第 2 位まで — `LIMITS.addressDecimals` と同じ深さ。
 *
 * **英字と数字が交互に並ぶので区切りが要らない。** 以前は `_` で行と列を切って
 * 小数を書いていたが (旧 `a.5_1.5`)、番地から `.` が消えたことで
 * **`.` を含む綴りは足 (`U1.5`)** と 1 行で分かれるようになった。
 */
const ADDRESS = new RegExp(`^([a-z]+)([0-9]{1,3})((?:[a-j][0-9]){0,${LIMITS.addressDecimals}})$`);

/** 組が 1 つも無いのと同じ意味になる末尾。`a1a0` は `a1` と同じ場所。 */
const EMPTY_PAIR = 'a0';

/** 小数の桁で丸める。`1.1` のような値が計算のたびに末尾でぶれると、綴りが揺れる。 */
const round = (value: number): number => Number(value.toFixed(LIMITS.addressDecimals));

/** 組の並び → 行と列の端数。組 i は 10 の (i+1) 乗ぶんの 1 を刻む。 */
function stepsOfPairs(pairs: string): { readonly row: number; readonly col: number } {
  let row = 0;
  let col = 0;
  for (let at = 0; at < pairs.length; at += 2) {
    const scale = 10 ** (at / 2 + 1);
    row += FRACTION_LETTERS.indexOf(pairs[at] ?? 'a') / scale;
    col += Number(pairs[at + 1]) / scale;
  }
  return { row, col };
}

/**
 * `a1` `a1a5` `b2c7f5` の形の番地を読む。読めなければ null
 * (エラー文はどう使うかを知っている側で作る)。大小どちらで書いてもよい。
 *
 * 同じ場所の綴りは 1 つに保つ。末尾の組が `a0` (行も列もずれ無し) の綴りは
 * 通さない — 2 通りで書けると、ネットの名前も図どうしの突き合わせもその分だけ揺れる。
 */
export function parseAddress(text: string): Address | null {
  const matched = ADDRESS.exec(text.toLowerCase());
  if (!matched) return null;

  const [, letters = '', digits = '', pairs = ''] = matched;
  if (pairs.endsWith(EMPTY_PAIR)) return null;

  const steps = stepsOfPairs(pairs);
  return checked(rowOfLetters(letters) + steps.row, Number(digits) + steps.col);
}

/**
 * 図に置ける範囲に収まっているか見て、中間モデルの形にする。
 * 交点の間も**格子の内側だけ**。最終行の組は次の行が無いところを指すので通さない。
 */
function checked(row: number, column: number): Address | null {
  if (row < 0 || row > LAST_ROW) return null;
  if (column < 1 || column > LIMITS.columns) return null;

  return { row: round(row), col: round(column - 1) };
}

/** 端数を桁の並びにする (`0.25` → `25`)。丸めてから取るので、末尾がぶれない。 */
const digitsOfFraction = (value: number): string =>
  String(Math.round((value - Math.floor(value)) * 10 ** LIMITS.addressDecimals))
    .padStart(LIMITS.addressDecimals, '0');

/** 行と列の端数 → 組の並び。ずれが無ければ空 (`a1` のまま)。 */
function pairsText(row: number, column: number): string {
  const rowDigits = digitsOfFraction(row);
  const columnDigits = digitsOfFraction(column);

  let pairs = '';
  for (let at = 0; at < LIMITS.addressDecimals; at += 1) {
    pairs += (FRACTION_LETTERS[Number(rowDigits[at])] ?? 'a') + columnDigits[at];
  }
  // 末尾の空の組は書かない (1 つの場所に綴りは 1 つ)。
  return pairs.replace(new RegExp(`(?:${EMPTY_PAIR})+$`), '');
}

/**
 * 番地を綴りに戻す。交点の上なら `a1`、間なら `a1a5` `b2c7f5`。
 * **読んだときと同じ綴りに戻る**ことが、ネットの名前とエラー文の拠りどころ。
 */
export function formatAddress(address: Address): string {
  // 行は必ず格子の内側に収める。parseAddress は範囲を見ているが、この綴りは
  // TeX の座標名にもなるので、万一はみ出しても格子の外を指す名前を出さない。
  const row = Math.min(LAST_ROW, Math.max(0, round(address.row)));
  const column = round(address.col + 1);

  return `${rowLetters(row)}${Math.floor(column)}${pairsText(row, column)}`;
}

/** その行と列に綴りがあるなら、それ。格子の外なら null (案内に出さない)。 */
function spellingAt(row: number, column: number): string | null {
  const address = checked(row, column);
  return address === null ? null : formatAddress(address);
}

/** `_` で行と列を切って小数を書いていた頃の綴り (旧 `a.5_1.5` `a_1.25`)。 */
const OLD_BETWEEN = /^([a-z]+)(?:\.([0-9]+))?_([0-9]{1,3})(?:\.([0-9]+))?$/;
/** その頃の書き間違い (`a1_5` = 列の小数を `_` で切った形)。 */
const OLD_SLIP = /^([a-z]+)([0-9]{1,3})_([0-9]+)$/;
/** 番地に小数を書いた綴り (`a1.5`)。いまの文法では足の綴り。 */
const DECIMAL = /^([a-z]+)([0-9]{1,3})\.([0-9]+)$/;

const fractionOf = (digits: string | undefined): number => (digits === undefined ? 0 : Number(`0.${digits}`));

/**
 * 番地として読めなかった綴りへの案内。**近い書き間違いにだけ**返す (無ければ null)。
 *
 * LLM に書かせて自己修正させる用途では、間違いの指摘より**正しい綴りが
 * 返ること**が効く。ここで返せるのは「言われたとおりに直せば通る」形だけにする。
 */
export function addressHint(text: string): string | null {
  const lowered = text.toLowerCase();
  // 読める綴りに案内は要らない (呼び手は読めなかったときだけ聞くが、念のため)。
  if (parseAddress(lowered) !== null) return null;
  // 番地のつもりで書かれた綴りにだけ返す。`vin/2` のような書き間違いに
  // 組の話をしても、直す手がかりにならない。
  if (!/^[a-z][a-z0-9./_]*$/.test(lowered)) return null;

  // 分数の話をするのは、交点の間を書こうとした綴り (`_` がある) にだけ。
  if (lowered.includes('/')) {
    return lowered.includes('_')
      ? '分数では書けません (交点の間は 英字+数字 の組で書きます。行の英字は a〜j で a = 0)'
      : null;
  }

  const old = OLD_BETWEEN.exec(lowered) ?? OLD_SLIP.exec(lowered);
  if (old) {
    const [, letters = '', first, digits = '', second] = old;
    // `a1f5` は行の端数が先、`a1_5` は列の端数だけ (行の端数を書く場所が無い)。
    const isSlip = second === undefined && first !== undefined && OLD_SLIP.test(lowered);
    const rowStep = isSlip ? 0 : fractionOf(first);
    const columnStep = isSlip ? fractionOf(first) : fractionOf(second);
    if (tooFine(first) || tooFine(second)) return decimalsLimit();
    return suggest(
      spellingAt(rowOfLetters(letters) + rowStep, Number(digits) + columnStep),
      '交点の間は 英字+数字 の組で書きます',
      '行の英字は a〜j (a = 0)、列は 0〜9',
    );
  }

  const decimal = DECIMAL.exec(lowered);
  if (decimal) {
    const [, letters = '', digits = '', step = ''] = decimal;
    if (tooFine(step)) return decimalsLimit();
    return suggest(
      spellingAt(rowOfLetters(letters), Number(digits) + fractionOf(step)),
      '番地に小数は書きません (`.` は足の区切り)',
      '交点の間は 英字+数字 の組',
    );
  }

  const pairs = /^([a-z]+)([0-9]{1,3})((?:[a-z][0-9])+)$/.exec(lowered);
  if (pairs) {
    const [, letters = '', digits = '', written = ''] = pairs;
    if (/[k-z]/.test(written)) return '端数の英字は a〜j です (a = 0、j = 9)';
    if (written.length > LIMITS.addressDecimals * 2) {
      return `端数の組は ${LIMITS.addressDecimals} 個までです (組 1 つで 1/10、2 つで 1/100)`;
    }
    const steps = stepsOfPairs(written);
    return suggest(
      spellingAt(rowOfLetters(letters) + steps.row, Number(digits) + steps.col),
      '端数の無い組は書きません',
      '交点の上なら組は要らない',
    );
  }

  return null;
}

/** 小数の桁が文法より細かいか。`undefined` は書かれていないということ。 */
const tooFine = (digits: string | undefined): boolean => digits !== undefined && digits.length > LIMITS.addressDecimals;

const decimalsLimit = (): string =>
  `番地の端数は ${LIMITS.addressDecimals} 桁までです (組 1 つで 1/10、${LIMITS.addressDecimals} つで 1/100)`;

/**
 * 直し方の案内。**綴りを返すのは、その綴りが通るときだけ**。
 * 言われたとおりに直しても通らない案内は、自己修正のループを空回りさせる
 * (`a0.5` を組で書き直しても、1 より小さい列は無いので通らない)。
 */
function suggest(spelling: string | null, lead: string, fallback = lead): string | null {
  return spelling === null || parseAddress(spelling) === null ? null : `${lead} (${spelling}。${fallback})`;
}

/**
 * TikZ の座標に付ける名前。**綴りをそのまま使う**。
 * 番地は英字と数字だけなので、TikZ がノードの足 (`(U1.north)`) と読む `.` も、
 * 座標名に使えない `_` も出てこない。`a1` の形はそのまま通すので、
 * 交点だけで描いた図の TeX はこれまでと 1 バイトも変わらない。
 */
export const texNameOfAddress = (address: Address): string => formatAddress(address);

/** -0 を 0 に正す。TeX に `-0` と書かれると読みにくく、出力も揺れるため。 */
const normalize = (value: number): number => (value === 0 ? 0 : value);

/**
 * 番地を TikZ の座標にする。`a1` が原点で、列は右へ、行は下へ伸ばす
 * (TikZ の y は上が正なので行は負の向き)。
 */
export const toPoint = (address: Address, pitch: number): Point => ({
  x: normalize(address.col * pitch),
  y: normalize(-address.row * pitch),
});

/**
 * 座標を突き合わせるときの許容誤差。
 *
 * 交点の間の番地は 1/100 刻みの小数なので、掛け算の答えが 2 進小数に収まらない。
 * ちょうど線の上に乗っている点でも外積が 1e-14 ほど残り、**厳密に 0 かで見ると
 * 図では触れて見えるのにネットリストだけが割れる**。
 *
 * 絶対値で決め打てるのは、図の大きさに上限があるため。番地は 99 行 × 99 列
 * までなので、外積も内積も 1e4 を超えず、丸めの残りは 1e-12 に届かない。
 * 意味のある差 (番地の刻み 0.01 と、その積) はこの値よりずっと大きい。
 */
const EPSILON = 1e-9;

/** 丸めの残りを 0 とみなす。番地の間隔より十分に細かい幅でだけ通す。 */
export const isNearlyZero = (value: number): boolean => Math.abs(value) < EPSILON;

/**
 * 同じ交点か。2 端子部品も配線も、両端が同じだと向きも長さも決まらないので、
 * これだけは通さない。
 *
 * 斜め (行も列も揃っていない) は**通す**。回路図の定石は「配線は水平と垂直だけ」
 * だが、circuitikz は任意の角度に部品も線も引けるので、
 * 文法の側で禁じずに書き手の判断に任せる (2026-08-25 決定)。
 */
export const isSameAddress = (from: Address, to: Address): boolean =>
  isNearlyZero(from.row - to.row) && isNearlyZero(from.col - to.col);

/** 配線の引き方。TikZ と同じ 3 つだけ (学習コストを増やさない)。 */
export type WireOperator = '--' | '-|' | '|-';

/**
 * 折れた配線が曲がる場所。まっすぐな線と、曲がる場所が端と重なる並び
 * (同じ行どうしを `-|` で結んだときなど) では null。
 *
 * `-|` は先に横、`|-` は先に縦 (TikZ と同じ)。
 */
export function cornerOf(from: Address, to: Address, operator: WireOperator): Address | null {
  if (operator === '--') return null;

  const corner = operator === '-|' ? { row: from.row, col: to.col } : { row: to.row, col: from.col };
  // 端の上に乗る「曲がり」は曲がっていない。ここで外しておかないと、
  // ただの直線の端に分岐の黒丸が出てしまう。
  return isSameAddress(corner, from) || isSameAddress(corner, to) ? null : corner;
}
