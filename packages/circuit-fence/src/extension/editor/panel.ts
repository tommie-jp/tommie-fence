import * as vscode from 'vscode';
import { fenceAt, gridMap, renderMapHtml } from '../../core/edit/map.ts';
import { parseAddress } from '../../core/model/address.ts';
import { movePart } from '../../core/edit/move.ts';
import { movePoint } from '../../core/edit/point.ts';
import { describeDiff } from './movePart.ts';
import { applyToDocument } from './vscodePort.ts';
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

  view.onDidDispose(() => { panel = null; bound = null; }, null, context.subscriptions);

  view.webview.onDidReceiveMessage(
    async (message: { kind: string; part?: string; from?: string; to?: string }) => {
      if (message.kind === 'move' && message.part && message.to) {
        await applyMove(message.part, message.to);
        refresh();
        return;
      }
      if (message.kind === 'moveNode' && message.from && message.to) {
        await applyNodeMove(message.from, message.to);
        refresh();
      }
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
  const now = mapHtmlNow();
  if (now) {
    void panel.webview.postMessage({ kind: 'map', html: now.html });
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
 * **接続が変わるときだけ確認する。** 変わらない移動で毎回止めると、
 * 番地の振り直しという本来の用途で邪魔になる。放したら false。
 */
async function agreed(changed: string | null, headline: string): Promise<boolean> {
  if (changed === null) return true;
  const answer = await vscode.window.showWarningMessage(
    `${headline}。${changed}`,
    { modal: true },
    '動かす',
  );
  if (answer === '動かす') return true;
  say('やめました');
  return false;
}

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
  if (!(await agreed(describeDiff(result.value.diff), `${written} の節点を ${target} へ`))) return;

  const applied = await applyToDocument(fence.document, fence.line, result.value.edits);
  say(applied ? `${written} の節点を ${target} へ動かしました` : '書き換えられませんでした');
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

  if (!(await agreed(describeDiff(result.value.diff), `${partId} を ${written} へ`))) return;

  const applied = await applyToDocument(fence.document, fence.line, result.value.edits);
  say(applied ? `${partId} を ${written} へ動かしました` : '書き換えられませんでした');
}
