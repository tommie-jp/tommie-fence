import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
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
 * どの `.md` も**自分のフェンスを描いた図だけ**をその直後に貼る
 * (2026-08-28 決定 — GitHub はフェンスを描画しないため)。他所の図を貼ると、
 * 題番号が図に焼き込まれているぶん、その図が向こうの番号を名乗って
 * こちらの体系が崩れる。同じ図が docs と examples の両方にあるので、
 * **題が同じなら中身も同じ**であることをここで見張る (片方だけ直すと、
 * 同じ名前の図が 2 通りの姿で出てしまう)。
 *
 * 貼った図とフェンスの対応そのものは embeddedFigures.test.ts が見る。
 */
const ROOT = fileURLToPath(new URL('../..', import.meta.url));

const DIRECTORIES = ['docs', 'examples', join('examples', 'errors')];

/** 早見表は「フェンスの形」を見せる 1 枚で、図として描くものではない。 */
const NOT_A_FIGURE = ['02-cheatsheet.md'];

const documents = DIRECTORIES.flatMap((directory) =>
  readdirSync(join(ROOT, directory))
    .filter((name) => name.endsWith('.md') && !NOT_A_FIGURE.includes(name))
    .sort()
    .map((name) => join(directory, name)),
);

type Figure = { readonly title: string | null; readonly body: string };

/** 題と、題を外した中身。中身を比べるときは番号の違いを持ち込まない。 */
const figuresOf = (path: string): Figure[] =>
  extractCircuitFences(readFileSync(join(ROOT, path), 'utf8')).map((fence) => ({
    title: /^title: (?:図\d{2} )?(.*)$/m.exec(fence.source)?.[1] ?? null,
    body: fence.source.replace(/^title: .*\n/m, ''),
  }));

const numbersOf = (path: string): (string | null)[] =>
  extractCircuitFences(readFileSync(join(ROOT, path), 'utf8')).map(
    (fence) => /^title: 図(\d{2}) .+$/m.exec(fence.source)?.[1] ?? null,
  );

const withFigures = documents.filter((path) => figuresOf(path).length > 0);

describe('図の番号', () => {
  test('図を持つ .md を 1 つ以上見ている', () => {
    expect(withFigures.length).toBeGreaterThan(0);
  });

  test.each(withFigures)('%s のどの図にも題が付いている', (path) => {
    expect(figuresOf(path).filter((figure) => figure.title === null)).toEqual([]);
  });

  test.each(withFigures)('%s の題が 図01 から書いた順の連番になっている', (path) => {
    const numbers = numbersOf(path);
    const wanted = numbers.map((_, index) => String(index + 1).padStart(2, '0'));

    expect(numbers).toEqual(wanted);
  });

  test.each(withFigures)('%s は自分で描いた図だけを貼っている', (path) => {
    const images = [
      ...readFileSync(join(ROOT, path), 'utf8').matchAll(/!\[.*?\]\(([^)]*)\)/g),
    ].map((image) => image[1] ?? '');
    const own = new RegExp(`^out/${basename(path, '.md')}(-\\d+)?\\.png$`);

    expect(images.filter((image) => !own.test(image))).toEqual([]);
  });

  test('同じ題の図はどこに書いてあっても中身が同じ', () => {
    const byTitle = new Map<string, { readonly path: string; readonly body: string }[]>();
    for (const path of withFigures) {
      for (const { title, body } of figuresOf(path)) {
        if (title === null) continue;
        byTitle.set(title, [...(byTitle.get(title) ?? []), { path, body }]);
      }
    }

    const split = [...byTitle]
      .filter(([, figures]) => new Set(figures.map((figure) => figure.body)).size > 1)
      .map(([title, figures]) => `${title} (${figures.map((figure) => figure.path).join(' / ')})`);

    expect(split).toEqual([]);
  });
});
