import { LineCounter, isMap, isScalar, parseDocument } from 'yaml';
import type { Node, Pair } from 'yaml';
import { rememberRecent } from 'fence-kit';
import { fenceError, safeToken } from '../errors.ts';
import { DEVICE_HINT, isDeviceName } from '../model/device.ts';
import type { DeviceName } from '../model/device.ts';
import { TOP_LEVEL_KEYS } from '../types.ts';
import type { FenceDocument, FenceError, StyleSpec } from '../types.ts';
import { EMPTY_STYLE, parseStyle } from './style.ts';

/** yaml のメッセージはライブラリ側の文言なので、載せる長さを切る。 */
const MAX_YAML_MESSAGE = 120;

/** 読んだ結果。**`doc` は必ずある** (52 の docs/54「エディターを YAML の都合で止めない」)。 */
export type ParseResult = { readonly doc: FenceDocument; readonly errors: readonly FenceError[] };

const emptyDocument = (): FenceDocument => ({ device: null, title: null, style: EMPTY_STYLE, keys: [] });

export const scalarText = (node: unknown): string | null => {
  if (!isScalar(node)) return null;
  if (typeof node.value === 'string') return node.value;
  if (typeof node.value === 'number') return String(node.value);
  return null;
};

function readFence(source: string): ParseResult {
  if (source.trim() === '') {
    return { doc: emptyDocument(), errors: [fenceError(`spectrum フェンスが空です — ${DEVICE_HINT}`, null)] };
  }

  const lineCounter = new LineCounter();
  const parsed = parseDocument(source, { lineCounter, uniqueKeys: false });
  const lineOf = (node: Node | Pair | null | undefined): number | null => {
    const range = (node as { range?: readonly [number, number, number] } | null)?.range;
    return range ? lineCounter.linePos(range[0]).line : null;
  };
  const root = parsed.contents;

  // **同じ行は 1 件だけ** (yaml は 1 つの壊れ方を 2 度言うことがある)。
  const seen = new Set<number | null>();
  const errors: FenceError[] = parsed.errors.flatMap((error) => {
    const { line } = lineCounter.linePos(error.pos[0]);
    if (seen.has(line)) return [];
    seen.add(line);
    return [fenceError(`YAML の構文エラー: ${(error.message.split('\n')[0] ?? '').slice(0, MAX_YAML_MESSAGE)}`, line)];
  });

  if (!isMap(root)) {
    errors.push(fenceError('フェンスの一番外側は `キーと値` の並びにします (`device: tinysa-ultra` から)', lineOf(root as Node | null)));
    return { doc: emptyDocument(), errors };
  }

  let device: DeviceName | null = null;
  let deviceWritten = false;
  let title: string | null = null;
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
      case 'device': {
        deviceWritten = true;
        const text = (scalarText(pair.value) ?? '').trim();
        if (isDeviceName(text)) device = text;
        else errors.push(fenceError(DEVICE_HINT, at, text || undefined));
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
        errors.push(fenceError(`${key}: はまだ書けません (この版で書けるのは device: title: style: だけ)`, keyLine, key));
        break;
    }
  }

  if (!deviceWritten) errors.unshift(fenceError(DEVICE_HINT, null));
  return { doc: { device, title, style, keys: [...written] }, errors };
}

/**
 * 読んだ結果は**直前の 2 本文ぶん覚える** (`rememberRecent`)。帯と Problems が
 * 同じ本文を続けて読むので、そのたびに YAML を通さない。
 */
export const parseFence = rememberRecent(readFence);
