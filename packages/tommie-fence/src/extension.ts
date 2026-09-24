import { join } from 'node:path';
import * as vscode from 'vscode';
import { renderTex } from 'circuit-fence/tex';
import { createWorkerRenderer } from 'circuit-fence/tex-worker';
import { activateWith } from './activate.ts';
import { registerEditorCommands } from './editor/commands.ts';
import { fenceEditors } from './editor/fences.ts';
import { registerProblems } from './problems/diagnostics.ts';
import { vnaProblems } from './vna.ts';
import { dataForUri, readDataFromEnv } from './vnaData.ts';

/**
 * デスクトップ版の入口。回路図の描画は WASM の TeX (node-tikzjax)。
 *
 * **描くのは別のスレッド。** エンジンは WASM を呼んだスレッドで回すので、
 * 拡張ホストで直に呼ぶと 1 枚に 0.4〜3.3 秒プロセスごと止まる — そのあいだ
 * マップからの知らせも、ほかの拡張のタイマーも待たされる (52 の docs/27)。
 * 立てられなければ今までどおり同じスレッドで描く (図が出ないよりはよい)。
 */
export function activate(context: vscode.ExtensionContext) {
  registerEditorCommands(context);
  // 読めなかった行を Problems パネルにも出す。TeX を通らないので web 版でも動く。
  // vna は殻を持たないので Problems の口だけ。`data:` は文書の隣を読む。
  const editors = fenceEditors();
  registerProblems(context, (document) => [...editors, vnaProblems(dataForUri(document.uri))]);

  return activateWith({
    render: createWorkerRenderer({
      workerPath: join(__dirname, 'tex-worker.cjs'),
      fallback: renderTex,
    }),
    refresh: () => {
      void vscode.commands.executeCommand('markdown.preview.refresh');
    },
    readData: readDataFromEnv,
  });
}

export function deactivate(): void {
  // 抱えているのは描画のキャッシュだけなので、後片付けは要らない。
}
