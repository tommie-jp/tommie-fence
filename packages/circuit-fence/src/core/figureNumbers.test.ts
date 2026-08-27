import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { extractCircuitFences } from './fences.ts';

/**
 * 図の題が `図NN タイトル` の形で、**その .md の中で**書いた順の連番か。
 *
 * 番号は「図12 を直して」と文章から指すためのもの。**体系はファイルごとに
 * 独立させる** (2026-08-27 決定) — 通し番号にすると、1 つのファイルに図を
 * 足しただけで関係のないファイルまで振り直しになる。
 *
 * 引き換えに、syntax.md には**同じ番号の図が 2 つ以上並ぶ**。貼ってある図は
 * それを作っている examples 側の番号を名乗るため。指すときはファイルも添える
 * (「02-parts.md の図01」)。
 *
 * 図を足したり並べ替えたりすると番号は黙ってずれる (ずれても図は描けてしまう)。
 * ここで見張らないと、文章の「図12」が別の図を指したまま残る。
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

  test.each(withFigures)('%s の題が 図01 から書いた順の連番になっている', (path) => {
    const numbers = titlesOf(path).map((title) => /^図(\d{2}) .+$/.exec(title ?? '')?.[1] ?? null);
    const wanted = numbers.map((_, index) => String(index + 1).padStart(2, '0'));

    expect(numbers).toEqual(wanted);
  });
});
