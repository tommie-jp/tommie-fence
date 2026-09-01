import { describe, expect, test, vi } from 'vitest';
import { labelOf, runMovePoint } from './movePoint.ts';
import type { EditorPort } from './movePart.ts';

const MARKDOWN = [
  '# ノート',
  '',
  '```circuit',
  'points:',
  '  fb: c3',
  'parts:',
  '  R1: resistor fb d3 10k',
  '  R2: resistor fb c5 1k',
  '  R3: resistor e1 e2 2k',
  '```',
  '',
].join('\n');

const portOf = (over: Partial<EditorPort> = {}): EditorPort => ({
  document: () => ({ text: MARKDOWN, line: 5 }),
  // 一覧の並びは番地順。`c3` の節点が先に来る。
  pick: async (items) => items[0] ?? null,
  prompt: async () => 'c4',
  confirm: async () => true,
  apply: async () => true,
  info: () => {},
  warn: () => {},
  ...over,
});

describe('labelOf', () => {
  test('shows the name, since a named node is a one-line rewrite', () => {
    const label = labelOf({ address: { row: 2, col: 2 }, name: 'fb', uses: 2 });

    expect(label).toContain('c3');
    expect(label).toContain('fb');
    expect(label).toContain('2 か所');
  });

  test('leaves the brackets out when the node has no name', () => {
    expect(labelOf({ address: { row: 2, col: 2 }, name: null, uses: 1 })).not.toContain('(');
  });
});

describe('runMovePoint', () => {
  test('rewrites the one points: line when the node has a name', async () => {
    const apply = vi.fn(async () => true);
    await runMovePoint(portOf({ apply }));

    expect(apply).toHaveBeenCalledOnce();
    const [fenceLine, edits] = apply.mock.calls[0] as unknown as [number, { line: number; text: string }[]];
    expect(fenceLine).toBe(3);
    expect(edits).toHaveLength(1);
    expect(edits[0]?.text).toBe('c4');
  });

  test('offers the address the node is at now, so a nudge is one keystroke', async () => {
    const prompt = vi.fn(async () => null);
    await runMovePoint(portOf({ prompt }));

    expect(prompt).toHaveBeenCalledWith(expect.any(String), 'c3');
  });

  test('does not ask when the move keeps every connection as it was', async () => {
    const confirm = vi.fn(async () => true);
    await runMovePoint(portOf({ confirm }));

    // 節点ごと動かせば接続は保たれる。毎回止めると本来の使い方で邪魔になる。
    expect(confirm).not.toHaveBeenCalled();
  });

  test('asks before a move that joins the node to something already there', async () => {
    const confirm = vi.fn(async () => false);
    const apply = vi.fn(async () => true);
    // e1 には R3 の端が来ている。同じ交点 = 接続なので、寄せるとつながる。
    await runMovePoint(portOf({ confirm, apply, prompt: async () => 'e1' }));

    expect(confirm).toHaveBeenCalledOnce();
    expect(apply).not.toHaveBeenCalled();
  });

  test('says why nothing happened when the fence cannot be read', async () => {
    const warn = vi.fn();
    const broken = '```circuit\nparts: [\n```\n';
    await runMovePoint(portOf({ document: () => ({ text: broken, line: 2 }), warn }));

    expect(warn).toHaveBeenCalledOnce();
  });

  test('says so when the cursor is outside a circuit fence', async () => {
    const warn = vi.fn();
    await runMovePoint(portOf({ document: () => ({ text: '# ノート\n', line: 1 }), warn }));

    expect(warn).toHaveBeenCalledOnce();
  });

  test('refuses a target that is not an address, rather than guessing', async () => {
    const warn = vi.fn();
    const apply = vi.fn(async () => true);
    await runMovePoint(portOf({ warn, apply, prompt: async () => 'あ' }));

    expect(warn).toHaveBeenCalledOnce();
    expect(apply).not.toHaveBeenCalled();
  });

  test('does nothing when the node is already where it was asked to go', async () => {
    const apply = vi.fn(async () => true);
    const info = vi.fn();
    await runMovePoint(portOf({ apply, info, prompt: async () => 'c3' }));

    expect(apply).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledOnce();
  });

  test('reports every rewritten place when a named node also has bare spellings', async () => {
    const info = vi.fn();
    const mixed = [
      '```circuit',
      'points:',
      '  fb: c3',
      'parts:',
      '  R1: resistor fb d3',
      '  R2: resistor c3 e3',
      '```',
      '',
    ].join('\n');
    await runMovePoint(portOf({ document: () => ({ text: mixed, line: 2 }), info }));

    // 名前の行き先 1 行 + 生の綴り 1 か所。「1 行を書き換えました」では嘘になる。
    expect(info).toHaveBeenCalledOnce();
    expect(String(info.mock.calls[0]?.[0])).toContain('2 か所');
  });

  test('backs out quietly when the pick is closed', async () => {
    const apply = vi.fn(async () => true);
    await runMovePoint(portOf({ apply, pick: async () => null }));

    expect(apply).not.toHaveBeenCalled();
  });
});
