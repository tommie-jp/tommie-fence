import { describe, expect, test } from 'vitest';
import { extractGraphFences } from './fences.ts';

describe('extractGraphFences', () => {
  test('takes the body of a graph fence with the line it starts on', () => {
    const markdown = ['# 見出し', '', '```graph', 'sweep: 1M-300M', '```', ''].join('\n');
    const blocks = extractGraphFences(markdown);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.source).toBe('sweep: 1M-300M\n');
    expect(blocks[0]?.line).toBe(3);
  });

  test('leaves fences of another language alone, even one that starts with the same letters', () => {
    expect(extractGraphFences('```perfboard\nboard: 12x8\n```')).toEqual([]);
    expect(extractGraphFences('```graphx\nsweep: 1M-2M\n```')).toEqual([]);
  });
});
