import * as vscode from 'vscode';
import type { CardReader, CardSource, CardTable } from 'fence-kit';

/**
 * プレビューと殻が部品カードを訊く口 (52 の docs/158)。**ファイルを読まない** — web 版の束にも入るので、
 * 読み手 (`vscodeCards.ts`。Node の API を使う) はデスクトップの入口だけが `setCardLookup` で登録する。
 * 登録が無ければ (web 版) どの口も undefined を返し、同梱の表だけで描く。
 */

type Lookup = (uri: vscode.Uri) => CardTable | undefined;

let lookup: Lookup | null = null;

export const setCardLookup = (next: Lookup | null): void => {
  lookup = next;
};

const tableOf = (uri: vscode.Uri | undefined): CardTable | undefined =>
  (lookup === null || uri === undefined ? undefined : lookup(uri));

/** 殻に渡す口。文書が決まっている殻 (タブそのものがマップ) 用。 */
export const cardSourceFor = (uri: vscode.Uri): CardSource => () => tableOf(uri);

/** 殻に渡す口。開いている文書が入れ替わる殻 (横に開くマップ) 用。そのとき前にある Markdown の文書を引く。 */
export const activeCardSource: CardSource = () => {
  const editor = vscode.window.activeTextEditor;
  return editor?.document.languageId === 'markdown' ? tableOf(editor.document.uri) : undefined;
};

/** プレビューの plugin に渡す口。VS Code は `env.currentDocument` に文書の URI を入れる。 */
export const cardReader: CardReader = (env) =>
  tableOf((env as { readonly currentDocument?: vscode.Uri } | null | undefined)?.currentDocument);
