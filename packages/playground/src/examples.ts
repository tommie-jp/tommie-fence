import { isKind } from './kinds.ts';
import type { Kind } from './kinds.ts';

/**
 * 例の一覧。**中身はビルド時に集める** (`scripts/examples.mjs` が
 * 各パッケージの `examples/` からフェンスを抜き出して `examples.json` を書く)。
 * ページは起動時にそれを 1 回読むだけ。
 *
 * ここにあるのは**外から来た JSON を受け取ってよいか**を確かめる部分。
 * 形が違うものは黙って捨てず、落とした数を数えて呼ぶ側に返す。
 */

export type Example = {
  readonly kind: Kind;
  /** わざと壊した例か。選ぶ欄で分けて並べる。 */
  readonly broken: boolean;
  /** 選ぶ欄に出す名前。フェンスの `title:` か、無ければファイル名。 */
  readonly label: string;
  readonly source: string;
  /** リポジトリの中での置き場。元のファイルへのリンクに使う。 */
  readonly from: string;
};

export type ExampleList = {
  readonly examples: readonly Example[];
  /** 形が合わずに落としたもの。0 でなければページが古い JSON を読んでいる。 */
  readonly dropped: number;
};

const isString = (value: unknown): value is string => typeof value === 'string';

function toExample(value: unknown): Example | null {
  if (typeof value !== 'object' || value === null) return null;
  const { kind, broken, label, source, from } = value as Record<string, unknown>;
  if (!isKind(kind)) return null;
  if (!isString(label) || !isString(source) || !isString(from)) return null;
  if (typeof broken !== 'boolean') return null;
  if (source.trim() === '') return null;
  return { kind, broken, label, source, from };
}

/** JSON (配列のはず) を例の一覧にする。 */
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

/** その種類の例だけ。並びは JSON のまま (作る側が並べてある)。 */
export const forKind = (examples: readonly Example[], kind: Kind): readonly Example[] =>
  examples.filter((example) => example.kind === kind);
