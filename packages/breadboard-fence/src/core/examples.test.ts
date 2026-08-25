import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { extractBreadboardFences } from './fences.ts';
import { renderBreadboard } from './index.ts';

/**
 * examples/out に置いた SVG をそのままスナップショットとして使う。
 * 描画を変えるとここが落ちるので、`npm run examples` で作り直して
 * git diff で図の変化をレビューしてからコミットする。
 */
const EXAMPLES = fileURLToPath(new URL('../../examples/', import.meta.url));

const markdownFiles = readdirSync(EXAMPLES).filter((name) => name.endsWith('.md')).sort();

describe('examples', () => {
  test('there is at least one example to check', () => {
    expect(markdownFiles.length).toBeGreaterThan(0);
  });

  test.each(markdownFiles)('%s renders to the drawing committed in examples/out', (name) => {
    const stem = name.replace(/\.md$/, '');
    const fences = extractBreadboardFences(readFileSync(join(EXAMPLES, name), 'utf8'));
    expect(fences.length).toBeGreaterThan(0);

    fences.forEach((fence, index) => {
      // 出力の名前は CLI (src/cli/main.ts の jobsFor) と同じ付け方に揃える。
      const outName = fences.length === 1 ? `${stem}.svg` : `${stem}-${index + 1}.svg`;
      const { svg, errors } = renderBreadboard(fence.source);
      const committed = readFileSync(join(EXAMPLES, 'out', outName), 'utf8');

      expect(errors, outName).toEqual([]);
      expect(`${svg}\n`, outName).toBe(committed);
    });
  });
});
