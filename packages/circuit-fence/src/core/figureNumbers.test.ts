import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { extractCircuitFences } from './fences.ts';

/**
 * 図の題が「回路図NN タイトル」の形で、**その .md の中で連番**になっているか。
 *
 * 番号はファイルをまたいで共有しない (2026-08-27 決定)。またぐ形にすると、
 * どれか 1 つの .md に図を足しただけで、関係のないファイルの番号まで
 * 振り直しになる。ファイルの中で閉じていれば、直すのはそのファイルだけで済む。
 *
 * 図を足したり並べ替えたりすると番号は黙ってずれるので、ここで見張る
 * (ずれても図は描けてしまうため、目では気づけない)。
 */
const ROOT = fileURLToPath(new URL('../..', import.meta.url));

const DIRECTORIES = ['docs', 'examples', join('examples', 'errors')];

/** 早見表は「フェンスの形」を見せる 1 枚で、図として描くものではない。 */
const NOT_A_FIGURE = ['cheatsheet.md'];

const documents = DIRECTORIES.flatMap((directory) =>
  readdirSync(join(ROOT, directory))
    .filter((name) => name.endsWith('.md') && !NOT_A_FIGURE.includes(name))
    .sort()
    .map((name) => join(directory, name)),
);

const titlesOf = (path: string): (string | null)[] =>
  extractCircuitFences(readFileSync(join(ROOT, path), 'utf8')).map(
    (fence) => /^title: (.*)$/m.exec(fence.source)?.[1] ?? null,
  );

const withFigures = documents.filter((path) => titlesOf(path).length > 0);

describe('図の番号', () => {
  test('図を持つ .md を 1 つ以上見ている', () => {
    expect(withFigures.length).toBeGreaterThan(0);
  });

  test.each(withFigures)('%s のどの図にも題が付いている', (path) => {
    expect(titlesOf(path).filter((title) => title === null)).toEqual([]);
  });

  test.each(withFigures)('%s の題が回路図NN から始まり、書いた順の連番になっている', (path) => {
    const numbers = titlesOf(path).map((title) => /^回路図(\d{2}) .+$/.exec(title ?? '')?.[1] ?? null);
    const wanted = numbers.map((_, index) => String(index + 1).padStart(2, '0'));

    expect(numbers).toEqual(wanted);
  });
});
