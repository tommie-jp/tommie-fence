import * as vscode from 'vscode';
import { revealMapEditor } from './customEditor.ts';
import { makeNonce, panelHtml } from 'fence-kit';
import { mapScriptUri, webviewRoot } from './vscodeHost.ts';
import { fenceEditors } from './fences.ts';
import { createSession } from 'fence-kit';
import type { FenceEditor, Session } from 'fence-kit';
import { firstFenceBodyLine } from './hasFence.ts';
import { attachSession, createSessionHost } from './vscodeHost.ts';
import { markdownEditor } from './vscodePort.ts';

/**
 * コマンドで横に開くマップのパネル。中身は `session.ts` (カスタムエディタと同じ)。
 * ここはパネルを 1 枚作って結ぶだけ。
 *
 * 戻す・やり直すは**自前の履歴**。パネルにフォーカスがあると VS Code の
 * `Ctrl+Z` はエディタに届かない (`activeTextEditor` が無くなる)。
 */

let panel: vscode.WebviewPanel | null = null;
let session: Session | null = null;

/**
 * カーソルがフェンスの外なら、**文書のいちばん上のフェンスへ移す**。
 * 題の釦から開く人はカーソルの場所を気にしていない (52 の docs/57)。
 * 移した先を見せるので、パネルがどのフェンスを映しているかは字の側でも分かる。
 * 移せた (もともと中に居た) なら true、フェンスが 1 つも無ければ false。
 */
function aimAtFence(editor: vscode.TextEditor, fences: readonly FenceEditor[]): boolean {
  const text = editor.document.getText();
  const line = editor.selection.active.line + 1;
  if (fences.some((one) => one.fenceAt(text, line) !== null)) return true;

  const body = firstFenceBodyLine(text, fences.map((one) => one.language));
  if (body === null) return false;
  // 閉じていない空のフェンスが文書の最後にあると、本文の行はまだ無い。
  const at = new vscode.Position(Math.min(body - 1, editor.document.lineCount - 1), 0);
  editor.selection = new vscode.Selection(at, at);
  editor.revealRange(new vscode.Range(at, at), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  return true;
}

export function openMapPanel(context: vscode.ExtensionContext): void {
  // **どのフェンスでもよい。** 3 つとも扱えるので、カーソルの下にあるものを
  // そのまま開く (52 の docs/19 の決め 6 — 開いたときの選び方)。外なら最初のもの。
  const fences = fenceEditors();
  const editor = markdownEditor();
  const names = fences.map((one) => one.language).join(' / ');
  if (editor === null) {
    void vscode.window.showWarningMessage(`${names} フェンスのある Markdown を開いてから使います`);
    return;
  }
  if (!aimAtFence(editor, fences)) {
    void vscode.window.showWarningMessage(`この文書には ${names} フェンスがありません`);
    return;
  }

  // タブそのものがマップになっている文書なら、そちらを前に出す
  // (同じ文書に 2 つのセッションを作らない — 光の印を取り合う)。
  if (revealMapEditor(editor.document.uri.toString())) return;

  if (panel !== null && session !== null) {
    panel.reveal(vscode.ViewColumn.Beside);
    session.refresh();
    return;
  }

  const view = vscode.window.createWebviewPanel(
    'tommieFenceMap',
    'Fence Editor',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [webviewRoot(context)] },
  );
  const live = createSession(createSessionHost(view.webview, 'own'), fences);
  view.webview.html = panelHtml({
    cspSource: view.webview.cspSource,
    nonce: makeNonce(),
    scriptUri: mapScriptUri(view.webview, context),
    view: live.view(),
    undo: 'own',
  });
  attachSession(view, live);
  // 閉じたら自分自身もほどく (context.subscriptions へ積むと済んだ分が溜まる)。
  const closed = view.onDidDispose(() => {
    panel = null;
    session = null;
    closed.dispose();
  });

  panel = view;
  session = live;
}
