import * as vscode from 'vscode';
import type { Case } from './runner.ts';
import { expectThat, until } from './runner.ts';

/**
 * 本物の VS Code でしか確かめられないこと (52 の docs/57)。単体試験は vscode を
 * スタブにしているので、「有効化に失敗する」「manifest の綴りが違って登録されない」
 * 「webview が立たない」類はここでしか見えない。
 */

const EXTENSION_ID = 'tommie.tommie-fence';

/** 読めない行を 1 つ持つ perfboard (中の 3 行目 = Markdown の 4 行目)。 */
const BROKEN = ['# 壊れた板', '```perfboard', 'board: 12x7', 'parts:', '  R1: resistr b2 b6', '```', ''].join('\n');

/** フェンスが 2 つあり、カーソルを置く 1 行目はどちらの外でもある文書。 */
const TWO_FENCES = [
  '# 2 つのフェンス',
  '',
  '```breadboard',
  'board: half',
  'parts:',
  '  R1: resistor a5 a10 330',
  '```',
  '',
  '```perfboard',
  'board: 12x7',
  'parts:',
  '  R1: resistor b2 b6 1k',
  '```',
  '',
].join('\n');

const openMarkdown = async (content: string): Promise<vscode.TextEditor> => {
  const document = await vscode.workspace.openTextDocument({ language: 'markdown', content });
  return vscode.window.showTextDocument(document);
};

const closeAll = async (): Promise<void> => {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
};

/** 試す文書 (`examples/try-me.md`)。VS Code は examples/ を開いて立てる。 */
const tryMe = (): vscode.Uri => {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder === undefined) throw new Error('examples/ を開いて立てていません');
  return vscode.Uri.joinPath(folder.uri, 'try-me.md');
};

const allTabs = (): readonly vscode.Tab[] => vscode.window.tabGroups.all.flatMap((group) => group.tabs);

/**
 * `.md` を開いただけで起きる。プレビューも命令も使わない。
 * **`onLanguage:markdown` を外しても通る** (Markdown 拡張がプレビューの部品を
 * 読みに来て起こす)。見ているのは「開けば起きる」という振る舞いのほう。
 */
const wakesOnMarkdown: Case = {
  name: 'wakes up when a markdown file opens',
  run: async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    expectThat(extension !== undefined, `${EXTENSION_ID} が見つかりません`);
    await openMarkdown('# 起こす\n');
    await until(() => extension?.isActive === true, '拡張が起きる');
  },
};

/** 読めない行が Problems に載る。行は Markdown の行、出どころは tommie-fence。 */
const listsProblems: Case = {
  name: 'lists an unreadable line in the Problems panel',
  run: async () => {
    const editor = await openMarkdown(BROKEN);
    const ours = (): readonly vscode.Diagnostic[] =>
      vscode.languages.getDiagnostics(editor.document.uri).filter((one) => one.source === 'tommie-fence');
    await until(() => ours().some((one) => one.severity === vscode.DiagnosticSeverity.Error), 'Problems に Error が載る');
    const error = ours().find((one) => one.severity === vscode.DiagnosticSeverity.Error);
    expectThat(error?.range.start.line === 4, `Error の行が 0 始まりの 4 行目ではありません: ${error?.range.start.line}`);
    expectThat(error?.code === 'perfboard', `コードが perfboard ではありません: ${String(error?.code)}`);
    await closeAll();
  },
};

/** `.md` のタブをカスタムエディタで開き直せる (manifest の viewType と登録が合っている)。 */
const opensCustomEditor: Case = {
  name: 'reopens try-me.md in the Fence Editor',
  run: async () => {
    await vscode.commands.executeCommand('vscode.openWith', tryMe(), 'tommie-fence.map');
    await until(() => allTabs().some((tab) => tab.input instanceof vscode.TabInputCustom
      && tab.input.viewType === 'tommie-fence.map'), 'Fence Editor のタブが立つ');
    await closeAll();
  },
};

/** 題の釦と同じ命令。カーソルがフェンスの外でも、最初のフェンスへ移して横に開く。 */
const opensPanelFromOutside: Case = {
  name: 'opens the map beside a markdown file even with the cursor outside every fence',
  run: async () => {
    const editor = await openMarkdown(TWO_FENCES);
    editor.selection = new vscode.Selection(0, 0, 0, 0);
    await vscode.commands.executeCommand('tommie-fence.openMap');
    await until(() => allTabs().some((tab) => tab.input instanceof vscode.TabInputWebview
      && tab.input.viewType.includes('tommieFenceMap')), 'マップのパネルが立つ');
    // 最初のフェンス (breadboard、開き記号は 3 行目) の本文の 1 行目へ移っている。
    expectThat(editor.selection.active.line === 3, `カーソルが 0 始まりの 3 行目にありません: ${editor.selection.active.line}`);
    await closeAll();
  },
};

/** プレビューの markdown-it に 4 つとも載っている (板は SVG を自分で組むので待たずに出る)。 */
const rendersPreview: Case = {
  name: 'renders the fences through the markdown preview engine',
  run: async () => {
    const document = await vscode.workspace.openTextDocument(tryMe());
    const html = await vscode.commands.executeCommand<string>('markdown.api.render', document);
    expectThat(typeof html === 'string', 'markdown.api.render が字を返しません');
    expectThat(html.includes('data-breadboard-fence'), 'breadboard の図が組まれていません');
    expectThat(html.includes('data-perfboard-fence'), 'perfboard の図が組まれていません');
    expectThat(html.includes('data-copper-fence'), 'copper の図が組まれていません');
  },
};

/** デスクトップで回すもの。 */
export const DESKTOP_CASES: readonly Case[] = [
  wakesOnMarkdown, listsProblems, opensCustomEditor, opensPanelFromOutside, rendersPreview,
];

/**
 * web 版で回すもの。**プレビューは見ない** (web の Markdown 拡張は
 * `markdown.api.render` を持たない版がある。図は TeX が要らない板の 2 つなら
 * 出るが、確かめ方が無い)。
 */
export const WEB_CASES: readonly Case[] = [wakesOnMarkdown, listsProblems, opensCustomEditor, opensPanelFromOutside];
