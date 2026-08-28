import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { compileCircuit, errorLine } from './index.ts';
import { extractCircuitFences, outputStem } from './fences.ts';
import { standaloneTex } from './tex/generate.ts';
import type { FenceBlock } from './fences.ts';

/**
 * 貼った図の見張り。
 *
 * 図を持つ `.md` は、**どのフェンスの直後にも、そのフェンス自身を描いて
 * 焼いた PNG** (`out/`) を貼る (2026-08-28 決定)。GitHub はフェンスを
 * 描画せず YAML だけを出すので、ソースと結果を対で見せるため。
 *
 * **PNG で貼る**。SVG の字は TeX フォント (cmr10 など) の `<text>` で、
 * 字形はプレビューに同梱の webfont が解決している。フォントの無い場所では
 * `Ω` が `¬` に化ける (焼き方は scripts/figures.mjs)。
 *
 * 作り直しは `npm run examples` / `npm run docs`。コミットしてある `.tex` を
 * 期待値にして、図が実装から遅れたら気づける形にしておく (SVG と PNG は
 * 環境で変わりうるのでバイト一致は見ない)。
 */
const ROOT = fileURLToPath(new URL('../..', import.meta.url));

const DIRECTORIES = ['docs', 'examples'];

/**
 * フェンスを持つが図ではないもの。README は目次、早見表は「フェンスの形」を
 * 見せる 1 枚 (`title: 図01 …` は書き方の見本であって題ではない)。
 */
const NOT_A_FIGURE = ['README.md', '02-cheatsheet.md'];

const documents = DIRECTORIES.flatMap((directory) =>
  readdirSync(join(ROOT, directory))
    .filter((name) => name.endsWith('.md') && !NOT_A_FIGURE.includes(name))
    .sort()
    .map((name) => join(directory, name)),
).filter((path) => extractCircuitFences(readFileSync(join(ROOT, path), 'utf8')).length > 0);

const fencesOf = (path: string): FenceBlock[] =>
  extractCircuitFences(readFileSync(join(ROOT, path), 'utf8'));

/** 図の書き出し先。どの `.md` からも隣の `out/` に書く。 */
const outDirOf = (path: string): string => join(ROOT, dirname(path), 'out');

/** 名前の付け方は CLI の jobsFor と同じ (規則そのものは core が持っている)。 */
const stemsOf = (path: string): string[] =>
  fencesOf(path).map((_, index, all) => outputStem(basename(path, '.md'), index, all.length));

const titleOf = (fence: FenceBlock): string | null =>
  /^title: (図\d{2} .+)$/m.exec(fence.source)?.[1] ?? null;

/** フェンスを閉じた ``` の次の行 (0 始まりの添字)。 */
const afterFence = (fence: FenceBlock): number => fence.line + fence.source.split('\n').length;

describe('貼った図', () => {
  test('図を持つ .md を 1 つ以上見ている', () => {
    expect(documents.length).toBeGreaterThan(0);
  });

  test.each(documents)('%s はどのフェンスの直後にもその図を貼っている', (path) => {
    const rows = readFileSync(join(ROOT, path), 'utf8').split('\n');
    const stems = stemsOf(path);
    const problems: string[] = [];

    for (const [index, fence] of fencesOf(path).entries()) {
      // 題の欠けと連番は figureNumbers.test.ts が見張る。ここでは対応だけを見る。
      const title = titleOf(fence);
      if (title === null) continue;

      let row = afterFence(fence);
      while (rows[row] === '') row += 1;

      const wanted = `![${title}](out/${stems[index]}.png)`;
      if (rows[row] !== wanted) problems.push(`${title}: ${rows[row] ?? '(行が無い)'} ≠ ${wanted}`);
    }

    expect(problems).toEqual([]);
  });

  test.each(documents)('%s の貼った画像の数がフェンスの数と合っている', (path) => {
    // 1 つ前の見張りと合わせると「余計な画像が無い」ことまで決まる。
    const images = readFileSync(join(ROOT, path), 'utf8').match(/!\[.*?\]\([^)]*\)/g) ?? [];

    expect(images).toHaveLength(fencesOf(path).length);
  });

  test.each(documents)('%s の図がコミットしてあり、SVG は焼いてある', (path) => {
    const problems: string[] = [];

    for (const stem of stemsOf(path)) {
      if (!existsSync(join(outDirOf(path), `${stem}.png`))) problems.push(`${stem}.png が無い`);

      const svgPath = join(outDirOf(path), `${stem}.svg`);
      if (!existsSync(svgPath)) {
        problems.push(`${stem}.svg が無い`);
        continue;
      }

      // auto テーマの currentColor は <img> では継承する色が無く、暗い地では
      // 見えない黒に落ちる。焼き直しは scripts/figures.mjs (PNG もそこで作る)。
      const svg = readFileSync(svgPath, 'utf8');
      if (svg.includes('="currentColor"')) problems.push(`${stem}.svg に currentColor が残っている`);
      if (!/\sdata-figure-paper="/.test(svg)) problems.push(`${stem}.svg に下地が無い`);
    }

    expect(problems).toEqual([]);
  });

  test.each(documents)('%s の図がコミットしてある TeX と一致する', (path) => {
    const stems = stemsOf(path);

    for (const [index, fence] of fencesOf(path).entries()) {
      const { tex, errors } = compileCircuit(fence.source);

      expect(errors.map(errorLine)).toEqual([]);
      expect(tex).not.toBeNull();
      // 書き出す .tex は CLI と同じく LaTeX に渡せる形 (文書クラス付き)。
      expect(`${standaloneTex(tex ?? '', 'fence')}\n`).toBe(
        readFileSync(join(outDirOf(path), `${stems[index]}.tex`), 'utf8'),
      );
    }
  });

  test.each(DIRECTORIES)('%s/out に置き去りの出力が無い', (directory) => {
    // フェンスを消して作り直しても、消えた番号の出力は残る (render は消さない)。
    // 残すと、もう存在しない題の図がコミットに居座り続ける。
    const mine = documents.filter((path) => dirname(path) === directory);
    const wanted = mine
      .flatMap((path) => stemsOf(path))
      .flatMap((stem) => ['png', 'svg', 'tex'].map((extension) => `${stem}.${extension}`))
      .sort();

    expect(readdirSync(join(ROOT, directory, 'out')).sort()).toEqual(wanted);
  });
});
