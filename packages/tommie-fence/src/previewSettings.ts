import * as vscode from 'vscode';
import type { ImageAfterFence, ImageAfterFenceOptions } from './imageAfterFence.ts';

const SECTION = 'tommieFence.preview';
const MODES: readonly ImageAfterFence[] = ['collapse', 'hide', 'show'];

/** 設定の値。知らない値 (手で書いた綴り違い) は既定の `collapse` に倒す。 */
export const imageAfterFenceMode = (value: unknown): ImageAfterFence =>
  MODES.find((mode) => mode === value) ?? 'collapse';

/**
 * GitHub 用の画像を畳む口 (52 の docs/101)。設定は描くたびに読み、変わったら
 * プレビューに描き直させる。**デスクトップと web で同じ** — TeX を通らない。
 */
export function imageAfterFenceOptions(context: vscode.ExtensionContext, refresh: () => void): ImageAfterFenceOptions {
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(SECTION)) refresh();
    }),
  );
  return {
    mode: () => imageAfterFenceMode(vscode.workspace.getConfiguration(SECTION).get('imageAfterFence')),
    label: (alt) => vscode.l10n.t('Image for GitHub: {0}', alt),
  };
}
