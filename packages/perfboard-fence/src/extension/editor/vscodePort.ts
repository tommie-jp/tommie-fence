import * as vscode from 'vscode';
import { changesForFence } from 'fence-kit';
import type { Change, Edit } from 'fence-kit';

/**
 * 文書を触るところ。**ここと `vscodeHost.ts` だけが vscode を知る**ので、
 * 薄く保つ (段取りは fence-kit の `session.ts` にあり、テストに掛かっている)。
 *
 * breadboard-fence の同じ名前のファイルと**中身が同じ**。vscode を import する
 * ものは fence-kit に置けない (あちらは外から何も持ってこない約束) ので、
 * いまは写しで持つ。**3 つ目 (perfboard) でも同じなら、置き場を決める**
 * (52 の docs/13)。
 */

/** アクティブな Markdown のエディタ。webview にフォーカスがあるときは無い。 */
export const markdownEditor = (): vscode.TextEditor | null => {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return null;
  return editor.document.languageId === 'markdown' ? editor : null;
};

/**
 * 覚えておいた書き換えを当て直す (戻す・やり直す)。
 *
 * **当てる前に、そこにある字が控えと合うか確かめる。** 合わなければ何もしない
 * (手で書き換えられていたら、覚えている桁はもう別の場所を指している)。
 * 黙って当てると、関係のない字を壊す。
 */
export async function applyChanges(
  document: vscode.TextDocument,
  changes: readonly Change[],
): Promise<boolean> {
  const edit = new vscode.WorkspaceEdit();
  for (const change of changes) {
    const { column, text } = change.from;
    const range = new vscode.Range(change.line, column, change.line, column + text.length);
    if (document.getText(range) !== text) return false;
    edit.replace(document.uri, range, change.to.text);
  }
  return vscode.workspace.applyEdit(edit);
}

/**
 * 編集を文書へ当てる。**アクティブなエディタを要求しない** — マップのパネルは
 * 掴んだ時点で Markdown が後ろに隠れていることがある (同じタブグループに
 * 入れた配置)。当て先は呼ぶ側が覚えている文書で決める。
 *
 * 行と桁の計算は `changesForFence` (vscode を知らず、テストに掛かる)。
 * 戻すための控えはここでは作らない — パネルの履歴はフェンスの本文で覚える
 * (`history.ts`。桁で覚えると行の増減で照合が立たない)。
 */
export async function applyToDocument(
  document: vscode.TextDocument,
  fenceLine: number,
  edits: readonly Edit[],
): Promise<boolean> {
  return applyChanges(document, changesForFence(document, fenceLine, edits));
}

/**
 * フェンスの本文を丸ごと書き戻す (戻す・やり直す)。`fenceLine` から `count` 行を
 * `body` にする (行は 0 始まり)。
 *
 * **文書の改行で綴じる。** `\n` で綴じると、CRLF の文書に LF の行が混ざる
 * (見た目には出ないまま、次の差分が全行に付く)。
 */
export async function replaceBody(
  document: vscode.TextDocument,
  fenceLine: number,
  count: number,
  body: readonly string[],
): Promise<boolean> {
  if (count <= 0 || fenceLine + count > document.lineCount) return false;
  const last = fenceLine + count - 1;
  const range = new vscode.Range(fenceLine, 0, last, document.lineAt(last).text.length);
  const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, range, body.join(eol));
  return vscode.workspace.applyEdit(edit);
}
