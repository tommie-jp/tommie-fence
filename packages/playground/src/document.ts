import { extractFences } from 'fence-kit';
import { KINDS } from './kinds.ts';
import type { Kind } from './kinds.ts';

/**
 * **文書は Markdown の全文**で、フェンスはその中の範囲 (52 の docs/43)。
 *
 * fence-editor はフェンス構文を編集するエディタで、本来の手順は
 * 「外にある `.md` を開く → 中のフェンスを直す → `.md` に書き戻す」。
 * 拡張 (VS Code) はそうしていて、殻 (`fence-kit` の `session.ts`) も
 * **Markdown の文書を相手にする作り**になっている。頁もそれに揃える。
 *
 * ここは DOM を知らない。数えるだけ。
 */

/**
 * 文書の中のフェンス 1 つ。
 *
 * **`line` は「本文の 1 行目」で 0 始まり。** 開き記号の行ではない。
 * これは `fence-kit` の `extractFences` が返す数え方で、殻が
 * `fenceLine` と呼んでいるものと同じ (`docEdits.ts` の `fenceBody` が
 * この行から本文を数える)。**ここをずらすと書き換えが 1 行ずれる。**
 */
export type DocFence = {
  readonly kind: Kind;
  readonly line: number;
  readonly source: string;
  /** フェンスの `title:`。無ければ null。 */
  readonly title: string | null;
};

const TITLE = /^title:[ \t]*(.*)$/m;

/** YAML の引用符を外す (書き方の違いを持ち込まない)。 */
const unquoted = (text: string): string =>
  ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))
    ? text.slice(1, -1)
    : text);

/** 画面に出す題の上限。**外から来た字**なので、長いものは切る。 */
const TITLE_MAX = 60;

/**
 * フェンスの題。**字下げした `title:` は拾わない** — 部品の中の題は
 * 図の題ではない。無ければ null。
 */
export function titleOf(source: string): string | null {
  const found = TITLE.exec(source);
  if (found === null) return null;
  const title = unquoted((found[1] ?? '').trim()).trim();
  if (title === '') return null;
  return title.length <= TITLE_MAX ? title : `${title.slice(0, TITLE_MAX)}…`;
}

/** 一覧に出す名前。題が無ければ種類で言う (無題の行にしない)。 */
export const labelOf = (fence: DocFence): string => fence.title ?? `${fence.kind} の図`;

/**
 * 文書の中のフェンスを、**言語をまたいで行順に**並べる。
 * 同じ `.md` に circuit と breadboard が混ざっていてもよい。
 */
export function fencesIn(text: string): readonly DocFence[] {
  const found: DocFence[] = [];
  for (const kind of KINDS) {
    for (const block of extractFences(text, kind)) {
      found.push({ kind, line: block.line, source: block.source, title: titleOf(block.source) });
    }
  }
  return found.sort((a, b) => a.line - b.line);
}

/**
 * その行を含むフェンスの番号 (無ければ -1)。**カーソルのある所が
 * 「いまのフェンス」** — 拡張と同じ決め方。
 *
 * 開き記号と閉じ記号の行も、そのフェンスの中と数える。カーソルが記号の上に
 * あるときに「フェンスの外」と言われると、掴めない理由が分からない。
 */
export function fenceAt(fences: readonly DocFence[], line: number): number {
  for (const [index, fence] of fences.entries()) {
    const body = fence.source.replace(/\n$/, '').split('\n').length;
    // 開き記号 (line - 1) から閉じ記号 (line + body) まで。
    if (line >= fence.line - 1 && line <= fence.line + body) return index;
  }
  return -1;
}

/** その位置は何行目か (0 始まり)。テキスト欄のカーソルを行に直すのに使う。 */
export const lineOfOffset = (text: string, offset: number): number =>
  text.slice(0, Math.max(0, offset)).split('\n').length - 1;

/**
 * フェンス 1 本を、それだけが書かれた Markdown にする。
 * **配ってあるリンクを開くとき**に使う (リンクが運ぶのはフェンス 1 本なので、
 * 文書に仕立ててから開く。以降の道は普通の文書と同じ)。
 */
export const asDocument = (kind: Kind, source: string): string =>
  `\`\`\`${kind}\n${source.replace(/\n$/, '')}\n\`\`\`\n`;

/**
 * フェンス 1 本の本文を入れ替えた文書を返す。**そのフェンスの行だけ**を
 * 差し替え、散文の行は 1 字も動かさない (書き戻すときに要る性質)。
 */
export function replaceFence(text: string, fence: DocFence, source: string): string {
  const lines = text.split('\n');
  const was = fence.source.replace(/\n$/, '').split('\n').length;
  const body = source.replace(/\n$/, '').split('\n');
  return [...lines.slice(0, fence.line), ...body, ...lines.slice(fence.line + was)].join('\n');
}

/** 行の範囲 (0 始まり、`to` は含まない)。`from === to` は幅の無い範囲 (その行の頭)。 */
export type LineSpan = { readonly from: number; readonly to: number };

/**
 * `before` から `after` になったときの、**`after` の中の変わった行の範囲**。
 * 同じなら null。頭と尻の同じ行を削って、残ったところを返す。
 *
 * Markdown の窓を開いたときに、殻が直前に書き換えた所を選んでおくのに使う
 * (52 の docs/48)。行が消えただけなら幅の無い範囲になる — 選ぶ行が無いので、
 * その位置にカーソルを置く。離れた 2 か所が変われば、その間ぜんぶ。
 */
export function changedSpan(before: string, after: string): LineSpan | null {
  if (before === after) return null;
  const was = before.split('\n');
  const now = after.split('\n');
  const most = Math.min(was.length, now.length);

  let head = 0;
  while (head < most && was[head] === now[head]) head += 1;
  // **頭で数えた行を尻で数え直さない。** 同じ行が並ぶと、範囲が裏返る。
  let tail = 0;
  while (tail < most - head && was[was.length - 1 - tail] === now[now.length - 1 - tail]) tail += 1;

  return { from: head, to: now.length - tail };
}

/**
 * 行の範囲を、字の位置の範囲にする (改行は含めない)。**文書の外を指したら
 * 文書の終わり** — 尻の行が消えたとき、指す行がもう無い。
 */
export function spanOffsets(text: string, span: LineSpan): { readonly start: number; readonly end: number } {
  const lines = text.split('\n');
  const startOf = (line: number): number =>
    lines.slice(0, line).reduce((sum, one) => sum + one.length + 1, 0);
  const start = Math.min(startOf(span.from), text.length);
  if (span.to <= span.from) return { start, end: start };
  // 最後の行の終わり = 次の行の頭から改行 1 つを引いたところ。
  const end = Math.min(startOf(span.to) - 1, text.length);
  return { start, end: Math.max(start, end) };
}
