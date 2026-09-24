import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { outputStem } from 'fence-kit';
import { dataFrom } from '../cli/data.ts';
import { extractVnaFences, renderVna } from './index.ts';

/**
 * examples/ の図をスナップショットとして使う。
 * **描画を変えるとここが落ちる**ので、`npm run examples` で作り直して
 * 出力もコミットする。
 */
const EXAMPLES = fileURLToPath(new URL('../../examples/', import.meta.url));
/** **例の `data:` は隣の Touchstone を読む** (CLI の `render` と同じ読み口で描く)。 */
const data = dataFrom(EXAMPLES);

const read = (path: string): string => readFileSync(`${EXAMPLES}${path}`, 'utf8');
const markdownFiles = readdirSync(EXAMPLES).filter((name) => name.endsWith('.md') && name !== 'README.md').sort();
const stemOf = (name: string): string => name.replace(/\.md$/, '');
// 名前の付け方は CLI と同じものを使う (書き写すと片方だけずれる)。
const outName = (stem: string, index: number, count: number): string =>
  `${outputStem(stem, index, count)}.svg`;

describe('examples', () => {
  test('there are examples to check', () => {
    expect(markdownFiles.length).toBeGreaterThan(0);
  });

  test.each(markdownFiles)('%s renders to the drawing committed in examples/out', (name) => {
    const fences = extractVnaFences(read(name));
    expect(fences.length).toBeGreaterThan(0);

    for (const [index, fence] of fences.entries()) {
      const { svg } = renderVna(fence.source, { data });
      expect(svg).not.toBe('');
      expect(`${svg}\n`).toBe(read(`out/${outName(stemOf(name), index, fences.length)}`));
    }
  });

  test.each(markdownFiles)('%s reads without an error', (name) => {
    for (const fence of extractVnaFences(read(name))) {
      // **例はお知らせも出さない** (見本がお知らせを出していると、それが正しい書き方に見える)。
      expect(renderVna(fence.source, { data }).errors).toEqual([]);
      expect(renderVna(fence.source, { data }).notices).toEqual([]);
    }
  });

  test.each(markdownFiles)('%s pastes a drawing after every fence', (name) => {
    const text = read(name);
    const fences = extractVnaFences(text);
    const stem = stemOf(name);

    for (const [index] of fences.entries()) {
      expect(text).toContain(`(out/${outName(stem, index, fences.length)})`);
    }
  });

  test.each(markdownFiles)('%s gives every fence a title, so prose can point at it', (name) => {
    for (const fence of extractVnaFences(read(name))) {
      expect(fence.source).toMatch(/^title:/m);
    }
  });
});

describe('docs/01-syntax.md', () => {
  const DOCS = fileURLToPath(new URL('../../docs/', import.meta.url));
  const text = readFileSync(`${DOCS}01-syntax.md`, 'utf8');
  const fences = extractVnaFences(text);

  test('has fences to check', () => {
    expect(fences.length).toBeGreaterThan(0);
  });

  test('renders to the drawings committed in docs/out', () => {
    for (const [index, fence] of fences.entries()) {
      const { svg, errors } = renderVna(fence.source);
      expect(errors).toEqual([]);
      const name = outName('01-syntax', index, fences.length);
      expect(`${svg}\n`).toBe(readFileSync(`${DOCS}out/${name}`, 'utf8'));
    }
  });

  test('pastes a drawing after every fence', () => {
    for (const [index] of fences.entries()) {
      expect(text).toContain(`(out/${outName('01-syntax', index, fences.length)})`);
    }
  });
});

describe('errors/', () => {
  const errorFiles = readdirSync(`${EXAMPLES}errors`).filter((name) => name.endsWith('.md')).sort();

  test.each(errorFiles)('%s is written wrong on purpose, and says so', (name) => {
    const fences = extractVnaFences(read(`errors/${name}`));
    expect(fences.length).toBeGreaterThan(0);

    for (const fence of fences) {
      // **どのフェンスも必ず何か言う。** 直ったのに errors/ に残っていると、
      // 「読めない例」として貼ってあるものが黙って読めるようになる。
      expect(renderVna(fence.source).errors.length).toBeGreaterThan(0);
    }
  });
});
