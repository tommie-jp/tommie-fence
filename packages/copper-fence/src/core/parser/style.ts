import { fenceError, safeToken } from '../errors.ts';
import { STYLE_RANGES, THEME_NAMES } from '../limits.ts';
import type { FenceError, StyleSpec, ThemeName } from '../types.ts';

/**
 * `style:` を読む。**書かれた項目だけを持つ** — 既定はテーマ側 (`resolveStyle`) が
 * 決める。名前 1 つだけ書く近道も受ける (`style: dark`)。perfboard と同じ作り。
 */
export const EMPTY_STYLE: StyleSpec = { theme: null, width: null, debug: null, stamp: null, check: null, grid: null, back: null };

const KEYS = ['theme', 'width', 'debug', 'stamp', 'check', 'grid', 'back'] as const;

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

/** `on` / `off` は YAML 1.2 では字。字のほうも受ける (perfboard と同じ)。 */
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
  check: asFlag('check'),
  grid: asFlag('grid'),
  back: asFlag('back'),
};

export type StyleResult = { readonly style: StyleSpec; readonly errors: readonly FenceError[] };

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
    if (!Object.hasOwn(READERS, key)) {
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
