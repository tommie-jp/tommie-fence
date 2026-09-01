import * as vscode from 'vscode';
import type { Edit } from '../../core/edit/move.ts';
import type { DocumentView, EditorPort } from './movePart.ts';

/**
 * `EditorPort` の vscode 版。**ここだけが vscode を知る**ので、薄く保つ
 * (段取りそのものは `movePart.ts` にあり、そちらはテストに掛かっている)。
 */

const markdownEditor = (): vscode.TextEditor | null => {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return null;
  return editor.document.languageId === 'markdown' ? editor : null;
};

/**
 * 編集を文書へ当てる。**アクティブなエディタを要求しない** — マップのパネルは
 * 掴んだ時点で Markdown が後ろに隠れていることがある (同じタブグループに
 * 入れた配置)。当て先は呼ぶ側が覚えている文書で決める。
 */
export async function applyToDocument(
  document: vscode.TextDocument,
  fenceLine: number,
  edits: readonly Edit[],
): Promise<boolean> {
  // **字下げしたフェンスは桁もずれる。** フェンスの取り出しは開き記号の
  // 字下げぶん (最大 3 つ) を本文から剥がすので、桁を足し戻さないと
  // 書き換えが左へ寄る (箇条書きの中のフェンスで起きる)。
  const opening = document.lineAt(fenceLine - 1).text;
  const indent = (/^ {0,3}/.exec(opening)?.[0] ?? '').length;

  const edit = new vscode.WorkspaceEdit();
  for (const one of edits) {
    // フェンスの中の行 → Markdown の行。開き記号の行のぶんだけずらす
    // (`shiftErrors` と同じ手口)。どちらも 1 始まりなので +fenceLine、
    // vscode は 0 始まりなので -1。
    const line = fenceLine + one.line - 1;
    const column = one.column + indent;
    edit.replace(
      document.uri,
      new vscode.Range(line, column, line, column + one.length),
      one.text,
    );
  }
  return vscode.workspace.applyEdit(edit);
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
      return applyToDocument(editor.document, fenceLine, edits);
    },

    info: (message) => {
      void vscode.window.showInformationMessage(message);
    },
    warn: (message) => {
      void vscode.window.showWarningMessage(message);
    },
  };
}
