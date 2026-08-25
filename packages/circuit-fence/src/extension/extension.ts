import * as vscode from 'vscode';
import { renderTex } from '../host/texSvg.ts';
import { activateWith } from './activate.ts';

/** デスクトップ版の入口。描画は WASM の TeX (node-tikzjax)。 */
export function activate() {
  return activateWith({
    render: renderTex,
    refresh: () => {
      void vscode.commands.executeCommand('markdown.preview.refresh');
    },
  });
}

export function deactivate(): void {
  // 抱えているのは描画のキャッシュだけなので、後片付けは要らない。
}
