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
    const fences = extractBreadboardFences(readFileSync(join(EXAMPLES, name), 'utf8'));
    expect(fences).toHaveLength(1);

    const { svg, errors } = renderBreadboard(fences[0]!.source);
    const committed = readFileSync(join(EXAMPLES, 'out', name.replace(/\.md$/, '.svg')), 'utf8');

    expect(errors).toEqual([]);
    expect(`${svg}\n`).toBe(committed);
  });
});
