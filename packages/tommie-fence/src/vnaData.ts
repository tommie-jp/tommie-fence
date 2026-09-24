import { dirname } from 'node:path';
import { dataFrom } from 'vna-fence/data';
import type { DataSource } from 'vna-fence/src/core';
import type { DataReader } from 'vna-fence/plugin';

/**
 * デスクトップで vna の `data:` を読む口。**文書の隣のファイルだけ** — 名前の絞りと
 * 大きさの上限は vna-fence が持つ (`dataFrom`)。`file:` でない文書 (untitled・git の
 * 差分) は隣が無いので読まない。**vscode を知らない形**にしてある (試験で使うため)。
 */
export type DocumentUri = { readonly scheme: string; readonly fsPath: string };

export const dataForUri = (uri: DocumentUri | undefined): DataSource | undefined =>
  (uri !== undefined && uri.scheme === 'file' ? dataFrom(dirname(uri.fsPath)) : undefined);

/** プレビューの markdown-it から: VS Code は `env.currentDocument` に文書の URI を入れる。 */
export const readDataFromEnv: DataReader = (env) =>
  dataForUri((env as { readonly currentDocument?: DocumentUri } | null | undefined)?.currentDocument);
