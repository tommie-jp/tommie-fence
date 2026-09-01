import { fenceError, safeToken } from '../errors.ts';
import { STYLE_RANGES, THEME_NAMES } from '../limits.ts';
import type { FenceError, StyleSpec, ThemeName } from '../types.ts';

/**
 * `style:` を読む。**書かれた項目だけを持つ** — 書かれなかったものは null で、
 * 既定はテーマ側が決める (ここで既定を埋めると、テーマを足したときに
 * 既定が 2 か所に散る)。
 *
 * 名前 1 つだけ書く近道も受ける (`style: dark`)。テーマを選ぶのが一番多い
 * 使い方なので、そのために `theme:` を書かせる必要はない。
 */

export const EMPTY_STYLE: StyleSpec = {
  theme: null,
  width: null,
  debug: null,
  stamp: null,
};

const KEYS = ['theme', 'width', 'debug', 'stamp'] as const;

type Reader = (value: unknown) => { value: unknown } | { problem: string };

const asTheme: Reader = (value) => {
  if (typeof value !== 'string') return { problem: 'テーマは名前で書きます' };
  if (!(THEME_NAMES as readonly string[]).includes(value)) {
    return { problem: `知らないテーマです: ${safeToken(value)} (${THEME_NAMES.join(' / ')})` };
  }
  return { value };
};

const asWidth: Reader = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return { problem: 'width は数で書きます' };
  const { min, max } = STYLE_RANGES.width;
  if (value < min || value > max) return { problem: `width は ${min}〜${max} です` };
  return { value: Math.round(value) };
};

/**
 * `on` / `off` は **YAML 1.2 では真偽値ではなく字**。1.1 の癖で書く人が多く、
 * こちらも書き方としてそう案内しているので、字のほうも受ける。
 * 受けずに「on か off で書きます」と返すと、**いま断った綴りを書けと言う**ことになる。
 */
const FLAG_WORDS: Record<string, boolean> = { on: true, off: false };

const asFlag = (key: string): Reader => (value) => {
  if (typeof value === 'boolean') return { value };
  const word = typeof value === 'string' ? FLAG_WORDS[value.trim().toLowerCase()] : undefined;
  return word === undefined ? { problem: `${key} は on か off で書きます` } : { value: word };
};

const READERS: Record<string, Reader> = {
  theme: asTheme,
  width: asWidth,
  debug: asFlag('debug'),
  stamp: asFlag('stamp'),
};

export type StyleResult = { readonly style: StyleSpec; readonly errors: readonly FenceError[] };

const own = (table: Record<string, unknown>, key: string): boolean => Object.hasOwn(table, key);

/**
 * `style:` の値 (名前 1 つ、または項目の並び) を読む。
 *
 * `lines` は項目ごとの行。**まとめて 1 つの行で返さない** — `style:` が
 * 始まった行を全部の報告に付けると、3 行下の綴りを直しに行かせるうえ、
 * その行に無い語を探すことになってキャレットも消える。
 */
export function parseStyle(
  written: unknown,
  line: number | null,
  lines: ReadonlyMap<string, number | null> = new Map(),
): StyleResult {
  const lineFor = (key: string): number | null => lines.get(key) ?? line;
  if (typeof written === 'string') {
    const read = asTheme(written);
    return 'problem' in read
      ? { style: EMPTY_STYLE, errors: [fenceError(read.problem, line, written)] }
      : { style: { ...EMPTY_STYLE, theme: written as ThemeName }, errors: [] };
  }

  if (written === null || typeof written !== 'object' || Array.isArray(written)) {
    return {
      style: EMPTY_STYLE,
      errors: [fenceError(`style: はテーマの名前か、${KEYS.join(' / ')} の並びで書きます`, line)],
    };
  }

  const entries = written as Record<string, unknown>;
  const errors: FenceError[] = [];
  const style: Record<string, unknown> = { ...EMPTY_STYLE };

  for (const key of Object.keys(entries)) {
    if (!own(READERS, key)) {
      errors.push(fenceError(`知らない style の項目です: ${safeToken(key)} (${KEYS.join(' / ')})`, lineFor(key), key));
      continue;
    }
    const read = (READERS[key] as Reader)(entries[key]);
    if ('problem' in read) {
      errors.push(fenceError(read.problem, lineFor(key), key));
      continue;
    }
    style[key] = read.value;
  }

  return { style: style as StyleSpec, errors };
}
