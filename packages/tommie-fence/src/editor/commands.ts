import * as vscode from 'vscode';
import { registerMapEditor } from './customEditor.ts';
import { openMapPanel } from './panel.ts';
import { runMovePart } from './movePart.ts';
import { runMovePoint } from './movePoint.ts';
import { createEditorPort } from './vscodePort.ts';
import { watchFenceContext } from './context.ts';
import { fenceEditors } from './fences.ts';

/**
 * この拡張が出す命令。**掴んで動かす editor は 1 つ**で、3 つのフェンスを扱う
 * (52 の docs/19)。番地を打って動かす 2 つは circuit の文法にしかない道なので、
 * **綴りは `circuit-fence.` のまま残す** — 一度公開した命令の名前は、
 * キー割り当てを書いた人の設定を壊さない。
 */
export function registerEditorCommands(context: vscode.ExtensionContext): void {
  registerMapEditor(context);
  // 題の右の釦 (`tommie-fence.openMap`) を、フェンスのある `.md` にだけ出す。
  watchFenceContext(context, fenceEditors().map((one) => one.language));
  context.subscriptions.push(
    vscode.commands.registerCommand('tommie-fence.openMap', () => openMapPanel(context)),
    vscode.commands.registerCommand('circuit-fence.movePart', () => runMovePart(createEditorPort())),
    vscode.commands.registerCommand('circuit-fence.movePoint', () => runMovePoint(createEditorPort())),
    // 旧 id。**古い設定から流す** (畳む前のキー割り当てをそのまま生かす)。
    vscode.commands.registerCommand('circuit-fence.openMap', () => openMapPanel(context)),
    vscode.commands.registerCommand('breadboard-fence.openMap', () => openMapPanel(context)),
    vscode.commands.registerCommand('perfboard-fence.openMap', () => openMapPanel(context)),
  );
}
