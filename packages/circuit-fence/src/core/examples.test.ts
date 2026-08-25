import { readFileSync, readdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { compileCircuit, errorLine, extractCircuitFences, shiftErrors } from './index.ts';
import { standaloneTex } from './tex/generate.ts';

/**
 * examples/ の図が、コミットしてある .tex と一致するか。
 *
 * 期待値の作り直しは `npm run examples` (図を変えたら出力もコミットする)。
 * バイト一致を見るのは .tex だけにしてある。SVG は同じ入力なら同じバイト列に
 * なることを実測しているが、node-tikzjax のバージョンが変わると変わりうるので、
 * こちらは差分を目で見るためのものとして扱う。
 */
const EXAMPLES = fileURLToPath(new URL('../../examples', import.meta.url));
const OUT = join(EXAMPLES, 'out');
/** わざと壊してある例。図は書き出さないので、CLI が見ない下の階層に置く。 */
const BROKEN = join(EXAMPLES, 'errors');

/** README.md は例そのものではなく目次なので、図を持たない。 */
const isExample = (name: string): boolean => extname(name) === '.md' && name !== 'README.md';

const documents = readdirSync(EXAMPLES).filter(isExample).sort();

/** 出力のファイル名の付け方は CLI の jobsFor と同じ規則。 */
const stemFor = (name: string, index: number, count: number): string =>
  count === 1 ? basename(name, '.md') : `${basename(name, '.md')}-${index + 1}`;

describe('examples', () => {
  test('見る例が 1 つ以上ある', () => {
    expect(documents.length).toBeGreaterThan(0);
  });

  test.each(documents)('%s の図がコミットしてある TeX と一致する', (name) => {
    const fences = extractCircuitFences(readFileSync(join(EXAMPLES, name), 'utf8'));
    expect(fences.length).toBeGreaterThan(0);

    for (const [index, fence] of fences.entries()) {
      const { tex, errors } = compileCircuit(fence.source);

      expect(errors.map(errorLine)).toEqual([]);
      expect(tex).not.toBeNull();
      // 書き出す .tex は CLI と同じく LaTeX に渡せる形 (文書クラス付き)。
      expect(`${standaloneTex(tex ?? '', 'fence')}\n`).toBe(
        readFileSync(join(OUT, `${stemFor(name, index, fences.length)}.tex`), 'utf8'),
      );
    }
  });
});

const brokenDocuments = readdirSync(BROKEN).filter(isExample).sort();

/**
 * examples/errors/ は「読めなかったときに何が出るか」の見本。
 * 文章に貼ってあるエラーの行が、いま本当に出る文言と一致しているかを見る
 * (ここが古びると、このプロジェクトが一番売りにしているところの説明が嘘になる)。
 */
describe('examples/errors', () => {
  test('壊してある例が 1 つ以上ある', () => {
    expect(brokenDocuments.length).toBeGreaterThan(0);
  });

  test.each(brokenDocuments)('%s に貼ってあるエラーが実際に出るものと一致する', (name) => {
    const source = readFileSync(join(BROKEN, name), 'utf8');
    const fences = extractCircuitFences(source);
    expect(fences.length).toBeGreaterThan(0);

    const shown = fences.flatMap((fence) =>
      // プレビューと同じく Markdown の行番号に直してから見比べる。
      shiftErrors(compileCircuit(fence.source).errors, fence.line).map(errorLine),
    );

    expect(shown.length).toBeGreaterThan(0);
    for (const line of shown) expect(source).toContain(line);
  });
});
