import { describe, expect, test } from 'vitest';
import { extractVnaFences } from './fences.ts';

describe('extractVnaFences', () => {
  test('takes the body of a vna fence with the line it starts on', () => {
    const markdown = ['# 見出し', '', '```vna', 'sweep: 1M-300M', '```', ''].join('\n');
    const blocks = extractVnaFences(markdown);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.source).toBe('sweep: 1M-300M\n');
    expect(blocks[0]?.line).toBe(3);
  });

  test('leaves fences of another language alone, even one that starts with the same letters', () => {
    expect(extractVnaFences('```perfboard\nboard: 12x8\n```')).toEqual([]);
    expect(extractVnaFences('```vnax\nsweep: 1M-2M\n```')).toEqual([]);
  });
});
