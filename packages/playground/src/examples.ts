import { isKind } from './kinds.ts';
import type { Kind } from './kinds.ts';

/**
 * 開ける `.md` の一覧。**中身はここに無い** — `scripts/examples.mjs` が
 * 各パッケージの `examples/` から `.md` を `dist/examples/` へ写し、
 * この一覧 (`examples.json`) を書く。頁は選ばれたものだけを取りに行く。
 *
 * **例も「外にある `.md`」の 1 つ**として扱う (52 の docs/43)。散文と
 * フェンスが混ざった本物の文書なので、開いて直して書き戻すデモの題材に
 * そのまま使える。
 *
 * ここにあるのは**外から来た JSON を受け取ってよいか**を確かめる部分。
 * 形が違うものは黙って捨てず、落とした数を数えて呼ぶ側に返す。
 */

export type Example = {
  /** その `.md` が使っているフェンスの言語。 */
  readonly kind: Kind;
  /** わざと壊した例か。`?dev` のときだけ並べる。 */
  readonly broken: boolean;
  /** ファイル名 (`01-led.md`)。 */
  readonly name: string;
  /** 文書の名前 (最初の見出し)。 */
  readonly title: string;
  /** 中のフェンスの本数。 */
  readonly fences: number;
  /** `dist/` からの道。ここを取りに行く。 */
  readonly path: string;
  /** リポジトリの中の置き場。出どころのリンクに使う。 */
  readonly from: string;
};

export type ExampleList = {
  readonly examples: readonly Example[];
  /** 形が合わずに落としたもの。0 でなければ頁が古い JSON を読んでいる。 */
  readonly dropped: number;
};

const isString = (value: unknown): value is string => typeof value === 'string';

function toExample(value: unknown): Example | null {
  if (typeof value !== 'object' || value === null) return null;
  const { kind, broken, name, title, fences, path, from } = value as Record<string, unknown>;
  if (!isKind(kind)) return null;
  if (!isString(name) || !isString(title) || !isString(path) || !isString(from)) return null;
  if (typeof broken !== 'boolean' || typeof fences !== 'number') return null;
  if (name === '' || path === '') return null;
  // **道は `dist/` の中に限る。** 外から来た字なので、別の出所を指させない。
  if (!path.startsWith('examples/') || path.includes('..')) return null;
  return { kind, broken, name, title, fences, path, from };
}

/** JSON (配列のはず) を一覧にする。 */
export function parseExamples(data: unknown): ExampleList {
  if (!Array.isArray(data)) return { examples: [], dropped: 0 };

  const examples: Example[] = [];
  let dropped = 0;
  for (const item of data) {
    const example = toExample(item);
    if (example === null) dropped += 1;
    else examples.push(example);
  }
  return { examples, dropped };
}

/**
 * 並べるもの。**わざと壊した例は既定で外す** — あれはエラーの帯を確かめる
 * ためのもので、初めて来た人の欄に並ぶと雑音にしかならない (52 の docs/41)。
 * `?dev` で開いた人にだけ `broken` を立てて呼ぶ。
 */
export const shown = (examples: readonly Example[], broken = false): readonly Example[] =>
  examples.filter((example) => broken || !example.broken);
