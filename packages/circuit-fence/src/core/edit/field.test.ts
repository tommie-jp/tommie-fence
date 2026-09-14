import { describe, expect, test } from 'vitest';
import { partFields, setField } from './field.ts';
import { applyRewrite } from './shared.ts';

const RC = [
  'parts:',
  '  R1: resistor a1 a3 10k',
  '  R2: resistor c1 c3',
  '  G1: ground e3',
  '  U1: opamp b5 LM358',
  '',
].join('\n');

const set = (source: string, id: string, field: Parameters<typeof setField>[2], text: string) => {
  const result = setField(source, id, field, text);
  if (!result.ok) throw new Error(result.error.message);
  return { ...result.value, source: applyRewrite(source, result.value) };
};

describe('setField', () => {
  test('writes over the value that is already there', () => {
    expect(set(RC, 'R1', 'value', '4k7').source).toContain('  R1: resistor a1 a3 4k7');
  });

  test('adds a value where the part had none', () => {
    expect(set(RC, 'R2', 'value', '220').source).toContain('  R2: resistor c1 c3 220');
  });

  test('takes the value away when it is given nothing', () => {
    expect(set(RC, 'R1', 'value', '').source).toContain('  R1: resistor a1 a3\n');
  });

  test('adds a label after the value, where the grammar expects it', () => {
    expect(set(RC, 'R1', 'label', 'R_1').source).toContain('  R1: resistor a1 a3 10k l=R_1');
  });

  test('writes over a label that is already there, and can take it away', () => {
    const labelled = set(RC, 'R1', 'label', 'R_1').source;

    expect(set(labelled, 'R1', 'label', 'R_x').source).toContain('l=R_x');
    expect(set(labelled, 'R1', 'label', '').source).toContain('  R1: resistor a1 a3 10k\n');
  });

  test('changes the type, which is the token after the name', () => {
    expect(set(RC, 'R1', 'type', 'capacitor').source).toContain('  R1: capacitor a1 a3 10k');
  });

  test('keeps the comment on the line, since only the token is replaced', () => {
    const source = ['parts:', '  R1: resistor a1 a3 10k  # 主抵抗', ''].join('\n');

    expect(set(source, 'R1', 'value', '4k7').source).toContain('  R1: resistor a1 a3 4k7  # 主抵抗');
  });

  test('says the connections did not change, because they did not', () => {
    expect(set(RC, 'R1', 'value', '4k7').diff).toEqual({ lost: [], gained: [] });
  });

  test('refuses a type that takes a different number of addresses', () => {
    const result = setField(RC, 'R1', 'type', 'ground');

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.message).toContain('番地');
  });

  test('refuses a type it does not know', () => {
    expect(setField(RC, 'R1', 'type', 'flux-capacitor').ok).toBe(false);
  });

  test('refuses a value on a one-terminal part, which the grammar has no room for', () => {
    expect(setField(RC, 'G1', 'value', '5V').ok).toBe(false);
  });

  test('writes the type number of a multi-terminal part as its value', () => {
    expect(set(RC, 'U1', 'value', 'TL072').source).toContain('  U1: opamp b5 TL072');
  });

  test('refuses a label on a multi-terminal part, which the grammar has no room for', () => {
    expect(setField(RC, 'U1', 'label', 'x').ok).toBe(false);
  });

  test('refuses a value with a space or an equals sign in it', () => {
    expect(setField(RC, 'R1', 'value', '10 k').ok).toBe(false);
    expect(setField(RC, 'R1', 'value', 'l=x').ok).toBe(false);
  });

  test('refuses a value that is too long to fit the drawing', () => {
    expect(setField(RC, 'R1', 'value', 'x'.repeat(80)).ok).toBe(false);
  });

  test('refuses a value next to v=, which the drawing puts in the same place', () => {
    const source = ['parts:', '  R1: resistor a1 a3 v=vR', ''].join('\n');

    expect(setField(source, 'R1', 'value', '10k').ok).toBe(false);
  });

  test('says so when there is no such part, and refuses a fence it cannot read', () => {
    expect(setField(RC, 'R9', 'value', '1k').ok).toBe(false);
    expect(setField('parts:\n  R1: [unclosed\n', 'R1', 'value', '1k').ok).toBe(false);
  });
});

describe('partFields', () => {
  test('reads what the fields hold now, so the form can show it', () => {
    expect(partFields(RC, 'R1')).toEqual({
      id: 'R1', type: 'resistor', value: '10k', label: '', color: '', can: ['id', 'type', 'value', 'label'],
    });
  });

  test('reads the label as the grammar read it, not as it was spelled', () => {
    const source = ['parts:', '  R1: resistor a1 a3 10k l=R_1', ''].join('\n');

    expect(partFields(source, 'R1')?.label).toBe('R_1');
  });

  test('leaves empty what the part does not carry', () => {
    // 1 端子は値もラベルも書けない。**書ける欄はフェンスが決めて渡す。**
    expect(partFields(RC, 'G1')).toEqual({
      id: 'G1', type: 'ground', value: '', label: '', color: '', can: ['id', 'type'],
    });
  });

  test('gives a multi-terminal part its type number as the value', () => {
    expect(partFields(RC, 'U1')?.value).toBe('LM358');
  });

  test('has nothing for a part that is not there, or a fence it cannot read', () => {
    expect(partFields(RC, 'R9')).toBeNull();
    expect(partFields('parts:\n  R1: [unclosed\n', 'R1')).toBeNull();
  });
});

describe('YAML に食われる綴りを断る (レビューで出た穴)', () => {
  const source = 'parts:\n  R1: resistor a1 a3 10k\n';

  test('refuses a value starting with #, which YAML eats as a comment', () => {
    // 通すと `R1: resistor a1 a3 #hi` になり、値は黙って消える。
    // エラーもネットの差分も出ないので、書いた人は書けたつもりで終わる。
    const result = setField(source, 'R1', 'value', '#hi');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('#');
  });

  test('refuses one anywhere a comment would start, not just at the head', () => {
    expect(setField(source, 'R1', 'value', '10k#hi').ok).toBe(false);
  });

  test('still takes an ordinary value', () => {
    expect(setField(source, 'R1', 'value', '4k7').ok).toBe(true);
  });
});

// **1 行に並べた部品 (フロー形式) は、その部品の範囲だけを書き換える。**
// 前は行が部品 1 つに対応しないので断っていた。ほかの 2 つのフェンスと揃える。
describe('setField on parts written in flow style', () => {
  const FLOW = 'parts: {R1: resistor a1 a3 10k, R2: resistor c1 c3}\n';

  test('writes over the value of the first part, leaving the second', () => {
    expect(set(FLOW, 'R1', 'value', '4k7').source).toBe('parts: {R1: resistor a1 a3 4k7, R2: resistor c1 c3}\n');
  });

  test('adds a value to the second part inside the braces', () => {
    expect(set(FLOW, 'R2', 'value', '220').source).toBe('parts: {R1: resistor a1 a3 10k, R2: resistor c1 c3 220}\n');
  });

  test('takes the value away without eating the separator', () => {
    expect(set(FLOW, 'R1', 'value', '').source).toBe('parts: {R1: resistor a1 a3, R2: resistor c1 c3}\n');
  });

  test('adds a label and changes the type in place', () => {
    expect(set(FLOW, 'R2', 'label', 'R_2').source).toBe('parts: {R1: resistor a1 a3 10k, R2: resistor c1 c3 l=R_2}\n');
    expect(set(FLOW, 'R2', 'type', 'capacitor').source).toBe('parts: {R1: resistor a1 a3 10k, R2: capacitor c1 c3}\n');
  });

  test('works on a map broken across lines', () => {
    const source = 'parts: {R1: resistor a1 a3,\n  R2: resistor c1 c3}\n';
    expect(set(source, 'R1', 'value', '1k').source).toBe('parts: {R1: resistor a1 a3 1k,\n  R2: resistor c1 c3}\n');
    expect(set(source, 'R2', 'value', '1k').source).toBe('parts: {R1: resistor a1 a3,\n  R2: resistor c1 c3 1k}\n');
  });

  // **同じ名前の記号が 1 行に 2 つ** (`vcc`)。名札の 2 つ目は 2 つ目の項目を指す。
  test('changes the second of two symbols with the same name', () => {
    const source = 'parts: {VCC: vcc a1, VCC: vcc c1}\n';
    expect(set(source, 'VCC#2', 'type', 'vee').source).toBe('parts: {VCC: vcc a1, VCC: vee c1}\n');
  });

  // **区切りの字は値に書けない。** 書くとその場で項目が割れる。
  test('refuses a value with a flow separator in it', () => {
    expect(setField(FLOW, 'R1', 'value', '1,0').ok).toBe(false);
    expect(setField(FLOW, 'R1', 'label', 'R}').ok).toBe(false);
  });

  test('still rewrites a line whose key has a space before the colon', () => {
    expect(set('parts:\n  R1 : resistor a1 a3\n', 'R1', 'value', '1k').source).toContain('resistor a1 a3 1k\n');
  });

  test('still takes a comma in a value written on its own line', () => {
    expect(set(RC, 'R1', 'value', '1,0').source).toContain('  R1: resistor a1 a3 1,0');
  });
});

// ---- レビューで出た穴 (2026-09-14) ----
// **範囲を読み違えそうな形は、書く前に読み直して確かめ、崩れるなら断る。**
describe('欄を 1 行に並べた部品に書くとき、崩す形は断る', () => {
  test('鍵に空白を置いた形も、範囲を見つけて書く', () => {
    expect(set('parts: {R1 : resistor a1 a3}\n', 'R1', 'value', '10k').source).toBe('parts: {R1: resistor a1 a3 10k}\n');
  });

  test("値の途中の ' があっても、隣の部品を飲み込まない", () => {
    const quoted = set('parts: {R1: resistor a1 a3, R2: resistor c1 c3}\n', 'R1', 'value', "'x").source;
    expect(quoted).toBe("parts: {R1: resistor a1 a3 'x, R2: resistor c1 c3}\n");
    expect(set(quoted, 'R1', 'value', '4k7').source).toBe('parts: {R1: resistor a1 a3 4k7, R2: resistor c1 c3}\n');
    expect(set(quoted, 'R2', 'value', '1k').source).toBe("parts: {R1: resistor a1 a3 'x, R2: resistor c1 c3 1k}\n");
  });

  test('次の行へ続く項目は断る', () => {
    expect(setField('parts: {R1: resistor a1\n  a3}\n', 'R1', 'value', '10k').ok).toBe(false);
    expect(setField('parts: {R1:\n  resistor a1 a3, R2: resistor c1 c3}\n', 'R1', 'value', '10k').ok).toBe(false);
  });

  // 組み直すと引用符が外れ、中の , が区切りになる。
  test('引用符で囲んだ値に区切りの字があれば断る', () => {
    expect(setField('parts: {R1: "resistor a1 a3 1,0", R2: resistor c1 c3}\n', 'R1', 'label', 'x').ok).toBe(false);
  });

  test('前の行の値が , で終わるブロック形式を、並べた形と取り違えない', () => {
    const source = 'parts:\n  R1: resistor a1 a3 1,\n  R2: resistor c1 c3 2,2\n';
    expect(set(source, 'R2', 'label', 'x').source).toBe('parts:\n  R1: resistor a1 a3 1,\n  R2: resistor c1 c3 2,2 l=x\n');
  });

  // 1 つ目は読めないので数に入らず、名札 VCC は 2 つ目を指す。字の 1 つ目を書き換えてはいけない。
  test('同じ名前の読めない項目が前にあるときは、書き換えずに断る', () => {
    const result = setField('parts: {VCC: vcc zz, VCC: vcc c1}\n', 'VCC', 'type', 'vee');
    if (result.ok) expect(applyRewrite('parts: {VCC: vcc zz, VCC: vcc c1}\n', result.value)).toBe('parts: {VCC: vcc zz, VCC: vee c1}\n');
  });
});
