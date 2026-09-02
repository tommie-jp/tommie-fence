import { describe, expect, test } from 'vitest';
import { colorName, hasHatch, hatchDash, hatchDefs, hatchFill } from './hatch.ts';

describe('hatchFill', () => {
  test('sends a colour that has a weave to its own pattern', () => {
    expect(hatchFill('red', '#000')).toBe('url(#pf-hatch-red)');
  });

  test('paints black flat — the colour used most often stays the plainest shape', () => {
    expect(hatchFill('black', '#111')).toBe('#111');
  });

  test('paints an unknown colour flat, rather than letting colour leak into a mono drawing', () => {
    expect(hatchFill('chartreuse', '#111')).toBe('#111');
  });
});

describe('hatchDash', () => {
  test('draws black solid and the rest with a line of its own', () => {
    expect(hatchDash('black')).toBe('');
    expect(hatchDash('red')).not.toBe('');
    expect(hatchDash('red')).not.toBe(hatchDash('yellow'));
  });

  test('draws an unknown colour solid', () => {
    expect(hatchDash('chartreuse')).toBe('');
  });
});

describe('hatchDefs', () => {
  test('writes out only the weaves the drawing used', () => {
    const defs = hatchDefs(['red'], '#000', '#fff');

    expect(defs).toContain('id="pf-hatch-red"');
    expect(defs).not.toContain('pf-hatch-blue');
  });

  test('writes nothing when nothing needs a weave', () => {
    expect(hatchDefs(['black'], '#000', '#fff')).toBe('');
    expect(hatchDefs([], '#000', '#fff')).toBe('');
  });
});

describe('colorName', () => {
  test('uses the words a part is picked out of a box with', () => {
    expect(colorName('brown')).toBe('茶');
    expect(colorName('violet')).toBe('紫');
  });

  test('leaves a name it does not know alone', () => {
    expect(colorName('chartreuse')).toBe('chartreuse');
    expect(hasHatch('chartreuse')).toBe(false);
  });
});
