import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { extractCircuitFences } from './fences.ts';

/**
 * 図の題の番号 (図NN) が、**syntax.md に出てくる順**の連番になっているか。
 *
 * 番号は「図NN を直して」と指して直せるようにするためのもの (2026-08-27 決定)。
 * 指せることが値打ちなので、**読み手が見る並び = syntax.md の表示順**で数える。
 * syntax.md にはフェンスを直に書いた図と、examples から貼った図が混ざるので、
 * 番号は**その図を作っているフェンス**に書く (貼った図なら examples の側)。
 *
 * 図を足したり並べ替えたりすると番号は黙ってずれる (ずれても図は描けてしまう)。
 * ここで見張らないと、文章の「図12」が別の図を指したまま残る。
 */
const ROOT = fileURLToPath(new URL('../..', import.meta.url));

const SYNTAX = join('docs', 'syntax.md');

const DIRECTORIES = ['docs', 'examples', join('examples', 'errors')];

/** 早見表は「フェンスの形」を見せる 1 枚で、図として描くものではない。 */
const NOT_A_FIGURE = ['cheatsheet.md'];

const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');

const documents = DIRECTORIES.flatMap((directory) =>
  readdirSync(join(ROOT, directory))
    .filter((name) => name.endsWith('.md') && !NOT_A_FIGURE.includes(name))
    .sort()
    .map((name) => join(directory, name)),
);

const titlesOf = (path: string): (string | null)[] =>
  extractCircuitFences(read(path)).map((fence) => /^title: (.*)$/m.exec(fence.source)?.[1] ?? null);

const withFigures = documents.filter((path) => titlesOf(path).length > 0);

/**
 * 貼った図 (`examples/out/02-parts-1.png`) を作っているフェンスの題。
 * 名前の付け方は CLI と同じ規則 — 1 枚だけのファイルは `stem`、
 * 何枚もあるファイルは `stem-N` (1 始まり)。
 */
function titleOfDrawing(target: string): string | null {
  const name = basename(target, '.png');
  const [, stem = '', index = ''] = /^(.*)-(\d+)$/.exec(name) ?? [];
  if (stem !== '') {
    const many = titlesOf(join('examples', `${stem}.md`));
    if (many.length > 1) return many[Number(index) - 1] ?? null;
  }
  return titlesOf(join('examples', `${name}.md`))[0] ?? null;
}

/** syntax.md に出てくる順の題。フェンスは中身から、貼った図は元のフェンスから。 */
function titlesInReadingOrder(): (string | null)[] {
  const fenceTitles = titlesOf(SYNTAX);
  const out: (string | null)[] = [];
  let fence = 0;
  let inside = false;

  for (const line of read(SYNTAX).split('\n')) {
    const text = line.trim();
    if (text.startsWith('```circuit')) {
      inside = true;
      out.push(fenceTitles[fence] ?? null);
      fence += 1;
    } else if (inside && text === '```') {
      inside = false;
    } else if (!inside) {
      const drawing = /^!\[.*?\]\((.*?\.png)\)/.exec(text)?.[1];
      if (drawing !== undefined) out.push(titleOfDrawing(drawing));
    }
  }

  return out;
}

describe('図の番号', () => {
  test('図を持つ .md を 1 つ以上見ている', () => {
    expect(withFigures.length).toBeGreaterThan(0);
  });

  test.each(withFigures)('%s のどの図にも題が付いている', (path) => {
    expect(titlesOf(path).filter((title) => title === null)).toEqual([]);
  });

  test('syntax.md に貼った図の題を、元のフェンスから引けている', () => {
    expect(titlesInReadingOrder().filter((title) => title === null)).toEqual([]);
  });

  test('syntax.md に出てくる順で 図01 から連番になっている', () => {
    const numbers = titlesInReadingOrder().map(
      (title) => /^図(\d{2}) .+$/.exec(title ?? '')?.[1] ?? null,
    );
    const wanted = numbers.map((_, index) => String(index + 1).padStart(2, '0'));

    expect(numbers).toEqual(wanted);
  });

  test('同じ番号を 2 つの図が名乗っていない', () => {
    const numbered = documents
      .flatMap(titlesOf)
      .map((title) => /^図(\d{2}) /.exec(title ?? '')?.[1])
      .filter((number): number is string => number !== undefined);

    expect([...numbered].sort()).toEqual([...new Set(numbered)].sort());
  });
});
