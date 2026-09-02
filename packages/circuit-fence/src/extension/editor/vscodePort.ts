import * as vscode from 'vscode';
import type { Edit } from '../../core/edit/move.ts';
import { changesForFence } from './docEdits.ts';
import type { Change } from './history.ts';
import type { DocumentView, EditorPort } from './movePart.ts';

/**
 * `EditorPort` の vscode 版。**ここだけが vscode を知る**ので、薄く保つ
 * (段取りそのものは `movePart.ts` にあり、そちらはテストに掛かっている)。
 */

/** アクティブな Markdown のエディタ。webview にフォーカスがあるときは無い。 */
export const markdownEditor = (): vscode.TextEditor | null => {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return null;
  return editor.document.languageId === 'markdown' ? editor : null;
};

/**
 * 覚えておいた書き換えを当て直す (戻す・やり直す)。
 *
 * **当てる前に、そこにある字が控えと合うか確かめる。** 合わなければ何もしない
 * (手で書き換えられていたら、覚えている桁はもう別の場所を指している)。
 * 黙って当てると、関係のない字を壊す。
 */
export async function applyChanges(
  document: vscode.TextDocument,
  changes: readonly Change[],
): Promise<boolean> {
  const edit = new vscode.WorkspaceEdit();
  for (const change of changes) {
    const { column, text } = change.from;
    const range = new vscode.Range(change.line, column, change.line, column + text.length);
    if (document.getText(range) !== text) return false;
    edit.replace(document.uri, range, change.to.text);
  }
  return vscode.workspace.applyEdit(edit);
}

/**
 * 編集を文書へ当てる。**アクティブなエディタを要求しない** — マップのパネルは
 * 掴んだ時点で Markdown が後ろに隠れていることがある (同じタブグループに
 * 入れた配置)。当て先は呼ぶ側が覚えている文書で決める。
 *
 * 当てた中身 (元の字と入れた字) を返す。**パネルの履歴がこれを覚えて逆を当てる** —
 * VS Code の `Ctrl+Z` はエディタにフォーカスが要るので、パネルからは届かない。
 * 行と桁の計算は `changesForFence` (vscode を知らず、テストに掛かる)。
 */
export async function applyToDocument(
  document: vscode.TextDocument,
  fenceLine: number,
  edits: readonly Edit[],
): Promise<readonly Change[] | null> {
  const changes = changesForFence(document, fenceLine, edits);
  return (await applyChanges(document, changes)) ? changes : null;
}

export function createEditorPort(): EditorPort {
  return {
    document: (): DocumentView | null => {
      const editor = markdownEditor();
      if (!editor) return null;
      // vscode の行は 0 始まり、こちらの行は 1 始まり。
      return { text: editor.document.getText(), line: editor.selection.active.line + 1 };
    },

    pick: async (items, placeholder) => (await vscode.window.showQuickPick([...items], { placeHolder: placeholder })) ?? null,

    prompt: async (placeholder, value) =>
      (await vscode.window.showInputBox({ prompt: placeholder, value })) ?? null,

    apply: async (fenceLine: number, edits: readonly Edit[]) => {
      const editor = markdownEditor();
      if (!editor) return false;
      return (await applyToDocument(editor.document, fenceLine, edits)) !== null;
    },

    info: (message) => {
      void vscode.window.showInformationMessage(message);
    },
    warn: (message) => {
      void vscode.window.showWarningMessage(message);
    },
  };
}
