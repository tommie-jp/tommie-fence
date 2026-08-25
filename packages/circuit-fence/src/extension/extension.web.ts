import * as vscode from 'vscode';
import { renderTex } from '../host/texSvg.web.ts';
import { activateWith } from './activate.ts';

/**
 * web 版 (vscode.dev / github.dev) の入口。
 * WASM の TeX は Node のファイル読み込みと jsdom に依存していて動かないので、
 * 図だけ描けない。検証・ネットリスト・行番号つきエラーはそのまま使える。
 */
export function activate() {
  return activateWith({
    render: renderTex,
    refresh: () => {
      void vscode.commands.executeCommand('markdown.preview.refresh');
    },
  });
}

export function deactivate(): void {
  // 抱えているものは無い。
}
