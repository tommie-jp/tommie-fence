import { LineCounter, isMap, isScalar, parseDocument } from 'yaml';
import type { Node, Pair } from 'yaml';
import { fenceError, safeToken } from '../errors.ts';
import { TOP_LEVEL_KEYS } from '../types.ts';
import type { FenceDocument, FenceError } from '../types.ts';

/** yaml のメッセージはライブラリ側の文言なので、載せる長さを切る。 */
const MAX_YAML_MESSAGE = 120;

export type ParseResult = { readonly doc: FenceDocument | null; readonly errors: readonly FenceError[] };

const scalarText = (node: unknown): string | null =>
  isScalar(node) && typeof node.value === 'string' ? node.value : null;

/**
 * フェンスの中身 (YAML) を読む。エラーはすべて行番号つきで返す。
 *
 * **Phase 0 で読むのは `board:` だけ。** 残りのキーは語彙として認めるが
 * 中身を見ない (見られるようになった Phase で足す)。知らないキーを名指すのは
 * ここから始める — 綴り間違いが黙って無視されるのが一番たちが悪い。
 */
export function parseFence(source: string): ParseResult {
  if (source.trim() === '') {
    return { doc: null, errors: [fenceError('perfboard フェンスが空です (board: から書き始めます)', null)] };
  }

  const lineCounter = new LineCounter();
  // 重複キーは YAML のエラーにせず、こちらで名指して報告する
  // (どのキーが 2 つあるのかを、こちらの言葉で言うため)。
  const parsed = parseDocument(source, { lineCounter, uniqueKeys: false });

  if (parsed.errors.length > 0) {
    return {
      doc: null,
      errors: parsed.errors.map((error) =>
        fenceError(
          `YAML の構文エラー: ${(error.message.split('\n')[0] ?? '').slice(0, MAX_YAML_MESSAGE)}`,
          lineCounter.linePos(error.pos[0]).line,
        ),
      ),
    };
  }

  const lineOf = (node: Node | Pair | null | undefined): number | null => {
    const range = (node as { range?: readonly [number, number, number] } | null)?.range;
    return range ? lineCounter.linePos(range[0]).line : null;
  };

  const root = parsed.contents;
  // **中身が始まる行を指す。** 1 行目に決め打つと、先頭が注釈のときに
  // 何も書いていない行を名指すことになる。
  const contentLine = lineOf(root as Node | null);

  if (!isMap(root)) {
    return {
      doc: null,
      errors: [fenceError('フェンスの一番外側は `キーと値` の並びにします (`board: ...` から)', contentLine)],
    };
  }

  const errors: FenceError[] = [];
  let board: string | null = null;
  let boardWritten = false;

  for (const pair of root.items) {
    const key = scalarText(pair.key);
    if (key === null) {
      errors.push(fenceError('キーは文字で書きます', lineOf(pair.key as Node)));
      continue;
    }
    if (!(TOP_LEVEL_KEYS as readonly string[]).includes(key)) {
      const known = TOP_LEVEL_KEYS.join(' / ');
      errors.push(fenceError(`知らないキーです: ${safeToken(key)} (書けるのは ${known})`, lineOf(pair.key as Node), key));
      continue;
    }
    if (key !== 'board') continue;

    const at = lineOf((pair.value ?? pair.key) as Node);
    if (boardWritten) {
      // 後勝ちで黙って上書きすると、**書いたはずの板と違う板の図が出る**。
      errors.push(fenceError('board: が 2 つあります (板は 1 枚です)', at, key));
      continue;
    }
    boardWritten = true;

    const name = scalarText(pair.value);
    if (name === null) {
      errors.push(fenceError('board: には板の名前を 1 つ書きます', at));
      continue;
    }
    board = name;
  }

  if (board === null) {
    // 板が決まらないと穴の数が決まらないので、番地も配置も読めない。
    // **`board:` と書いてあって値が無いときは言わない** — すぐ上で言っている。
    if (!boardWritten) {
      errors.push(fenceError('board: が要ります (どの板に載せるかで穴の数が決まります)', contentLine));
    }
    return { doc: null, errors };
  }

  return { doc: { board }, errors };
}
