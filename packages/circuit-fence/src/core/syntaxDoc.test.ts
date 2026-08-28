import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { compileCircuit, errorLine } from './index.ts';
import { extractCircuitFences } from './fences.ts';
import { NOTE_BOX_SOLID, NOTE_KINDS } from './notes.ts';
import { standaloneTex } from './tex/generate.ts';
import type { FenceBlock } from './fences.ts';

/**
 * 文法リファレンス (docs/01-syntax.md) の注釈の一覧が、実装から遅れていないか。
 *
 * 早見表 (02-cheatsheet.md) には cheatsheet.test.ts の見張りがあるが、
 * こちらには無かった。`line` を足したとき**節だけが増えて一覧の表が
 * 取り残され**、「書けるのは 5 種類」と書いたまま 6 種類になっていた。
 * 種類は増える側なので、増やした人が表を直し忘れたことに気づける形にしておく。
 *
 * 見るのは**名前と数だけ**。書きぶりまで縛ると、文章を直すたびに
 * テストを直すことになる (早見表の見張りと同じ考え)。
 */
const SYNTAX = readFileSync(fileURLToPath(new URL('../../docs/01-syntax.md', import.meta.url)), 'utf8');

/** 注釈の節だけを切り出す。ほかの節に出てくる同じ語を数に入れないため。 */
const NOTES_SECTION = /\n## 注釈 \(`notes:`\)\n([\s\S]*?)\n## /.exec(SYNTAX)?.[1] ?? '';

/**
 * 節の頭にある一覧の表。**種類を数えるのはここだけ**にする — 節の見出し
 * (`### 直線 — …`) で見ると、表に載せ忘れても見張りが通ってしまう。
 */
const SUMMARY_TABLE = /\n(\|[\s\S]*?)\n\n/.exec(NOTES_SECTION)?.[1] ?? '';

describe('docs/01-syntax.md の注釈', () => {
  test('注釈の節がある', () => {
    expect(NOTES_SECTION).not.toBe('');
  });

  test('書ける種類が全部一覧の表に載っている', () => {
    expect(NOTE_KINDS.filter((kind) => !SUMMARY_TABLE.includes(`- ${kind} `))).toEqual([]);
  });

  test('「書けるのは N 種類」の数が種類の数と合っている', () => {
    expect(NOTES_SECTION).toContain(`書けるのは ${NOTE_KINDS.length} 種類`);
  });

  test('枠を実線で引く語が載っている', () => {
    expect(NOTES_SECTION).toContain(`\`${NOTE_BOX_SOLID}\``);
  });
});

/**
 * 貼った図の見張り。01-syntax.md は各フェンスの直後に、**そのフェンス自身を
 * CLI で描いて GitHub 用に焼いた PNG** (docs/out) を貼ってある — GitHub は
 * フェンスを描画しないので、フェンス (ソース) と図 (結果) を対で見せるため。
 * SVG のままでは貼れない — 字が TeX フォントの <text> で、プレビューの
 * webfont が無い場所では Ω などが化ける (焼き方は scripts/docsSvg.mjs)。
 *
 * 作り直しは `npm run docs`。examples と同じく、コミットしてある .tex を
 * 期待値にして、図が実装から遅れたら気づける形にしておく (examples.test.ts と
 * 同じ考え。SVG と PNG のバイト一致は見ない)。
 */
const DOCS_OUT = fileURLToPath(new URL('../../docs/out', import.meta.url));

const FIGURES = extractCircuitFences(SYNTAX);
const ROWS = SYNTAX.split('\n');

/** 出力のファイル名の付け方は CLI の jobsFor と同じ規則 (1 枚だけなら連番なし)。 */
const stemOf = (index: number): string =>
  FIGURES.length === 1 ? '01-syntax' : `01-syntax-${index + 1}`;

const titleOf = (fence: FenceBlock): string | null =>
  /^title: (図\d{2} .+)$/m.exec(fence.source)?.[1] ?? null;

/** フェンスを閉じた ``` の次の行 (ROWS の添字)。 */
const afterFence = (fence: FenceBlock): number => fence.line + fence.source.split('\n').length;

describe('docs/01-syntax.md の貼った図', () => {
  test('図が 1 つ以上ある', () => {
    expect(FIGURES.length).toBeGreaterThan(0);
  });

  test('どのフェンスの直後にも、そのフェンスを描いた図が貼ってある', () => {
    const problems: string[] = [];

    for (const [index, fence] of FIGURES.entries()) {
      // 題の欠けと連番は figureNumbers.test.ts が見張る。ここでは対応だけを見る。
      const title = titleOf(fence);
      if (title === null) continue;

      let row = afterFence(fence);
      while (ROWS[row] === '') row += 1;

      const wanted = `![${title}](out/${stemOf(index)}.png)`;
      if (ROWS[row] !== wanted) problems.push(`${title}: ${ROWS[row] ?? '(行が無い)'} ≠ ${wanted}`);
    }

    expect(problems).toEqual([]);
  });

  test('貼った画像の数がフェンスの数と合っている', () => {
    // 1 つ前の見張りと合わせると「余計な画像が無い」ことまで決まる。
    expect(SYNTAX.match(/!\[.*?\]\([^)]*\)/g) ?? []).toHaveLength(FIGURES.length);
  });

  test('図がコミットしてあり、SVG は GitHub 用に色が焼いてある', () => {
    const problems: string[] = [];

    for (const [index] of FIGURES.entries()) {
      if (!existsSync(join(DOCS_OUT, `${stemOf(index)}.png`))) {
        problems.push(`${stemOf(index)}.png が無い`);
      }

      const name = `${stemOf(index)}.svg`;
      const path = join(DOCS_OUT, name);
      if (!existsSync(path)) {
        problems.push(`${name} が無い`);
        continue;
      }

      const svg = readFileSync(path, 'utf8');
      // auto テーマの currentColor は <img> では継承する色が無く、ダークテーマで
      // 見えない黒に落ちる。焼き直しは scripts/docsSvg.mjs (PNG もそこで作る)。
      if (svg.includes('currentColor')) problems.push(`${name} に currentColor が残っている`);
      if (!/\sdata-github-paper="/.test(svg)) problems.push(`${name} に下地が無い`);
    }

    expect(problems).toEqual([]);
  });

  test('docs/out にフェンスと対応しない置き去りの出力が無い', () => {
    // フェンスを消して作り直しても、消えた番号の出力は残る (render は消さない)。
    // 残すと、もう存在しない題の図がコミットに居座り続ける。
    const wanted = FIGURES.flatMap((_, index) =>
      ['png', 'svg', 'tex'].map((extension) => `${stemOf(index)}.${extension}`),
    ).sort();

    expect(readdirSync(DOCS_OUT).sort()).toEqual(wanted);
  });

  test('図がコミットしてある TeX と一致する', () => {
    for (const [index, fence] of FIGURES.entries()) {
      const { tex, errors } = compileCircuit(fence.source);

      expect(errors.map(errorLine)).toEqual([]);
      expect(tex).not.toBeNull();
      expect(`${standaloneTex(tex ?? '', 'fence')}\n`).toBe(
        readFileSync(join(DOCS_OUT, `${stemOf(index)}.tex`), 'utf8'),
      );
    }
  });
});
