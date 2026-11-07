import { describe, expect, it } from 'vitest';
import { sceneWireNames } from './scene.ts';

describe('sceneWireNames', () => {
  it('names a wire by the two ends as written', () => {
    expect(sceneWireNames([['c12', 'f9'], ['+t1', 'a3']])).toEqual(['wire(c12-f9)', 'wire(+t1-a3)']);
  });

  it('numbers the second wire with the same ends from 2', () => {
    expect(sceneWireNames([['c12', 'f9'], ['a1', 'a2'], ['c12', 'f9'], ['c12', 'f9']]))
      .toEqual(['wire(c12-f9)', 'wire(a1-a2)', 'wire(c12-f9)#2', 'wire(c12-f9)#3']);
  });

  it('keeps the name of a wire when another wire is added before it', () => {
    const before = sceneWireNames([['c12', 'f9']]);
    const after = sceneWireNames([['a1', 'a2'], ['c12', 'f9']]);
    expect(after[1]).toBe(before[0]);
  });
});
