import * as vscode from 'vscode';
import { renderTex } from 'circuit-fence/tex.web';
import { activateWith } from './activate.ts';
import { registerEditorCommands } from './editor/commands.ts';
import { fenceEditors } from './editor/fences.ts';
import { registerProblems } from './problems/diagnostics.ts';
import { vnaProblems } from './vna.ts';

/**
 * web 版 (vscode.dev / github.dev) の入口。
 * WASM の TeX は Node のファイル読み込みと jsdom に依存していて動かないので、
 * 図だけ描けない。検証・ネットリスト・行番号つきエラーはそのまま使える。
 *
 * **「部品を動かす」もそのまま使える。** 書き換えは番地の綴りの差し替えで、
 * マップはパース済みモデルから組むので TeX を通らない。欠けるのは
 * 書き換えたあとの図だけで、それはもともと描けないもの。
 */
export function activate(context: vscode.ExtensionContext) {
  registerEditorCommands(context);
  // 読めなかった行を Problems パネルにも出す。TeX を通らないので web 版でも動く。
  // vna の `data:` は読めない (fs が無い)。vna がそう言う。
  registerProblems(context, [...fenceEditors(), vnaProblems()]);

  return activateWith({
    render: renderTex,
    refresh: () => {
      void vscode.commands.executeCommand('markdown.preview.refresh');
    },
  });
}

export function deactivate(): void {
  // 抱えているものは無い。
}
