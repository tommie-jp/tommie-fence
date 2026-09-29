import { problemsOf as vnaProblemsOf } from 'vna-fence/src/core';
import type { DataSource } from 'vna-fence/src/core';
import { problemsOf as scopeProblemsOf } from 'scope-fence/src/core';
import { problemsOf as spectrumProblemsOf } from 'spectrum-fence/src/core';
import { problemsOf as graphProblemsOf } from 'graph-fence/src/core';
import { problemsOf as logicProblemsOf } from 'logic-fence/src/core';
import type { ProblemSource } from './problems/collect.ts';

/**
 * マップ (殻) を持たないフェンスの Problems の口。**図の中に動かす部品が無い**ので
 * `FenceEditor` の代わりにこれだけを Problems に並べる (52 の docs/76・85)。
 * `data` を渡せば `data:` を読む (読む口の形は 2 つとも同じ `(name) => string | null`)。
 */
export const vnaProblems = (data?: DataSource): ProblemSource => ({
  language: 'vna',
  problems: (source, fenceLine, want) => vnaProblemsOf(source, fenceLine, want, data),
});

export const scopeProblems = (data?: DataSource): ProblemSource => ({
  language: 'scope',
  problems: (source, fenceLine, want) => scopeProblemsOf(source, fenceLine, want, data),
});

export const spectrumProblems = (data?: DataSource): ProblemSource => ({
  language: 'spectrum',
  problems: (source, fenceLine, want) => spectrumProblemsOf(source, fenceLine, want, data),
});

export const graphProblems = (data?: DataSource): ProblemSource => ({
  language: 'graph',
  problems: (source, fenceLine, want) => graphProblemsOf(source, fenceLine, want, data),
});

/** logic に `data:` はまだ無いので、読む口は要らない。 */
export const logicProblems = (): ProblemSource => ({
  language: 'logic',
  problems: (source, fenceLine, want) => logicProblemsOf(source, fenceLine, want),
});

/** マップ (殻) を持たずに図と Problems だけを出す言語。**拡張が描くフェンス = 殻の言語 + これ**。 */
export const MAPLESS_LANGUAGES: readonly string[] = ['vna', 'scope', 'spectrum', 'graph', 'logic'];
