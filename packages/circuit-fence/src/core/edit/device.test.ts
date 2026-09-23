import { describe, expect, test } from 'vitest';
import { applyRewrite } from 'fence-kit';
import { parseAddress } from '../model/address.ts';
import { parseFence } from '../parser/parseFence.ts';
import { setField } from './field.ts';
import { duplicatePart } from './insert.ts';
import { movePart } from './move.ts';
import { deletePart } from './remove.ts';
import { renamePart } from './rename.ts';
import { flipPart, turnPart } from './turn.ts';
import { movePoint } from './point.ts';

/**
 * 機器 (`device`) を升目から触る (52 の docs/66 の段 1)。**機器はブロックで書く**
 * ので、1 行を組み直す部品の道には乗らない。鍵の行を 1 行形式で書き直すと、
 * 下の行が宙に浮いてフェンスごと読めなくなる (実機で確かめた)。
 */

const lines = (...rows: string[]): string => `${rows.join('\n')}\n`;

const SOURCE = lines(
  'parts:',
  '  M1:',
  '    type: device',
  '    at: d5',
  '    label: S',
  '    pins: [A, B]',
  '  R1: resistor a1 a3',
  'wires:',
  '  - M1.A -| a3',
);

/** 書き換えを当てて、読めることを確かめてから返す。 */
function applied(result: { ok: boolean; value?: unknown; error?: { message: string } }): string {
  if (!result.ok) throw new Error(result.error?.message ?? 'refused');
  const value = result.value as { edits?: []; lines?: [] };
  const text = applyRewrite(SOURCE, value);
  expect(parseFence(text).errors).toEqual([]);
  return text;
}

describe('機器を升目から触る', () => {
  test('moves by rewriting the at: line and nothing else', () => {
    const text = applied(movePart(SOURCE, 'M1', parseAddress('f8')!));

    expect(text).toBe(SOURCE.replace('    at: d5', '    at: f8'));
  });

  test('turns by adding a turn: line, and drops it when the box comes back round', () => {
    const once = applied(turnPart(SOURCE, 'M1', 1));
    expect(once).toBe(SOURCE.replace('    pins: [A, B]', '    pins: [A, B]\n    turn: r90'));

    const back = turnPart(once, 'M1', 3);
    expect(back.ok).toBe(true);
    expect(applyRewrite(once, back.ok ? back.value : {})).toBe(SOURCE);
  });

  test('flips by writing mirror beside the turn it already has', () => {
    const turned = SOURCE.replace('    pins: [A, B]', '    pins: [A, B]\n    turn: r180');
    const flipped = flipPart(turned, 'M1');

    expect(flipped.ok).toBe(true);
    expect(applyRewrite(turned, flipped.ok ? flipped.value : {})).toContain('    turn: r180 mirror');
  });

  test('deletes the whole block with the wires to its pins', () => {
    const removed = deletePart(SOURCE, 'M1');

    expect(removed.ok).toBe(true);
    const text = applyRewrite(SOURCE, removed.ok ? removed.value : {});
    expect(text).toBe(lines('parts:', '  R1: resistor a1 a3'));
  });

  test('writes the value into label:, adding the line when there is none', () => {
    const relabelled = applied(setField(SOURCE, 'M1', 'value', 'HC-SR04'));
    expect(relabelled).toContain('    label: HC-SR04');

    const bare = SOURCE.replace('    label: S\n', '');
    const added = setField(bare, 'M1', 'value', 'T');
    expect(added.ok).toBe(true);
    expect(applyRewrite(bare, added.ok ? added.value : {})).toContain('    label: T');
  });

  test('keeps the block when renamed', () => {
    expect(applied(renamePart(SOURCE, 'M1', 'M9'))).toContain('  M9:\n    type: device');
  });

  test('refuses to copy a device and says how', () => {
    const copied = duplicatePart(SOURCE, 'M1', 'M2');

    expect(copied.ok).toBe(false);
    expect(copied.ok ? '' : copied.error.message).toContain('device');
  });
});

describe('機器のブロックの書き方の幅 (コードレビューで出た 5 件)', () => {
  const rewrite = (source: string, result: { ok: boolean; value?: unknown; error?: { message: string } }): string => {
    if (!result.ok) throw new Error(result.error?.message ?? 'refused');
    const text = applyRewrite(source, result.value as { edits?: []; lines?: [] });
    expect(parseFence(text).errors).toEqual([]);
    return text;
  };

  test('refuses to edit a device written as a flow map on one line', () => {
    const flow = lines('parts:', '  M1: {type: device, at: d5, pins: [A, B]}');

    for (const result of [
      movePart(flow, 'M1', parseAddress('f8')!),
      turnPart(flow, 'M1', 1),
      setField(flow, 'M1', 'value', 'T'),
    ]) {
      expect(result.ok).toBe(false);
      expect(result.ok ? '' : result.error.message).toContain('手で');
    }
  });

  test.each([['true'], ['1.10'], ['@x'], ['[x]'], ['null'], ['a: b']])('quotes a label %s that YAML would read as something else', (label) => {
    const text = rewrite(SOURCE, setField(SOURCE, 'M1', 'value', label));

    expect(parseFence(text).doc.parts.find((one) => one.id === 'M1')).toMatchObject({ value: label });
  });

  test('keeps a blank line and a comment inside the block', () => {
    const spaced = lines(
      'parts:',
      '  M1:',
      '    type: device',
      '',
      '# the place',
      '    at: d5',
      '    pins: [A, B]',
      '  R1: resistor a1 a3',
    );

    expect(rewrite(spaced, movePart(spaced, 'M1', parseAddress('f8')!))).toContain('    at: f8');
    const removed = deletePart(spaced, 'M1');
    expect(removed.ok).toBe(true);
    expect(applyRewrite(spaced, removed.ok ? removed.value : {})).toBe(lines('parts:', '  R1: resistor a1 a3'));
  });

  test('keeps the comment at the end of a line it rewrites', () => {
    const commented = SOURCE.replace('    at: d5', '    at: d5  # 右の端');

    expect(rewrite(commented, movePart(commented, 'M1', parseAddress('f8')!))).toContain('    at: f8  # 右の端');
  });

  test('moves a device together with a point dragged under it', () => {
    const shared = SOURCE.replace('  R1: resistor a1 a3', '  R1: resistor d5 d7');
    const moved = movePoint(shared, parseAddress('d5')!, parseAddress('e5')!);

    expect(moved.ok).toBe(true);
    const text = applyRewrite(shared, moved.ok ? moved.value : {});
    expect(text).toContain('    at: e5');
    expect(text).toContain('R1: resistor e5 d7');
  });
});
