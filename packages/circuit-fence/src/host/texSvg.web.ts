import type { RenderOutcome } from './renderQueue.ts';

/**
 * web 版の拡張 (vscode.dev / github.dev) 用の差し替え。
 *
 * node-tikzjax は jsdom と Node のファイル読み込みに依存していてブラウザでは動かない。
 * 黙って何も出さないのではなく、描けないことをはっきり返す。
 * 検証・ネットリスト・行番号つきエラーは core (純関数) にあるので web でもそのまま動く。
 */
export const renderTex = async (_tex: string): Promise<RenderOutcome> => ({
  ok: false,
  kind: 'message',
  message: 'web 版では図を描けません (デスクトップの VS Code で開くと描けます)',
});
