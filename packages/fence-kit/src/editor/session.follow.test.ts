import { describe, expect, test } from 'vitest';
import { createSession } from './session.ts';
import type { FenceEditor } from './fenceEditor.ts';
import type { Outgoing } from './session.ts';

/**
 * **殻が文書に付いていく側。** カーソルの追従、フェンスの乗り換え、
 * 光らせる先、戻す・やり直す、帯からの行送り。
 *
 * どれも「マップから来た知らせ」ではなく**エディタの側で起きたこと**への答えで、
 * `session.commands.test.ts` とは別の道を通る。
 */

const LINES = [
  '# 見出し',
  '',
  '```fake',
  'R1: resistor a1 a3',
  '```',
  '',
  '```fake',
  'D1: led b1 b2',
  '```',
  '',
];
const MARKDOWN = LINES.join('\n');

/** フェンスは 3 行目と 7 行目から。中身はその次の 1 行きり。 */
const fenceAt = (line: number): { line: number; source: string; indents: never[] } | null => {
  if (line >= 3 && line <= 5) return { line: 3, source: 'R1: resistor a1 a3\n', indents: [] };
  if (line >= 7 && line <= 9) return { line: 7, source: 'D1: led b1 b2\n', indents: [] };
  return null;
};

const ok = { ok: true as const, value: { edits: [], diff: { lost: [], gained: [] } } };

const open = (over: Partial<FenceEditor> = {}, hostOver: Record<string, unknown> = {}) => {
  const editor: FenceEditor = {
    language: 'fake',
    fences: () => [{ line: 3, title: '図01' }, { line: 7, title: '図02' }],
    fenceAt: (_markdown, line) => fenceAt(line),
    firstFence: () => fenceAt(3),
    view: (source) => ({ map: `<svg data-of="${source.trim()}"></svg>`, issues: '' }),
    aimAt: (_source, line, column) => (line === 1 && column < 2 ? { kind: 'part' as const, id: 'R1' } : null),
    spansOf: () => [{ line: 1, column: 0, length: 2 }],
    fieldsOf: (_source, handle) => ({
      id: handle, type: 'resistor', value: '', label: '', color: '', can: ['id'],
    }),
    colorNames: () => '',
    nameOf: (handle) => handle,
    nextId: () => 'X1',
    cellsOf: () => ['a1'],
    foldsWire: false,
    fine: null,
    step: () => null,
    stepsTo: () => null,
    palette: () => '',
    typeNames: () => '',
    movePart: () => ({ ok: true, value: { edits: [{ line: 1, column: 0, length: 2, text: 'R9' }], diff: { lost: [], gained: [] } } }),
    movePoint: () => ok,
    addPart: () => ok,
    duplicate: () => ok,
    addWire: () => ok,
    deletePart: () => ok,
    deleteWire: () => ok,
    rename: () => ok,
    setField: () => ok,
    turn: () => ok,
    flip: () => ok,
    ...over,
  };

  let text = MARKDOWN;
  const doc = {
    uri: { toString: () => 'file:///a.md' },
    getText: () => text,
    get lineCount() { return text.split('\n').length; },
    lineAt: (line: number) => ({ text: text.split('\n')[line] ?? '' }),
  };
  let cursor = { line: 3, character: 0 };
  const sent: Outgoing[] = [];
  const shown: unknown[] = [];
  const lit: unknown[] = [];
  const host = {
    post: (message: Outgoing) => sent.push(message),
    documents: () => [doc],
    activeEditor: () => ({ document: doc, selection: { active: cursor } }),
    openDocument: () => doc,
    // フェンスの中の桁を、Markdown の行へずらして当てる。
    applyEdits: async (
      _doc: unknown,
      fenceLine: number,
      edits: readonly { line: number; column: number; length: number; text: string }[],
    ) => {
      const lines = text.split('\n');
      for (const edit of [...edits].sort((a, b) => b.line - a.line || b.column - a.column)) {
        const at = fenceLine + edit.line - 1;
        const now = lines[at] ?? '';
        lines[at] = now.slice(0, edit.column) + edit.text + now.slice(edit.column + edit.length);
      }
      text = lines.join('\n');
      return true;
    },
    replaceBody: async (_doc: unknown, fenceLine: number, count: number, body: readonly string[]) => {
      const lines = text.split('\n');
      lines.splice(fenceLine, count, ...body);
      text = lines.join('\n');
      return true;
    },
    highlight: (...args: unknown[]) => { lit.push(args); },
    showDocument: async (...args: unknown[]) => { shown.push(args); },
    ...hostOver,
  };

  const session = createSession(host as never, [editor], {});
  const at = (line: number, character = 0): void => { cursor = { line, character }; };
  const last = (kind: string) => [...sent].reverse().find((one) => one.kind === kind);
  return { session, sent, last, at, shown, lit, source: () => text };
};

describe('カーソルに付いていく', () => {
  test('draws the fence the cursor is sitting in', () => {
    const { session, at } = open();
    at(3);

    expect(session.view().html).toContain('R1: resistor');
  });

  test('switches when the cursor moves into the other fence', () => {
    const { session, at } = open();
    at(3);
    session.view();
    at(7);

    expect(session.view().html).toContain('D1: led');
  });

  test('stays on the fence it was showing when the cursor leaves them all', () => {
    const { session, at } = open();
    at(3);
    session.view();
    at(0);

    expect(session.view().html).toContain('R1: resistor');
  });

  test('lights what the cursor points at, in the fence it is showing', () => {
    const { session, at, last } = open();
    at(3);
    session.view();
    at(3, 0);
    session.refresh();

    expect(last('aim')).toMatchObject({ what: 'part', id: 'R1' });
  });

  test('lights nothing when the cursor points at no part', () => {
    const { session, at, last } = open();
    at(3);
    session.view();
    at(3, 9);
    session.refresh();

    expect(last('aim')).toEqual({ kind: 'aim' });
  });

  test('lights nothing when the cursor is in another fence than the one shown', async () => {
    // 一覧で選び直した直後は、カーソルは別のフェンスに居る。
    const { session, at, last } = open();
    at(3);
    session.view();
    await session.handle({ kind: 'fence', line: 7 });
    at(3);
    session.refresh();

    expect(last('aim')).toEqual({ kind: 'aim' });
  });
});

describe('フェンスを選び直す', () => {
  test('switches to the fence the picker named, whatever the cursor is doing', async () => {
    const { session, at } = open();
    at(3);
    session.view();

    await session.handle({ kind: 'fence', line: 7 });

    expect(session.view().html).toContain('D1: led');
  });

  test('ignores a line that is not a fence', async () => {
    const { session, at } = open();
    at(3);
    session.view();

    await session.handle({ kind: 'fence', line: 1 });

    expect(session.view().html).toContain('R1: resistor');
  });
});

describe('帯からの行送り', () => {
  test('opens the document at the line, and lights that line', async () => {
    const { session, at, shown, lit } = open();
    at(3);
    session.view();

    await session.handle({ kind: 'goto', line: 4 });

    expect(shown).toHaveLength(1);
    expect(lit.length).toBeGreaterThan(0);
  });

  test('clamps past the end, so a row is never dead to the click', async () => {
    // 打ちかけのフェンスが文末にあると、帯は最後の行より先を指す。
    const { session, at, shown } = open();
    at(3);
    session.view();

    await session.handle({ kind: 'goto', line: 9999 });

    expect(shown).toHaveLength(1);
  });

  test('does nothing when the map has not been drawn yet', async () => {
    const { session, shown } = open();

    await session.handle({ kind: 'goto', line: 4 });

    expect(shown).toEqual([]);
  });
});

describe('戻す・やり直す', () => {
  test('hands undo to the host when the host has one', async () => {
    const undone: string[] = [];
    const { session, at } = open({}, { nativeUndo: async (kind: string) => { undone.push(kind); } });
    at(3);
    session.view();

    await session.handle({ kind: 'undo' });
    await session.handle({ kind: 'redo' });

    expect(undone).toEqual(['undo', 'redo']);
  });

  test('says there is nothing to undo when its own history is empty', async () => {
    const { session, at, last } = open();
    at(3);
    session.view();

    await session.handle({ kind: 'undo' });

    expect((last('status') as { text?: string } | undefined)?.text).toContain('戻せる');
  });

  test('puts back the last change it made', async () => {
    const { session, at, source, last } = open();
    at(3);
    session.view();
    await session.handle({ kind: 'move', part: 'R1', to: 'b3' });
    expect(source()).toContain('R9');

    await session.handle({ kind: 'undo' });

    expect(source()).toContain('R1: resistor');
    expect((last('status') as { text?: string } | undefined)?.text).toContain('戻しました');
  });

  test('redoes what it just put back', async () => {
    const { session, at, source } = open();
    at(3);
    session.view();
    await session.handle({ kind: 'move', part: 'R1', to: 'b3' });
    await session.handle({ kind: 'undo' });

    await session.handle({ kind: 'redo' });

    expect(source()).toContain('R9');
  });

  test('refuses to undo over a change made by hand, and says why', async () => {
    const { session, at, last } = open();
    at(3);
    session.view();
    await session.handle({ kind: 'move', part: 'R1', to: 'b3' });
    // 手で書き換える (履歴が覚えている姿と食い違う)。
    await session.handle({ kind: 'setField', part: 'R1', field: 'value', text: '1k' });
    await session.handle({ kind: 'move', part: 'R1', to: 'c3' });

    await session.handle({ kind: 'undo' });

    expect(last('status')).toBeDefined();
  });
});

describe('どの文書に付いているか', () => {
  test('follows any document until it is pinned to one', () => {
    const { session } = open();

    expect(session.follows('file:///other.md')).toBe(true);
  });

  test('binds to the document it drew, and knows it afterwards', () => {
    const { session, at } = open();
    at(3);
    session.view();

    expect(session.isBoundTo('file:///a.md')).toBe(true);
    expect(session.isBoundTo('file:///other.md')).toBe(false);
  });

  test('lets go of everything when disposed', () => {
    const { session, at } = open();
    at(3);
    session.view();

    session.dispose();

    expect(session.isBoundTo('file:///a.md')).toBe(false);
  });
});

describe('フェンスがないとき', () => {
  test('says so instead of drawing an empty map', () => {
    const { session } = open({ fences: () => [], fenceAt: () => null, firstFence: () => null });

    expect(session.view().html).not.toContain('<svg');
  });
});
