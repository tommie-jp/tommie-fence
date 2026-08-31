import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { extractBreadboardFences } from './fences.ts';
import { parseFence } from './parser/parseFence.ts';

/**
 * **どの図にも `図NN タイトル` の題を付ける**という規約を見張る。
 * 文章から「図02 を直して」と指せるようにするためのもの。
 *
 * **番号は .md ごとに 01 から数え直す。** 通し番号にすると、1 つのファイルに
 * 図を足しただけで、関係のないファイルまで振り直しになる。
 */
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DIRS = ['examples', 'docs'] as const;

const TITLED = /^図(\d{2}) (.+)$/;

type Figure = { readonly file: string; readonly number: number; readonly title: string; readonly source: string };

function figuresIn(dir: string): Figure[] {
  const files = readdirSync(join(ROOT, dir)).filter((name) => name.endsWith('.md') && name !== 'README.md').sort();

  return files.flatMap((file) => {
    const fences = extractBreadboardFences(readFileSync(join(ROOT, dir, file), 'utf8'));
    return fences.map((fence) => {
      const title = parseFence(fence.source).doc?.title ?? '';
      const matched = TITLED.exec(title);
      return {
        file: `${dir}/${file}`,
        number: matched === null ? 0 : Number(matched[1]),
        title,
        source: fence.source,
      };
    });
  });
}

const figures = DIRS.flatMap(figuresIn);

describe('図の題', () => {
  test('見張る図が 1 つ以上ある', () => {
    expect(figures.length).toBeGreaterThan(0);
  });

  test('どの図にも 図NN タイトル の題が付いている', () => {
    const untitled = figures.filter((figure) => !TITLED.test(figure.title));

    expect(untitled.map((figure) => `${figure.file}: ${figure.title}`)).toEqual([]);
  });

  test('番号は .md ごとに 01 から、書いた順の連番になっている', () => {
    const counts = new Map<string, number>();
    const wrong: string[] = [];

    for (const figure of figures) {
      const next = (counts.get(figure.file) ?? 0) + 1;
      counts.set(figure.file, next);
      if (figure.number !== next) wrong.push(`${figure.file}: 図${figure.number} (図${next} のはず)`);
    }

    expect(wrong).toEqual([]);
  });

  test('題が同じなら中身も同じ', () => {
    // docs と examples に同じ図を置いたときに、片方だけ直すのを防ぐ。
    const sources = new Map<string, Figure>();
    const conflicts: string[] = [];

    for (const figure of figures) {
      const seen = sources.get(figure.title);
      if (seen === undefined) sources.set(figure.title, figure);
      else if (seen.source !== figure.source) conflicts.push(`${figure.title} (${seen.file} と ${figure.file})`);
    }

    expect(conflicts).toEqual([]);
  });
});
