import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { extractBreadboardFences } from './fences.ts';

/**
 * **フェンスの直後には、そのフェンスを描いた図を貼る**という規約を見張る。
 *
 * GitHub はフェンスを描画せず YAML をそのまま出すので、貼っていないと
 * 「書き方は読めるが、何が出るのかは分からない」文書になる。
 * プレビューではフェンス自体が図になるので、同じ図が 2 回見えるが、
 * どこで読んでもソースと結果が対で読めるほうを採る。
 *
 * **他所の図は流用しない。** 図には題番号が焼き込まれているので、
 * 貼ると向こうの番号を名乗ることになり、番号の体系が崩れる。
 */
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** 図を貼る決まりになっている文書と、その図の置き場。 */
const SETS = [
  { dir: 'examples', out: 'examples/out' },
  { dir: 'docs', out: 'docs/out' },
] as const;

const markdownIn = (dir: string): string[] =>
  readdirSync(join(ROOT, dir))
    .filter((name) => name.endsWith('.md') && name !== 'README.md')
    .sort();

/** 出力の名前の付け方は CLI (src/cli/main.ts の jobsFor) と同じ。 */
const stemOf = (file: string, index: number, count: number): string => {
  const stem = basename(file, '.md');
  return count === 1 ? stem : `${stem}-${index + 1}`;
};

const imagesIn = (markdown: string): string[] =>
  [...markdown.matchAll(/^!\[[^\]]*\]\(([^)]+)\)$/gm)].map((match) => match[1] ?? '');

describe.each(SETS)('$dir の図', ({ dir, out }) => {
  const files = markdownIn(dir);

  test('見張る文書が 1 つ以上ある', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  test.each(files)('%s はフェンスの数だけ図を貼っている', (file) => {
    const markdown = readFileSync(join(ROOT, dir, file), 'utf8');
    const fences = extractBreadboardFences(markdown);
    const wanted = fences.map((_fence, index) => `out/${stemOf(file, index, fences.length)}.svg`);

    expect(imagesIn(markdown)).toEqual(wanted);
  });

  test.each(files)('%s が貼っている図はすべて書き出されている', (file) => {
    for (const image of imagesIn(readFileSync(join(ROOT, dir, file), 'utf8'))) {
      expect(existsSync(join(ROOT, dir, image)), image).toBe(true);
    }
  });

  test('置き場に、どこからも貼られていない図が残っていない', () => {
    const referenced = new Set(
      files.flatMap((file) => imagesIn(readFileSync(join(ROOT, dir, file), 'utf8')).map((image) => basename(image))),
    );
    const written = readdirSync(join(ROOT, out)).filter((name) => name.endsWith('.svg'));

    expect(written.filter((name) => !referenced.has(name))).toEqual([]);
  });
});
