import { describe, expect, test } from 'vitest';
import { extractLogicFences } from './fences.ts';

describe('extractLogicFences', () => {
  test('takes the body of a logic fence with the line it starts on', () => {
    const markdown = ['# 見出し', '', '```logic', 'sweep: 1M-300M', '```', ''].join('\n');
    const blocks = extractLogicFences(markdown);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.source).toBe('sweep: 1M-300M\n');
    expect(blocks[0]?.line).toBe(3);
  });

  test('leaves fences of another language alone, even one that starts with the same letters', () => {
    expect(extractLogicFences('```perfboard\nboard: 12x8\n```')).toEqual([]);
    expect(extractLogicFences('```logicx\nsweep: 1M-2M\n```')).toEqual([]);
  });
});
