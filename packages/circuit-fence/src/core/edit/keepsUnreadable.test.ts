import { describe, expect, test } from 'vitest';
import { applyRewrite } from 'fence-kit';
import { parseFence } from '../parser/parseFence.ts';
import { createCircuitEditor } from './fenceEditor.ts';

/**
 * **読めた項目の最後の 1 つを消しても、読めない行が残るなら鍵は消さない。**
 * 前は読めた項目だけを見て鍵の行ごと落としていたので、残った読めない行が上の鍵の
 * 中身として読まれ、フェンスごと読めなくなっていた (段 0 の「読めない行は 1 字も
 * 触らない」に反する)。
 */
const editor = createCircuitEditor();
const HEAD = '';
const at = (source: string, text: string): number => source.split('\n').indexOf(text) + 1;
const applied = (source: string, result: ReturnType<typeof editor.deleteWire>): string => {
  if (!result.ok) throw new Error(result.error.message);
  return applyRewrite(source, result.value);
};

describe('読めない行が残る鍵', () => {
  test('配線', () => {
    const source = `${HEAD}parts:\n  R2: resistor a1 a3\nwires:\n  - a1 --\n  - c1 -- c5\n`;
    expect(parseFence(source).doc.wires.length).toBe(1);
    expect(applied(source, editor.deleteWire(source, at(source, '  - c1 -- c5')))).toBe(`${HEAD}parts:\n  R2: resistor a1 a3\nwires:\n  - a1 --\n`);
  });

  test('部品', () => {
    const source = `${HEAD}parts:\n  R1: resistr a1 a3\n  R2: resistor a1 a3\n`;
    expect(parseFence(source).doc.parts.length).toBe(1);
    expect(applied(source, editor.deletePart(source, 'R2'))).toBe(`${HEAD}parts:\n  R1: resistr a1 a3\n`);
  });

  test('注釈', () => {
    const source = `${HEAD}parts:\n  R2: resistor a1 a3\nnotes:\n  - circle\n  - circle R2\n`;
    expect(parseFence(source).doc.notes.length).toBe(1);
    const line = at(source, '  - circle R2');
    expect(applied(source, editor.deletePart(source, `note:${line}`))).toBe(`${HEAD}parts:\n  R2: resistor a1 a3\nnotes:\n  - circle\n`);
  });

  test('読めない行が無ければ、今までどおり鍵ごと消す', () => {
    const source = `${HEAD}parts:\n  R2: resistor a1 a3\nwires:\n  - c1 -- c5\n`;
    expect(applied(source, editor.deleteWire(source, at(source, '  - c1 -- c5')))).toBe(`${HEAD}parts:\n  R2: resistor a1 a3\n`);
  });
});
