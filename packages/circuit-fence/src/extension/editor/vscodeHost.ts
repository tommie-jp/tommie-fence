import * as vscode from 'vscode';
import type { Incoming, LitRange, Session, SessionHost } from './session.ts';
import { applyChanges, applyToDocument, markdownEditor } from './vscodePort.ts';

/**
 * `SessionHost` の vscode 版と、セッションを webview に結ぶ配線。
 * **ここだけが vscode を知る**ので薄く保つ (段取りは `session.ts` にあり、
 * そちらはテストに掛かっている)。パネルとカスタムエディタの両方が使う。
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
    applyChanges,
    highlight,
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
 * 手で書き換えたときもマップを追いつかせる。デバウンスは要らない
 * (組むのはパース済みモデルからで、TeX は通らない)。覚えている文書は
 * 隠れていても追う (マップの書き換え自体がこの経路で反映される)。
 */
export function attachSession(panel: vscode.WebviewPanel, session: Session, context: vscode.ExtensionContext): void {
  const listeners = [
    panel.webview.onDidReceiveMessage((message: Incoming) => {
      session.handle(message).catch((error: unknown) => {
        // 握りつぶさない。webview は「…」のまま待ってしまう。
        const reason = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Circuit Fence: マップの操作に失敗しました: ${reason}`);
      });
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (session.isBoundTo(event.document.uri.toString())) session.refresh();
    }),
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (session.follows(event.textEditor.document.uri.toString())) session.refresh();
    }),
  ];
  panel.onDidDispose(() => {
    for (const one of listeners) one.dispose();
    session.dispose();
  }, null, context.subscriptions);
}
