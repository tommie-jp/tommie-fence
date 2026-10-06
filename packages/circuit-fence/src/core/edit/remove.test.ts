import { describe, expect, test } from 'vitest';
import { deletePart, deleteWire } from './remove.ts';
import { applyRewrite } from './shared.ts';

const RC = [
  'parts:',
  '  IN:  port 1,1',
  '  R1:  resistor 1,1 3,1 10k',
  '  Q1:  npn 5,2',
  'wires:',
  '  - 3,1 -- 4,1',
  '  - 4,1 -- Q1.b',
  '',
].join('\n');

const dropped = (source: string, id: string) => {
  const result = deletePart(source, id);
  if (!result.ok) throw new Error(result.error.message);
  return { ...result.value, source: applyRewrite(source, result.value) };
};

describe('deletePart', () => {
  test('takes out the line the part was written on, and nothing else', () => {
    const { source } = dropped(RC, 'R1');

    expect(source).not.toContain('R1');
    expect(source).toContain('  IN:  port 1,1');
    expect(source).toContain('  - 3,1 -- 4,1');
  });

  test('takes the wires that point at its pins with it', () => {
    // ピンを指す配線は、部品が消えると読めなくなる (残すとエラーの行が増えるだけ)。
    const { source, wires } = dropped(RC, 'Q1');

    expect(source).not.toContain('Q1.b');
    expect(source).toContain('  - 3,1 -- 4,1');
    expect(wires).toBe(1);
  });

  test('leaves wires that only name an address, since they stand on their own', () => {
    expect(dropped(RC, 'R1').wires).toBe(0);
  });

  test('says which connections the removal broke', () => {
    const { diff } = dropped(RC, 'R1');

    expect(diff.lost.length).toBeGreaterThan(0);
    expect(diff.gained).toEqual([]);
  });

  test('takes the key with the last part, since an empty parts: cannot be read', () => {
    const source = ['parts:', '  R1: resistor 1,1 3,1', ''].join('\n');

    expect(dropped(source, 'R1').source.trim()).toBe('');
  });

  test('takes the wires key when the last wire goes with the part', () => {
    const source = ['parts:', '  Q1: npn 5,2', '  R1: resistor 1,1 3,1', 'wires:', '  - 4,1 -- Q1.b', ''].join('\n');

    expect(dropped(source, 'Q1').source).not.toContain('wires:');
    expect(dropped(source, 'Q1').source).toContain('R1: resistor 1,1 3,1');
  });

  test('refuses a part written in flow style, where the line is not the part', () => {
    // `parts: {R1: …}` は行ごと消すと鍵まで消える。差し替えは今までどおり効く。
    const result = deletePart('parts: {R1: "resistor 1,1 3,1"}\n', 'R1');

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.message).toContain('フロー形式');
  });

  test('refuses when two parts share a line', () => {
    const result = deletePart('parts:\n  {R1: "resistor 1,1 3,1", C1: "capacitor 1,2 3,2"}\n', 'R1');

    expect(result.ok).toBe(false);
  });

  test('says so when there is no such part', () => {
    const result = deletePart(RC, 'R9');

    expect(result.ok === false && result.error.message).toContain('R9');
  });

  test('refuses a fence it cannot read, rather than guessing', () => {
    expect(deletePart('parts:\n  R1: [unclosed\n', 'R1').ok).toBe(false);
  });
});

describe('deleteWire', () => {
  const cut = (source: string, line: number) => {
    const result = deleteWire(source, line);
    if (!result.ok) throw new Error(result.error.message);
    return applyRewrite(source, result.value);
  };

  test('takes out the whole path written on that line', () => {
    // 「1 行 = 1 本の経路」なので、数珠つなぎも 1 本として消える。
    const source = ['wires:', '  - 1,1 -- 3,1 -- 5,1', '  - 1,2 -- 3,2', ''].join('\n');

    expect(cut(source, 2)).toBe(['wires:', '  - 1,2 -- 3,2', ''].join('\n'));
  });

  test('takes the key with the last wire', () => {
    const source = ['parts:', '  R1: resistor 1,1 3,1', 'wires:', '  - 3,1 -- 5,1', ''].join('\n');

    expect(cut(source, 4)).toBe(['parts:', '  R1: resistor 1,1 3,1', ''].join('\n'));
  });

  test('says so when the line holds no wire', () => {
    const result = deleteWire(['wires:', '  - 1,1 -- 3,1', ''].join('\n'), 1);

    expect(result.ok).toBe(false);
  });

  test('refuses wires written in flow style', () => {
    const result = deleteWire('wires: ["1,1 -- 3,1", "1,2 -- 3,2"]\n', 1);

    expect(result.ok === false && result.error.message).toContain('フロー形式');
  });
});

describe('部品を消したときの注釈 (レビューで出た穴)', () => {
  const source = [
    'parts:',
    '  R1: resistor 1,1 3,1 10k',
    '  C1: capacitor 1,3 3,3 100n',
    'wires:',
    '  - 3,1 -- 1,3',
    'notes:',
    '  - circle R1 red',
    '  - arrow R1 C1',
    '  - circle C1 blue',
  ].join('\n');

  test('takes the notes that point at the part with it', () => {
    // 残しても何も描かれず、エラーもお知らせも出ない。配線を一緒に消すのと同じ理由。
    const result = deletePart(source, 'R1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const written = applyRewrite(source, result.value);

    expect(written).not.toContain('circle R1');
    expect(written).not.toContain('arrow R1');
    expect(written).toContain('circle C1 blue');
  });

  test('drops the notes: key when nothing is left under it', () => {
    const only = 'parts:\n  R1: resistor 1,1 3,1 10k\nnotes:\n  - circle R1 red\n';
    const result = deletePart(only, 'R1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(applyRewrite(only, result.value)).not.toContain('notes:');
  });
});
