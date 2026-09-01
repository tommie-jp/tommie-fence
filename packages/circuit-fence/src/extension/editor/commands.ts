import * as vscode from 'vscode';
import { openMapPanel } from './panel.ts';
import { runMovePart } from './movePart.ts';
import { createEditorPort } from './vscodePort.ts';

/**
 * 「部品を動かす」の登録。**デスクトップと web の両方で登録する。**
 *
 * この機能は TeX を通らない — 書き換えは番地の綴りの差し替えで、マップは
 * パース済みモデルから組む。web で欠けるのは**書き換えたあとの図**だけで、
 * それは web 版がもともと描けないもの (既存の制約) にすぎない。
 */
export function registerEditorCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('circuit-fence.movePart', () => runMovePart(createEditorPort())),
    vscode.commands.registerCommand('circuit-fence.openMap', () => openMapPanel(context)),
  );
}
