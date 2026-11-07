import { describe, expect, test } from 'vitest';
import { scenesOfCircuit } from '../index.ts';

const fence = (...lines: string[]) => lines.join('\n');

describe('the scene that fence-check reads (52 docs/148)', () => {
  test('two-terminal parts give a body and a lead; wires bend at their corner', () => {
    const [scene] = scenesOfCircuit(fence(
      'parts:',
      '  V1: dc 1,3 1,1 5V',
      '  R1: resistor 1,1 3,1 1k',
      'wires:',
      '  - 3,1 -| 1,3',
    ));
    expect(scene?.approximate).toBe(true);
    expect(scene?.parts.map((part) => part.id)).toEqual(['V1', 'R1']);
    expect(scene?.wires.filter((wire) => wire.lead === true).map((wire) => wire.id)).toEqual(['V1', 'R1']);
    const bent = scene?.wires.find((wire) => wire.id === 'wire#1');
    expect(bent?.points).toHaveLength(3);
  });

  test('wires to pins of multi-terminal parts are only counted as skipped', () => {
    const [scene] = scenesOfCircuit(fence(
      'parts:',
      '  Q1: npn 3,3',
      '  R1: resistor 1,1 3,1 1k',
      'wires:',
      '  - 3,1 -- Q1.C',
    ));
    expect(scene?.skipped).toBe(1);
  });

  test('a short has a lead but no body', () => {
    const [scene] = scenesOfCircuit(fence('parts:', '  S1: short 1,1 3,1'));
    expect(scene?.parts).toEqual([]);
    expect(scene?.wires).toHaveLength(1);
  });

  test('no parts, no scene', () => {
    expect(scenesOfCircuit('title: 空\n')).toEqual([]);
  });
});
