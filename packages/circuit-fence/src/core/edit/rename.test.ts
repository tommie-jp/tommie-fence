import { describe, expect, test } from 'vitest';
import { renamePart } from './rename.ts';
import { applyRewrite } from './shared.ts';

const RC = [
  'parts:',
  '  R1: resistor a1 a3 10k',
  '  Q1: npn b5',
  'wires:',
  '  - a3 -- Q1.b',
  '  - Q1.c -- Q1.e',
  '  - a1 -- b1',
  'notes:',
  '  - circle Q1 red',
  '  - arrow R1 Q1 blue',
  '',
].join('\n');

const renamed = (source: string, from: string, to: string) => {
  const result = renamePart(source, from, to);
  if (!result.ok) throw new Error(result.error.message);
  return { ...result.value, source: applyRewrite(source, result.value) };
};

describe('renamePart', () => {
  test('writes the new name where the part is defined', () => {
    expect(renamed(RC, 'Q1', 'T1').source).toContain('  T1: npn b5');
  });

  test('carries the wires that point at its pins', () => {
    const { source } = renamed(RC, 'Q1', 'T1');

    expect(source).toContain('  - a3 -- T1.b');
    expect(source).toContain('  - T1.c -- T1.e');
  });

  test('carries what the notes point at', () => {
    const { source } = renamed(RC, 'Q1', 'T1');

    expect(source).toContain('  - circle T1 red');
    expect(source).toContain('  - arrow R1 T1 blue');
  });

  test('leaves the type, the value and the colour alone', () => {
    const { source } = renamed(RC, 'R1', 'R9');

    expect(source).toContain('  R9: resistor a1 a3 10k');
    expect(source).toContain('  - arrow R9 Q1 blue');
  });

  test('does not mistake a colour for the part it happens to be named after', () => {
    // 部品を `red` と名付けることはできる。色の綴りまで書き換えたら図が変わる。
    const source = ['parts:', '  red: resistor a1 a3', 'notes:', '  - circle red red', ''].join('\n');

    expect(renamed(source, 'red', 'R1').source).toContain('  - circle R1 red');
  });

  test('says nothing changed when the name is the one it already has', () => {
    const result = renamePart(RC, 'Q1', 'Q1');

    expect(result.ok && result.value.edits).toEqual([]);
  });

  test('keeps every connection, since only the name of the end changes', () => {
    // ネットリストは端子を名前で呼ぶので、名前を変えると組が全部入れ替わって見える。
    // つながりは 1 つも変わっていないので、離れた・つながったとは言わない。
    expect(renamed(RC, 'Q1', 'T1').diff).toEqual({ lost: [], gained: [] });
  });

  test('refuses a name another part already has', () => {
    expect(renamePart(RC, 'Q1', 'R1').ok).toBe(false);
  });

  test('refuses a name the grammar does not allow', () => {
    expect(renamePart(RC, 'Q1', 'a b').ok).toBe(false);
  });

  test('refuses a name that a point already carries', () => {
    const source = ['points:', '  mid: b2', 'parts:', '  R1: resistor a1 a3', ''].join('\n');

    expect(renamePart(source, 'R1', 'mid').ok).toBe(false);
  });

  test('says so when there is no such part', () => {
    expect(renamePart(RC, 'R9', 'R8').ok).toBe(false);
  });

  test('refuses a fence it cannot read', () => {
    expect(renamePart('parts:\n  R1: [unclosed\n', 'R1', 'R2').ok).toBe(false);
  });

  test('refuses when a reference cannot be found on its line, rather than half-renaming', () => {
    // フロー形式の注釈は綴りが 1 つにつながっている。半分だけ書き換えると図が壊れる。
    const source = ['parts:', '  R1: resistor a1 a3', 'notes: [circle R1]', ''].join('\n');

    expect(renamePart(source, 'R1', 'R2').ok).toBe(false);
  });
});
