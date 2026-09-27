import { LineCounter, isMap, isScalar, parseDocument } from 'yaml';
import type { Node, Pair } from 'yaml';
import { formatPerDiv, parsePerDiv, rememberRecent } from 'fence-kit';
import { fenceError, safeToken } from '../errors.ts';
import { LIMITS } from '../limits.ts';
import { TOP_LEVEL_KEYS } from '../types.ts';
import type { FenceDocument, FenceError, StyleSpec, TimeSpec } from '../types.ts';
import { EMPTY_STYLE, parseStyle } from './style.ts';

/** yaml のメッセージはライブラリ側の文言なので、載せる長さを切る。 */
const MAX_YAML_MESSAGE = 120;

/** 読んだ結果。**`doc` は必ずある** (52 の docs/54「エディターを YAML の都合で止めない」)。 */
export type ParseResult = { readonly doc: FenceDocument; readonly errors: readonly FenceError[] };

const emptyDocument = (): FenceDocument => ({
  view: 'time',
  title: null,
  time: null,
  style: EMPTY_STYLE,
});

export const scalarText = (node: unknown): string | null => {
  if (!isScalar(node)) return null;
  if (typeof node.value === 'string') return node.value;
  if (typeof node.value === 'number') return String(node.value);
  return null;
};

/**
 * **書かれたとおりの綴り**を元の字面から切り出す。YAML は `1.50` を `1.5` に
 * 読むので、解決後の値を名指すと行のどこにも無い綴りになる。
 */
export const writtenText = (node: unknown, source: string): string | null => {
  const range = (node as { range?: readonly [number, number, number] } | null)?.range;
  if (!range) return null;
  const text = source.slice(range[0], range[1]).trim();
  return text === '' ? null : text;
};

const TIME_HINT = 'time: は 1ms/div / 200us/div のように /div を付けます';

function readTime(text: string | null, at: number | null): TimeSpec | FenceError {
  const perDiv = text === null ? null : parsePerDiv(text, 's');
  if (perDiv === null) return fenceError(TIME_HINT, at, text ?? undefined);
  const { min, max } = LIMITS.perDiv;
  if (perDiv < min || perDiv > max) {
    return fenceError(`time: は ${formatPerDiv(min, 's')}〜${formatPerDiv(max, 's')} です`, at, text ?? undefined);
  }
  return { perDiv, line: at };
}

function readFence(source: string): ParseResult {
  if (source.trim() === '') {
    return { doc: emptyDocument(), errors: [fenceError('scope フェンスが空です (ch1: から書き始めます)', null)] };
  }

  const lineCounter = new LineCounter();
  const parsed = parseDocument(source, { lineCounter, uniqueKeys: false });
  const lineOf = (node: Node | Pair | null | undefined): number | null => {
    const range = (node as { range?: readonly [number, number, number] } | null)?.range;
    return range ? lineCounter.linePos(range[0]).line : null;
  };
  const root = parsed.contents;
  const contentLine = lineOf(root as Node | null);

  // **同じ行は 1 件だけ** (yaml は 1 つの壊れ方を 2 度言うことがある)。
  const seen = new Set<number | null>();
  const errors: FenceError[] = parsed.errors.flatMap((error) => {
    const { line } = lineCounter.linePos(error.pos[0]);
    if (seen.has(line)) return [];
    seen.add(line);
    return [fenceError(`YAML の構文エラー: ${(error.message.split('\n')[0] ?? '').slice(0, MAX_YAML_MESSAGE)}`, line)];
  });

  if (!isMap(root)) {
    errors.push(fenceError('フェンスの一番外側は `キーと値` の並びにします (`ch1: ...` から)', contentLine));
    return { doc: emptyDocument(), errors };
  }

  let title: string | null = null;
  let time: TimeSpec | null = null;
  let style: StyleSpec = EMPTY_STYLE;
  const written = new Set<string>();

  for (const pair of root.items) {
    const key = scalarText(pair.key);
    const keyLine = lineOf(pair.key as Node);
    const at = lineOf((pair.value ?? pair.key) as Node);
    if (key === null) {
      errors.push(fenceError('キーは文字で書きます', keyLine));
      continue;
    }
    if (!(TOP_LEVEL_KEYS as readonly string[]).includes(key)) {
      errors.push(fenceError(`知らないキーです: ${safeToken(key)} (書けるのは ${TOP_LEVEL_KEYS.join(' / ')})`, keyLine, key));
      continue;
    }
    // **同じキーが 2 つあれば言う。** 後勝ちで黙ると、書いたはずのものと違う図が出る。
    if (written.has(key)) {
      errors.push(fenceError(`${key}: が 2 つあります (1 つにまとめます)`, keyLine, key));
      continue;
    }
    written.add(key);

    switch (key) {
      case 'view': {
        const text = (scalarText(pair.value) ?? '').trim();
        if (text === 'xy') errors.push(fenceError('view: xy はまだ描けません (この版で描けるのは time だけ)', at, text));
        else if (text !== 'time') errors.push(fenceError('view: は time か xy です', at, text || undefined));
        break;
      }
      case 'title': {
        const text = scalarText(pair.value);
        if (text === null) {
          errors.push(fenceError('title: には図の題を 1 行で書きます', at));
          break;
        }
        title = text.trim() === '' ? null : text;
        break;
      }
      case 'time': {
        const read = readTime(writtenText(pair.value, source) ?? scalarText(pair.value), at);
        if ('message' in read) errors.push(read);
        else time = read;
        break;
      }
      case 'style': {
        const lines = new Map<string, number | null>();
        if (isMap(pair.value)) {
          for (const item of pair.value.items) {
            const name = scalarText(item.key);
            if (name !== null) lines.set(name, lineOf((item.value ?? item.key) as Node));
          }
        }
        const read = parseStyle((pair.value as { toJSON?: () => unknown } | null)?.toJSON?.() ?? null, at, lines);
        style = read.style;
        errors.push(...read.errors);
        break;
      }
      default:
        // 段 1 で読む (trigger / ch1〜ch4 / data / cursors / measure)。
        break;
    }
  }

  return { doc: { view: 'time', title, time, style }, errors };
}

/**
 * 読んだ結果は**直前の 2 本文ぶん覚える** (`rememberRecent`)。帯と Problems が
 * 同じ本文を続けて読むので、そのたびに YAML を通さない。
 */
export const parseFence = rememberRecent(readFence);
