import * as vscode from 'vscode';
import { fenceAt } from '../../core/edit/map.ts';
import { revealMapEditor } from './customEditor.ts';
import { makeNonce, panelHtml } from './panelHtml.ts';
import { mapScriptUri } from './vscodeHost.ts';
import { createSession } from './session.ts';
import type { Session } from './session.ts';
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
  const editor = markdownEditor();
  const fence = editor === null ? null : fenceAt(editor.document.getText(), editor.selection.active.line + 1);
  if (editor === null || fence === null) {
    void vscode.window.showWarningMessage('circuit フェンスの中にカーソルを置いてから開きます');
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
    'circuitFenceMap',
    '部品と節点を動かす',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true },
  );
  const live = createSession(createSessionHost(view.webview, 'own'));
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
