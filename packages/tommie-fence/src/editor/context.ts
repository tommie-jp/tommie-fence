import * as vscode from 'vscode';
import { FOLLOW_DELAY_MS } from './delay.ts';
import { hasFence } from './hasFence.ts';

/**
 * 題の右の釦 (`editor/title`) を出す文脈の鍵。`package.json` の `when` と同じ綴り。
 *
 * **フェンスのある `.md` にだけ出す** — Markdown を書く人の全員が電子工作を
 * しているわけではない (52 の docs/57)。
 */
export const HAS_FENCE = 'tommieFence.hasFence';

/**
 * 前に出ているテキストエディタを見て鍵を立てる。
 *
 * - 別のエディタが前に出たら、すぐ立て直す
 * - 前の文書が書き換わったら、`FOLLOW_DELAY_MS` でまとめて立て直す
 *   (フェンスを 1 字ずつ打つたびに文書を読み直さない)
 * - **テキストエディタが無くなったとき (マップのタブ、画像) は前の値のまま** —
 *   鍵は窓全体で 1 つなので、下ろすと横の組の `.md` の題からも釦が消える
 */
export function watchFenceContext(context: vscode.ExtensionContext, languages: readonly string[]): void {
  let current: boolean | null = null;
  let pending: ReturnType<typeof setTimeout> | null = null;

  const set = (value: boolean): void => {
    if (value === current) return;
    current = value;
    void vscode.commands.executeCommand('setContext', HAS_FENCE, value);
  };

  const judge = (editor: vscode.TextEditor | undefined): void => {
    if (editor === undefined) {
      if (current === null) set(false);
      return;
    }
    const { document } = editor;
    set(document.languageId === 'markdown' && hasFence(document.getText(), languages));
  };

  const judgeSoon = (): void => {
    if (pending !== null) return;
    pending = setTimeout(() => {
      pending = null;
      judge(vscode.window.activeTextEditor);
    }, FOLLOW_DELAY_MS);
  };

  judge(vscode.window.activeTextEditor);
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => judge(editor)),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document === vscode.window.activeTextEditor?.document) judgeSoon();
    }),
    {
      // **予約も片付ける。** 残すと、閉じたあとに鍵を立てにいく。
      dispose: () => {
        if (pending !== null) clearTimeout(pending);
        pending = null;
      },
    },
  );
}
