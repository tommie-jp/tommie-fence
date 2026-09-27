import { describe, expect, test } from 'vitest';
import { extractScopeFences } from './fences.ts';

describe('extractScopeFences', () => {
  test('takes the body of a scope fence with the line it starts on', () => {
    const markdown = ['# 見出し', '', '```scope', 'sweep: 1M-300M', '```', ''].join('\n');
    const blocks = extractScopeFences(markdown);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.source).toBe('sweep: 1M-300M\n');
    expect(blocks[0]?.line).toBe(3);
  });

  test('leaves fences of another language alone, even one that starts with the same letters', () => {
    expect(extractScopeFences('```perfboard\nboard: 12x8\n```')).toEqual([]);
    expect(extractScopeFences('```scopex\nsweep: 1M-2M\n```')).toEqual([]);
  });
});
