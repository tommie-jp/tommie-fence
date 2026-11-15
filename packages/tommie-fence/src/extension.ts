import { join } from 'node:path';
import * as vscode from 'vscode';
import { renderTex } from 'circuit-fence/tex';
import { createWorkerRenderer } from 'circuit-fence/tex-worker';
import { createDiskStore, texCacheKey } from 'circuit-fence/tex-cache';
import { VERSION as CIRCUIT_VERSION } from 'circuit-fence/src/core';
import { activateWith } from './activate.ts';
import { imageAfterFenceOptions } from './previewSettings.ts';
import { registerEditorCommands } from './editor/commands.ts';
import { fenceEditors } from './editor/fences.ts';
import { registerProblems } from './problems/diagnostics.ts';
import { registerMigrateFix } from './problems/migrateFix.ts';
import { graphProblems, logicProblems, scopeProblems, spectrumProblems, vnaProblems } from './mapless.ts';
import { NEIGHBOR_READERS, dataForUri, graphDataFrom, scopeDataFrom, spectrumDataFrom, vnaDataFrom } from './neighborData.ts';
import { cardReader, cardSourceFor } from './cards/cardHooks.ts';
import { registerCards } from './cards/vscodeCards.ts';

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
  // vna・scope・spectrum・graph・logic は殻を持たないので Problems の口だけ。`data:` は文書の隣を読む (logic にはまだ無い)。
  // 部品カード (52 の docs/158) は文書ごと。殻は軽いので文書ごとに作る。
  const refreshProblems = registerProblems(context, (document) => [
    ...fenceEditors(cardSourceFor(document.uri)),
    vnaProblems(dataForUri(document.uri, vnaDataFrom)),
    scopeProblems(dataForUri(document.uri, scopeDataFrom)),
    spectrumProblems(dataForUri(document.uri, spectrumDataFrom)),
    graphProblems(dataForUri(document.uri, graphDataFrom)),
    logicProblems(),
  ]);
  // 旧い番地の綴り (`a1f5`) をまとめて x,y に書き換えるクイックフィックス (52 の docs/126)。
  registerMigrateFix(context);

  const refresh = (): void => {
    void vscode.commands.executeCommand('markdown.preview.refresh');
  };
  // カードが変わったら、プレビューを描き直し、フェンスの Problems も組み直す。
  registerCards(context, () => {
    refresh();
    refreshProblems();
  });
  return activateWith({
    render: createWorkerRenderer({
      workerPath: join(__dirname, 'tex-worker.cjs'),
      fallback: renderTex,
    }),
    refresh,
    imageAfterFence: imageAfterFenceOptions(context, refresh),
    readers: NEIGHBOR_READERS,
    cards: cardReader,
    // 描いた回路図は拡張の保存領域に控える (TeX は 1 枚 0.8 秒。開き直しても描き直さない。52 の docs/163)。
    figureStore: createDiskStore(join(context.globalStorageUri.fsPath, 'tex'), texCacheKey(CIRCUIT_VERSION)),
  });
}

export function deactivate(): void {
  // 抱えているのは描画のキャッシュだけなので、後片付けは要らない。
}
