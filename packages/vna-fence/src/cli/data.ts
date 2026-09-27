import { readNeighbor } from 'fence-kit/cli';
import type { DataSource } from '../core/index.ts';
import { DATA_NAME, LIMITS } from '../core/limits.ts';

/**
 * `data:` の読み口 (CLI と拡張のデスクトップ版)。**入力の `.md` と同じディレクトリの
 * 通常のファイルだけ**。読み方の守り (シンボリックリンクを辿らない・通常のファイルだけ・
 * 上限まで) は fence-kit の `readNeighbor` が持つ (scope と共用)。ここは名前の形と
 * 上限を渡すだけの包み。
 */
export const dataFrom = (home: string): DataSource => (name) =>
  readNeighbor(home, name, { pattern: DATA_NAME, maxBytes: LIMITS.dataBytes });
