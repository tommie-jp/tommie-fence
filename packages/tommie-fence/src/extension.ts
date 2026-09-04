import * as vscode from 'vscode';
import { renderTex } from 'circuit-fence/tex';
import { activateWith } from './activate.ts';
import { registerEditorCommands } from './editor/commands.ts';

/** デスクトップ版の入口。回路図の描画は WASM の TeX (node-tikzjax)。 */
export function activate(context: vscode.ExtensionContext) {
  registerEditorCommands(context);

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
