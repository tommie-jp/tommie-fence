import * as vscode from 'vscode';
import { COLOR_LIST_ID, TYPE_LIST_ID, makeNonce, panelHtml } from 'fence-kit';
import { createCircuitEditor } from './circuitEditor.ts';
import { mapLook } from './mapLook.ts';
import { createSession } from 'fence-kit';
import { attachSession, createSessionHost, mapScriptUri } from './vscodeHost.ts';

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

/**
 * 開いているカスタムエディタ (文書の URI → パネル)。**1 つの文書に何枚も
 * 開ける** (エディタを分割すれば同じ文書の 2 枚目が立つ) ので、1 枚だけを
 * 覚えると、2 枚目を閉じたときに 1 枚目まで見失う。
 */
const open = new Map<string, Set<vscode.WebviewPanel>>();

/** その文書のカスタムエディタが開いていれば前に出す。 */
export function revealMapEditor(uri: string): boolean {
  const panels = open.get(uri);
  const first = panels === undefined ? undefined : [...panels][0];
  if (first === undefined) return false;
  first.reveal();
  return true;
}

export function registerMapEditor(context: vscode.ExtensionContext): void {
  const provider: vscode.CustomTextEditorProvider = {
    resolveCustomTextEditor(document, panel) {
      panel.webview.options = { enableScripts: true };
      const uri = document.uri.toString();
      const fence = createCircuitEditor(mapLook);
      const session = createSession(createSessionHost(panel.webview, 'vscode'), fence, { pinned: document });
      panel.webview.html = panelHtml({
        cspSource: panel.webview.cspSource,
        nonce: makeNonce(),
        scriptUri: mapScriptUri(panel.webview, context),
        view: session.view(),
        chrome: {
          palette: fence.palette(),
          typeNames: fence.typeNames(TYPE_LIST_ID),
          colorNames: fence.colorNames(COLOR_LIST_ID),
        },
        undo: 'vscode',
        foldsWire: fence.foldsWire,
      });

      const panels = open.get(uri) ?? new Set<vscode.WebviewPanel>();
      panels.add(panel);
      open.set(uri, panels);
      // 閉じたら自分自身もほどく (context.subscriptions へ積むと済んだ分が溜まる)。
      const closed = panel.onDidDispose(() => {
        panels.delete(panel);
        if (panels.size === 0) open.delete(uri);
        closed.dispose();
      });
      attachSession(panel, session);
    },
  };

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(MAP_EDITOR, provider, {
      // 隠れても捨てない。マップは小さい SVG で、組み直す経路を足すより安い。
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );
}
