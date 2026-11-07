import { describe, expect, test } from 'vitest';
import { renderPerfboard, scenesOfPerfboard } from '../index.ts';

const fence = (...lines: string[]) => lines.join('\n');

describe('the scene that fence-check reads (52 docs/148)', () => {
  const source = fence(
    'board: 14x8',
    'parts:',
    '  R1: resistor c3 c7 10k',
    '  D1: led c9 c11 green',
    'wires:',
    '  - c7 -- c9',
  );

  test('bodies from the fit check, captions as placed, straight wires', () => {
    const [scene] = scenesOfPerfboard(source);
    expect(scene?.fence).toBe('perfboard');
    expect(scene?.parts.map((part) => part.id)).toEqual(['R1', 'D1']);
    expect(scene?.captions.map((caption) => caption.owner).sort()).toEqual(['D1', 'R1']);
    expect(scene?.wires).toEqual([expect.objectContaining({ id: 'wire#1', line: 6 })]);
    expect(scene?.wires[0]?.points).toHaveLength(2);
  });

  test('pins are where wires may end', () => {
    const [scene] = scenesOfPerfboard(source);
    expect(scene?.parts[0]?.pins).toHaveLength(2);
  });

  test('the drawing does not carry the scene', () => {
    expect(Object.keys(renderPerfboard(source))).not.toContain('scene');
  });
});
