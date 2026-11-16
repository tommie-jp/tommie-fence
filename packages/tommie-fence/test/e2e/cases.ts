import * as vscode from 'vscode';
import type { Case } from './runner.ts';
import { expectThat, until } from './runner.ts';

/**
 * 本物の VS Code でしか確かめられないこと (52 の docs/57)。単体試験は vscode を
 * スタブにしているので、「有効化に失敗する」「manifest の綴りが違って登録されない」
 * 「webview が立たない」類はここでしか見えない。
 */

const EXTENSION_ID = 'tommie.tommie-fence';

/**
 * 読めない行を 1 つ持つ perf (中の 3 行目 = Markdown の 4 行目)。**短い綴りで書く** —
 * 長い綴りは下の TWO_FENCES が通る (どちらも読む。52 の docs/08)。
 */
const BROKEN = ['# 壊れた基板', '```perf', 'board: 12x7', 'parts:', '  R1: resistr b2 b6', '```', ''].join('\n');

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
    expectThat(error?.code === 'perf', `コードが perf ではありません: ${String(error?.code)}`);
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

/**
 * プレビューの markdown-it に載っている (基板と画面は SVG を自分で組むので待たずに出る)。
 * circuit は TeX を回すので待たない。計器の画面は vna・scope・spectrum の 3 つとも見る。グラフ (graph) とロジックアナライザの画面 (logic) も見る。
 */
const rendersPreview: Case = {
  name: 'renders the fences through the markdown preview engine',
  run: async () => {
    const document = await vscode.workspace.openTextDocument(tryMe());
    const html = await vscode.commands.executeCommand<string>('markdown.api.render', document);
    expectThat(typeof html === 'string', 'markdown.api.render が字を返しません');
    expectThat(html.includes('data-breadboard-fence'), 'breadboard の図が組まれていません');
    expectThat(html.includes('data-perfboard-fence'), 'perfboard の図が組まれていません');
    expectThat(html.includes('data-copper-fence'), 'copper の図が組まれていません');
    expectThat(html.includes('data-vna-fence'), 'vna の図が組まれていません');
    expectThat(html.includes('data-scope-fence'), 'scope の図が組まれていません');
    expectThat(html.includes('data-spectrum-fence'), 'spectrum の図が組まれていません');
    expectThat(html.includes('data-graph-fence'), 'graph の図が組まれていません');
    expectThat(html.includes('data-logic-fence'), 'logic の図が組まれていません');
  },
};

/**
 * 部品カード (52 の docs/158)。ワークスペースに `.tommie-fence/parts/*.part.yaml` を置くと、
 * 再表示の操作なしに Problems から「表に無い」が消え、プレビューにピンの名前が出る。
 * 壊れたカードは、カードのファイルの行に Problems が載る。試したファイルは消す。
 */
const readsLocalCards: Case = {
  name: 'reads part cards from .tommie-fence/parts without a reload',
  run: async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (folder === undefined) throw new Error('examples/ を開いて立てていません');
    const parts = vscode.Uri.joinPath(folder.uri, '.tommie-fence', 'parts');
    const card = vscode.Uri.joinPath(parts, 'e2e-xy1234.part.yaml');
    const broken = vscode.Uri.joinPath(parts, 'e2e-broken.part.yaml');
    const page = vscode.Uri.joinPath(folder.uri, 'e2e-cards.md');
    const write = (uri: vscode.Uri, text: string) => vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(text));
    /**
     * カードは利用者と同じく VS Code の操作で作る (エクスプローラの「新しいファイル」と同じ道)。
     * `fs.writeFile` で作ると、VS Code が「作成」の知らせを時々落とし、CI で時々落ちた。
     */
    const create = async (uri: vscode.Uri, text: string): Promise<void> => {
      const edit = new vscode.WorkspaceEdit();
      edit.createFile(uri, { overwrite: true, contents: new TextEncoder().encode(text) });
      expectThat(await vscode.workspace.applyEdit(edit), `${uri.path} を作れません`);
    };
    try {
      await write(page, '# カード\n\n```bread\nparts:\n  U1: dip8 e10 XY1234\n```\n');
      const editor = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(page));
      const unknown = (): boolean => vscode.languages.getDiagnostics(editor.document.uri)
        .some((one) => one.source === 'tommie-fence' && one.message.includes('XY1234'));
      await until(unknown, 'カードが無いうちは「表に無い」が載る');

      await create(card, 'models: [XY1234]\npackage: dip8\nrole: 試験\npins: [1A, 1B, 1Y, GND, 2Y, 2A, 2B, VCC]\nsource: 試験\n');
      await until(() => !unknown(), 'カードを置くと「表に無い」が消える');
      const html = await vscode.commands.executeCommand<string>('markdown.api.render', editor.document);
      expectThat(html.includes('1Y'), 'プレビューにカードのピンの名前が出ていません');

      await create(broken, 'models: [XB1]\npackage: dip8\nrole: r\npins: [A]\nsource: s\n');
      await until(() => vscode.languages.getDiagnostics(broken).some((one) => one.range.start.line === 3), '壊れたカードの 4 行目に Problems が載る');
    } finally {
      for (const uri of [card, broken, page]) await vscode.workspace.fs.delete(uri).then(undefined, () => undefined);
      await vscode.workspace.fs.delete(vscode.Uri.joinPath(folder.uri, '.tommie-fence'), { recursive: true }).then(undefined, () => undefined);
      await closeAll();
    }
  },
};

/** デスクトップで回すもの。 */
export const DESKTOP_CASES: readonly Case[] = [
  wakesOnMarkdown, listsProblems, opensCustomEditor, opensPanelFromOutside, rendersPreview, readsLocalCards,
];

/**
 * web 版で回すもの。**プレビューは見ない** (web の Markdown 拡張は
 * `markdown.api.render` を持たない版がある。図は TeX が要らないブレッドボードとユニバーサル基板なら
 * 出るが、確かめ方が無い)。
 */
export const WEB_CASES: readonly Case[] = [wakesOnMarkdown, listsProblems, opensCustomEditor, opensPanelFromOutside];
