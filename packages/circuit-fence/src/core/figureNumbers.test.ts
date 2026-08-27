import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { extractCircuitFences } from './fences.ts';

/**
 * 図の題の番号 (回路図NN) が **syntax.md だけ**にあり、そこで連番になっているか。
 *
 * 番号は syntax.md の図だけが持つ (2026-08-27 決定)。例の図は syntax.md に
 * 埋め込まれるため、例の側に番号を焼き込むと syntax.md の表示順と食い違って
 * 見える (実際に食い違い、初出時に「.md ごとに 01 から数え直す」へ、
 * 同日「syntax.md 専属」へ改めた)。例の題は内容だけにする。
 *
 * 図を足したり並べ替えたりすると番号は黙ってずれるので、ここで見張る
 * (ずれても図は描けてしまうため、目では気づけない)。
 */
const ROOT = fileURLToPath(new URL('../..', import.meta.url));

const DIRECTORIES = ['docs', 'examples', join('examples', 'errors')];

/** 番号を持つのはこのファイルの図だけ。 */
const NUMBERED = join('docs', 'syntax.md');

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

  test('syntax.md の題が回路図NN から始まり、書いた順の連番になっている', () => {
    const numbers = titlesOf(NUMBERED).map(
      (title) => /^回路図(\d{2}) .+$/.exec(title ?? '')?.[1] ?? null,
    );
    const wanted = numbers.map((_, index) => String(index + 1).padStart(2, '0'));

    expect(numbers).toEqual(wanted);
  });

  test.each(withFigures.filter((path) => path !== NUMBERED))(
    '%s の題に番号 (回路図NN) が紛れ込んでいない',
    (path) => {
      expect(titlesOf(path).filter((title) => /^回路図\d/.test(title ?? ''))).toEqual([]);
    },
  );
});
