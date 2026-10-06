import { describe, expect, test } from 'vitest';
import { applyRewrite } from 'fence-kit';
import { isNodeHandle, nameNode, nodeFields, nodeHandleOf } from './pointName.ts';

const after = (source: string, handle: string, to: string): string => {
  const result = nameNode(source, handle, to);
  if (!result.ok) throw new Error(result.error.message);
  return applyRewrite(source, result.value);
};

const RC = [
  'parts:',
  '  IN: port 1,1',
  '  R1: resistor 1,1 3,1 10k',
  '  C1: capacitor 3,1 3,3 100n',
  'wires:',
  '  - 3,1 -- 3,2',
  '',
].join('\n');

describe('節点の名札', () => {
  test('tells a node handle from a part id', () => {
    expect(isNodeHandle(nodeHandleOf('3,1'))).toBe(true);
    expect(isNodeHandle('R1')).toBe(false);
  });

  test('shows the address as the type and an empty name for a node with no name', () => {
    const fields = nodeFields(RC, nodeHandleOf('3,1'));

    expect(fields?.id).toBe('');
    expect(fields?.type).toBe('3,1');
    expect(fields?.can).toEqual(['id']);
  });

  test('writes a points line and rewrites every place that spelled the address', () => {
    // 名前を付けたら、その番地を書いていた場所は全部名前になる。
    // **1 か所でも残ると節点が割れる** ので、生の綴りは残さない。
    const written = after(RC, nodeHandleOf('3,1'), 'vout');

    expect(written).toContain('points:\n  vout: 3,1');
    expect(written).toContain('  R1: resistor 1,1 vout 10k');
    expect(written).toContain('  C1: capacitor vout 3,3 100n');
    expect(written).toContain('  - vout -- 3,2');
    expect(written).not.toContain('3,1 ');
  });

  test('renames the name it already has, and the places that use it', () => {
    const named = after(RC, nodeHandleOf('3,1'), 'vout');
    const again = after(named, nodeHandleOf('3,1'), 'vo');

    expect(again).toContain('  vo: 3,1');
    expect(again).toContain('  R1: resistor 1,1 vo 10k');
    expect(again).not.toContain('vout');
  });

  test('takes the name away when the field is cleared, putting the address back', () => {
    const named = after(RC, nodeHandleOf('3,1'), 'vout');
    const bare = after(named, nodeHandleOf('3,1'), '');

    expect(bare).not.toContain('vout');
    expect(bare).toContain('  R1: resistor 1,1 3,1 10k');
    expect(bare).toContain('  - 3,1 -- 3,2');
  });

  test('reads the name back once it is written', () => {
    const named = after(RC, nodeHandleOf('3,1'), 'vout');

    expect(nodeFields(named, nodeHandleOf('3,1'))?.id).toBe('vout');
  });

  test('refuses a name the fence could not read back', () => {
    // 番地の形は読み分けられない。部品 ID と同じ名前も、注釈の指し先で割れる。
    expect(nameNode(RC, nodeHandleOf('3,1'), '7,2').ok).toBe(false);
    expect(nameNode(RC, nodeHandleOf('3,1'), 'R1').ok).toBe(false);
    expect(nameNode(RC, nodeHandleOf('3,1'), 'あ').ok).toBe(false);
  });

  test('refuses a name another point already has', () => {
    const named = after(RC, nodeHandleOf('3,1'), 'vout');

    expect(nameNode(named, nodeHandleOf('1,1'), 'vout').ok).toBe(false);
  });

  test('says nothing changed when the name is already what was asked', () => {
    const named = after(RC, nodeHandleOf('3,1'), 'vout');
    const same = nameNode(named, nodeHandleOf('3,1'), 'vout');

    expect(same.ok ? (same.value.edits ?? []) : null).toEqual([]);
  });
});
