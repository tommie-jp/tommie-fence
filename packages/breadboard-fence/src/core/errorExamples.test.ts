import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { extractBreadboardFences } from './fences.ts';
import { renderBreadboard } from './index.ts';
import { errorText } from './render/errorText.ts';

/**
 * `examples/errors/` は**わざと読めなく書いたフェンス**の置き場。
 * 図にならない行を含むので `npm run examples` の対象ではなく、
 * 代わりにここで「まだ報告が出ること」と「文面が書いてあるとおりであること」を見張る。
 *
 * 直したつもりのない親切 (エラーが出なくなる・文面が変わる) に気づけるようにするため。
 */
const ERRORS = fileURLToPath(new URL('../../examples/errors/', import.meta.url));

const files = readdirSync(ERRORS).filter((name) => name.endsWith('.md')).sort();

/** 本文に写した ```text ブロック。フェンスの下に、出るはずの文面を並べてある。 */
const expectedBlocks = (markdown: string): string[] =>
  [...markdown.matchAll(/```text\n([\s\S]*?)```/g)].map((match) => match[1] ?? '');

describe('error examples', () => {
  test('there is at least one broken example to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  test.each(files)('%s still reports something for every fence', (name) => {
    const fences = extractBreadboardFences(readFileSync(join(ERRORS, name), 'utf8'));
    expect(fences.length).toBeGreaterThan(0);

    for (const fence of fences) {
      const { errors, notices } = renderBreadboard(fence.source);
      expect([...errors, ...notices].length, `${name} の ${fence.line} 行目`).toBeGreaterThan(0);
    }
  });

  test.each(files)('%s writes down the same wording the tool produces', (name) => {
    const markdown = readFileSync(join(ERRORS, name), 'utf8');
    const fences = extractBreadboardFences(markdown);
    const written = expectedBlocks(markdown).join('\n');

    for (const fence of fences) {
      const { errors, notices } = renderBreadboard(fence.source);
      for (const item of [...errors, ...notices]) {
        // 文面そのものが本文に写してあること。写しがずれると、
        // 例を読んだ人が「自分の書き方が悪い」と思ってしまう。
        expect(written, `${name} の ${fence.line} 行目`).toContain(errorText(item).split('\n')[0]);
      }
    }
  });
});
