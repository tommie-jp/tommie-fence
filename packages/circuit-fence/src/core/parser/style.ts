import { safeToken } from '../errors.ts';
import { STYLE_RANGES } from '../limits.ts';
import type { StyleRange } from '../limits.ts';
import { parseAddress } from '../model/address.ts';
import { THEME_NAMES } from '../render/theme.ts';
import type { StyleSpec } from '../types.ts';

/** 何も書かれていない状態。テーマも大きさも既定のまま。 */
export const EMPTY_STYLE: StyleSpec = {
  theme: null,
  inkColor: null,
  paperColor: null,
  gridColor: null,
  grid: null,
  gridTo: null,
  pitch: null,
  standard: null,
  wireWidth: null,
  width: null,
};

/**
 * 読めなかった理由と、それがどの項目のものか。
 * 行番号は YAML の節を持っている側 (parseFence) が key から引く
 * (`style:` の行だけを指しても、どれを直せばいいか分からないため)。
 */
export type StyleMessage = { readonly message: string; readonly key: string | null };

export type StyleValidation = { readonly value: StyleSpec; readonly messages: readonly StyleMessage[] };

/**
 * 色は `#rgb` / `#rrggbb` だけを受ける。名前や `rgb()` を通すと、
 * 検証済みの値しか SVG の属性に入れないという約束が崩れる。
 * 名前で選びたいときは、色ではなくテーマを指定してもらう。
 */
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const STANDARDS = ['american', 'european'] as const;

const KEYS = [
  'theme', 'ink-color', 'paper-color', 'grid-color',
  'grid', 'grid-to', 'pitch', 'standard', 'wire-width', 'width',
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
    // 値が空で届くのは `ink-color: #333` と書いたとき。YAML は `#` から先を
    // コメントとして落とすので、書き方だけを返すと**そう書いた本人には
    // 堂々巡り**になる。引用符が要ることのほうを伝える。
    const hint = raw === null || raw === undefined
      ? '# から先は YAML のコメントになります。"#333" のように "…" で囲みます'
      : '#rgb か #rrggbb で書きます';
    messages.push({ message: `style の ${key} は色として読めません (${hint})`, key });
    return null;
  }
  return normaliseColor(raw);
};

const readSize = (raw: unknown, key: string, range: StyleRange, messages: StyleMessage[]): number | null => {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    messages.push({ message: `style の ${key} は ${range.min}〜${range.max} の数値で書きます`, key });
    return null;
  }
  const clamped = Math.min(Math.max(raw, range.min), range.max);
  // 範囲外は捨てずに端へ寄せる。書いた意図 (もっと大きく / 小さく) は残るほうがよい。
  if (clamped !== raw) {
    messages.push({ message: `style の ${key} は ${range.min}〜${range.max} です (${clamped} にしました)`, key });
  }
  return clamped;
};

const readFlag = (raw: unknown, key: string, messages: StyleMessage[]): boolean | null => {
  if (typeof raw === 'boolean') return raw;
  if (raw === 'on') return true;
  if (raw === 'off') return false;
  messages.push({ message: `style の ${key} は on か off です`, key });
  return null;
};

const readChoice = (
  raw: unknown,
  key: string,
  allowed: readonly string[],
  messages: StyleMessage[],
): string | null => {
  if (typeof raw === 'string' && allowed.includes(raw)) return raw;
  messages.push({ message: `style の ${key} は ${allowed.join(' か ')} です`, key });
  return null;
};

/** 1 項目を読んで指定に足す。読めなければ理由を積んで、それまでの指定をそのまま返す。 */
function withKey(style: StyleSpec, key: string, raw: unknown, messages: StyleMessage[]): StyleSpec {
  const size = (range: StyleRange): number | null => readSize(raw, key, range, messages);
  const color = (): string | null => readColor(raw, key, messages);

  switch (key) {
    case 'theme':
      return { ...style, theme: readChoice(raw, key, THEME_NAMES, messages) ?? style.theme };
    case 'ink-color':
      return { ...style, inkColor: color() ?? style.inkColor };
    case 'paper-color':
      return { ...style, paperColor: color() ?? style.paperColor };
    case 'grid-color':
      return { ...style, gridColor: color() ?? style.gridColor };
    case 'grid':
      return { ...style, grid: readFlag(raw, key, messages) ?? style.grid };
    case 'grid-to': {
      const address = typeof raw === 'string' ? parseAddress(raw) : null;
      if (address === null) {
        messages.push({ message: `style の ${key} は番地で書きます (グリッドの右下、たとえば e12)`, key });
        return style;
      }
      return { ...style, gridTo: address };
    }
    case 'pitch':
      return { ...style, pitch: size(STYLE_RANGES.pitch) ?? style.pitch };
    case 'standard':
      return { ...style, standard: readChoice(raw, key, STANDARDS, messages) ?? style.standard };
    case 'wire-width':
      return { ...style, wireWidth: size(STYLE_RANGES.wireWidth) ?? style.wireWidth };
    case 'width':
      return { ...style, width: size(STYLE_RANGES.width) ?? style.width };
    default:
      messages.push({ message: `style の知らない項目です: ${safeToken(key)} (使えるのは ${KEYS.join(', ')})`, key });
      return style;
  }
}

/**
 * フェンスの `style:` を検証済みの指定に変える。
 * 読めなかった項目は捨てて残りは活かし、捨てた理由は 1 件ずつ返す。
 */
export function validateStyle(raw: unknown, base: StyleSpec = EMPTY_STYLE): StyleValidation {
  // `style: dark` の 1 行記法。テーマだけ選ぶのがいちばん多い書き方なので短く書ける。
  if (typeof raw === 'string') {
    const messages: StyleMessage[] = [];
    const theme = readChoice(raw, 'theme', THEME_NAMES, messages);
    return { value: { ...base, theme: theme ?? base.theme }, messages };
  }

  if (!isRecord(raw)) {
    return {
      value: base,
      messages: [{ message: `style はテーマ名か、${KEYS.join(' / ')} のマップで書きます`, key: null }],
    };
  }

  const messages: StyleMessage[] = [];
  // style: が 2 回書かれることがある。後に書いたほうで上書きし、
  // 書かなかった項目は前のまま残す (parts と同じで、読めたものは捨てない)。
  let value = base;
  for (const [key, item] of Object.entries(raw)) value = withKey(value, key, item, messages);

  return { value, messages };
}
