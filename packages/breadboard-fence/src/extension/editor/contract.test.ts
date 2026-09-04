import { describe, expect, test } from 'vitest';
import { checkFenceEditor } from 'fence-kit';
import { createBreadboardEditor } from '../../core/edit/fenceEditor.ts';

/**
 * 殻がフェンスに求めることを、**3 つのフェンスで同じ手**で確かめる
 * (中身は `fence-kit/src/editor/contract.ts`)。とくに
 * **パレットに出る種類が全部 1 クリックで置ける**ことを見る — ここが破れていた
 * のに版をまたいで気づけなかった (3 本足 5 種が置けなかった)。
 */
const SOURCE = [
  'title: 契約',
  'board: full',
  'points:',
  '  vin: a1',
  'parts:',
  '  R1: resistor c1 c6 330',
  'wires:',
  '  - a1 -- b1',
  '',
].join('\n');

describe('breadboard の FenceEditor', () => {
  test('殻が求めることを全部満たす', () => {
    expect(checkFenceEditor(createBreadboardEditor(), {
      source: SOURCE,
      room: 'e20',
      part: 'R1',
      moveTo: 'e30',
    })).toEqual([]);
  });
});
