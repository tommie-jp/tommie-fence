import type { MarkdownIt } from 'markdown-it';
import type * as vscode from 'vscode';
import { registerEditorCommands } from './editor/commands.ts';
import { perfboardPlugin } from './markdownItPlugin.ts';

/**
 * VS Code は markdown プレビューを開くときにこの拡張を活性化し、
 * exports.extendMarkdownIt(md) の**戻り値をそのまま** markdown-it として使う。
 * 同期で必ず md を返すこと (undefined や Promise を返すとプレビューが真っ白になる)。
 *
 * マップ (図を掴んで動かすエディタ) もここで登録する。
 */
export function activate(context: vscode.ExtensionContext) {
  registerEditorCommands(context);

  return {
    extendMarkdownIt(md: MarkdownIt): MarkdownIt {
      return md.use(perfboardPlugin);
    },
  };
}

export function deactivate(): void {
  // 後片付けは不要 (描画は同期の純関数だけで完結する)。
}
