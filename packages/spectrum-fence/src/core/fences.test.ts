import { describe, expect, test } from 'vitest';
import { extractSpectrumFences } from './fences.ts';

describe('extractSpectrumFences', () => {
  test('takes the body of a spectrum fence with the line it starts on', () => {
    const markdown = ['# 見出し', '', '```spectrum', 'sweep: 1M-300M', '```', ''].join('\n');
    const blocks = extractSpectrumFences(markdown);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.source).toBe('sweep: 1M-300M\n');
    expect(blocks[0]?.line).toBe(3);
  });

  test('leaves fences of another language alone, even one that starts with the same letters', () => {
    expect(extractSpectrumFences('```perfboard\nboard: 12x8\n```')).toEqual([]);
    expect(extractSpectrumFences('```spectrumx\nsweep: 1M-2M\n```')).toEqual([]);
  });
});
