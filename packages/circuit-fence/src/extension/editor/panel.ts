import * as vscode from 'vscode';
import { fenceAt, gridMap, renderMapHtml } from '../../core/edit/map.ts';
import { parseAddress } from '../../core/model/address.ts';
import { movePart } from '../../core/edit/move.ts';
import { describeDiff } from './movePart.ts';
import { createEditorPort } from './vscodePort.ts';
import { makeNonce, panelHtml } from './panelHtml.ts';

/**
 * マップのパネル。**vscode の縁だけ**を持ち、升目も書き換えも core の純関数。
 *
 * 図そのものではなくマップを掴ませる理由は `core/edit/map.ts` の頭書き。
 * ドラッグ中は選択の見た目だけが動き、**放したとき 1 回だけ**書き換えて
 * コンパイルする (TeX → SVG は 1 図 1 秒前後かかるので追従させない)。
 */

let panel: vscode.WebviewPanel | null = null;

const markdownEditor = (): vscode.TextEditor | null => {
  const editor = vscode.window.activeTextEditor;
  return editor?.document.languageId === 'markdown' ? editor : null;
};

/** いまカーソルのあるフェンスからマップを組む。無ければ null。 */
function mapHtmlNow(): { html: string; fenceLine: number } | null {
  const editor = markdownEditor();
  if (!editor) return null;

  const fence = fenceAt(editor.document.getText(), editor.selection.active.line + 1);
  if (!fence) return null;
  return { html: renderMapHtml(gridMap(fence.source)), fenceLine: fence.line };
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
    '部品を動かす',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true },
  );
  const view = panel;
  view.webview.html = panelHtml({
    cspSource: view.webview.cspSource,
    nonce: makeNonce(),
    mapHtml: now.html,
  });

  view.onDidDispose(() => { panel = null; }, null, context.subscriptions);

  view.webview.onDidReceiveMessage(async (message: { kind: string; part?: string; to?: string }) => {
    if (message.kind !== 'move' || !message.part || !message.to) return;
    await applyMove(message.part, message.to);
    refresh();
  }, null, context.subscriptions);

  // 手で書き換えたときもマップを追いつかせる。デバウンスは要らない
  // (組むのはパース済みモデルからで、TeX は通らない)。
  const listeners = [
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document === markdownEditor()?.document) refresh();
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
    html: '<p class="cf-note">カーソルが circuit フェンスの外にあります。'
      + 'フェンスの中へ戻すとマップが出ます。</p>',
  });
}

const say = (text: string): void => {
  if (panel) void panel.webview.postMessage({ kind: 'status', text });
};

/** マップから来た「どの部品を・どの番地へ」を書き換えに落とす。 */
async function applyMove(partId: string, written: string): Promise<void> {
  const editor = markdownEditor();
  if (!editor) {
    // **黙って戻らない。** webview は「…」を出したまま待ってしまう。
    say('Markdown のエディタが前に出ていません');
    return;
  }

  const fence = fenceAt(editor.document.getText(), editor.selection.active.line + 1);
  if (!fence) {
    say('カーソルが circuit フェンスの外にあります (フェンスの中へ戻します)');
    return;
  }
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

  // **接続が変わるときだけ確認する。** 変わらない移動で毎回止めると、
  // 番地の振り直しという本来の用途で邪魔になる。
  const changed = describeDiff(result.value.diff);
  if (changed !== null) {
    const answer = await vscode.window.showWarningMessage(
      `${partId} を ${written} へ。${changed}`,
      { modal: true },
      '動かす',
    );
    if (answer !== '動かす') {
      say('やめました');
      return;
    }
  }

  const applied = await createEditorPort().apply(fence.line, result.value.edits);
  say(applied ? `${partId} を ${written} へ動かしました` : '書き換えられませんでした');
}
