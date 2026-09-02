import * as vscode from 'vscode';
import { registerMapEditor } from './customEditor.ts';
import { openMapPanel } from './panel.ts';

/**
 * マップの入口。**タブそのものをマップにするカスタムエディタ**と、
 * 横に開くコマンドの 2 つ。デスクトップと web の両方で登録する
 * (描画は同期の純関数なので、web でも図まで出る)。
 *
 * QuickPick で動かすコマンド (circuit-fence にある「部品を動かす」) は
 * 置いていない。**図そのものを掴める**ので、番地を打つ道が要らない。
 */
export function registerEditorCommands(context: vscode.ExtensionContext): void {
  registerMapEditor(context);
  context.subscriptions.push(
    vscode.commands.registerCommand('perfboard-fence.openMap', () => openMapPanel(context)),
  );
}
