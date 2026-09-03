import { describe, expect, test } from 'vitest';
import { checkFenceEditor } from 'fence-kit';
import { createPerfboardEditor } from './perfboardEditor.ts';

/**
 * 殻がフェンスに求めることを、**3 つのフェンスで同じ手**で確かめる
 * (中身は `fence-kit/src/editor/contract.ts`)。
 */
const SOURCE = [
  'title: 契約',
  'board: 24x18',
  'points:',
  '  vin: a1',
  'parts:',
  '  R1: resistor c1 c6',
  'wires:',
  '  - a1 -- b1',
  '',
].join('\n');

describe('perfboard の FenceEditor', () => {
  test('殻が求めることを全部満たす', () => {
    expect(checkFenceEditor(createPerfboardEditor(), {
      source: SOURCE,
      room: 'j2',
      part: 'R1',
      moveTo: 'j10',
    })).toEqual([]);
  });
});
