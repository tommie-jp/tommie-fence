import { describe, expect, test, vi } from 'vitest';
import { describeDiff, runMovePart } from './movePart.ts';
import type { EditorPort } from './movePart.ts';

const MARKDOWN = [
  '# ノート',
  '',
  '```circuit',
  'parts:',
  '  R1:  resistor a1 a3 10k',
  '  C1:  capacitor a3 c3 100n',
  '```',
  '',
].join('\n');

const portOf = (over: Partial<EditorPort> = {}): EditorPort => ({
  document: () => ({ text: MARKDOWN, line: 5 }),
  pick: async (items) => items[0] ?? null,
  prompt: async () => 'b1',
  confirm: async () => true,
  apply: async () => true,
  info: () => {},
  warn: () => {},
  ...over,
});

describe('describeDiff', () => {
  test('says nothing when nothing changes', () => {
    expect(describeDiff({ lost: [], gained: [] })).toBeNull();
  });

  test('names what comes apart and what joins', () => {
    const text = describeDiff({ lost: [['R1.2', 'C1.1']], gained: [['R1.1', 'C1.2']] })!;

    expect(text).toContain('離れる接続: R1.2 — C1.1');
    expect(text).toContain('つながる接続: R1.1 — C1.2');
  });
});

describe('runMovePart', () => {
  test('moves the part the user picked, to the address they typed', async () => {
    const apply = vi.fn(async () => true);
    await runMovePart(portOf({ apply }));

    expect(apply).toHaveBeenCalledOnce();
    const [fenceLine, edits] = apply.mock.calls[0] as unknown as [number, { text: string }[]];
    expect(fenceLine).toBe(3);
    expect(edits.map((edit) => edit.text)).toEqual(['b1', 'b3']);
  });

  test('offers the address the part is at now, so a nudge is one keystroke', async () => {
    const prompt = vi.fn(async () => null);
    await runMovePart(portOf({ prompt }));

    expect(prompt).toHaveBeenCalledWith(expect.any(String), 'a1');
  });

  test('asks before a move that changes what is connected', async () => {
    const confirm = vi.fn(async () => false);
    const apply = vi.fn(async () => true);

    await runMovePart(portOf({ confirm, apply }));

    expect(confirm).toHaveBeenCalledOnce();
    expect(apply).not.toHaveBeenCalled();
  });

  test('does not ask when the move keeps every connection', async () => {
    const confirm = vi.fn(async () => true);
    const apply = vi.fn(async () => true);
    // C1 を丸ごと下へ動かすと R1 と離れるので、離れない例として R1 と C1 を
    // つないでいない図を使う。
    const document = () => ({ text: '```circuit\nparts:\n  R1: resistor a1 a3\n```\n', line: 3 });

    await runMovePart(portOf({ document, confirm, apply, prompt: async () => 'c1' }));

    expect(confirm).not.toHaveBeenCalled();
    expect(apply).toHaveBeenCalledOnce();
  });

  test('says so when the cursor is not in a fence', async () => {
    const warn = vi.fn();
    await runMovePart(portOf({ document: () => ({ text: MARKDOWN, line: 1 }), warn }));

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('circuit フェンスがありません'));
  });

  test('says so when there is no editor at all', async () => {
    const warn = vi.fn();
    await runMovePart(portOf({ document: () => null, warn }));

    expect(warn).toHaveBeenCalledOnce();
  });

  test('passes the reason on when the move is refused', async () => {
    const warn = vi.fn();
    const apply = vi.fn(async () => true);

    await runMovePart(portOf({ prompt: async () => 'a99', warn, apply }));

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('外へ出ます'));
    expect(apply).not.toHaveBeenCalled();
  });

  test('says so when what was typed is not an address', async () => {
    const warn = vi.fn();
    await runMovePart(portOf({ prompt: async () => 'nowhere', warn }));

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('番地として読めません'));
  });

  test('stops quietly when the user closes a picker', async () => {
    const apply = vi.fn(async () => true);

    await runMovePart(portOf({ pick: async () => null, apply }));
    await runMovePart(portOf({ prompt: async () => null, apply }));

    expect(apply).not.toHaveBeenCalled();
  });

  test('says the part is already there instead of writing an empty edit', async () => {
    const info = vi.fn();
    const apply = vi.fn(async () => true);

    await runMovePart(portOf({ prompt: async () => 'a1', info, apply }));

    expect(info).toHaveBeenCalledWith(expect.stringContaining('すでに'));
    expect(apply).not.toHaveBeenCalled();
  });
});
