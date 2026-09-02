import * as vscode from 'vscode';
import type { Incoming, LitRange, Session, SessionHost } from 'fence-kit';
import { applyToDocument, markdownEditor, replaceBody } from './vscodePort.ts';

/**
 * `SessionHost` の vscode 版と、セッションを webview に結ぶ配線。
 * **ここと `vscodePort.ts` だけが vscode を知る**ので薄く保つ
 * (段取りは fence-kit の `session.ts` にあり、テストに掛かっている)。
 * パネルとカスタムエディタの両方が使う。
 *
 * circuit-fence の同じ名前のファイルと**名札以外は同じ**。vscode を import する
 * ものは fence-kit に置けないので、いまは写しで持つ (52 の docs/13)。
 */

/**
 * マップで掴んだものをエディタで光らせる印。**1 つだけ作って使い回す** —
 * 作るたびに新しい型ができ、消し忘れが積もる。
 */
const HIGHLIGHT = vscode.window.createTextEditorDecorationType({
  backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
  borderRadius: '2px',
});

/**
 * その文書を見せているエディタで光らせる。**フォーカスは動かさない** —
 * 掴んでいる最中にエディタが前へ出ると、マップが隠れて置けなくなる。
 * 見えていないところにあるときだけ寄せる (勝手にスクロールし続けない)。
 */
function highlight(uri: string, ranges: readonly LitRange[]): void {
  const spans = ranges.map((range) => new vscode.Range(range.line, range.start, range.line, range.end));
  for (const editor of vscode.window.visibleTextEditors) {
    if (editor.document.uri.toString() !== uri) continue;
    editor.setDecorations(HIGHLIGHT, spans);
    const first = spans[0];
    if (first) editor.revealRange(first, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }
}

/**
 * webview から見た `dist/map.js` の在り処。**束ねた 1 本を読み込ませる** —
 * 中で動くものは `src/webview/` にあり、状態遷移は node のテストに掛かっている
 * (文字列に書いたスクリプトは「その字が入っているか」しか試せない)。
 */
export const mapScriptUri = (webview: vscode.Webview, context: vscode.ExtensionContext): string =>
  webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'dist', 'map.js')).toString();

/**
 * その文書をテキストエディタで見せる。**もう見えていれば何もしない** —
 * 帯の行を押すたびにタブが増えたり、開き直しで見ている所が飛んだりしない。
 *
 * 見えていないときに開くのは、**タブそのものがマップだと、その文書の
 * テキストエディタが 1 つも開いていないことがある**ため。そのままでは
 * 光らせる先が無く、帯の行は押しても何も起きない行になる。
 * 押すのは「そこへ行く」という申し出なので、前に出してよい。
 */
async function showDocument(uri: string, line: number): Promise<void> {
  if (vscode.window.visibleTextEditors.some((editor) => editor.document.uri.toString() === uri)) return;
  const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
  const at = new vscode.Range(line, 0, line, 0);
  await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.Beside, selection: at });
}

/**
 * `undo` は `own` (パネル: 自前の履歴) か `vscode` (カスタムエディタ: そのタブの
 * 文書へ VS Code の undo が届く)。後者は `executeCommand('undo')` を呼ぶだけ —
 * アクティブなエディタがカスタムエディタなら、VS Code がその資源の undo に回す。
 */
export function createSessionHost(webview: vscode.Webview, undo: 'own' | 'vscode'): SessionHost<vscode.TextDocument> {
  const base: SessionHost<vscode.TextDocument> = {
    post: (message) => { void webview.postMessage(message); },
    activeEditor: markdownEditor,
    openDocument: (uri) => vscode.workspace.textDocuments.find((one) => one.uri.toString() === uri) ?? null,
    applyEdits: applyToDocument,
    replaceBody,
    highlight,
    showDocument,
    ask: async (prompt, value) => (await vscode.window.showInputBox({ prompt, value })) ?? null,
  };
  if (undo === 'own') return base;
  return {
    ...base,
    nativeUndo: async (kind) => { await vscode.commands.executeCommand(kind); },
  };
}

/**
 * セッションを webview に結ぶ。webview からの知らせ、文書の書き換え、
 * カーソルの移動を流し込み、閉じたら全部ほどく。
 *
 * 手で書き換えたときもマップを追いつかせる。**デバウンスは置いていない** —
 * 組み直すのは図そのもの (同期の純関数) なので速い。覚えている文書は
 * 隠れていても追う (マップの書き換え自体がこの経路で反映される)。
 */
export function attachSession(panel: vscode.WebviewPanel, session: Session): void {
  const listeners = [
    panel.webview.onDidReceiveMessage((message: Incoming) => {
      session.handle(message).catch((error: unknown) => {
        // 握りつぶさない。webview は「…」のまま待ってしまう。
        const reason = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Breadboard Fence: マップの操作に失敗しました: ${reason}`);
      });
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (session.isBoundTo(event.document.uri.toString())) session.refresh();
    }),
    vscode.window.onDidChangeTextEditorSelection((event) => {
      // **Markdown のカーソルだけを追う。** 関わりのないファイルでカーソルを
      // 動かしただけで組み直すと、掴んでいたものが黙って外れる
      // (マップを入れ替えると webview は掴みを捨てる)。
      if (event.textEditor.document.languageId !== 'markdown') return;
      if (session.follows(event.textEditor.document.uri.toString())) session.refresh();
    }),
  ];
  // **閉じたら自分自身もほどく。** context.subscriptions へ積むと、開いて
  // 閉じるたびに済んだ listener が溜まる (窓を作り直すまで消えない)。
  const closed = panel.onDidDispose(() => {
    for (const one of listeners) one.dispose();
    session.dispose();
    closed.dispose();
  });
}
