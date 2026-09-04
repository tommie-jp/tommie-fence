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
  '  IN: port a1',
  '  R1: resistor a1 a3 10k',
  '  C1: capacitor a3 c3 100n',
  'wires:',
  '  - a3 -- b3',
  '',
].join('\n');

describe('節点の名札', () => {
  test('tells a node handle from a part id', () => {
    expect(isNodeHandle(nodeHandleOf('a3'))).toBe(true);
    expect(isNodeHandle('R1')).toBe(false);
  });

  test('shows the address as the type and an empty name for a node with no name', () => {
    const fields = nodeFields(RC, nodeHandleOf('a3'));

    expect(fields?.id).toBe('');
    expect(fields?.type).toBe('a3');
    expect(fields?.can).toEqual(['id']);
  });

  test('writes a points line and rewrites every place that spelled the address', () => {
    // 名前を付けたら、その番地を書いていた場所は全部名前になる。
    // **1 か所でも残ると節点が割れる** ので、生の綴りは残さない。
    const written = after(RC, nodeHandleOf('a3'), 'vout');

    expect(written).toContain('points:\n  vout: a3');
    expect(written).toContain('  R1: resistor a1 vout 10k');
    expect(written).toContain('  C1: capacitor vout c3 100n');
    expect(written).toContain('  - vout -- b3');
    expect(written).not.toContain('a3 ');
  });

  test('renames the name it already has, and the places that use it', () => {
    const named = after(RC, nodeHandleOf('a3'), 'vout');
    const again = after(named, nodeHandleOf('a3'), 'vo');

    expect(again).toContain('  vo: a3');
    expect(again).toContain('  R1: resistor a1 vo 10k');
    expect(again).not.toContain('vout');
  });

  test('takes the name away when the field is cleared, putting the address back', () => {
    const named = after(RC, nodeHandleOf('a3'), 'vout');
    const bare = after(named, nodeHandleOf('a3'), '');

    expect(bare).not.toContain('vout');
    expect(bare).toContain('  R1: resistor a1 a3 10k');
    expect(bare).toContain('  - a3 -- b3');
  });

  test('reads the name back once it is written', () => {
    const named = after(RC, nodeHandleOf('a3'), 'vout');

    expect(nodeFields(named, nodeHandleOf('a3'))?.id).toBe('vout');
  });

  test('refuses a name the fence could not read back', () => {
    // 番地の形は読み分けられない。部品 ID と同じ名前も、注釈の指し先で割れる。
    expect(nameNode(RC, nodeHandleOf('a3'), 'b7').ok).toBe(false);
    expect(nameNode(RC, nodeHandleOf('a3'), 'R1').ok).toBe(false);
    expect(nameNode(RC, nodeHandleOf('a3'), 'あ').ok).toBe(false);
  });

  test('refuses a name another point already has', () => {
    const named = after(RC, nodeHandleOf('a3'), 'vout');

    expect(nameNode(named, nodeHandleOf('a1'), 'vout').ok).toBe(false);
  });

  test('says nothing changed when the name is already what was asked', () => {
    const named = after(RC, nodeHandleOf('a3'), 'vout');
    const same = nameNode(named, nodeHandleOf('a3'), 'vout');

    expect(same.ok ? (same.value.edits ?? []) : null).toEqual([]);
  });
});
