import { strippedIndent } from '../../core/edit/shared.ts';

/**
 * セッションが文書とエディタに求める最小の形。**vscode の `TextDocument` と
 * `TextEditor` はそのまま当てはまる** (構造で合わせる)。テストは同じ形の
 * 偽物を渡す。
 */

export type DocLike = {
  readonly uri: { toString(): string };
  getText(): string;
  /** 行の数。**`lineAt` を呼ぶ前に範囲を確かめるため**に要る (vscode は外で投げる)。 */
  readonly lineCount: number;
  /** 行は 0 始まり (vscode に合わせる)。**範囲の外は投げる**。 */
  lineAt(line: number): { readonly text: string };
};

export type EditorLike<D extends DocLike> = {
  readonly document: D;
  readonly selection: {
    readonly active: { readonly line: number; readonly character: number };
  };
};

/**
 * その行から剥がされた字下げ。フェンスの取り出しは開き記号の字下げぶん
 * (最大 3 つ) を本文から剥がすので、フェンスの中の桁を Markdown の桁にする
 * ときに足し戻す (箇条書きの中のフェンスで書き換えが左へ寄った。実際に踏まれた)。
 * **行ごとに数える** — 開き記号より浅い行は剥がした量が少ない (`strippedIndent`)。
 */
export const indentOn = (document: DocLike, fenceLine: number, line: number): number =>
  strippedIndent(document.lineAt(fenceLine - 1).text, document.lineAt(line).text);
