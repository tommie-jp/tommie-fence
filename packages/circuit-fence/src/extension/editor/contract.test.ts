import { describe, expect, test } from 'vitest';
import { checkFenceEditor } from 'fence-kit';
import { createCircuitEditor } from './circuitEditor.ts';

/**
 * 殻がフェンスに求めることを、**3 つのフェンスで同じ手**で確かめる
 * (中身は `fence-kit/src/editor/contract.ts`)。
 */
const SOURCE = [
  'title: 契約',
  'points:',
  '  vin: a1',
  'parts:',
  '  R1: resistor c1 c3 10k',
  'wires:',
  '  - a1 -- b1',
  '',
].join('\n');

describe('circuit の FenceEditor', () => {
  test('殻が求めることを全部満たす', () => {
    expect(checkFenceEditor(createCircuitEditor(), {
      source: SOURCE,
      room: 'j5',
      part: 'R1',
      moveTo: 'j9',
    })).toEqual([]);
  });
});
