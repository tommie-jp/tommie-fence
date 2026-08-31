import { safeToken } from '../errors.ts';
import { STYLE_RANGES } from '../limits.ts';
import type { StyleRange, StyleSpec } from '../types.ts';

/** 何も指定されていない状態。テーマは classic、大きさも色も既定のまま。 */
export const EMPTY_STYLE: StyleSpec = {
  theme: null,
  textSize: null,
  textColor: null,
  textBackground: null,
  wireWidth: null,
  boardColor: null,
  holeSize: null,
  holeColor: null,
  width: null,
  debug: null,
  stamp: null,
  line: null,
};

/**
 * 読めなかった理由と、それがどの項目のものか。
 * 行番号は YAML の節を持っている側 (parseFence) が key から引く。
 */
export type StyleMessage = {
  readonly message: string;
  readonly key: string | null;
  /** 読めてはいるが、書いたとおりには出ないという知らせ (端へ寄せた、など)。 */
  readonly notice?: boolean;
};

export type StyleValidation = { readonly value: StyleSpec; readonly messages: readonly StyleMessage[] };

/**
 * 色は `#rgb` / `#rrggbb` だけを受ける。名前や `rgb()` を通すと、
 * 検証済みの値しか属性に入れないという約束 (render/svg.ts) が崩れる。
 * 名前で選びたいときは、色ではなくテーマを指定してもらう。
 */
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export const STYLE_KEYS = [
  'theme', 'text-size', 'text-color', 'text-background',
  'wire-width', 'board-color', 'hole-size', 'hole-color', 'width', 'debug', 'stamp',
] as const;

const isRecord = (raw: unknown): raw is Record<string, unknown> =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw);

/** `#abc` を `#aabbcc` に伸ばして小文字に揃える。下流が 1 つの形だけを見ればよくなる。 */
const normaliseColor = (text: string): string => {
  const body = text.slice(1).toLowerCase();
  return `#${body.length === 3 ? [...body].map((digit) => digit + digit).join('') : body}`;
};

const readColor = (raw: unknown, key: string, messages: StyleMessage[]): string | null => {
  if (typeof raw !== 'string' || !HEX_COLOR.test(raw)) {
    // 読めなかった値は図に書き戻さない (配線の色名と同じ扱い)。書ける形だけを示す。
    //
    // **値が空なら、たいてい YAML のコメントに食われている**。`text-color: #333` は
    // `#` から先がコメントなので値が null になり、書いた本人には書いたとおりに見える。
    // ここで気づけないと直しようがないので、囲み方まで添える。
    const eaten = raw === null || raw === undefined
      ? ' (`#` から始まる値は "…" で囲みます。囲まないと YAML のコメントになります)'
      : '';
    messages.push({ message: `style の ${key} は色として読めません (#rgb か #rrggbb で書きます)${eaten}`, key });
    return null;
  }
  return normaliseColor(raw);
};

const readFlag = (raw: unknown, key: string, messages: StyleMessage[]): boolean | null => {
  if (raw === 'on') return true;
  if (raw === 'off') return false;
  messages.push({ message: `style の ${key} は on か off です`, key });
  return null;
};

const readSize = (raw: unknown, key: string, range: StyleRange, messages: StyleMessage[]): number | null => {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    messages.push({ message: `style の ${key} は ${range.min}〜${range.max} の数値で書きます`, key });
    return null;
  }
  const clamped = Math.min(Math.max(raw, range.min), range.max);
  // 範囲外は捨てずに端へ寄せる。書いた意図 (もっと大きく / 小さく) は残るほうがよい。
  if (clamped !== raw) {
    messages.push({
      message: `style の ${key} は ${range.min}〜${range.max} です (${clamped} にしました)`,
      key,
      notice: true,
    });
  }
  return clamped;
};

const readName = (raw: unknown, key: string, messages: StyleMessage[]): string | null => {
  if (typeof raw !== 'string') {
    messages.push({ message: `style の ${key} はテーマの名前です`, key });
    return null;
  }
  return raw;
};

/** 1 項目を読んで指定に足す。読めなければ理由を積んで、それまでの指定をそのまま返す。 */
function withKey(style: StyleSpec, key: string, raw: unknown, messages: StyleMessage[]): StyleSpec {
  const size = (range: StyleRange): number | null => readSize(raw, key, range, messages);
  const color = (): string | null => readColor(raw, key, messages);

  switch (key) {
    case 'theme':
      return { ...style, theme: readName(raw, key, messages) ?? style.theme };
    case 'text-size':
      return { ...style, textSize: size(STYLE_RANGES.textSize) ?? style.textSize };
    case 'text-color':
      return { ...style, textColor: color() ?? style.textColor };
    case 'text-background':
      return { ...style, textBackground: color() ?? style.textBackground };
    case 'wire-width':
      return { ...style, wireWidth: size(STYLE_RANGES.wireWidth) ?? style.wireWidth };
    case 'board-color':
      return { ...style, boardColor: color() ?? style.boardColor };
    case 'hole-size':
      return { ...style, holeSize: size(STYLE_RANGES.holeSize) ?? style.holeSize };
    case 'hole-color':
      return { ...style, holeColor: color() ?? style.holeColor };
    case 'width':
      return { ...style, width: size(STYLE_RANGES.width) ?? style.width };
    case 'debug':
      return { ...style, debug: readFlag(raw, key, messages) ?? style.debug };
    case 'stamp':
      return { ...style, stamp: readFlag(raw, key, messages) ?? style.stamp };
    default:
      messages.push({ message: `style の知らない項目です: ${safeToken(key)} (使えるのは ${STYLE_KEYS.join(', ')})`, key });
      return style;
  }
}

/**
 * `style:` が 2 回書かれたときに重ねる。**後に書いたほうが勝つが、
 * 書かれていない項目は前のまま残す** (`board:` と同じ扱い)。
 * まるごと置き換えると `style: dark` のあとに `style: {text-size: 20}` と
 * 書いたときにテーマが黙って消える。
 */
export function mergeStyle(previous: StyleSpec, next: StyleSpec): StyleSpec {
  const pick = <T>(a: T | null, b: T | null): T | null => a ?? b;
  return {
    theme: pick(next.theme, previous.theme),
    textSize: pick(next.textSize, previous.textSize),
    textColor: pick(next.textColor, previous.textColor),
    textBackground: pick(next.textBackground, previous.textBackground),
    wireWidth: pick(next.wireWidth, previous.wireWidth),
    boardColor: pick(next.boardColor, previous.boardColor),
    holeSize: pick(next.holeSize, previous.holeSize),
    holeColor: pick(next.holeColor, previous.holeColor),
    width: pick(next.width, previous.width),
    debug: pick(next.debug, previous.debug),
    stamp: pick(next.stamp, previous.stamp),
    line: next.line ?? previous.line,
  };
}

/**
 * フェンスの `style:` を検証済みの指定に変える。
 * 読めなかった項目は捨てて残りは活かし、捨てた理由は 1 件ずつ返す。
 */
export function validateStyle(raw: unknown, line: number | null): StyleValidation {
  const base: StyleSpec = { ...EMPTY_STYLE, line };

  // `style: dark` の 1 行記法。テーマだけ選ぶのがいちばん多い書き方なので短く書ける。
  if (typeof raw === 'string') return { value: { ...base, theme: raw }, messages: [] };

  if (!isRecord(raw)) {
    return { value: base, messages: [{ message: `style はテーマ名か、${STYLE_KEYS.join(' / ')} のマップで書きます`, key: null }] };
  }

  const messages: StyleMessage[] = [];
  let value = base;
  for (const [key, item] of Object.entries(raw)) value = withKey(value, key, item, messages);

  return { value, messages };
}
