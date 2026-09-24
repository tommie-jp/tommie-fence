import { problemsOf } from 'vna-fence/src/core';
import type { DataSource } from 'vna-fence/src/core';
import type { ProblemSource } from './problems/collect.ts';

/**
 * vna の Problems の口。**vna はマップ (殻) を持たない**ので `FenceEditor` の代わりに
 * これだけを Problems に並べる (52 の docs/76)。`data` を渡せば `data:` を読む。
 */
export const vnaProblems = (data?: DataSource): ProblemSource => ({
  language: 'vna',
  problems: (source, fenceLine, want) => problemsOf(source, fenceLine, want, data),
});

/** マップ (殻) を持たずに図と Problems だけを出す言語。**拡張が描くフェンス = 殻の言語 + これ**。 */
export const MAPLESS_LANGUAGES: readonly string[] = ['vna'];
