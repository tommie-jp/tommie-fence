import * as vscode from 'vscode';
import { makeNonce, panelHtml } from './panelHtml.ts';
import { createSession } from './session.ts';
import { attachSession, createSessionHost } from './vscodeHost.ts';

/**
 * `.md` のタブそのものをマップにするカスタムエディタ。タブの頭の開き方の一覧
 * (と `Reopen Editor With...`) に載る。**中身はパネルと同じ** `session.ts`。
 *
 * `CustomTextEditorProvider` なので文書は `TextDocument` のまま — 書き換えは
 * 今までどおり `WorkspaceEdit` で当たり、保存・hot exit・隣に開いたテキスト
 * エディタとの同期は VS Code が持つ。**戻す・やり直すも VS Code に頼む**
 * (アクティブなカスタムエディタの資源へ undo が届く)。
 *
 * 文書は 1 つに固定する (`pinned`)。カーソルに従う乗り換えは同じ文書の中の
 * フェンスに限り、複数のフェンスは頭の一覧で選ぶ (タブにはカーソルが無い)。
 */

export const MAP_EDITOR = 'circuit-fence.map';

/** 開いているカスタムエディタ (文書の URI → パネル)。文書 1 つに 1 つ。 */
const open = new Map<string, vscode.WebviewPanel>();

/** その文書のカスタムエディタが開いていれば前に出す。 */
export function revealMapEditor(uri: string): boolean {
  const panel = open.get(uri);
  if (panel === undefined) return false;
  panel.reveal();
  return true;
}

export function registerMapEditor(context: vscode.ExtensionContext): void {
  const provider: vscode.CustomTextEditorProvider = {
    resolveCustomTextEditor(document, panel) {
      panel.webview.options = { enableScripts: true };
      const uri = document.uri.toString();
      const session = createSession(createSessionHost(panel.webview, 'vscode'), { pinned: document });
      panel.webview.html = panelHtml({
        cspSource: panel.webview.cspSource,
        nonce: makeNonce(),
        view: session.view(),
        undo: 'vscode',
      });

      open.set(uri, panel);
      panel.onDidDispose(() => {
        if (open.get(uri) === panel) open.delete(uri);
      }, null, context.subscriptions);
      attachSession(panel, session, context);
    },
  };

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(MAP_EDITOR, provider, {
      // 隠れても捨てない。マップは小さい SVG で、組み直す経路を足すより安い。
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );
}
