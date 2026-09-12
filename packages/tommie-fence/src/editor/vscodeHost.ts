import * as vscode from 'vscode';
import type { Incoming, LitRange, Session, SessionHost } from 'fence-kit';
import { applyToDocument, createFence, markdownEditor, replaceBody } from './vscodePort.ts';

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
 * webview から見た `dist/map.js` の在り処。**束ねた 1 本を読み込ませる** —
 * 中で動くものは `src/webview/` にあり、状態遷移は node のテストに掛かっている
 * (文字列に書いたスクリプトは「その字が入っているか」しか試せない)。
 */
export const mapScriptUri = (webview: vscode.Webview, context: vscode.ExtensionContext): string =>
  webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot(context), 'map.js')).toString();

/**
 * webview に読ませてよい場所。**`dist/` の下だけ** (束ねた `map.js` がそこにある)。
 * `localResourceRoots` を書かないと既定でワークスペース全体まで読めるので、
 * パネルもカスタムエディタもここに絞る (CSP も `default-src 'none'` で、
 * 読むのはこの 1 本だけ)。
 */
export const webviewRoot = (context: vscode.ExtensionContext): vscode.Uri =>
  vscode.Uri.joinPath(context.extensionUri, 'dist');

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
    // **フェンスが 1 本も無い文書に 1 本作る。** 殻が呼ぶのは文書を固定して
    // いるとき (カスタムエディタ) だけ — パネルは今までどおり案内を出す。
    createFence,
    highlight,
    showDocument,
    // 右クリックの「テキストコピー」。VS Code のクリップボードへ写す。
    copyText: async (text: string) => { await vscode.env.clipboard.writeText(text); },
  };
  if (undo === 'own') return base;
  return {
    ...base,
    nativeUndo: async (kind) => { await vscode.commands.executeCommand(kind); },
  };
}

/**
 * カーソルを追うのをまとめる待ち時間。**マウスで文字を選ぶと 1 秒に何十回も来る** —
 * 1 回ごとに組み直すと、その間ずっと拡張ホストが埋まり、マップの操作が待たされる
 * (52 の docs/27)。人が「ついてこない」と感じない範囲でまとめる。
 */
export const FOLLOW_DELAY_MS = 50;

/**
 * セッションを webview に結ぶ。webview からの知らせ、文書の書き換え、
 * カーソルの移動を流し込み、閉じたら全部ほどく。
 *
 * 手で書き換えたときもマップを追いつかせる。**書き換えにデバウンスは置いていない** —
 * 組み直すのはパース済みモデルからで、帯のために compile も通るが (TeX の
 * 生成まで。描画はしない)、いちばん大きい例 (152 行) で 1 回 5 ms 前後。
 * 打鍵ごとでも足りている。覚えている文書は隠れていても追う
 * (マップの書き換え自体がこの経路で反映される)。
 *
 * **カーソルの移動だけはまとめる。** あちらは打鍵ではなくマウスの動きで来るので、
 * 数が 1 桁多い (`FOLLOW_DELAY_MS`)。
 */
export function attachSession(panel: vscode.WebviewPanel, session: Session): void {
  /** カーソルを追う予約。連続した動きを 1 回にまとめる。 */
  let following: ReturnType<typeof setTimeout> | null = null;
  const followSoon = (): void => {
    if (following !== null) return;
    following = setTimeout(() => {
      following = null;
      session.refresh();
    }, FOLLOW_DELAY_MS);
  };

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
      // **Markdown のカーソルだけを追う。** 関わりのないファイルでカーソルを
      // 動かしただけで組み直すと、掴んでいたものが黙って外れる
      // (マップを入れ替えると webview は掴みを捨てる)。
      if (event.textEditor.document.languageId !== 'markdown') return;
      if (session.follows(event.textEditor.document.uri.toString())) followSoon();
    }),
  ];
  // **閉じたら自分自身もほどく。** context.subscriptions へ積むと、開いて
  // 閉じるたびに済んだ listener が溜まる (窓を作り直すまで消えない)。
  const closed = panel.onDidDispose(() => {
    // **予約も片付ける。** 残すと、閉じたセッションを組み直しにいく。
    if (following !== null) clearTimeout(following);
    following = null;
    for (const one of listeners) one.dispose();
    session.dispose();
    closed.dispose();
  });
}
