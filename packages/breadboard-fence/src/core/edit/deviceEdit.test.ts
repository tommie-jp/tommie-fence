import { describe, expect, test } from 'vitest';
import { applyRewrite } from 'fence-kit';
import { createBreadboardEditor } from './fenceEditor.ts';

/**
 * **板の外の機器も升目から触れること** (実機で「基板外のデバイスをマウスで
 * 動かせるようにする。他のマウスコマンドにも対応する」)。
 *
 * 機器は入れ子で書くので、1 行の綴りを書き換える部品の道には乗らない。
 * どこまでできるかは文法が決める — 帯を移す・名前を変える・ラベルを直すはでき、
 * 回す・値を書く・複製するはできない (できない理由を言って断る)。
 */

const SOURCE = `board: full
parts:
  R1: resistor b3 b7 10k
  AD2:
    type: device
    at: top
    label: Analog Discovery 2
    pins: [V+, GND]
wires:
  - AD2.V+ -- b3 red
  - AD2.GND -- b7 black
`;

const editor = createBreadboardEditor();

const after = (result: ReturnType<typeof editor.setField>): string => {
  if (!result.ok) throw new Error(result.error.message);
  return applyRewrite(SOURCE, result.value);
};

describe('板の外の機器を升目から触る', () => {
  test('moves to the band the hole was dropped in, since that is all the grammar has', () => {
    expect(after(editor.movePart(SOURCE, 'AD2', 'g3'))).toContain('at: bottom');
    expect(after(editor.movePart(SOURCE, 'AD2', 'b3'))).toContain('at: top');
  });

  test('offers only the name and the label, because a device has neither value nor type to pick', () => {
    // 値は文法が使わない (箱に出るのは label)。種類は device そのもの。
    // **直せるように見えて直せない欄を出さない。**
    expect(editor.fieldsOf(SOURCE, 'AD2')?.can).toEqual(['id', 'label']);
  });

  test('writes the label into the block, rather than refusing because the line has no spelling', () => {
    expect(after(editor.setField(SOURCE, 'AD2', 'label', 'AD2 (rev C)'))).toContain('label: AD2 (rev C)');
  });

  test('adds a label line under the key when there is none yet', () => {
    const bare = SOURCE.replace('    label: Analog Discovery 2\n', '');
    const result = editor.setField(bare, 'AD2', 'label', 'Scope');

    expect(result.ok && applyRewrite(bare, result.value)).toContain('    label: Scope');
  });

  test('takes the whole line away when the label is cleared, leaving no empty key', () => {
    const cleared = after(editor.setField(SOURCE, 'AD2', 'label', ''));

    expect(cleared).not.toContain('label:');
    expect(cleared).toContain('pins: [V+, GND]');
  });

  test('says why a value cannot be written on a device', () => {
    const result = editor.setField(SOURCE, 'AD2', 'value', '100');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('ラベル');
  });

  test('renames the wires that point at its pins, so the box does not fall off the drawing', () => {
    // 機器には穴が無く、配線は `AD2.V+` の形でピンを指す。名前だけ変えると
    // 指し先を見失って、図から機器が消える。
    const renamed = after(editor.rename(SOURCE, 'AD2', 'SCOPE'));

    expect(renamed).toContain('  SCOPE:');
    expect(renamed).toContain('- SCOPE.V+ -- b3 red');
    expect(renamed).toContain('- SCOPE.GND -- b7 black');
  });

  test('lights the wires that point at its pins, since that is where its place comes from', () => {
    const spans = editor.spansOf(SOURCE, 'part', 'AD2');

    expect(spans.length).toBeGreaterThan(1);
  });

  test('says why a device cannot be duplicated, instead of talking about holes', () => {
    const result = editor.duplicate(SOURCE, 'AD2', 'AD3');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('置き場が決まりません');
  });

  test('deletes the whole block, as one thing', () => {
    const result = editor.deletePart(SOURCE, 'AD2');

    expect(result.ok && applyRewrite(SOURCE, result.value)).not.toContain('AD2');
  });
});
