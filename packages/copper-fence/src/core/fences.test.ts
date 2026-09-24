import { describe, expect, test } from 'vitest';
import { extractCopperFences } from './fences.ts';

describe('extractCopperFences', () => {
  test('takes the body of a copper fence with the line it starts on', () => {
    const markdown = ['# 見出し', '', '```copper', 'board: 40x20mm', '```', ''].join('\n');
    const blocks = extractCopperFences(markdown);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.source).toBe('board: 40x20mm\n');
    expect(blocks[0]?.line).toBe(3);
  });

  test('leaves fences of another language alone, even one that starts with the same letters', () => {
    expect(extractCopperFences('```perfboard\nboard: 12x8\n```')).toEqual([]);
    expect(extractCopperFences('```copperfoil\nboard: x\n```')).toEqual([]);
  });
});
