import { checkFenceEditor } from 'fence-kit';
import { describe, expect, test } from 'vitest';
import { createCopperEditor } from './fenceEditor.ts';

const SOURCE = [
  'board: 40x30mm',
  'copper:',
  '  L1: line 0,10 40,10 3.06',
  '  P1: pad 30,20',
  'parts:',
  '  J1: sma left 10',
  '  C1: capacitor/1608 20,10 10p',
  'wires:',
  '  - P1 -- 35,25',
].join('\n');

describe('the copper editor', () => {
  test('keeps the contract the map shell relies on', () => {
    expect(checkFenceEditor(createCopperEditor(), {
      source: SOURCE,
      room: '10,22',
      part: 'C1',
      moveTo: '12,4',
      broken: { source: `${SOURCE}\n  - P1 -- nowhere`, line: 10 },
    })).toEqual([]);
  });
});
