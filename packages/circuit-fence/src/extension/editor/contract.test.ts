import { describe, expect, test } from 'vitest';
import { checkFenceEditor } from 'fence-kit';
import { createCircuitEditor } from '../../core/edit/fenceEditor.ts';

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

describe('足を指す配線 (升目の接続点から)', () => {
  const WITH_Q = ['parts:', '  Q1: npn b2', '  R1: resistor a1 a3 10k', ''].join('\n');

  test('takes a pin as an end and writes it as the fence spells it', () => {
    // 升目の足の丸を押すと `Q1.C` という綴りで返ってくる。番地ではないので、
    // 番地としてだけ読んでいると「読めません」で終わっていた。
    const result = createCircuitEditor().addWire(WITH_Q, 'Q1.C', 'a4', '--');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const written = (result.value.lines ?? [])
      .map((line) => ('text' in line ? line.text : ''))
      .join('\n');
    expect(written).toContain('Q1.C -- a4');
  });

  test('takes a pin at both ends', () => {
    const result = createCircuitEditor().addWire(WITH_Q, 'Q1.C', 'Q1.E', '--');

    expect(result.ok).toBe(true);
  });

  test('says which leg is missing instead of writing a wire that draws nothing', () => {
    const result = createCircuitEditor().addWire(WITH_Q, 'Q1.Z', 'a4', '--');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('Z');
  });

  test('still refuses a spelling that is neither an address nor a leg', () => {
    const result = createCircuitEditor().addWire(WITH_Q, 'なんだこれ', 'a4', '--');

    expect(result.ok).toBe(false);
  });
});
