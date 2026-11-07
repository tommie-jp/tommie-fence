import { describe, expect, test } from 'vitest';
import { renderBreadboard, scenesOfBreadboard } from '../index.ts';

const fence = (...lines: string[]) => lines.join('\n');

describe('the scene that fence-check reads (52 docs/148)', () => {
  const source = fence(
    'board: half',
    'parts:',
    '  R1: resistor a5 a10 10k',
    '  D1: led c12 c13 red',
    'wires:',
    '  - -t3 -- a3 black',
  );

  test('one scene with bodies, captions and routed wires', () => {
    const [scene, ...rest] = scenesOfBreadboard(source);
    expect(rest).toEqual([]);
    expect(scene?.fence).toBe('breadboard');
    expect(scene?.approximate).toBe(false);
    expect(scene?.parts.map((part) => part.id)).toEqual(['R1', 'D1']);
    expect(scene?.captions.map((caption) => caption.owner)).toEqual(['R1', 'D1']);
    expect(scene?.wires).toHaveLength(1);
    expect(scene?.wires[0]?.id).toBe('wire(-t3-a3)');
    expect(scene?.wires[0]?.points.length).toBeGreaterThanOrEqual(2);
  });

  test('a caption sits below its body, not on it (glyph box, not the routing band)', () => {
    const [scene] = scenesOfBreadboard(source);
    const body = scene!.parts.find((part) => part.id === 'R1')!.rect;
    const caption = scene!.captions.find((one) => one.owner === 'R1')!.rect;
    expect(caption.cy - caption.height / 2).toBeGreaterThanOrEqual(body.cy + body.height / 2);
  });

  test('a two-lead body stays tilted when the part is', () => {
    const [scene] = scenesOfBreadboard(fence('board: half', 'parts:', '  R1: resistor a5 e9 10k'));
    expect(scene?.parts[0]?.rect.angle).not.toBe(0);
  });

  test('sheets give one scene each, named', () => {
    const scenes = scenesOfBreadboard(fence(
      'board: half',
      'sheets:',
      '  - name: A',
      '    parts:',
      '      R1: resistor a5 a10 10k',
      '  - name: B',
      '    parts:',
      '      R2: resistor a5 a10 1k',
    ));
    expect(scenes.map((scene) => scene.sheet)).toEqual(['A', 'B']);
  });

  test('the drawing does not carry the scene', () => {
    expect(Object.keys(renderBreadboard(source))).not.toContain('scene');
  });
});
