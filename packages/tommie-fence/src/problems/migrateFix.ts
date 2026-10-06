import * as vscode from 'vscode';
import { migrateCircuitFences } from 'circuit-fence/src/core/migrate.ts';

/**
 * 旧い番地の綴り (`a1` `a1f5`) を `x,y` に書き換えるクイックフィックス (52 の docs/126 の段 9)。
 *
 * circuit-fence 0.35.0 から旧綴りは読まずに断る (`a1f5 は旧い綴りです。1.5,1.5 と書きます`)。
 * 1 か所ずつ直すと数百か所になる文書もあるので、**その文書の回路図をまとめて 1 操作で**
 * 書き換える。中身は core の `migrateCircuitFences` (教科書の一括変換と同じ物) で、
 * ここは「どの行をどう差し替えるか」と vscode への配線だけ。
 */

/** 旧綴りを断った文の目印。core の `oldSpellingHint` の文面。 */
const OLD_SPELLING = '旧い綴りです';

/** その診断が circuit の旧綴りか。 */
export const isOldSpelling = (diagnostic: { readonly message: string; readonly code?: unknown }): boolean =>
  diagnostic.code === 'circuit' && diagnostic.message.includes(OLD_SPELLING);

/**
 * 書き換えた行 (0 始まり) と中身。**行の数は変わらない** (語の置き換えだけ) ので、
 * 変わった行だけを差し替える — 文書を丸ごと置き換えると、カーソルと折り畳みが飛ぶ。
 */
export function migratedLines(text: string): { readonly lines: readonly { readonly line: number; readonly text: string }[]; readonly changed: number } {
  const result = migrateCircuitFences(text);
  if (result.changed === 0) return { lines: [], changed: 0 };
  const before = text.split(/\r?\n/);
  const after = result.text.split(/\r?\n/);
  const lines = before.flatMap((line, index) => {
    const next = after[index];
    return next === undefined || next === line ? [] : [{ line: index, text: next }];
  });
  return { lines, changed: result.changed };
}

export function registerMigrateFix(context: vscode.ExtensionContext): void {
  const provider: vscode.CodeActionProvider = {
    provideCodeActions(document, _range, actionContext) {
      const diagnostics = actionContext.diagnostics.filter(isOldSpelling);
      if (diagnostics.length === 0) return [];
      const { lines, changed } = migratedLines(document.getText());
      if (lines.length === 0) return [];

      const action = new vscode.CodeAction(
        vscode.l10n.t('Rewrite the circuit addresses as x,y ({0} places)', String(changed)),
        vscode.CodeActionKind.QuickFix,
      );
      action.diagnostics = diagnostics;
      action.isPreferred = true;
      const edit = new vscode.WorkspaceEdit();
      for (const { line, text } of lines) edit.replace(document.uri, document.lineAt(line).range, text);
      action.edit = edit;
      return [action];
    },
  };
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider({ language: 'markdown' }, provider, {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }),
  );
}
