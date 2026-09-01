import { describe, expect, test } from 'vitest';
import { extractPerfboardFences } from './fences.ts';

describe('extractPerfboardFences', () => {
  test('takes the body of a perfboard fence with the line it starts on', () => {
    const markdown = ['# 見出し', '', '```perfboard', 'board: akizuki-c', '```', ''].join('\n');

    const blocks = extractPerfboardFences(markdown);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.source).toBe('board: akizuki-c\n');
    // fence-kit が返すのは**開き記号の行** (1 始まり)。中身はその次の行から。
    expect(blocks[0]?.line).toBe(3);
  });

  test('leaves fences of another language alone', () => {
    expect(extractPerfboardFences('```breadboard\nboard: half\n```')).toEqual([]);
    expect(extractPerfboardFences('```yaml\nboard: x\n```')).toEqual([]);
  });

  test('returns nothing for markdown without a fence', () => {
    expect(extractPerfboardFences('ただの文章')).toEqual([]);
  });
});
