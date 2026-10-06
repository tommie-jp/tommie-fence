import { describe, expect, test } from 'vitest';
import { checkFenceEditor } from 'fence-kit';
import { createCircuitEditor } from './fenceEditor.ts';

/**
 * 殻がフェンスに求めることを、**3 つのフェンスで同じ手**で確かめる
 * (中身は `fence-kit/src/editor/contract.ts`)。
 */
const SOURCE = [
  'title: 契約',
  'points:',
  '  vin: 1,1',
  'parts:',
  '  R1: resistor 1,3 3,3 10k',
  'wires:',
  '  - 1,1 -- 1,2',
  '',
].join('\n');

describe('circuit の FenceEditor', () => {
  test('殻が求めることを全部満たす', () => {
    expect(checkFenceEditor(createCircuitEditor(), {
      source: SOURCE,
      room: '5,10',
      part: 'R1',
      moveTo: '9,10',
      // 2 行目の種類の綴りを間違えた本文 (Problems の行の表を見る)。
      broken: { source: 'parts:\n  R1: resistr 1,1 3,1 10k\n', line: 2 },
    })).toEqual([]);
  });
});

describe('ピンを指す配線 (升目の接続点から)', () => {
  const WITH_Q = ['parts:', '  Q1: npn 2,2', '  R1: resistor 1,1 3,1 10k', ''].join('\n');

  test('takes a pin as an end and writes it as the fence spells it', () => {
    // 升目のピンの丸を押すと `Q1.C` という綴りで返ってくる。番地ではないので、
    // 番地としてだけ読んでいると「読めません」で終わっていた。
    const result = createCircuitEditor().addWire(WITH_Q, 'Q1.C', '4,1', '--');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const written = (result.value.lines ?? [])
      .map((line) => ('text' in line ? line.text : ''))
      .join('\n');
    expect(written).toContain('Q1.C -- 4,1');
  });

  test('takes a pin at both ends', () => {
    const result = createCircuitEditor().addWire(WITH_Q, 'Q1.C', 'Q1.E', '--');

    expect(result.ok).toBe(true);
  });

  test('says which leg is missing instead of writing a wire that draws nothing', () => {
    const result = createCircuitEditor().addWire(WITH_Q, 'Q1.Z', '4,1', '--');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('Z');
  });

  test('still refuses a spelling that is neither an address nor a leg', () => {
    const result = createCircuitEditor().addWire(WITH_Q, 'なんだこれ', '4,1', '--');

    expect(result.ok).toBe(false);
  });
});
