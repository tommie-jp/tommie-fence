import { readNeighbor } from 'fence-kit/cli';
import type { DataSource } from '../core/index.ts';
import { DATA_NAME, LIMITS } from '../core/limits.ts';

/**
 * `data:` の読み口 (CLI と拡張のデスクトップ版)。**入力の `.md` と同じディレクトリの
 * 通常のファイルだけ**。読み方の守り (名前がそのままファイル名であること・シンボリック
 * リンクを辿らない・通常のファイルだけ・上限まで) は fence-kit の `readNeighbor`
 * (vna と共用)。ここは名前の形と上限を渡すだけの包み。
 */
export const dataFrom = (home: string): DataSource => (name) =>
  readNeighbor(home, name, { pattern: DATA_NAME, maxBytes: LIMITS.dataBytes });
