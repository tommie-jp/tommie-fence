import * as vscode from 'vscode';
import { aimAt, fenceAt, gridMap } from '../../core/edit/map.ts';
import { renderMapHtml } from '../../core/edit/mapSvg.ts';
import { formatAddress, parseAddress } from '../../core/model/address.ts';
import { movePart, partSpans } from '../../core/edit/move.ts';
import { strippedIndent } from '../../core/edit/shared.ts';
import { movePoint, nodeSpans } from '../../core/edit/point.ts';
import { describeDiff } from './movePart.ts';
import { applyChanges, applyToDocument } from './vscodePort.ts';
import { createHistory, invert } from './history.ts';
import { makeNonce, panelHtml } from './panelHtml.ts';

/**
 * マップのパネル。**vscode の縁だけ**を持ち、升目も書き換えも core の純関数。
 *
 * 図そのものではなくマップを掴ませる理由は `core/edit/map.ts` の頭書き。
 * ドラッグ中は選択の見た目だけが動き、**放したとき 1 回だけ**書き換えて
 * コンパイルする (TeX → SVG は 1 図 1 秒前後かかるので追従させない)。
 *
 * **パネルは開いたフェンスの文書を覚える。** 「いまアクティブな Markdown」を
 * 毎回探すと、パネルを Markdown と同じタブグループに入れた配置で詰む —
 * パネルを前に出した時点で Markdown が隠れてアクティブでなくなり、
 * 掴むたびに「エディタが前に出ていません」で止まる (実際に踏まれた)。
 * カーソルが別のフェンスに入ったら覚え直す (マップの乗り換えは今までどおり)。
 */

let panel: vscode.WebviewPanel | null = null;

/** 覚えているフェンス。文書は URI で、フェンスは開き記号の行で引き直す。 */
let bound: { readonly uri: vscode.Uri; readonly line: number } | null = null;

/**
 * マップでの移動の履歴。**VS Code の `Ctrl+Z` はエディタにフォーカスが要る**ので、
 * 掴んで動かしている間はパネルから届かない。当てた書き換えを覚えて逆を当てる。
 * 別の文書へ移ったら忘れる (覚えている桁が別の文書を指してしまう)。
 */
const history = createHistory();

/**
 * マップで掴んだものをエディタで光らせる印。**1 つだけ作って使い回す** —
 * 作るたびに新しい型ができ、消し忘れが積もる。
 */
const HIGHLIGHT = vscode.window.createTextEditorDecorationType({
  backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
  borderRadius: '2px',
});

const markdownEditor = (): vscode.TextEditor | null => {
  const editor = vscode.window.activeTextEditor;
  return editor?.document.languageId === 'markdown' ? editor : null;
};

type FenceNow = {
  readonly document: vscode.TextDocument;
  readonly source: string;
  readonly line: number;
};

/**
 * いま掴めるフェンス。アクティブな Markdown のカーソルにフェンスがあれば
 * そちらへ乗り換え、無ければ覚えている文書のフェンスを引き直す。
 */
function currentFence(): FenceNow | null {
  const editor = markdownEditor();
  if (editor) {
    const fence = fenceAt(editor.document.getText(), editor.selection.active.line + 1);
    if (fence) {
      // 別の文書へ移ったら履歴は捨てる (覚えている桁が別の文書を指す)。
      if (bound !== null && bound.uri.toString() !== editor.document.uri.toString()) history.clear();
      bound = { uri: editor.document.uri, line: fence.line };
      return { document: editor.document, source: fence.source, line: fence.line };
    }
  }

  if (bound === null) return null;
  const remembered = bound;
  const document = vscode.workspace.textDocuments.find(
    (one) => one.uri.toString() === remembered.uri.toString(),
  );
  if (!document) return null;

  // 開き記号の行で引き直す。フェンスの中の書き換えでは動かない行だが、
  // 上に行が足されてずれたら見失う (そのときは掴み直してもらう)。
  const fence = fenceAt(document.getText(), remembered.line);
  if (!fence) return null;
  bound = { uri: document.uri, line: fence.line };
  return { document, source: fence.source, line: fence.line };
}

/** いま掴めるフェンスからマップを組む。無ければ null。 */
function mapHtmlNow(): { html: string } | null {
  const fence = currentFence();
  if (!fence) return null;
  return { html: renderMapHtml(gridMap(fence.source)) };
}

export function openMapPanel(context: vscode.ExtensionContext): void {
  const now = mapHtmlNow();
  if (!now) {
    void vscode.window.showWarningMessage('circuit フェンスの中にカーソルを置いてから開きます');
    return;
  }

  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside);
    void panel.webview.postMessage({ kind: 'map', html: now.html });
    // 中身を入れ替えると印が消えるので、指しているものを送り直す。
    sendAim();
    return;
  }

  panel = vscode.window.createWebviewPanel(
    'circuitFenceMap',
    '部品と節点を動かす',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true },
  );
  const view = panel;
  view.webview.html = panelHtml({
    cspSource: view.webview.cspSource,
    nonce: makeNonce(),
    mapHtml: now.html,
  });

  view.onDidDispose(() => {
    highlight([]);
    panel = null;
    bound = null;
    history.clear();
  }, null, context.subscriptions);

  view.webview.onDidReceiveMessage(
    async (message: { kind: string; part?: string; from?: string; to?: string; what?: string; id?: string }) => {
      if (message.kind === 'move' && message.part && message.to) {
        await applyMove(message.part, message.to);
        refresh();
        return;
      }
      if (message.kind === 'moveNode' && message.from && message.to) {
        await applyNodeMove(message.from, message.to);
        refresh();
        return;
      }
      if (message.kind === 'undo' || message.kind === 'redo') {
        await stepBack(message.kind);
        refresh();
        return;
      }
      if (message.kind === 'select') showSelection(message.what, message.id);
    },
    null,
    context.subscriptions,
  );

  // 手で書き換えたときもマップを追いつかせる。デバウンスは要らない
  // (組むのはパース済みモデルからで、TeX は通らない)。覚えている文書は
  // 隠れていても追う (パネルの書き換え自体がこの経路で反映される)。
  const listeners = [
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() === bound?.uri.toString()) refresh();
    }),
    vscode.window.onDidChangeTextEditorSelection(() => refresh()),
  ];
  context.subscriptions.push(...listeners);
  view.onDidDispose(() => { for (const one of listeners) one.dispose(); }, null, context.subscriptions);
}

function refresh(): void {
  if (!panel) return;
  // **地図を組んでから履歴の状態を送る。** 別の文書へ移ったときに履歴を
  // 捨てるのはこの中なので、先に送るとボタンが有効なまま取り残される。
  const now = mapHtmlNow();
  void panel.webview.postMessage({ kind: 'history', ...history.state() });
  if (now) {
    void panel.webview.postMessage({ kind: 'map', html: now.html });
    // **マップを入れ替えると webview は掴みを捨てる。** こちらの光も消さないと、
    // 掴んでいないのにエディタが光ったままになる。
    highlight([]);
    // 印も消えるので、カーソルが指しているものを送り直す。
    sendAim();
    return;
  }
  // **古いマップを出しっぱなしにしない。** 残したまま置くと、書き換えは
  // できないのに掴めてしまい、返る文面も的を外す。
  void panel.webview.postMessage({
    kind: 'map',
    html: '<p class="cf-note">フェンスを見失いました (元の Markdown を閉じたか、'
      + 'フェンスの行がずれました)。circuit フェンスの中にカーソルを置くとマップが出ます。</p>',
  });
}

/**
 * マップで掴んだものをエディタで光らせる。**フォーカスは動かさない** —
 * 掴んでいる最中にエディタが前へ出ると、マップが隠れて置けなくなる。
 * 見えていないエディタには何もしない (光らせる先が無い)。
 */
function highlight(spans: readonly { line: number; column: number; length: number }[]): void {
  const fence = spans.length === 0 ? null : currentFence();

  const ranges = fence === null ? [] : spans.map((span) => {
    // フェンスの中の行 → Markdown の行 (書き換えと同じ手口)。剥がされた
    // 字下げは行ごとに違うので、行ごとに数えて足し戻す。
    const line = fence.line + span.line - 1;
    const opening = fence.document.lineAt(fence.line - 1).text;
    const indent = strippedIndent(opening, fence.document.lineAt(line).text);
    return new vscode.Range(line, span.column + indent, line, span.column + indent + span.length);
  });

  // **見えているエディタは全部触る。** 光らせる先だけを見ると、別の文書へ
  // 乗り換えたときに前の文書の光が永久に取り残される。
  for (const editor of vscode.window.visibleTextEditors) {
    const mine = bound !== null && editor.document.uri.toString() === bound.uri.toString();
    editor.setDecorations(HIGHLIGHT, mine ? ranges : []);
    const first = mine ? ranges[0] : undefined;
    // 見えていないところにあるときだけ寄せる。勝手にスクロールし続けない。
    if (first) editor.revealRange(first, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }
}

/** マップから来た「これを掴んだ」。`what` が無ければ光を消す。 */
function showSelection(what: string | undefined, id: string | undefined): void {
  const fence = currentFence();
  if (!fence || what === undefined || id === undefined) {
    highlight([]);
    return;
  }
  if (what === 'node') {
    const address = parseAddress(id);
    highlight(address === null ? [] : nodeSpans(fence.source, address));
    return;
  }
  highlight(partSpans(fence.source, id));
}

/**
 * エディタのカーソルが指しているものをマップで光らせる (掴んだものを
 * エディタで光らせるのと逆向き)。マップを組み直すたびに送る —
 * 中身を入れ替えると印も消えるため。
 */
function sendAim(): void {
  if (!panel) return;
  const editor = markdownEditor();
  const fence = editor === null ? null : fenceAt(editor.document.getText(), editor.selection.active.line + 1);
  if (!editor || !fence) {
    void panel.webview.postMessage({ kind: 'aim' });
    return;
  }

  // Markdown の行 → フェンスの中の行。剥がされた字下げのぶん桁を戻す。
  const at = editor.selection.active.line;
  const indent = strippedIndent(editor.document.lineAt(fence.line - 1).text, editor.document.lineAt(at).text);
  const line = at + 1 - fence.line;
  const aim = aimAt(fence.source, line, Math.max(0, editor.selection.active.character - indent));
  if (aim === null) {
    void panel.webview.postMessage({ kind: 'aim' });
    return;
  }
  void panel.webview.postMessage({
    kind: 'aim',
    what: aim.kind,
    id: aim.kind === 'part' ? aim.id : aim.kind === 'node' ? formatAddress(aim.address) : String(aim.line),
  });
}

const say = (text: string): void => {
  if (panel) void panel.webview.postMessage({ kind: 'status', text });
};

/** いま掴めるフェンス。見失っていたら理由を言う (**黙って戻らない** — webview は「…」のまま待ってしまう)。 */
function fenceNow(): FenceNow | null {
  const fence = currentFence();
  if (!fence) {
    say('フェンスを見失いました。circuit フェンスの中にカーソルを置いて掴み直します');
    return null;
  }
  return fence;
}

/**
 * 動かしたあとのお知らせ。接続が変わったらそれも添える。
 *
 * **確認では止めない** (2026-09-02 の決め)。掴んで放すたびにモーダルが出ると、
 * 動かすという本来の用途で邪魔になる。変化を黙らせはしない — 帯に出す。
 * 戻したければ Ctrl+Z (書き換えは普通の編集として当たる)。
 */
const told = (done: string, changed: string | null): void =>
  say(`${done}${changed === null ? '' : `。${changed}`}`);

/** マップから来た「どの節点を・どの番地へ」。**交点ごと動くので接続は保たれる。** */
async function applyNodeMove(written: string, target: string): Promise<void> {
  const fence = fenceNow();
  if (!fence) return;

  const at = parseAddress(written);
  const to = parseAddress(target);
  if (at === null || to === null) {
    say(`番地として読めません: ${at === null ? written : target}`);
    return;
  }

  const result = movePoint(fence.source, at, to);
  if (!result.ok) {
    say(result.error.message);
    return;
  }
  if (result.value.edits.length === 0) {
    say(`節点はすでに ${written} にあります`);
    return;
  }
  const applied = await applyToDocument(fence.document, fence.line, result.value.edits);
  if (applied === null) {
    say('書き換えられませんでした');
    return;
  }
  history.push({ label: `${written} の節点を ${target} へ`, changes: applied });
  told(`${written} の節点を ${target} へ動かしました`, describeDiff(result.value.diff));
}

/** マップから来た「どの部品を・どの番地へ」を書き換えに落とす。 */
async function applyMove(partId: string, written: string): Promise<void> {
  const fence = fenceNow();
  if (!fence) return;

  const to = parseAddress(written);
  if (to === null) {
    say(`番地として読めません: ${written}`);
    return;
  }

  const result = movePart(fence.source, partId, to);
  if (!result.ok) {
    say(result.error.message);
    return;
  }
  if (result.value.edits.length === 0) {
    say(`${partId} はすでに ${written} にあります`);
    return;
  }

  const applied = await applyToDocument(fence.document, fence.line, result.value.edits);
  if (applied === null) {
    say('書き換えられませんでした');
    return;
  }
  history.push({ label: `${partId} を ${written} へ`, changes: applied });
  told(`${partId} を ${written} へ動かしました`, describeDiff(result.value.diff));
}

/**
 * 1 歩戻す / やり直す。**当ててから履歴を動かす** — 先に動かすと、
 * 当てられなかったときに履歴が嘘になる。
 *
 * 当てられないのは、覚えたあとに手で書き換えられたとき。**黙って当てない**
 * (覚えている桁はもう別の場所を指している)。その 1 歩は捨てて、
 * エディタの `Ctrl+Z` を使ってもらう。
 */
async function stepBack(kind: 'undo' | 'redo'): Promise<void> {
  // **フェンスを先に確かめる。** 履歴を捨てるのは `currentFence` の中なので、
  // 先に取り出すと、別の文書へ切り替わった瞬間の 1 歩を当ててしまう。
  const fence = fenceNow();
  if (!fence) return;

  const undoing = kind === 'undo';
  const step = undoing ? history.takeUndo() : history.takeRedo();
  if (step === null) {
    say(undoing ? '戻せる移動がありません' : 'やり直せる移動がありません');
    return;
  }

  // 戻すのは逆向き、やり直すのはそのまま。
  const changes = undoing ? invert(step).changes : step.changes;
  if (!(await applyChanges(fence.document, changes))) {
    if (undoing) history.dropUndo();
    else history.dropRedo();
    say(`${step.label} は戻せません (そのあと手で書き換えられています)。エディタの Ctrl+Z を使います`);
    return;
  }

  if (undoing) history.commitUndo();
  else history.commitRedo();
  say(undoing ? `${step.label} を戻しました` : `${step.label} をやり直しました`);
}
