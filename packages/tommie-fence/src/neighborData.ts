import { dirname } from 'node:path';
import { dataFrom as vnaDataFrom } from 'vna-fence/data';
import { dataFrom as scopeDataFrom } from 'scope-fence/data';
import { dataFrom as spectrumDataFrom } from 'spectrum-fence/data';
import type { DataSource } from 'vna-fence/src/core';
import type { DataReader } from 'vna-fence/plugin';

/**
 * デスクトップで `data:` を読む口 (vna の Touchstone、scope と spectrum の CSV)。**文書の隣の
 * ファイルだけ** — 名前の絞りと大きさの上限は各フェンスが持ち (`dataFrom`)、読み方の
 * 守りは fence-kit の `readNeighbor` が持つ。`file:` でない文書 (untitled・git の
 * 差分) は隣が無いので読まない。**vscode を知らない形**にしてある (試験で使うため)。
 */
export type DocumentUri = { readonly scheme: string; readonly fsPath: string };

/** フェンスごとの読み口の作り方 (隣のディレクトリ → 読む口)。 */
export type DataFrom = (home: string) => DataSource;

export const dataForUri = (uri: DocumentUri | undefined, from: DataFrom): DataSource | undefined =>
  (uri !== undefined && uri.scheme === 'file' ? from(dirname(uri.fsPath)) : undefined);

/** プレビューの markdown-it から: VS Code は `env.currentDocument` に文書の URI を入れる。 */
export const readerFor = (from: DataFrom): DataReader => (env) =>
  dataForUri((env as { readonly currentDocument?: DocumentUri } | null | undefined)?.currentDocument, from);

/** 3 つのフェンスの読み口 (プレビューと Problems の両方が使う)。 */
export type NeighborReaders = { readonly vna: DataReader; readonly scope: DataReader; readonly spectrum: DataReader };

export const NEIGHBOR_READERS: NeighborReaders = {
  vna: readerFor(vnaDataFrom), scope: readerFor(scopeDataFrom), spectrum: readerFor(spectrumDataFrom),
};

export { scopeDataFrom, spectrumDataFrom, vnaDataFrom };
