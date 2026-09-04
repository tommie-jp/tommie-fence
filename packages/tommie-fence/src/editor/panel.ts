import * as vscode from 'vscode';
import { revealMapEditor } from './customEditor.ts';
import { makeNonce, panelHtml } from 'fence-kit';
import { mapScriptUri } from './vscodeHost.ts';
import { fenceEditors } from './fences.ts';
import { createSession } from 'fence-kit';
import type { Session } from 'fence-kit';
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

export function openMapPanel(context: vscode.ExtensionContext): void {
  // **どのフェンスでもよい。** 3 つとも扱えるので、カーソルの下にあるものを
  // そのまま開く (52 の docs/19 の決め 6 — 開いたときの選び方)。
  const fences = fenceEditors();
  const editor = markdownEditor();
  const text = editor?.document.getText() ?? '';
  const line = (editor?.selection.active.line ?? 0) + 1;
  const at = editor === null ? null : fences.find((one) => one.fenceAt(text, line) !== null) ?? null;
  if (editor === null || at === null) {
    void vscode.window.showWarningMessage(
      `${fences.map((one) => one.language).join(' / ')} フェンスの中にカーソルを置いてから開きます`,
    );
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
    { enableScripts: true, retainContextWhenHidden: true },
  );
  const live = createSession(createSessionHost(view.webview, 'own'), fences);
  view.webview.html = panelHtml({
    cspSource: view.webview.cspSource,
    nonce: makeNonce(),
    scriptUri: mapScriptUri(view.webview, context),
    view: live.view(),
    undo: 'own',
    foldsWire: at.foldsWire,
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
